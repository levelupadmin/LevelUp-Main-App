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
 * THE HARD REQUIREMENT — THE INTAKE CUTOFF. One Tally form is reused across
 * editions (form `81dRPA` carries 880 historical completed submissions from
 * Edition 1 and earlier). Ingesting them would fabricate hundreds of bogus
 * applications and corrupt the NSM baseline. So every submission is gated on
 * `offerings.intake_opens_at ?? offerings.created_at`, and because Tally
 * returns newest-first the scan STOPS at the first out-of-window row. The
 * comparison itself lives in `_shared/tally.ts` (`isInIntakeWindow` /
 * `partitionByCutoff`) so it is unit-testable — this file must not reimplement
 * it inline.
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
 * PARTIALS ARE COUNTED, NEVER CREATED. `cohort_applications.status` has no
 * honest value for an incomplete form, so partials are reported as a number
 * per form (response + one structured log line) and nothing else.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildQuestionMap,
  dedupeBySubmissionId,
  formIdFromTallyUrl,
  partitionByCutoff,
  toApplicationRow,
  type CohortApplicationRow,
  type TallyEnvelope,
  type TallySubmission,
} from "../_shared/tally.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

interface OfferingRow {
  id: string;
  title: string | null;
  slug: string | null;
  tally_form_url: string | null;
  intake_opens_at: string | null;
  created_at: string;
}

/**
 * The brief's per-form summary shape. The three optional fields are emitted
 * ONLY when non-zero/present, so a healthy run still returns exactly the shape
 * the brief specifies; each one exists because folding it into `skipped` would
 * make a real fault indistinguishable from routine dedupe.
 */
interface FormSummary {
  formId: string;
  offering: string;
  scanned: number;
  created: number;
  skipped: number;
  partialCount: number;
  stoppedAtCutoff: boolean;
  /** Submissions with no usable `submittedAt`: skipped, never a stop signal. */
  undatedSkipped?: number;
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

  // Auth: service_role only. `verify_jwt = true` in config.toml only proves the
  // caller holds SOME valid project JWT — the anon key qualifies — so without
  // this check any anonymous caller could hammer the poller and burn the Tally
  // API quota. Parse the bearer token and require role=service_role, the same
  // guarantee notify-cohort/index.ts:47-60 relies on.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonRes({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7).trim();
  try {
    // base64URL → base64 before decoding. `atob` implements WHATWG
    // forgiving-base64, which REJECTS `-` and `_` — the exact substitutions
    // base64url makes for `+` and `/`. Whether a given service-role payload
    // happens to encode a 62/63 sextet is luck of the claim bytes, and this is
    // the first function whose only caller is cron: an unlucky key would 401
    // every 15 minutes and take intake down with no other signal.
    const segment = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(segment)) as { role?: string };
    if (payload.role !== "service_role") return jsonRes({ error: "Forbidden" }, 403);
  } catch {
    return jsonRes({ error: "Invalid token" }, 401);
  }

  const apiKey = Deno.env.get("TALLY_API_KEY") ?? "";
  if (!apiKey) {
    // Fail-soft: an unset key is a config state, not an incident. Nothing is
    // ingested and the next run picks up once the secret is set.
    log("warn", "tally_api_key_unset", {});
    return jsonRes({ ok: true, skipped: "TALLY_API_KEY not configured", forms: [] });
  }

  const admin = createAdminClient();

  // ORDERED, not incidental. Two staged offerings may point at the same form
  // (see the header), and because the unique index on tally_response_id is
  // global, whichever one is scanned FIRST claims each submission. An unordered
  // select would hand that to whatever Postgres happened to return first and
  // could change the winner between runs. Ordered newest-intake-first — with
  // NULL intake_opens_at last, then created_at, then id so the order is total —
  // the live edition wins and a stale leftover edition is the one that reports
  // the collision, which is the right way round.
  const { data: offeringData, error: offeringsErr } = await admin
    .from("offerings")
    .select("id, title, slug, tally_form_url, intake_opens_at, created_at")
    .eq("payment_mode", "staged")
    .not("tally_form_url", "is", null)
    .order("intake_opens_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (offeringsErr) {
    log("error", "offerings_query_failed", { message: offeringsErr.message });
    return jsonRes({ error: offeringsErr.message }, 500);
  }

  const offerings = (offeringData ?? []) as OfferingRow[];
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

    // The cutoff. NULL intake_opens_at falls back to the offering's own
    // created_at — and that fallback is LOUD, because it is the one path that
    // can mass-backfill history. TP-1 only hardened the pilot offering's
    // intake_opens_at; any other staged offering whose row predates its form's
    // traffic (an earlier edition still marked staged, a draft created months
    // before intake opened, a row cloned in the admin editor) would otherwise
    // ingest every completed submission since the ROW was created, silently,
    // reported only as a large `created` count.
    const cutoff = offering.intake_opens_at ?? offering.created_at;
    if (!offering.intake_opens_at) {
      log("warn", "cutoff_defaulted_to_created_at", {
        formId,
        offering: label,
        offeringId: offering.id,
        cutoff,
        note: "offerings.intake_opens_at is NULL; set it to bound this form's intake window",
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
    };
    forms.push(summary);

    try {
      const questionMap: Record<string, string> = {};
      const collected: TallySubmission[] = [];
      let undated = 0;

      for (let page = 1; page <= TALLY_MAX_PAGES; page++) {
        const envelope = await fetchPage(formId, page, apiKey);

        // Partials are only ever COUNTED. The envelope reports the whole
        // form's partial pool, so the last read wins rather than accumulating.
        summary.partialCount = envelope.totalNumberOfSubmissionsPerFilter?.partial ?? 0;

        // Labels live in the envelope, not in the submissions. Merge across
        // pages so a question absent from a later page keeps its label.
        Object.assign(questionMap, buildQuestionMap(envelope.questions));

        const pageSubmissions = envelope.submissions ?? [];
        const { inWindow, skippedUndated, stoppedAtCutoff } = partitionByCutoff(
          pageSubmissions,
          cutoff,
        );
        collected.push(...inWindow);
        undated += skippedUndated;

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

      // Map purely first, so the DB is only asked about rows that could exist.
      const candidates: CohortApplicationRow[] = [];
      for (const submission of submissions) {
        const row = toApplicationRow(submission, questionMap, offering.id, null);
        if (!row || !row.tally_response_id) {
          // No email (or no stable response id) — same skip as the webhook.
          summary.skipped++;
          continue;
        }
        candidates.push(row);
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
        cutoff,
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

  const body: Record<string, unknown> = { ok: true, forms };
  if (pageCapHit) body.pageCapHit = true;
  return jsonRes(body);
});
