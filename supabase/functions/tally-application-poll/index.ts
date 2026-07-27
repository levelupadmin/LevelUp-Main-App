/**
 * tally-application-poll — PULLS cohort applications from the Tally API on a
 * schedule (`design/briefs/cohort-tally-poll.md` TP-2). Runs every 15 minutes
 * via pg_cron.
 *
 * WHY THIS EXISTS. The webhook path (`tally-application-webhook`) needs a
 * shared HMAC secret to be safe, and no secret was set — so it is fail-closed
 * and inert. This function is the replacement: instead of Tally pushing into a
 * publicly-writable path, the app pulls with a key it already holds
 * (`TALLY_API_KEY`). The webhook stays deployed and UNMODIFIED as the
 * instant-delivery option if a signing secret is ever set.
 *
 * THE HARD REQUIREMENT — THE INTAKE WINDOW, BOUNDED AT BOTH ENDS. One Tally
 * form is reused across editions (form `81dRPA` carries 880 historical
 * completed submissions from Edition 1 and earlier) AND keeps taking traffic
 * after an edition closes, so an unbounded scan fabricates applications off
 * both ends of the stream. Every submission is therefore gated on:
 *   • START — `offerings.intake_opens_at`, REQUIRED. An offering without one is
 *     not polled at all: it is excluded from the scan query, counted once at
 *     the top level as `skippedNoCutoff`, and logged. There is NO `created_at`
 *     fallback (FX-2.1) — see `resolveIntakeWindow` for why that fallback was
 *     the dangerous branch rather than the safe one.
 *   • END — `offerings.application_deadline` when set, as end of that day in
 *     IST (FX-2.2). NULL means no ceiling, reported as `windowEnd: null`.
 * Because Tally returns newest-first the scan STOPS at the first row BELOW the
 * start; a row above the END is skipped and counted, never a stop signal (that
 * would halt on row 1 of every closed edition — see `partitionByCutoff`).
 * All of it — the window resolution, the comparison, and the completed-only
 * guard — lives in `_shared/tally.ts` (`resolveIntakeWindow`,
 * `isInIntakeWindow`, `partitionByCutoff`, `isIngestableSubmission`) so it is
 * unit-testable; this file CALLS those and must not reimplement any of it
 * inline.
 *
 * THE THREE INVIOLABLE RULES:
 *   1. READ-ONLY against Tally (SOR-1). GET only, zero writes to any external
 *      system. The only write is the app-owned `cohort_applications` insert.
 *   2. Fail-soft per form. A 429/5xx/throw on one form records the error in
 *      that form's summary and moves on; it never aborts the run. An unset
 *      `TALLY_API_KEY` returns early instead of throwing.
 *   3. Secrets by name only — `Deno.env.get("TALLY_API_KEY")`, nothing inlined.
 *
 * IT NEVER UPDATES. Unlike the webhook, an existing `(offering_id, email)` row
 * is SKIPPED, not updated: this re-scans the same window every 15 minutes, so
 * an update branch would rewrite the same rows forever and could thrash
 * `tally_response_id` between two submissions by the same person. For the same
 * reason it does not mirror the webhook's `users` profile enrichment — a cron
 * overwriting phone/city/occupation from stale form answers is a silent
 * data-loss hazard. The only status it ever writes is `'submitted'`, on insert.
 *
 * THE WINDOW NEVER SHRINKS, SO THE DB READS ARE BULK. The cutoff is fixed at
 * `intake_opens_at`, which means every tick re-scans the entire intake window
 * and skips almost all of it. Doing that with two PostgREST round-trips per
 * submission is O(window) sequential queries every 15 minutes and times the
 * function out once an edition gets busy (Edition 1 of this same form reached
 * 880 completed submissions). So each form does ONE paged read of the keys it
 * already holds and ONE chunked `users` read for the genuinely-new rows; the
 * per-row round-trip is the INSERT only.
 *
 * ONE FORM, TWO OFFERINGS. The unique index backing idempotency
 * (`cohort_applications_tally_response_id_key`) is GLOBAL, not per-offering,
 * while `tally_form_url` is free-text admin input — so two staged offerings can
 * legitimately point at the same form and only the first can ever ingest a
 * given submission. That 23505 is NOT idempotent success (no row exists for the
 * second offering and none ever will), so it is counted and logged separately
 * from an ordinary already-exists skip, and the offering scan is ORDERED
 * newest-intake-first so the winner is deterministic and is the live edition.
 *
 * PARTIALS ARE COUNTED, NEVER CREATED, AND THE GUARD IS IN CODE. The Tally
 * fetch asks for `&filter=completed` and the envelope reports the form's whole
 * partial pool, which is reported per form as `partialCount` and nothing else.
 * But a query string in one URL is not a guarantee, so every submission is ALSO
 * put through `isIngestableSubmission` before it can become a row (FX-2.3);
 * anything that reaches the loop without `isCompleted === true` is skipped and
 * counted as `skippedNotCompleted`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/crypto.ts";
import {
  buildQuestionMap,
  buildQuestionTypeMap,
  dedupeBySubmissionId,
  formIdFromTallyUrl,
  isIngestableSubmission,
  partitionByCutoff,
  resolveIntakeWindow,
  toApplicationRow,
  type CohortApplicationRow,
  type TallyEnvelope,
  type TallySubmission,
} from "../_shared/tally.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
/**
 * The token the pg_cron caller presents, compared constant-time in the handler.
 * Set to the SAME value the cron sends (the vault secret
 * `email_queue_service_role_key`). Explicit rather than inferred, because
 * `SUPABASE_SERVICE_ROLE_KEY` and that vault secret are DIFFERENT key formats on
 * a project mid-migration — see the auth block for the live evidence.
 */
const POLL_AUTH_TOKEN = Deno.env.get("POLL_AUTH_TOKEN") ?? "";

const TALLY_BASE = "https://api.tally.so";
const TALLY_PAGE_SIZE = 100;
/** Runaway guard: at most 2000 submissions scanned per form per run. */
const TALLY_MAX_PAGES = 20;

/** PostgREST page size for the bulk read of already-ingested keys. */
const EXISTING_PAGE_SIZE = 1000;
/** Runaway guard on that read. Exceeding it throws into the per-form fail-soft. */
const EXISTING_MAX_PAGES = 20;
/**
 * Email spellings per `users` `.in()` chunk. Sized against the REQUEST LINE,
 * not the row count: PostgREST puts the whole `in.(...)` list in the URL and
 * Kong/nginx default to an 8 KB request line (`large_client_header_buffers 4
 * 8k`). 200 percent-encoded addresses of the form firstname.lastname@gmail.com
 * measure ~8.4 KB — over the limit — and the resulting 414 comes back as an
 * ordinary chunk error, so every application in it would insert with `user_id`
 * NULL. That NULL is permanent (this function never updates) and RLS
 * `students_read_own_applications` (`user_id = auth.uid()`) then hides the
 * application from the applicant forever. 50 keeps the same list near 2.1 KB, a
 * ~4x margin; the read is chunked anyway, so a smaller chunk costs round-trips
 * and nothing else. Counted in SPELLINGS, not addresses — see `lookupUserIds`,
 * a mixed-case answer contributes two.
 */
const USER_LOOKUP_CHUNK = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** One structured log line, so the poller is greppable in the function logs. */
function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ fn: "tally-application-poll", event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * The offering columns the scan reads. `created_at` is deliberately NOT among
 * them: FX-2.1 removed the cutoff fallback, and not selecting the column is the
 * cheapest way to keep it removed. (It is still ORDERED on below — PostgREST
 * does not require an ordered column to be selected.)
 */
interface OfferingRow {
  id: string;
  title: string | null;
  slug: string | null;
  tally_form_url: string | null;
  intake_opens_at: string | null;
  application_deadline: string | null;
}

/**
 * The brief's per-form summary shape, plus the resolved window (FX-2.4).
 *
 * `windowStart` / `windowEnd` are ALWAYS present: they are the two instants
 * every other number on this summary is relative to, and `windowEnd: null` —
 * "this form has no closing date, it will ingest for as long as it is staged" —
 * is exactly the state that has to be visible rather than inferred from a
 * missing key.
 *
 * The optional counters are emitted ONLY when non-zero, so a healthy run still
 * returns essentially the shape the brief specifies; each one exists because
 * folding it into `skipped` would make a real fault indistinguishable from
 * routine dedupe.
 *
 * `skippedNoCutoff` is NOT here, and cannot be: an offering with no
 * `intake_opens_at` is filtered out of the scan query, so it never reaches a
 * per-form summary at all. It is reported once, at the top level of the
 * response body — present UNCONDITIONALLY on every run that polls, unlike the
 * optional counters above, with `null` meaning "unknown" rather than none. See
 * `countOfferingsWithoutCutoff`. (The one body without it is the `skipped:
 * "TALLY_API_KEY not configured"` early return, which says in the body itself
 * that no run happened.)
 */
interface FormSummary {
  formId: string;
  offering: string;
  scanned: number;
  created: number;
  skipped: number;
  partialCount: number;
  stoppedAtCutoff: boolean;
  /** Inclusive start of the window: the offering's `intake_opens_at`. */
  windowStart: string;
  /** Inclusive end (IST end of `application_deadline`), or null = no ceiling. */
  windowEnd: string | null;
  /** Submissions with no usable `submittedAt`: skipped, never a stop signal. */
  undatedSkipped?: number;
  /** Submissions ABOVE the ceiling: skipped, and never a stop signal either. */
  afterDeadlineSkipped?: number;
  /** Reached the loop without `isCompleted === true`. Never inserted (FX-2.3). */
  skippedNotCompleted?: number;
  /** 23505s owned by a DIFFERENT offering — this form is shared, see the header. */
  crossOfferingCollisions?: number;
  /**
   * Inserts that FAILED (anything that is not a 23505). Never folded into
   * `skipped`: a skip means "already ingested, nothing to do", so counting a
   * failure there makes a total insert outage read exactly like a healthy
   * all-already-ingested tick. It also sets `error`, because pg_cron invokes
   * this via `net.http_post` and discards the body — this summary is the only
   * structured contract a human ever reads.
   */
  insertFailed?: number;
  error?: string;
}

/**
 * The service-role client. Wrapped in a factory purely so `AdminClient` below
 * is the client type as actually INSTANTIATED here — `ReturnType<typeof
 * createClient>` picks up the generic defaults instead and does not match.
 */
function createAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Every `(email, tally_response_id)` this offering has already ingested, in ONE
 * paged read. Replaces the per-submission existence query: the poller re-scans
 * a window that never shrinks, so almost every row it reads is one it will
 * skip. Throws on error rather than guessing — an incomplete key set would
 * insert duplicates — and the throw lands in the per-form fail-soft catch.
 *
 * The `.order("id")` is LOAD-BEARING, not cosmetic. `.range()` pages are
 * separate requests, and without an ORDER BY Postgres gives no stable row order
 * across them, so a row can be returned twice and another never at all. A key
 * this read misses is a duplicate application: the repeat submission carries a
 * DIFFERENT `tally_response_id`, so the global unique index does not catch it
 * and the `(offering_id, email)` dedupe below is the only guard. Edition 1 of
 * this same form reached 880 completed submissions, so one offering crossing
 * the 1000-row page size is inside the horizon.
 */
async function loadExistingKeys(
  admin: AdminClient,
  offeringId: string,
): Promise<{ emails: Set<string>; responseIds: Set<string> }> {
  const emails = new Set<string>();
  const responseIds = new Set<string>();

  for (let page = 0; page < EXISTING_MAX_PAGES; page++) {
    const from = page * EXISTING_PAGE_SIZE;
    const { data, error } = await admin
      .from("cohort_applications")
      .select("email, tally_response_id")
      .eq("offering_id", offeringId)
      .order("id", { ascending: true })
      .range(from, from + EXISTING_PAGE_SIZE - 1);
    if (error) throw new Error(`existing application read failed: ${error.message}`);

    const rows = (data ?? []) as { email: string | null; tally_response_id: string | null }[];
    for (const row of rows) {
      if (row.email) emails.add(row.email.toLowerCase());
      if (row.tally_response_id) responseIds.add(row.tally_response_id);
    }
    if (rows.length < EXISTING_PAGE_SIZE) return { emails, responseIds };
  }

  throw new Error(
    `existing application read exceeded ${EXISTING_MAX_PAGES} pages for offering ${offeringId}`,
  );
}

/**
 * `email → users.id` for the rows about to be inserted, in chunked `.in()`
 * reads instead of one round-trip per submission. Keyed lower-case because
 * mailbox case is not meaningful and the two sides are typed by different
 * humans.
 *
 * THE FILTER HAS TO CARRY THE CASE, TOO. `users.email` is plain `text` and
 * PostgREST `in.(...)` is exact equality, so normalising only the rows that
 * come BACK is half a fix: a form answer typed `Meera@Example.com` would never
 * match its lower-case `users` row, and because this function never updates an
 * existing application, that unlinked state is permanent. So every address is
 * sent in both spellings — as typed and lower-cased — and the map is keyed
 * lower-case for the caller. (An `ilike` filter would also cover a `users` row
 * stored in a third casing, but `_` and `%` are legal in a local part and are
 * ILIKE wildcards; getting that escaping wrong links an application to the
 * WRONG account, which is strictly worse than not linking it.)
 *
 * A failed chunk is logged and treated as "no match" — an unlinked application
 * is recoverable by hand, a lost application is not — but at ERROR level,
 * because the resulting NULL never self-heals.
 */
async function lookupUserIds(admin: AdminClient, emails: string[]): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();

  const spellings = new Set<string>();
  for (const email of emails) {
    const trimmed = email.trim();
    if (!trimmed) continue;
    spellings.add(trimmed);
    spellings.add(trimmed.toLowerCase());
  }
  const unique = [...spellings];

  for (let i = 0; i < unique.length; i += USER_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + USER_LOOKUP_CHUNK);
    const { data, error } = await admin.from("users").select("id, email").in("email", chunk);
    if (error) {
      log("error", "user_lookup_failed", {
        chunkSize: chunk.length,
        message: error.message,
        note: "applications in this chunk insert with user_id NULL; the poller never updates, so they stay unlinked until fixed by hand",
      });
      continue;
    }
    for (const user of (data ?? []) as { id: string; email: string | null }[]) {
      if (user.email) byEmail.set(user.email.toLowerCase(), user.id);
    }
  }
  return byEmail;
}

/** How many un-opted-in offerings the warn log names before it truncates. */
const NO_CUTOFF_LABEL_LIMIT = 20;

/**
 * THE OFFERINGS THIS RUN DELIBERATELY DID NOT TOUCH — staged, carrying a Tally
 * form, and with no `intake_opens_at`.
 *
 * WHY THIS IS A SECOND QUERY RATHER THAN A SUMMARY FIELD. FX-2.1 asks for two
 * things that one query cannot both do: such offerings must NEVER BE SCANNED
 * (so the scan query filters them out with `.not("intake_opens_at","is",null)`)
 * and they must be REPORTED as `skippedNoCutoff` (so something has to see
 * them). A row removed by a filter produces no per-form summary. Resolved as:
 * the filter stays, and this read — over exactly the complement of the scan
 * query — supplies one TOP-LEVEL `skippedNoCutoff` for the whole run, plus one
 * warn log naming the offerings so the fix is actionable. "Never scanned" and
 * "visible" both hold; the count is a run-level fact, which is what it is.
 *
 * It selects identifying columns rather than being strictly head-only, because
 * a bare count cannot name anything and "some offering somewhere is not
 * ingesting" is not a report anyone can act on. The read is bounded by the
 * number of STAGED offerings carrying a form URL — single digits — and capped
 * anyway; the exact count comes from the count header, so the cap truncates the
 * names and never the number.
 *
 * Fail-soft: a failure here must not cost the run any ingest, so it is logged
 * and reported as `skippedNoCutoff: null` — unknown, explicitly not zero.
 */
async function countOfferingsWithoutCutoff(
  admin: AdminClient,
): Promise<{ count: number | null; labels: string[] }> {
  const { data, count, error } = await admin
    .from("offerings")
    .select("id, title, slug", { count: "exact" })
    .eq("payment_mode", "staged")
    .not("tally_form_url", "is", null)
    .is("intake_opens_at", null)
    .limit(NO_CUTOFF_LABEL_LIMIT);

  if (error) {
    log("error", "no_cutoff_count_failed", {
      message: error.message,
      note: "cannot report how many staged offerings are un-pollable for want of intake_opens_at; ingest itself is unaffected",
    });
    return { count: null, labels: [] };
  }

  const rows = (data ?? []) as { id: string; title: string | null; slug: string | null }[];
  return {
    count: count ?? rows.length,
    labels: rows.map((row) => row.slug || row.title || row.id),
  };
}

/** One page of a form's completed submissions, newest-first. GET only. */
async function fetchPage(formId: string, page: number, apiKey: string): Promise<TallyEnvelope> {
  const url =
    `${TALLY_BASE}/forms/${formId}/submissions` +
    `?page=${page}&limit=${TALLY_PAGE_SIZE}&filter=completed`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    // 429 / 5xx land here and bubble to the per-form fail-soft catch.
    throw new Error(`Tally ${res.status} on ${formId} page ${page}`);
  }
  return (await res.json()) as TallyEnvelope;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: the caller must present the SERVICE-ROLE KEY ITSELF, byte for byte
  // (FX-3). `verify_jwt = true` (config.toml:58-59) only proves the caller holds
  // SOME valid project JWT — the anon key qualifies — so it cannot be the gate.
  //
  // WHY A KEY COMPARE AND NOT A CLAIM PARSE. The gate this replaces base64URL-
  // decoded the bearer token's payload and required `role=service_role` WITHOUT
  // verifying the signature, the same shape notify-cohort/index.ts:59-68 uses.
  // An unverified payload is a string an attacker can author: mint any token
  // whose middle segment decodes to `{"role":"service_role"}` and the gate
  // opens. It survived only because `verify_jwt` happened to be on — and this
  // repo's own deploy docs (src/docs/content/tech.ts:119-120) present
  // `--no-verify-jwt` as the standard flag, one deploy away from reducing the
  // gate to a forgeable string. Comparing against SUPABASE_SERVICE_ROLE_KEY is
  // unforgeable without the key and holds regardless of `verify_jwt` or any
  // deploy flag; `verify_jwt = true` stays as defense in depth. This is the
  // guarantee process-email-queue/index.ts:109-117 already relies on.
  //
  // REBUTTING notify-cohort/index.ts:52-55. That comment asserts a byte compare
  // is UNWORKABLE here — "the deployed function's SUPABASE_SERVICE_ROLE_KEY env
  // var occasionally returns a different representation than what's stored in
  // the vault (Supabase sometimes re-issues internal JWTs without rotating the
  // dashboard key)" — and uses that to justify the claim parse. If it were true
  // this gate would 401 the cron at some arbitrary later date. It is not
  // supported by this repo's own production evidence:
  // process-email-queue/index.ts:115-117 performs the IDENTICAL byte compare
  // against SUPABASE_SERVICE_ROLE_KEY, and its pg_cron caller sends the SAME
  // vault secret this poll's cron sends (`email_queue_service_role_key` — see
  // 20260722140100_tally_poll_cron.sql:35-37,46, which reuses the email
  // worker's secret by name). That compare has been live and passing in
  // production, so the divergence notify-cohort describes is not something this
  // deployment exhibits. Two contradictory comments in one codebase are how a
  // 401 debug session gets stranded, so: if this gate ever rejects the cron,
  // read THIS paragraph first and go compare the two values (see the coupling
  // note below) rather than reaching for the claim parse.
  //
  // ⚠️ COUPLED TO THE VAULT SECRET — VERIFY BEFORE DEPLOYING. The only
  // production caller is the pg_cron job
  // (supabase/migrations/20260722140100_tally_poll_cron.sql:44-47), which sends
  // `Bearer ' || vault.decrypted_secrets['email_queue_service_role_key']`. This
  // gate passes ONLY if that vault secret is byte-identical to this function's
  // SUPABASE_SERVICE_ROLE_KEY. If it was stored with a trailing newline, or is a
  // separately-minted worker JWT rather than the literal key, intake dies
  // silently every 15 minutes. The `.trim()` below absorbs stray whitespace the
  // header itself picks up; it cannot fix a genuinely different secret.
  //
  // The pre-deploy comparison of those two values is necessary but NOT
  // sufficient: it runs once, and a later key rotation that misses the vault
  // would break intake with no user-visible symptom. The standing signal is the
  // pair of log events below — after deploy, confirm the first cron run logs a
  // successful poll and neither `auth_rejected` nor `auth_misconfigured`, and
  // keep an alert on both. Either one repeating at a 15-minute cadence with no
  // other traffic means the cron itself is being turned away: `auth_rejected`
  // points at the vault secret, `auth_misconfigured` at this function's env.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  // `timingSafeEqual` returns false on a length mismatch, but an UNSET key and
  // an empty bearer are both "" and would compare EQUAL — so a missing key is a
  // hard 401 before the compare can ever run. It gets its OWN event (the same
  // way `tally_api_key_unset` below does for the other server-side secret):
  // folded into `auth_rejected` it is indistinguishable from a bad caller, and
  // the operator burns the outage chasing the vault secret and the cron job
  // while the fault is on this function's side. The RESPONSE is byte-identical
  // either way — the caller learns nothing about which half failed.
  // WHICH SECRET THE CRON ACTUALLY SENDS IS NOT `SUPABASE_SERVICE_ROLE_KEY`.
  // The cron sends the vault secret `email_queue_service_role_key`, which on this
  // project is the LEGACY service_role JWT (`eyJ…`, 219 chars). The platform
  // injects `SUPABASE_SERVICE_ROLE_KEY` into the edge runtime in the NEW
  // `sb_secret_…` format, because the project carries both key generations at
  // once. Comparing the bearer against the injected env var therefore 401s the
  // cron on EVERY tick — verified live 2026-07-27, and silently, since a cron
  // 401 has no user-visible symptom. The gateway can't catch it either:
  // verify_jwt=true only proves the bearer is SOME valid project JWT.
  //
  // So the shared secret is explicit and format-independent: POLL_AUTH_TOKEN,
  // set to the same value the cron sends. `SUPABASE_SERVICE_ROLE_KEY` stays the
  // fallback so this keeps working on a project where the two DO coincide.
  const EXPECTED = POLL_AUTH_TOKEN || SERVICE_KEY;
  if (!EXPECTED) {
    log("error", "auth_misconfigured", { reason: "poll_auth_token_unset" });
    return jsonRes({ error: "Unauthorized" }, 401);
  }
  if (!token || !timingSafeEqual(token, EXPECTED)) {
    // The RESPONSE carries no detail (no reason, no hint about which half
    // failed). But a cron-wide 401 with zero log signal is an invisible outage
    // repeating every 15 minutes, so emit exactly one structured line — shape
    // only. Never the token, never a prefix of it, never the key.
    log("warn", "auth_rejected", {
      hasAuthHeader: authHeader.length > 0,
      tokenLength: token.length,
    });
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("TALLY_API_KEY") ?? "";
  if (!apiKey) {
    // Fail-soft: an unset key is a config state, not an incident. Nothing is
    // ingested and the next run picks up once the secret is set.
    //
    // No `skippedNoCutoff` here, and that is not the ambiguity the field exists
    // to remove: this body carries `skipped`, which says outright that the run
    // never polled anything, so nobody can read a missing count as "none". The
    // alternative — a DB round-trip to count offerings for a run that is about
    // to do nothing — buys a number with no run to be about.
    log("warn", "tally_api_key_unset", {});
    return jsonRes({ ok: true, skipped: "TALLY_API_KEY not configured", forms: [] });
  }

  const admin = createAdminClient();

  // FILTERED, and the filter is the requirement (FX-2.1). `intake_opens_at` is
  // the offering's explicit opt-in to being polled: without one there is no
  // honest lower bound, so the row is not scanned, not paged, not even read
  // here. `countOfferingsWithoutCutoff` reports what this excluded.
  //
  // ORDERED, not incidental. Two staged offerings may point at the same form
  // (see the header), and because the unique index on tally_response_id is
  // global, whichever one is scanned FIRST claims each submission. An unordered
  // select would hand that to whatever Postgres happened to return first and
  // could change the winner between runs. Ordered newest-intake-first, then
  // created_at, then id so the order is total: the live edition wins and a
  // stale leftover edition is the one that reports the collision, which is the
  // right way round. (Every row now HAS an intake_opens_at, so the old
  // NULLs-last tie-break is gone with the rows it sorted.)
  const { data: offeringData, error: offeringsErr } = await admin
    .from("offerings")
    .select("id, title, slug, tally_form_url, intake_opens_at, application_deadline")
    .eq("payment_mode", "staged")
    .not("tally_form_url", "is", null)
    .not("intake_opens_at", "is", null)
    .order("intake_opens_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (offeringsErr) {
    log("error", "offerings_query_failed", { message: offeringsErr.message });
    return jsonRes({ error: offeringsErr.message }, 500);
  }

  const offerings = (offeringData ?? []) as OfferingRow[];
  const noCutoff = await countOfferingsWithoutCutoff(admin);
  // FIRES FOR "SOME" **AND** FOR "UNKNOWN", AND SAYS WHICH. The guard used to be
  // `if (noCutoff.count)`, which is falsy for `null` as well as `0` — so the one
  // state that needs a human ("we cannot tell whether an offering is silently
  // un-pollable", i.e. the count query itself failed) was the one state that
  // emitted nothing at all. `0` stays silent: there is nothing to report.
  if (noCutoff.count === null || noCutoff.count > 0) {
    log("warn", "offerings_skipped_no_cutoff", {
      count: noCutoff.count,
      counted: noCutoff.count !== null,
      offerings: noCutoff.labels,
      truncated: noCutoff.count !== null && noCutoff.count > noCutoff.labels.length,
      note: noCutoff.count === null
        ? "UNKNOWN, not zero: the count query failed, so it cannot be said whether any staged offering with a tally_form_url is un-pollable for want of offerings.intake_opens_at. Ingest itself is unaffected; such offerings are not polled at all, and setting that column opts one in. The poller never falls back to created_at."
        : "staged offerings with a tally_form_url and NULL offerings.intake_opens_at are not polled at all; set that column to opt one in. The poller never falls back to created_at.",
    });
  }

  const forms: FormSummary[] = [];
  let pageCapHit = false;

  for (const offering of offerings) {
    const label = offering.slug || offering.title || offering.id;
    const formId = formIdFromTallyUrl(offering.tally_form_url);
    if (!formId) {
      // Edge case from the brief: an offering whose tally_form_url isn't a
      // tally.so URL. Skip + log; there is no form to poll.
      log("warn", "skip_non_tally_url", { offering: label, url: offering.tally_form_url });
      continue;
    }

    // The window, resolved by the pure core — both ends come off this row and
    // nothing is inferred from anything else.
    const { windowStart, windowEnd, skipReason } = resolveIntakeWindow(offering);
    if (skipReason || !windowStart) {
      // Unreachable: the query above already excluded these. Kept because the
      // filter and the resolver are independent statements of the same rule,
      // and the failure this guards is silent mass-backfill — if a PostgREST
      // filter ever stops meaning what it says, this must not be the run that
      // finds out by ingesting Edition 1.
      log("error", "offering_missing_cutoff_after_filter", {
        formId,
        offering: label,
        offeringId: offering.id,
        skipReason,
        note: "offerings.intake_opens_at is NULL/unusable but the row survived the scan filter; skipped",
      });
      continue;
    }
    if (offering.application_deadline && !windowEnd) {
      // A deadline that exists but cannot be read: the scan runs UNBOUNDED
      // above (better than dropping every application), so say so loudly.
      log("error", "application_deadline_unusable", {
        formId,
        offering: label,
        offeringId: offering.id,
        applicationDeadline: offering.application_deadline,
        note: "offerings.application_deadline is set but not a readable date; this form is scanning with NO upper bound",
      });
    }

    const summary: FormSummary = {
      formId,
      offering: label,
      scanned: 0,
      created: 0,
      skipped: 0,
      partialCount: 0,
      stoppedAtCutoff: false,
      windowStart,
      windowEnd,
    };
    forms.push(summary);

    try {
      const questionMap: Record<string, string> = {};
      const questionTypeMap: Record<string, string> = {};
      const collected: TallySubmission[] = [];
      let undated = 0;
      let afterDeadline = 0;

      for (let page = 1; page <= TALLY_MAX_PAGES; page++) {
        const envelope = await fetchPage(formId, page, apiKey);

        // Partials are only ever COUNTED. The envelope reports the whole
        // form's partial pool, so the last read wins rather than accumulating.
        summary.partialCount = envelope.totalNumberOfSubmissionsPerFilter?.partial ?? 0;

        // Labels live in the envelope, not in the submissions. Merge across
        // pages so a question absent from a later page keeps its label. The
        // TYPE map is merged the same way, in the same place, and must stay
        // that way: field selection ranks by block type first, so a type lost
        // mid-scan would silently drop that question to the fail-soft path.
        Object.assign(questionMap, buildQuestionMap(envelope.questions));
        Object.assign(questionTypeMap, buildQuestionTypeMap(envelope.questions));

        const pageSubmissions = envelope.submissions ?? [];
        const { inWindow, skippedUndated, skippedAfterDeadline, stoppedAtCutoff } =
          partitionByCutoff(pageSubmissions, windowStart, windowEnd);
        collected.push(...inWindow);
        undated += skippedUndated;
        afterDeadline += skippedAfterDeadline;

        if (stoppedAtCutoff) {
          // Newest-first: everything past this row is older than the cutoff.
          summary.stoppedAtCutoff = true;
          break;
        }
        if (!envelope.hasMore || pageSubmissions.length === 0) break;
        if (page === TALLY_MAX_PAGES) {
          pageCapHit = true;
          log("warn", "page_cap_hit", { formId, offering: label, maxPages: TALLY_MAX_PAGES });
        }
      }

      const submissions = dedupeBySubmissionId(collected);
      summary.scanned = submissions.length;

      if (undated > 0) {
        summary.undatedSkipped = undated;
        log("warn", "undated_submissions_skipped", {
          formId,
          offering: label,
          count: undated,
          note: "submittedAt missing or unparseable; not ingested, and not treated as the cutoff boundary",
        });
      }

      if (afterDeadline > 0) {
        summary.afterDeadlineSkipped = afterDeadline;
        log("info", "after_deadline_submissions_skipped", {
          formId,
          offering: label,
          count: afterDeadline,
          windowEnd,
          note: "submitted after offerings.application_deadline (IST end of day); not ingested, and not treated as the cutoff boundary. Routine once an edition closes while its form stays live.",
        });
      }

      // Map purely first, so the DB is only asked about rows that could exist.
      let notCompleted = 0;
      const candidates: CohortApplicationRow[] = [];
      for (const submission of submissions) {
        if (!isIngestableSubmission(submission)) {
          // FX-2.3. `&filter=completed` should already have kept partials off
          // this page; that is a query string, this is the guarantee.
          notCompleted++;
          continue;
        }
        const row = toApplicationRow(submission, questionMap, offering.id, null, questionTypeMap);
        if (!row || !row.tally_response_id) {
          // No email (or no stable response id) — same skip as the webhook.
          summary.skipped++;
          continue;
        }
        candidates.push(row);
      }

      if (notCompleted > 0) {
        summary.skippedNotCompleted = notCompleted;
        log("error", "not_completed_submissions_skipped", {
          formId,
          offering: label,
          count: notCompleted,
          note: "a submission without isCompleted=true reached the ingest loop despite the completed-only fetch filter; not inserted. Check the Tally query string.",
        });
      }

      // ONE read of what this offering already holds, instead of two per
      // submission. Dedupe per offering+email — unlike the webhook this SKIPS
      // rather than updates (header note on the 15-minute re-scan) — and per
      // response id, so a row this offering already ingested never reaches the
      // insert. The running sets also collapse a repeated email WITHIN a batch.
      const existing = await loadExistingKeys(admin, offering.id);
      const fresh: CohortApplicationRow[] = [];
      for (const row of candidates) {
        const emailKey = row.email.toLowerCase();
        if (existing.emails.has(emailKey) || existing.responseIds.has(row.tally_response_id)) {
          summary.skipped++;
          continue;
        }
        existing.emails.add(emailKey);
        existing.responseIds.add(row.tally_response_id);
        fresh.push(row);
      }

      // Link existing accounts in one chunked read rather than per row.
      const userIds = await lookupUserIds(admin, fresh.map((row) => row.email));

      let insertFailed = 0;
      let lastInsertError = "";

      for (const row of fresh) {
        row.user_id = userIds.get(row.email.toLowerCase()) ?? null;

        const { error: insertErr } = await admin.from("cohort_applications").insert(row);
        if (insertErr) {
          // 23505 = the unique partial index cohort_applications_tally_response_id_key,
          // which is GLOBAL rather than per-offering. Two very different causes
          // land here, so find out which before counting it.
          if ((insertErr as { code?: string }).code === "23505") {
            const { data: owner } = await admin
              .from("cohort_applications")
              .select("id, offering_id")
              .eq("tally_response_id", row.tally_response_id)
              .maybeSingle();
            const ownerOfferingId = (owner as { offering_id?: string } | null)?.offering_id ?? null;

            if (ownerOfferingId && ownerOfferingId !== offering.id) {
              // A DIFFERENT offering owns this submission: this form is pointed
              // at by two staged offerings. Not idempotent success — no row
              // exists for this offering and, the index being global, none ever
              // will. Counting it as a plain skip would hide it forever.
              summary.crossOfferingCollisions = (summary.crossOfferingCollisions ?? 0) + 1;
              log("error", "cross_offering_response_collision", {
                formId,
                offering: label,
                offeringId: offering.id,
                responseId: row.tally_response_id,
                ownedByOfferingId: ownerOfferingId,
                note: "tally_form_url points two staged offerings at one form; the global unique index on tally_response_id lets only the first ingest it",
              });
              continue;
            }

            // Same offering: a concurrent run already created this row.
            // Idempotent success, no new row, so it counts as skipped.
            summary.skipped++;
            continue;
          }
          // A real failure (constraint, RLS, connection, timeout). NOT a skip:
          // see the note on FormSummary.insertFailed. Still fail-soft — the
          // remaining rows are attempted — but it is surfaced on the summary.
          insertFailed++;
          lastInsertError = insertErr.message;
          log("error", "application_insert_failed", {
            formId,
            responseId: row.tally_response_id,
            message: insertErr.message,
          });
          continue;
        }
        summary.created++;
      }

      if (insertFailed > 0) {
        summary.insertFailed = insertFailed;
        summary.error = `${insertFailed} of ${fresh.length} insert(s) failed (last: ${lastInsertError})`;
      }

      // The recoverable pool, finally visible as a number.
      log("info", "form_polled", {
        formId,
        offering: label,
        // FX-2 replaced the single `cutoff` with an explicit window; this
        // shorthand was left pointing at the deleted binding, which made the
        // per-form success log throw AFTER the inserts had already committed —
        // silencing the one health signal and turning every form into a
        // `form_failed` at ERROR. Only `deno check` sees this file.
        windowStart: summary.windowStart,
        windowEnd: summary.windowEnd,
        scanned: summary.scanned,
        created: summary.created,
        skipped: summary.skipped,
        insertFailed: summary.insertFailed ?? 0,
        undatedSkipped: summary.undatedSkipped ?? 0,
        crossOfferingCollisions: summary.crossOfferingCollisions ?? 0,
        partialCount: summary.partialCount,
        stoppedAtCutoff: summary.stoppedAtCutoff,
      });
    } catch (err) {
      // Fail-soft per form: record and move on to the next offering.
      summary.error = err instanceof Error ? err.message : String(err);
      log("error", "form_failed", { formId, offering: label, message: summary.error });
    }
  }

  // `skippedNoCutoff` IS UNCONDITIONAL, UNLIKE `pageCapHit`. `pageCapHit` is a
  // flag whose absence means the same thing as `false`, so emitting it only when
  // true costs nothing. This is a COUNT, and the whole reason it exists is to
  // state "no staged offering is silently un-pollable" as a fact rather than as
  // an inference from a missing key — omitting a zero would put `0` and "the
  // poller is too old to report this" back in the same place, which is precisely
  // the ambiguity `countOfferingsWithoutCutoff` was written to remove. `null` is
  // carried through verbatim: the count query failed, so the answer is unknown
  // and explicitly not zero.
  const body: Record<string, unknown> = { ok: true, forms, skippedNoCutoff: noCutoff.count };
  if (pageCapHit) body.pageCapHit = true;
  return jsonRes(body);
});
