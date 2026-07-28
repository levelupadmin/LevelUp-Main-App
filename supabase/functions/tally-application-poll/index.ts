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
 *      system. The only writes are app-owned: the `cohort_applications` insert
 *      and the applicant's own auth user (see IDENTITY PROVISIONING below).
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
 * IDENTITY PROVISIONING — WHY IT LIVES HERE AND NOT IN THE WEBHOOK (phase SP,
 * REQ-IDENT-1). An applicant must become an app user WITHOUT ever seeing a
 * signup screen, so intake provisions the `auth.users` row itself. The PRD
 * writes that against the webhook; the webhook is fail-closed and inert (no
 * `TALLY_SIGNING_SECRET`), so provisioning built there would never run. This
 * function is the live host. The decision itself is pure and shared
 * (`_shared/identity.ts`), and the webhook calls the SAME sequence, so
 * behaviour is identical if a signing secret is ever set.
 *
 * It is IDEMPOTENT for the same reason the insert is: provisioning runs only
 * for genuinely-new rows (`fresh`, already past the response-id/email dedupe),
 * and even if a run creates the user and then fails to insert, the next tick
 * finds that user by email and stamps it rather than minting a second one.
 * It is FAIL-SOFT: any provisioning error leaves `user_id` NULL and the
 * application is still inserted — an unlinked application is recoverable, a
 * lost one is not. And it NEVER MERGES: ANY partial identity match — the email
 * belongs to an account, the phone belongs to an account, or the two belong to
 * different accounts — is a collision, which defers to an interactive claim
 * (`pending_claim`), never a silent join on the strength of a form answer.
 * The account it mints carries BOTH identifiers, both UNCONFIRMED, and is
 * tagged as unverified intake so it grants no entitlements until a real OTP
 * proves a channel (see `provisionApplicant`).
 *
 * DEPLOY ORDER — MIGRATION FIRST. The collision path names `pending_claim`, so
 * this function must not be deployed ahead of
 * `20260727120000_cohort_applications_pending_claim.sql`. A tick in between
 * inserts ordinary rows fine (the column is never named for them) but raises
 * 42703 on a collision row and counts it as `insertFailed`. It self-heals —
 * nothing was inserted and the window never shrinks, so the next tick after
 * the migration lands retries it — but the gap is avoidable and should be.
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
import { decideProvision, identityKeys, type ProvisionOutcome } from "../_shared/identity.ts";
import { normalizePhone } from "../_shared/phone.ts";
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
  /** Applicants given a brand-new passwordless auth user by this run. */
  provisionCreated?: number;
  /**
   * Identity collisions: inserted with `user_id` NULL + `pending_claim`, with
   * NOTHING minted and nothing merged. Counted separately from `insertFailed`
   * because it is a correct, expected outcome — but it is also the only state
   * that needs a human-facing claim step, so it must never hide inside `created`.
   */
  provisionCollisions?: number;
  /** Provisioning threw: the application was still inserted, `user_id` NULL. */
  provisionFailed?: number;
  /**
   * Rows inserted with provisioning deliberately OFF — either
   * `PROVISION_APPLICANTS` is not "true" or the gate migration is not applied.
   * Surfaced so "intake is healthy but nothing is linking" is legible at a
   * glance instead of looking like a silent provisioning failure.
   */
  provisionSkipped?: number;
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
 * ONE `auth.users` lookup on ONE key, via the deterministic
 * `find_login_identity` RPC. Never GoTrue's admin list `?email=`/`?phone=`
 * filter: that param is silently ignored and returns page 1 of ALL users, so
 * every applicant past page 1 would read as brand-new and get a second account
 * (the exact bug 20260603120000_legacy_login_fix.sql was written to kill).
 *
 * The RPC normalises internally the same way `identityKeys` does — lower/trim
 * on email, last-10 subscriber digits on phone — so the caller's keys go
 * straight in. It is `service_role`-only and returns at most one row.
 *
 * Exactly ONE key per call, deliberately. The RPC ORs its two predicates and
 * `LIMIT 1`s the result, so passing both at once collapses "email belongs to A,
 * phone belongs to B" — the collision this whole path exists to detect — into a
 * single winner. `decideProvision` needs the two answers separately.
 *
 * Throws on error rather than returning null: a lookup failure that read as
 * "nobody has this email" would mint a duplicate account for an existing user.
 * The throw lands in `provisionApplicant`'s fail-soft catch.
 */
async function findAuthIdentity(
  admin: AdminClient,
  key: { email: string } | { phone: string },
): Promise<{ id: string } | null> {
  const { data, error } = await admin.rpc("find_login_identity", {
    p_phone: "phone" in key ? key.phone : null,
    p_email: "email" in key ? key.email : null,
  });
  if (error) throw new Error(`find_login_identity failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { id?: string } | undefined;
  return row?.id ? { id: row.id } : null;
}

/**
 * The applicant's identity BY EMAIL — `auth.users` first, then the
 * `public.users` mirror.
 *
 * THE MIRROR LEG IS NOT A BELT-AND-BRACES EXTRA; without it this lookup misses
 * most of the existing user base. `find_login_identity` matches
 * `lower(auth.users.email)`, but the app's phone-first signup mints the auth
 * row with a PLACEHOLDER address — `Signup.tsx` sends `syntheticEmail(phone)`
 * (`…@phone.leveluplearning.in`) — and the real address is written later by
 * `set_onboarding_profile`, which updates `public.users` ONLY
 * (20260611100000). So for essentially every user who signed up by phone,
 * `auth.users.email` is the placeholder and their real email exists solely in
 * the mirror. Asking GoTrue alone would report them as "email belongs to
 * nobody" and park their application in a claim flow they should never have
 * seen — the exact regression against the `email -> users.id` lookup this
 * function replaced.
 *
 * Both legs are keyed on the SAME normalised value: `identityKeys` lowercases
 * and trims, `find_login_identity` lowercases internally, and
 * `set_onboarding_profile` stores `lower(btrim(p_email))` — so a plain `.eq`
 * on the mirror is an exact match, not a case-sensitivity gamble. `deleted_at
 * IS NULL` because a soft-deleted profile must not adopt new applications, and
 * `public.users.email` is UNIQUE (20260530120000) so this can never be
 * ambiguous.
 *
 * `id` is shared by both tables (`handle_new_user` mirrors with the same id),
 * so either leg returns something `decideProvision` can compare with `byPhone`.
 * Throws rather than swallowing: a lookup read as "nobody has this email"
 * mints a duplicate account for an existing user.
 */
async function findIdentityByEmail(
  admin: AdminClient,
  email: string,
): Promise<{ id: string } | null> {
  const authRow = await findAuthIdentity(admin, { email });
  if (authRow) return authRow;

  const { data, error } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`users mirror email lookup failed: ${error.message}`);
  const id = (data as { id?: string } | null)?.id;
  return id ? { id } : null;
}

/**
 * The applicant's phone as GoTrue must receive it, or null when it cannot be
 * trusted as a real number.
 *
 * `normalizePhone` accepts only a 10-digit subscriber number or a 12-digit
 * `91`-prefixed one and returns the 10 digits, which we render as
 * `+91XXXXXXXXXX` — the canonical form `legacy_enrolments`, verify-msg91-otp
 * and `claim_legacy_enrolments_for_user` all agree on. Deliberately NOT
 * `e164()`: that only prepends a `+`, so raw form text of "9788385577" would
 * mint the auth row with "+9788385577", a number that exists nowhere and that
 * no MSG91 login could ever present.
 *
 * Anything else (a foreign number, a typo, a landline) returns null and the
 * account is minted email-only. That is a smaller loss than binding a login
 * key to digits nobody can prove.
 */
function mintablePhone(raw: string | null): string | null {
  const digits = normalizePhone((raw ?? "").trim());
  return digits ? `+91${digits}` : null;
}

/**
 * `app_metadata` stamped on every account this intake mints. `app_metadata` is
 * service-role-only (a user can never write it, unlike `user_metadata`), which
 * is what makes it usable as a TRUST SIGNAL: it marks an identity whose email
 * and phone are still nothing but unauthenticated form text.
 *
 * `claim_legacy_enrolments_for_user` (hardened in
 * 20260727120000_cohort_applications_pending_claim.sql) reads this flag and
 * grants NOTHING while it is set and no channel is confirmed. Without it,
 * minting a user here fires the legacy-entitlement claim on an unverified
 * email and hands a stranger a real TagMango customer's paid catalogue —
 * `handle_new_user` → `public.users` INSERT → `users_claim_legacy_enrolments`
 * with `v_email_claims_ok = (TG_OP = 'INSERT') = true`. That INSERT-only
 * carve-out was written on the assumption that an INSERT into `public.users`
 * only ever follows a VERIFIED auth path; this function is the first intake
 * that breaks the assumption, so it must announce itself.
 *
 * The flag is never cleared. The gate stops applying the moment GoTrue records
 * a `phone_confirmed_at`/`email_confirmed_at` on the row — i.e. when a real OTP
 * finally proves a channel — and parts 4 and 5 of that migration are what
 * actually re-drive the withheld claim at that point (the phone arm on the
 * mirror write, the email arm on first email confirmation). Neither arm can
 * fire off the gate alone: this function's own INSERT is the only event the
 * email-keyed claim was ever allowed to run on.
 */
const INTAKE_APP_METADATA = {
  levelup_unverified_intake: true,
  provisioned_by: "tally_intake",
} as const;

/**
 * THE KILL SWITCH. Provisioning is OFF unless `PROVISION_APPLICANTS` is
 * explicitly "true".
 *
 * This function is a cron job that has been LIVE and ticking every 15 minutes
 * since 2026-07-27, and intake is the one thing that must not stop: a lost
 * application is a lost applicant, and nobody is watching at 03:00. Every other
 * moving part of phase SP is additive and reversible by a flag; provisioning is
 * the one surface that mutates `auth.users` from unauthenticated input, and
 * before this switch its only rollback was a redeploy. So it ships INERT: the
 * deploy is proven safe with provisioning off, then the secret is set and ONE
 * tick is watched deliberately.
 *
 * Absent env → off. The default is the safe direction, so a typo, an unset
 * secret, or a fresh project all disable provisioning rather than enable it.
 */
const PROVISION_APPLICANTS = (Deno.env.get("PROVISION_APPLICANTS") ?? "").trim().toLowerCase() === "true";

/**
 * Is the migration that gates an unproven intake identity actually applied?
 *
 * THE HAZARD THIS CLOSES is deploy ORDER, and it is the one irreversible step
 * in the sequence. If this function ships before
 * 20260727120000_cohort_applications_pending_claim.sql, ordinary rows still
 * mint intake-tagged auth users while the gate in
 * `claim_legacy_enrolments_for_user` does not yet exist — so the email-keyed
 * legacy claim runs on an address nobody proved and stamps
 * `claimed_by_user_id` permanently. One 15-minute tick in the wrong order
 * cannot be undone. Ordering is a runbook instruction, and a runbook is not a
 * control; this is.
 *
 * FAILS CLOSED BY CONSTRUCTION: the probe is an RPC that only exists once the
 * migration has run, so "not applied" and "cannot tell" are the same answer —
 * a missing function returns PGRST202, which lands in the same `false` as an
 * outright error. Checked once per invocation, not per row.
 */
async function intakeGateInstalled(admin: AdminClient): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("intake_provisioning_gate_ok");
    if (error) {
      log("error", "provision_gate_absent", {
        code: (error as { code?: string }).code ?? null,
        message: error.message,
        note: "the pending_claim migration is not applied, so minting an identity here would let the email-keyed legacy claim run unproven and stamp claimed_by_user_id permanently; provisioning is SKIPPED this tick and applications still insert unlinked",
      });
      return false;
    }
    return data === true;
  } catch (err) {
    log("error", "provision_gate_probe_failed", {
      message: err instanceof Error ? err.message : String(err),
      note: "could not prove the gate is installed; treating as absent and skipping provisioning",
    });
    return false;
  }
}

/** What provisioning decided for one application, in the shape the row needs. */
interface ProvisionResult {
  /** The auth uid to stamp, or null (no identity, collision, or failure). */
  userId: string | null;
  /** Collision only: the row is inserted unlinked and awaits an OTP claim. */
  pendingClaim: boolean;
  /** `created | existing | collision | skipped | error`, for the summary. */
  status: ProvisionOutcome["status"] | "error";
}

/**
 * Resolve — and if necessary CREATE — the applicant's auth identity, so the
 * application is already bound to an `auth.uid` before it is inserted and the
 * applicant never meets a signup screen (REQ-IDENT-1).
 *
 * The decision is `decideProvision`, which is pure and unit-tested; this
 * function performs the two lookups, applies the INTAKE POLICY the pure module
 * deliberately refuses to own, and does the one write that is left.
 *
 * ── WHAT A MINTED ACCOUNT CARRIES ───────────────────────────────────────────
 * BOTH identifiers, BOTH unconfirmed, plus `INTAKE_APP_METADATA`. Carrying
 * both is the whole point of the phase — "one passwordless `auth.users` row
 * carries both phone and email, so a later OTP on EITHER channel resolves to
 * the same `auth.uid`" — and it is what keeps the applicant away from a signup
 * screen. Minting email-only would dead-end the phone tab: `find_login_identity`
 * would find no row for the number, `verify-msg91-otp` would return
 * `signup_requires_email_and_name`, Login.tsx would say "No account with this
 * number. Sign up first.", and the ensuing signup would mint a SECOND account
 * on `syntheticEmail(phone)` — one human, two identities, and the application
 * stamped on the one they are not signed into.
 *
 *  • `email_confirm: false` / `phone_confirm: false` — the
 *    guest-create-order/index.ts:247-255 reasoning. Both values are
 *    unauthenticated form text; the account must be INERT (no entitlements,
 *    nothing confirmed) until a real OTP proves a channel.
 *
 *  • ACCEPTED RESIDUAL RISK, stated plainly because it is inherent to the
 *    design and not to this implementation: `auth.users.phone` is the phone-OTP
 *    login key and `find_login_identity` matches it with no reference to
 *    `phone_confirmed_at`, so a number written here is reachable before anyone
 *    proves it. Someone who submits the public form with {their own email, a
 *    stranger's number} pre-binds that number, and the stranger's first genuine
 *    MSG91 OTP resolves into an account whose email the submitter controls. It
 *    is bounded: a number that ALREADY belongs to an account is never touched
 *    (that is `phone_taken` → parked, below), so only unregistered numbers can
 *    be pre-bound. Closing it properly means teaching `find_login_identity` to
 *    prefer a confirmed row — a change to the live login path for every user,
 *    which is neither this task's file nor its blast radius.
 *
 *  • NO `user_metadata.phone`, which is a DIFFERENT field from the above.
 *    `handle_new_user` mirrors `NEW.raw_user_meta_data->>'phone'` (never
 *    `NEW.phone`) into the UNIQUE `public.users.phone`, where an unproven value
 *    both feeds `claim_legacy_enrolments_for_user`'s PHONE-keyed arm and squats
 *    the column against its real owner. The mirror phone is written later, by
 *    `sync_confirmed_phone_to_users` (20260727120000), and only once GoTrue has
 *    recorded a `phone_confirmed_at` — i.e. only with proof.
 *
 * ── INTAKE POLICY ON THE THREE COLLISION REASONS ────────────────────────────
 * All three are handled IDENTICALLY: insert with `user_id` NULL +
 * `pending_claim`, mint nothing, join nothing. That is the brief's S-2 spec
 * ("`collision` → leave `user_id` NULL and set `pending_claim = true`"), the
 * shared module's authoritative statement of the trigger, and inviolable rule
 * 3 (never a silent merge).
 *
 * There is no carve-out for `email_taken`, and the tempting one — "the email
 * has an account, the phone has none, so there is nothing to merge, just
 * stamp it" — is a hole: nothing at intake proves the email. Anyone could POST
 * the public form with a stranger's address and their own phone, and the
 * application (their name, phone, city, occupation, bio) would be stamped onto
 * the stranger's `user_id`, surfaced to the stranger by
 * `students_read_own_applications`, and rendered by S-5 as the stranger's own
 * applicant stage. The ordinary "someone who already has an account applies"
 * case does NOT land here anyway: their email and phone both resolve to the
 * same uid, which is `existing`, and `findIdentityByEmail`'s mirror leg is
 * what makes that hold for the phone-first user base.
 *
 * CONSEQUENCE, for S-4: a parked row need not carry both channels. An
 * `email_taken` collision on a submission with no usable phone parks a row
 * whose only channel is the email — and the claim must prove the channel the
 * caller has NOT already used, so such a row cannot be self-claimed. It is
 * rare (the Tally form asks for a phone) and it is a stuck row rather than a
 * wrong bind, which is the correct way round.
 *
 * FAIL-SOFT throughout: every failure path returns `userId: null` and the
 * caller still inserts the application. It is logged at ERROR because the NULL
 * never self-heals — this function never updates an existing row.
 */
async function provisionApplicant(
  admin: AdminClient,
  applicant: { email: string; phone: string | null; fullName: string },
): Promise<ProvisionResult> {
  try {
    // INSIDE the try on purpose. `identityKeys` is pure but not total — it
    // reads .trim()/.toLowerCase() off fields that arrive as untyped JSON, so a
    // non-string (a Tally field that came back as a number, an object, null
    // where a string was assumed) throws a TypeError. Outside the try that
    // escapes the mandated fail-soft and takes down the WHOLE form's batch;
    // inside it, one malformed application is parked and the rest still land.
    const keys = identityKeys({ email: applicant.email, phone: applicant.phone });

    const byEmail = keys.email ? await findIdentityByEmail(admin, keys.email) : null;
    const byPhone = keys.phone ? await findAuthIdentity(admin, { phone: keys.phone }) : null;
    const outcome = decideProvision(keys, { byEmail, byPhone });

    switch (outcome.status) {
      case "existing":
        return { userId: await mirroredUserId(admin, outcome.userId), pendingClaim: false, status: "existing" };

      case "collision": {
        // All three reasons, one handling. See the INTAKE POLICY note above.
        log("warn", "provision_collision", {
          reason: outcome.reason,
          note: "an existing account already owns one of the applicant's identifiers, and intake cannot prove the applicant is that account; inserted with user_id NULL + pending_claim, nothing merged, no user minted. Resolved interactively at first sign-in by an OTP on the channel the caller has not already used.",
        });
        return { userId: null, pendingClaim: true, status: "collision" };
      }

      case "created": {
        // An email is the only thing we may key a new identity on (GoTrue
        // needs one to mint a magiclink session, and `handle_new_user` mirrors
        // it), so a submission without a usable one is left unlinked rather
        // than minting a phone-only account. Tally guarantees an email and the
        // column is NOT NULL, so this is a guard, not a path.
        if (!keys.email) {
          log("warn", "provision_no_email", {
            note: "application carries no usable email; inserted with user_id NULL rather than minting an account with no way to mint a session",
          });
          return { userId: null, pendingClaim: false, status: "skipped" };
        }
        // EMAIL-ONLY. The phone is stashed in `app_metadata`, NEVER written to
        // `auth.users.phone`.
        //
        // WHY — this is the one line the SP council blocked on, and it was
        // right. `auth.users.phone` is not a contact detail, it is the
        // PHONE-OTP LOGIN KEY: `find_login_identity` (20260603120000:78-92)
        // matches it on the last 10 digits with NO `phone_confirmed_at`
        // predicate. Writing unauthenticated public-form text there binds a
        // login key to digits nobody has proven. The attack is one form
        // submission: POST {an email you own, a stranger's unregistered
        // number}; fifteen minutes later this cron mints the row; the
        // stranger's first genuine MSG91 OTP then resolves into an account
        // whose email — and therefore whose magic-link sign-in at
        // Login.tsx:390 (`shouldCreateUser:false`, already shipped) — the
        // submitter controls. Silent, permanent, invisible to the victim.
        //
        // NO FLAG CONTAINS THIS. `VITE_EMAIL_OTP_TAB` gates the new Email tab,
        // which is the harmless surface; the magic-link path it would have
        // gated has been in production for months.
        //
        // The number is not lost. `sync_intake_phone_on_confirm` (part 4a of
        // 20260727120000) promotes it onto `auth.users.phone` the moment a
        // `phone_confirmed_at` lands on THIS row by any route — i.e. once the
        // applicant has actually proven the number. Unproven, it is inert
        // metadata that no lookup keys on.
        //
        // COST, stated honestly, both halves:
        //  1. Until they prove it, the applicant's phone tab does not resolve
        //     to this account. That is exactly today's production behaviour for
        //     an applicant, so it is an unmet stretch goal, not a regression —
        //     and the email route is the CTA in their confirmation mail.
        //  2. A second application from the SAME phone under a DIFFERENT email
        //     no longer lands as `collision/phone_taken` (nothing keys on the
        //     phone any more), so it mints a second identity instead of parking
        //     a row. One human, two email-keyed accounts. That is a data-quality
        //     problem an operator can merge; the alternative it replaces is an
        //     account takeover, which cannot be undone. Deliberate trade.
        //
        // `byPhone` is still looked up and still forces a collision when an
        // existing account ALREADY owns the number — that check reads a proven
        // value written by GoTrue, which is safe. Only the WRITE is removed.
        const intakePhone = mintablePhone(applicant.phone);
        if (keys.phone && !intakePhone) {
          log("warn", "provision_phone_unmintable", {
            note: "the application's phone is not a 10-digit or 91-prefixed 12-digit number, so nothing is stashed for later promotion",
          });
        }
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: keys.email,
          email_confirm: false,
          phone_confirm: false,
          user_metadata: { full_name: applicant.fullName },
          app_metadata: {
            ...INTAKE_APP_METADATA,
            ...(intakePhone ? { levelup_intake_phone: intakePhone } : {}),
          },
        });
        if (createErr || !created?.user?.id) {
          throw new Error(createErr?.message ?? "createUser returned no user");
        }
        return {
          userId: await mirroredUserId(admin, created.user.id),
          pendingClaim: false,
          status: "created",
        };
      }

      case "skipped":
        return { userId: null, pendingClaim: false, status: "skipped" };
    }
  } catch (err) {
    log("error", "provision_failed", {
      message: err instanceof Error ? err.message : String(err),
      note: "the application is still inserted, with user_id NULL and pending_claim TRUE so it stays reachable; the poller never updates, so it is resolved by the interactive claim or by hand",
    });
    // pendingClaim TRUE, not false. A failure here can land AFTER createUser
    // succeeded (the mirror read, or anything downstream of it), so the row may
    // have a real auth identity and no `user_id` to show for it. With
    // pending_claim false such a row matches NEITHER RLS policy — not
    // `students_read_own_applications` (user_id is NULL) nor
    // `claimants_read_pending_applications` (pending_claim is false) — so it is
    // invisible to the applicant AND never revisited, because `loadExistingKeys`
    // puts its email in the existing set and the next tick skips it. Parking it
    // is strictly better: the worst case is an applicant offered a claim that
    // resolves to an identity already theirs, which the claim path handles.
    return { userId: null, pendingClaim: true, status: "error" };
  }
}

/**
 * `cohort_applications.user_id` references `public.users(id)`, not
 * `auth.users(id)`. `handle_new_user()` (20260405070345) mirrors one to the
 * other with the SAME id on AFTER INSERT, so a freshly-created uid is always
 * present — but an auth row that predates that trigger need not be, and
 * stamping an unmirrored uid would fail the FK and cost us the whole
 * application. So the uid is confirmed against the mirror before it is used,
 * and an unmirrored one degrades to NULL: unlinked, not lost.
 */
async function mirroredUserId(admin: AdminClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("users").select("id").eq("id", userId).maybeSingle();
  if (error) throw new Error(`users mirror check failed: ${error.message}`);
  if (data) return userId;
  log("error", "provisioned_user_not_mirrored", {
    userId,
    note: "auth user exists but public.users has no row with that id; user_id left NULL rather than risking the FK and losing the application",
  });
  return null;
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

      let insertFailed = 0;
      // BOTH gates, resolved ONCE per form rather than per row: the operator's
      // deliberate switch, and proof that the migration this depends on is
      // actually applied. Either one false means every row this tick inserts
      // exactly as it did before phase SP — unlinked, never lost.
      const provisioningEnabled = PROVISION_APPLICANTS && (await intakeGateInstalled(admin));
      if (!PROVISION_APPLICANTS) {
        log("info", "provisioning_disabled", {
          note: "PROVISION_APPLICANTS is not 'true'; applications insert with user_id NULL exactly as they did before phase SP",
        });
      }

      let lastInsertError = "";
      let provisionCreated = 0;
      let provisionSkipped = 0;
      let provisionCollisions = 0;
      let provisionFailed = 0;

      for (const row of fresh) {
        // IDENTITY FIRST, THEN THE INSERT (phase SP, see the header). `fresh` is
        // already past the response-id/email dedupe, so this only ever runs for
        // a genuinely-new application — which is what makes it idempotent
        // across ticks. It replaces the old `email → users.id` lookup: that
        // single key could only ever LINK an account that happened to exist,
        // whereas this also creates the missing one and refuses to guess when
        // the two keys disagree.
        const provisioned = provisioningEnabled
          ? await provisionApplicant(admin, {
              email: row.email,
              phone: row.phone,
              fullName: row.full_name,
            })
          : ({ userId: null, pendingClaim: false, status: "skipped" } as ProvisionResult);
        if (!provisioningEnabled) provisionSkipped++;
        row.user_id = provisioned.userId;
        // Only ever SET, never cleared: the column defaults to false, so an
        // ordinary row is left alone rather than carrying a redundant field.
        // A collision row DOES name it, which is why the migration has to be
        // applied before this function is deployed (see the header).
        if (provisioned.pendingClaim) row.pending_claim = true;
        if (provisioned.status === "created") provisionCreated++;
        else if (provisioned.status === "collision") provisionCollisions++;
        else if (provisioned.status === "error") provisionFailed++;

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
      if (provisionCreated > 0) summary.provisionCreated = provisionCreated;
      if (provisionCollisions > 0) summary.provisionCollisions = provisionCollisions;
      if (provisionFailed > 0) summary.provisionFailed = provisionFailed;
      if (provisionSkipped > 0) summary.provisionSkipped = provisionSkipped;

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
        provisionCreated: summary.provisionCreated ?? 0,
        provisionCollisions: summary.provisionCollisions ?? 0,
        provisionFailed: summary.provisionFailed ?? 0,
        provisionSkipped: summary.provisionSkipped ?? 0,
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
