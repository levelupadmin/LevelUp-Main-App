/**
 * cohort-reentry-cron — drives the re-entry reminder ladder (PHASE RE, E-1).
 *
 * Every 15 minutes (`20260730100100_reentry_cron.sql`) this reads the two
 * drop-off pools that have a real, addressable population — the completed form
 * with the ₹400 unpaid, and the ₹400 paid with no interview booked — asks the
 * PURE decision layer whether each one is due a nudge, CLAIMS the rung in the
 * ledger, and only then dispatches.
 *
 * THIS FILE DECIDES NOTHING. Every rule — ≤1 message per application per day,
 * ≤4 ever, the 21:30–09:00 IST quiet window, no channel double-firing the same
 * step, going silent within one cron cycle of the reconciler advancing the
 * stage, "this address unsubscribed" and "no copy exists for this rung" — lives
 * in `_shared/ladder.ts` as pure functions over an explicit clock, where vitest
 * can hit every boundary without a network or a database. A rule re-implemented
 * here would be a rule nobody can test; the loop below therefore has exactly one
 * branch about an applicant, and it is `if (!decision.send)`. Suppression and
 * copy availability reach the decision as INPUTS (`suppressedChannels`,
 * `channelTemplates`), not as skips bolted on afterwards.
 *
 * ── WHO THIS CAN ACTUALLY REACH ─────────────────────────────────────────────
 * ONLY applications the reconciler has read. That rule stays strict because
 * deriving non-payment from local `status='submitted'` / NULL timestamps would
 * dun people who paid off-app. The missing producer is now supplied by
 * `20260803173000_reentry_server_reconciliation.sql`: a bounded service-only
 * caller refreshes completed applications, including `user_id`-NULL rows, by
 * reading TeleCRM and Razorpay and mirroring the result onto the app-owned
 * `reconciled_*` columns. It never writes an external system.
 *
 * The server refresh has its own exact-string switch,
 * `REENTRY_RECONCILE_ENABLED`. A live ladder refuses to run unless both that
 * switch and `REMINDER_LADDER_ENABLED` are true, so the default-off browser
 * `VITE_FUNNEL_RECON` flag can no longer leave a nominally-enabled ladder with
 * a structurally empty population. Rows still fail closed as `unreconciled` or
 * `fee-evidence-stale` when the worker has not produced sufficiently fresh
 * evidence; local defaults never become proof that payment is missing.
 *
 * ── THE SWITCH IS SERVER-SIDE, AND IT IS NOT THE VITE FLAG ──────────────────
 * `VITE_REMINDER_LADDER` (registered in `src/lib/flags.ts`, default OFF) gates
 * any future CLIENT surface. It cannot gate this function: it resolves through
 * `import.meta.env`, which does not exist in Deno. The gate here is
 * `REMINDER_LADDER_ENABLED`, read below. Absent, or anything other than the
 * exact string 'true', and a LIVE tick returns BEFORE it reads a single
 * applicant row and before any sender is constructed. Fail-closed by
 * construction: the enabled path is the special case, not the default. Neither
 * switch is set by this phase (brief Δ3 — Rahul owns enabling it).
 *
 * The ONE thing a disabled ladder will still do is a `{"dry_run":true}`
 * request, and that is deliberate. A preview whose price is arming the live
 * cron is not a pre-flight check: the pg_cron schedule posts `'{}'::jsonb`
 * every 15 minutes, so setting the env var to "see what it would do" IS the
 * live run. Instead, `dryRun` is FORCED true whenever the switch is off, so the
 * preview cannot become a send however it is called.
 *
 * ── THE SEND PATH, AND WHY IT IS NOT `queue-transactional-email` (E-2) ──────
 * That function REQUIRES a `user_id` UUID and resolves the address by selecting
 * `users.email` (its index.ts:39-56). This ladder's entire population is defined
 * by NOT having a `public.users` row, so it could not reach a single one of them
 * — it would 400 on the missing id, or 404 on the missing user. So this function
 * walks the same steps that function walks, over the address on the application
 * itself (`cohort_applications.email`, NOT NULL): read the `email_templates` row
 * by key, interpolate `{{variable}}` placeholders through `sanitizeVar`, check
 * `isEmailSuppressed`, then `enqueueEmail` onto the same proven
 * `transactional_emails` queue that `process-email-queue` drains. All three
 * helpers are imported from `_shared/email.ts`; neither that file nor
 * `queue-transactional-email` is modified — both are live shared code on the
 * email path.
 *
 * ── WHY NOTHING CAN BE SENT AS THIS FILE STANDS ─────────────────────────────
 * Four independent reasons, any one sufficient (the fourth arrived with U-1:
 * `UNSUBSCRIBE_TOKEN_SECRET` is unset, and a live run refuses to start without
 * it rather than mail a reminder nobody can opt out of):
 *   1. `REMINDER_LADDER_ENABLED` is unset, so every scheduled tick returns
 *      before reading a row, and any other call is forced into dry-run.
 *   2. A dry run reaches no sender AT ALL: the claim and the dispatch both live
 *      inside `if (!dryRun)`, so there is no code path from a dry run to
 *      `dispatch()`. It reports what it WOULD have done and writes nothing.
 *   3. The copy lives in `public.email_templates`, seeded by
 *      `20260730100200_reentry_email_templates.sql`, AND THIS PHASE DOES NOT
 *      APPLY THAT MIGRATION. The set of keys with an active template row is what
 *      `decide()` receives as the email channel's `channelTemplates`, so against
 *      today's database no rung is renderable, every decision comes back
 *      `{ send: false, reason: "no-copy" }` — counted, never claimed, never
 *      dispatched — and the guarantee is enforced by the database rather than by
 *      an empty object literal in this file.
 *
 * ── CONSENT, AND THE OPT-OUT (U-1 BUILT IT; THIS IS NOW A REAL LINK) ────────
 * `user_marketing_prefs` holds zero rows, so no consent is claimed anywhere in
 * the copy: these are service messages to someone who submitted an application,
 * and every body says so.
 *
 * U-1 replaced the reply-and-ask-a-human opt-out with a working one, and all
 * four pieces are wired here rather than described:
 *   • `ensureUnsubscribeCredential` below mints (or reuses) the per-address
 *     token in `public.email_unsubscribe_tokens`. The token is DERIVED —
 *     `HMAC-SHA256(UNSUBSCRIBE_TOKEN_SECRET, "v1:<row id>:<issued_at>")`, see
 *     `_shared/unsubscribe.ts` — so that table stores only its SHA-256 and a
 *     read of IT cannot forge an opt-out, while all four rungs of a ladder
 *     still carry a link that keeps working. (The narrow claim is the true one:
 *     the rendered body and the pgmq payload do carry the live link, and the
 *     DLQ retains it for a message that never sent. `_shared/unsubscribe.ts`
 *     spells that out.)
 *     "KEEPS WORKING" IS VERIFIED, NOT ASSUMED. `issued_at` is a string inside
 *     that HMAC, and it does not round-trip verbatim: the mint writes JS
 *     `toISOString()`, the reuse path reads back PostgREST's rendering of the
 *     same `timestamptz`, and the two spellings differ. So the derivation
 *     canonicalises the instant, and the sender then re-hashes the token it
 *     derived and compares it to the row before mailing it
 *     (`reusableUnsubscribeCredential`). A token that would not open its own
 *     row rotates the row instead of going in an email. Rotating
 *     `UNSUBSCRIBE_TOKEN_SECRET` lands in the same check, which is what stops a
 *     key change from silently killing the ladder's opt-out for the full TTL —
 *     though links ALREADY delivered are a separate cost, and the rotation
 *     procedure for those is in `_shared/unsubscribe.ts`.
 *   • `{{unsubscribe_url}}` is a first-class template variable (`templateVariables`)
 *     AND a member of `URL_VARIABLES`. Both are load-bearing: a variable the map
 *     does not fill trips `UNRESOLVED_PLACEHOLDER` and burns the rung POST-CLAIM
 *     with nothing sent, and a URL not in `URL_VARIABLES` is deleted outright by
 *     `sanitizeVar`, which would mail a body promising a link that is not there.
 *   • `enqueueEmail` now takes an OPTIONAL `unsubscribeToken` and puts it on the
 *     payload only when present, which is the field `process-email-queue:284`
 *     has always forwarded and that nothing has ever set. Every other producer
 *     of that helper queues a byte-identical message to before. NO claim is made
 *     about what the provider does with it: nothing in this repo emits a
 *     `List-Unsubscribe` header, so the in-body link is the only path anything
 *     relies on.
 *   • the link resolves to the public `email-unsubscribe` function, which stamps
 *     `email_unsubscribe_tokens.used_at`. THAT is the opt-out record, and this
 *     file reads it in the same two places it reads `suppressed_emails`:
 *     `loadOptedOutEmails` per page (pre-claim, so an opted-out person never
 *     burns a rung) and `ensureUnsubscribeCredential` per dispatch (the
 *     last-moment check). The ladder goes quiet for that person on the next
 *     tick.
 *
 * THE OPT-OUT IS SCOPED TO THIS LADDER ON PURPOSE. The endpoint does NOT insert
 * into `suppressed_emails`, because that list has no category column and
 * `queue-transactional-email` gates EVERY transactional send on it — so an
 * unsubscribe written there would also, silently and irreversibly, kill the
 * same applicant's payment receipt and cohort notifications. The copy says
 * "these reminders"; the mechanism now stops exactly those. A reply still works
 * too, and is the path for somebody who wants everything to stop: a human puts
 * the address into `suppressed_emails`, which the checks below also honour.
 *
 * WHAT THAT SCOPING DOES NOT STOP, stated because a reader should not have to
 * infer it: `send-bulk-email` is a separate producer whose only opt-out list is
 * `suppressed_emails`, so clicking this link does NOT stop a bulk campaign.
 * Both pages the endpoint renders say so and offer the write-to-support path
 * that does. Whether a reminder opt-out should also suppress marketing is a
 * product call and is flagged as one, not settled here.
 *
 * ── THE INVIOLABLE RULES THIS FILE OBEYS ────────────────────────────────────
 *   1. The intake chain is FROZEN (INTEG-PAY-1). This function originates no
 *      order and inserts nothing into the chain; the nudges hand back links
 *      that already exist.
 *   2. Zero writes to Tally, TeleCRM or Razorpay (SOR-1). The only rows this
 *      writes are `reentry_notifications_log` rows the app fully owns. It does
 *      not write `cohort_applications` either — not even a "last nudged" column.
 *   3. NFR-COPY-1: the 100-word essay is NEVER surfaced. It lives in
 *      `cohort_applications.bio` AND inside the raw `tally_data` submission, so
 *      NEITHER column is selected below. Personalisation is structured fields
 *      only (name, email, phone, offering).
 *   4. Secrets by name only.
 *
 * ── STAYING INSIDE pg_net's 60s: THIS CHUNKS, IT DOES NOT RACE ──────────────
 * The cron's `timeout_milliseconds := 60000` is the budget for one pass. The
 * pass is bounded by construction, so the answer to "chunk or finish?" is
 * CHUNK, and here is the arithmetic:
 *   • candidates: at most `MAX_CANDIDATE_PAGES` (5) reads of
 *     `REENTRY_BATCH_LIMIT` (200) rows → ≤1000 rows, ≤5 round trips.
 *   • ledger history + suppression + opt-outs: chunked at `LOOKUP_CHUNK` (50)
 *     ids/addresses → ≤20 + ≤20 + ≤20 round trips (one lookup key per address,
 *     see `loadSuppressedEmails` and `loadOptedOutEmails`).
 *   • copy: ONE read of `email_templates` for all six rung keys, per run.
 *   • the ledger: at most `MAX_CLAIM_ATTEMPTS_PER_RUN` (50) CLAIM ATTEMPTS,
 *     each costing one INSERT plus, when the claim is won, one last-moment
 *     suppression check, one unsubscribe-token read, one enqueue and one settle
 *     update → ≤250 round trips, and ≤300 on a run where every winner is a
 *     FIRST CONTACT, since minting that address's token row costs one more
 *     INSERT (see `ensureUnsubscribeCredential`).
 * ≤316 sequential round trips in the steady state and ≤366 on a first-contact
 * run, against the same region; at even 100 ms each that is ~32 s and ~37 s, a
 * 1.9x / 1.6x margin inside the 60 s timeout.
 *
 * U-1 MOVED THAT MARGIN and the number above is the post-U-1 one. The opt-out
 * costs a page-level read (batched, ≤20) and one row read per WON claim (≤50),
 * and both are deliberate: the page-level read is what stops an opted-out
 * person burning a rung, and the per-claim read is the last-moment check that
 * closes the window between the two. Anyone adding another per-claim round trip
 * should start from 1.6x, not from the 2.4x this comment used to claim.
 *
 * THE BUDGET COUNTS CLAIM ATTEMPTS, NOT DELIVERIES, and that distinction is the
 * whole reason the bound holds. Counting only successful dispatches leaves the
 * two paths that consume a round trip and produce no message — a 23505 race
 * against an overlapping invocation, and a ledger INSERT that errors — free of
 * charge, so a transient ledger outage or one overlapping tick would turn a
 * single pass into up to 1000 sequential INSERTs and blow straight through the
 * timeout. `claimAttempts()` therefore counts `dispatched + dispatchFailed +
 * suppressedAtDispatch + raced + racedDailyCap + claimFailed`: every path that
 * touched the ledger, which is every path that cost time. Anything past the ceiling is left for the next tick 15
 * minutes later, and because the engine allows at most one message per
 * application per day, a backlog can never grow faster than the chunk drains it.
 *
 * The candidate read is ALSO bounded by the ladder window (`LADDER_WINDOW_MS`),
 * and that is a correctness fix, not a speed one. This function never writes
 * `cohort_applications`, so a row that never pays keeps its stage forever; an
 * unbounded oldest-first read would therefore fill every batch with the same
 * permanently-`expired` rows and never scan a live applicant again.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/crypto.ts";
import { enqueueEmail, isEmailSuppressed, sanitizeVar } from "../_shared/email.ts";
import {
  CANDIDATE_STATUSES,
  CRON_PERIOD_MS,
  decide,
  istDayKey,
  LADDER_TEMPLATE_KEYS,
  LADDER_WINDOW_MS,
  LADDERS,
  ledgerKey,
  POOL_STAGE,
  type LadderChannel,
  type LadderDecision,
  type LadderSend,
  type LadderSkipReason,
} from "../_shared/ladder.ts";
import {
  buildUnsubscribeUrl,
  deriveUnsubscribeCredential,
  hashUnsubscribeToken,
  isUnsubscribeTokenExpired,
  isUsableUnsubscribeSecret,
  MIN_UNSUBSCRIBE_SECRET_LENGTH,
  normalizeUnsubscribeEmail,
  unsubscribeTokenMatchesStoredHash,
} from "../_shared/unsubscribe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * The app's own origin, used to build the EXISTING in-app links the nudges hand
 * back. Same resolution and same default as `_shared/email.ts` so a nudge and a
 * transactional email cannot point at different hosts.
 */
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://app.leveluplearning.in";

/**
 * The shared secret the pg_cron caller presents. Same arrangement as
 * tally-application-poll: the cron sends the vault secret
 * `email_queue_service_role_key`, which on this project is the LEGACY
 * service_role JWT, while the platform injects `SUPABASE_SERVICE_ROLE_KEY` in
 * the newer `sb_secret_…` format — comparing against the injected env var alone
 * would 401 every tick, silently. So the expected token is explicit, with the
 * injected key kept as a fallback for a project where the two coincide.
 */
const POLL_AUTH_TOKEN = Deno.env.get("POLL_AUTH_TOKEN") ?? "";

/**
 * THE KILL SWITCH. Read as a string and compared to the exact literal 'true':
 * unset, empty, '1', 'TRUE' and 'yes' are all OFF. A permissive parse here is
 * how a stray environment value turns into outbound mail.
 */
const LADDER_ENABLED = Deno.env.get("REMINDER_LADDER_ENABLED") === "true";

/**
 * The ladder's candidate mirror must have a server-side producer. The browser
 * flag defaults off and cannot populate anonymous applications, so a live run
 * refuses to send unless the scheduled reconciler has also been intentionally
 * enabled. This couples the two rollout actions fail-closed.
 */
const REENTRY_RECONCILE_ENABLED = Deno.env.get("REENTRY_RECONCILE_ENABLED") === "true";

/**
 * How old a fee-pool reading may be and still be allowed to dun somebody, in
 * hours. Unset uses the engine's own 26h default (one cadence step).
 *
 * PARSED FAIL-SAFE, WHICH IS THE OPPOSITE OF THE KILL SWITCH ABOVE. Anything
 * unparseable — a typo, a unit suffix, a negative — returns `undefined` and the
 * engine applies its default bound. A permissive parse there would let a stray
 * value DISABLE a guard that stops the system emailing a paying customer to
 * demand payment, so the only way to switch it off is the explicit, documented
 * `0`. See `resolvePool` in `_shared/ladder.ts` for what the bound protects.
 */
const FEE_EVIDENCE_MAX_AGE_MS: number | undefined = (() => {
  const raw = Deno.env.get("REENTRY_FEE_EVIDENCE_MAX_AGE_HOURS");
  if (raw === undefined || raw.trim() === "") return undefined;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0) return undefined;
  return hours * 60 * 60 * 1000;
})();

/**
 * The HMAC key every unsubscribe token is derived from (U-1). Secret by name
 * only; `_shared/unsubscribe.ts` refuses anything under
 * MIN_UNSUBSCRIBE_SECRET_LENGTH characters, because the token's entire
 * unguessability rests on it.
 *
 * A LIVE run with this unset is refused up front, next to the kill switch,
 * rather than left to fail per row. The per-row failure would be the expensive
 * kind: minting happens after the ledger claim, so an unset secret would burn a
 * rung per applicant and record a `last_error` for each. Mail with no working
 * opt-out is not something to ship one rung at a time.
 */
const UNSUBSCRIBE_SECRET = Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET") ?? "";

/** Candidate applications read per page. See the 60s budget note above. */
const REENTRY_BATCH_LIMIT = 200;
/**
 * Pages of candidates one invocation will walk. The window filter keeps the
 * live pool to 14 days of applications, so 1000 rows is far more headroom than
 * this funnel has ever needed — and when it is not, the run says so
 * (`truncated`) instead of quietly scanning the same prefix forever.
 */
const MAX_CANDIDATE_PAGES = 5;
/**
 * Ledger CLAIM ATTEMPTS per invocation — not messages sent. Every attempt costs
 * a round trip whether it wins the row, loses a 23505 race or errors, so the
 * budget has to count all three or it does not bound anything (see the 60 s
 * arithmetic above). The rest waits 15 minutes.
 */
const MAX_CLAIM_ATTEMPTS_PER_RUN = 50;
/**
 * Ids/addresses per lookup chunk. Sized against the REQUEST LINE, not the row
 * count — PostgREST puts the whole filter in the URL and Kong defaults to an
 * 8 KB request line. 50 UUIDs in an `.in()` is ~2 KB, and 50 addresses as
 * quoted `email.ilike."…"` operands is ~2.5 KB once `%22`/`%40` are counted:
 * both a 3x margin. Same reasoning, same number as tally-application-poll's
 * user lookup.
 */
const LOOKUP_CHUNK = 50;

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

/** One structured log line, so this cron is greppable in the function logs. */
function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ fn: "cohort-reentry-cron", event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * The application columns the ladder reads. `bio` and `tally_data` are ABSENT
 * and must stay absent: the 100-word essay lives in both, and not selecting a
 * column is the cheapest way to guarantee it can never reach a message body
 * (NFR-COPY-1). An earlier phase in this program certified a surface clean by
 * grepping only one of the two.
 */
interface ApplicationRow {
  id: string;
  offering_id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  status: string | null;
  created_at: string;
  app_fee_paid_at: string | null;
  reconciled_stage: string | null;
  reconciled_at: string | null;
  completed_no_fee: boolean | null;
  /**
   * The embedded offering. To-one on a real FK, so PostgREST returns an object
   * — but it is normalised through `offeringOf` below rather than trusted,
   * because a to-one embed that ever came back as a single-element array would
   * otherwise silently make every rung unrenderable and the ladder would report
   * a healthy run that reached nobody.
   */
  offerings: OfferingRow | OfferingRow[] | null;
}

/**
 * The offering columns a nudge personalises from and hands links back from.
 * All four are structured fields; none of them is or contains the essay.
 */
interface OfferingRow {
  title: string | null;
  app_fee_inr: number | string | null;
  calendly_url: string | null;
  application_deadline: string | null;
}

const APPLICATION_COLUMNS =
  "id, offering_id, full_name, email, phone, status, created_at, app_fee_paid_at, reconciled_stage, reconciled_at, completed_no_fee, " +
  "offerings(title, app_fee_inr, calendly_url, application_deadline)";

/** A rendered message, ready for a sender. */
interface ReentryMessage {
  subject: string;
  html: string;
  text: string;
}

/** One `public.email_templates` row, as the renderer needs to see it. */
interface EmailTemplateRow {
  template_key: string;
  subject: string;
  html_body: string;
  text_body: string | null;
}

/** The rungs of each pool, split so renderability can be decided per pool. */
const FEE_TEMPLATE_KEYS: readonly string[] = LADDERS.fee.map((r) => r.templateKey);
const INTERVIEW_TEMPLATE_KEYS: readonly string[] = LADDERS.interview.map((r) => r.templateKey);

/**
 * Variables whose value is a URL and must therefore NOT pass through
 * `sanitizeVar`, which strips `https?://\S+` wholesale — running a link through
 * it deletes the link and mails an empty button. Same carve-out
 * `queue-transactional-email` makes for `app_url`, and it is safe for exactly
 * the same reason: every member is a URL this function built or validated
 * itself (`SITE_URL`, the existing checkout route, a `calendly_url` that
 * cleared `isCalendlyUrl`, and an unsubscribe link built from `SUPABASE_URL`
 * plus a credential this function derived), never a string an applicant
 * supplied.
 *
 * `unsubscribe_url` IS IN HERE FOR A REASON, and it is the trap this comment
 * has always been about: leave it out and `sanitizeVar` deletes the link, so
 * the body still promises an opt-out and no longer contains one. That is a
 * silent failure in the one sentence of the email that must not fail.
 */
const URL_VARIABLES: ReadonlySet<string> = new Set([
  "app_url",
  "fee_link",
  "calendly_link",
  "unsubscribe_url",
]);

/** Month names for the deadline date. Fixed English, so the render is deterministic. */
const MONTH_NAMES: readonly string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Reused rather than rebuilt per row; a suppressed applicant has no other channel today. */
const EMAIL_SUPPRESSED: ReadonlySet<LadderChannel> = new Set<LadderChannel>(["email"]);

/** Per-run counters. Every outcome is counted — a silent skip is a blind spot. */
type SkipCounters = Partial<Record<LadderSkipReason, number>>;

interface RunSummary {
  ok: true;
  enabled: boolean;
  dryRun: boolean;
  /** Candidate pages read this run. */
  pages: number;
  scanned: number;
  eligible: number;
  claimed: number;
  dispatched: number;
  /** Rungs another overlapping invocation had already claimed (23505 on `reentry_notif_unique`). */
  raced: number;
  /**
   * Claims the DAILY cap refused (23505 on `reentry_notif_daily_unique`): this
   * application already has a message on this IST day, filed under a different
   * rung. Kept apart from `raced` because it is not a scheduling artefact — it
   * is the ≤1/day cap catching a cross-pool race the engine cannot see, since
   * both invocations evaluated the cap against a history read before either
   * wrote. Non-zero here is the daily cap working, not a fault; persistently
   * non-zero means invocations are overlapping far more than the 15-minute
   * period implies.
   */
  racedDailyCap: number;
  /** Claims whose dispatch failed. The rung is burned; see the ledger comment. */
  dispatchFailed: number;
  /**
   * Ledger writes that errored for a reason that was NOT a 23505 race. Kept
   * apart from `dispatchFailed` because they are opposite faults: a claim
   * failure means the ledger itself is unreachable — nothing was sent and
   * nothing can be — while a dispatch failure means the sender is broken and a
   * rung was spent. Folding them together makes a database outage read as a
   * mail outage.
   */
  claimFailed: number;
  /**
   * Claims whose recipient turned out to be suppressed at the last moment —
   * they unsubscribed between this page's suppression read and the dispatch.
   * Kept apart from `dispatchFailed` because nothing is broken: the rung is
   * deliberately spent so it can never be re-attempted at an address that asked
   * us to stop.
   */
  suppressedAtDispatch: number;
  /**
   * Eligible applications this run REACHED and decided to send to, but did not,
   * because `MAX_CLAIM_ATTEMPTS_PER_RUN` was already spent. Nothing was claimed
   * for them, so the next tick reaches the identical decision. Rows the scan
   * never reached at all are NOT counted here — that is what `truncated`
   * reports.
   */
  deferred: number;
  skips: SkipCounters;
  /**
   * The scan stopped before it ran out of candidates, so live applications may
   * exist that this run never looked at. Only ever set with a reason, because
   * "hit the page cap" (raise it / the funnel grew) and "spent the dispatch
   * budget" (working as designed, the backlog drains next tick) call for
   * completely different responses.
   */
  truncated?: true;
  truncatedReason?: "page-cap" | "claim-budget";
}

function bump(counters: SkipCounters, key: LadderSkipReason) {
  counters[key] = (counters[key] ?? 0) + 1;
}

/**
 * Ledger round trips this run has already spent. EVERY outcome of a claim
 * counts: a won claim (dispatched / dispatchFailed), a lost race on either
 * UNIQUE (raced / racedDailyCap) and an errored INSERT (claimFailed) all cost
 * one INSERT against the same database. Counting only the ones that produced a
 * message would leave the failure paths unbounded — which is exactly how one
 * overlapping invocation, or a minute of ledger unavailability, becomes a
 * thousand sequential INSERTs and a pg_net timeout.
 */
function claimAttempts(summary: RunSummary): number {
  return summary.dispatched + summary.dispatchFailed + summary.suppressedAtDispatch + summary.raced +
    summary.racedDailyCap + summary.claimFailed;
}

function createAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Every ledger row for this batch of applications, chunked. Throws on error
 * rather than guessing: an incomplete history would under-count the caps and
 * re-send a rung that already went out, which is the one failure mode this
 * whole ledger exists to prevent.
 */
async function loadHistory(
  admin: AdminClient,
  applicationIds: string[],
): Promise<Map<string, LadderSend[]>> {
  const byApp = new Map<string, LadderSend[]>();
  for (const id of applicationIds) byApp.set(id, []);

  for (let i = 0; i < applicationIds.length; i += LOOKUP_CHUNK) {
    const chunk = applicationIds.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await admin
      .from("reentry_notifications_log")
      .select("application_id, template_key, channel, claimed_at")
      .in("application_id", chunk);
    if (error) throw new Error(`ledger read failed: ${error.message}`);
    for (const row of (data ?? []) as Array<{
      application_id: string;
      template_key: string;
      channel: string;
      claimed_at: string;
    }>) {
      byApp.get(row.application_id)?.push({
        templateKey: row.template_key,
        channel: row.channel as LadderChannel,
        sentAt: row.claimed_at,
      });
    }
  }
  return byApp;
}

/**
 * One `email.ilike."…"` operand for a PostgREST `or=(…)` filter, escaped for
 * the two parsers it passes through, in this order:
 *
 *   1. THE LIKE PATTERN. `%`, `_` and `\` are wildcards/escapes to Postgres. An
 *      unescaped `_` is the dangerous one — `first_last@x.com` is an ordinary
 *      address, and left as a wildcard it would match strangers' addresses and
 *      silence them. Backslash-escaping makes each one literal.
 *   2. THE POSTGREST VALUE. The operand is double-quoted so a `,` `.` `(` `)`
 *      inside an address cannot be read as filter syntax, and `"` / `\` inside
 *      the quotes are backslash-escaped in turn.
 *
 * With no wildcards left, `ilike` is exactly case-insensitive equality.
 */
function suppressionOperand(email: string): string {
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const quoted = pattern.replace(/["\\]/g, (c) => `\\${c}`);
  return `email.ilike."${quoted}"`;
}

/**
 * Suppressed addresses for this page, lower-cased.
 *
 * THE MATCH IS CASE-INSENSITIVE IN THE DATABASE, not by enumerating spellings.
 * `suppressed_emails.email` is a plain `TEXT NOT NULL` with no normalisation
 * and no `lower()` index (`20260407192559_email_infra.sql`), so an address
 * stored `Foo@Bar.com` is invisible to an `.in()` on the as-typed and
 * lower-cased spellings of `foo@bar.com` — and that miss means mail to someone
 * who asked us to stop. `ilike` compares case-insensitively on the column side,
 * which is the only side that matters, and it needs ONE key per address instead
 * of two.
 *
 * THIS LOOKUP IS THE LOAD-BEARING SUPPRESSION DEFENCE ON THIS PATH. The ladder
 * queues onto the transactional queue directly (it must —
 * `queue-transactional-email` requires a `user_id` this population does not
 * have), so it does not inherit that function's suppression check, and
 * `process-email-queue` has none of its own. `sendEmail` re-checks the single
 * address with `isEmailSuppressed` immediately before enqueueing, which closes
 * the window between this page-level read and the dispatch — but that check is
 * a SUPPLEMENT, not a substitute: it is an exact, case-SENSITIVE `.eq`, so it
 * cannot see the `Foo@Bar.com` spelling this one catches. Hence also why this is
 * deliberately NOT `_shared/email.ts`'s
 * `fetchSuppressedSet`: that helper chunks at 500 addresses, which puts ~20 KB
 * of URL-encoded emails on a request line Kong caps at 8 KB, and it destructures
 * only `{ data }` — so a failed request is indistinguishable from a clean sheet
 * and every unsubscribed address becomes sendable. This one chunks at the same
 * 50 the ledger lookup uses and THROWS, aborting the run with nothing sent.
 */
async function loadSuppressedEmails(admin: AdminClient, emails: string[]): Promise<Set<string>> {
  const wanted = new Set<string>();
  for (const email of emails) {
    const key = email.trim().toLowerCase();
    if (key) wanted.add(key);
  }
  const unique = [...wanted];

  const suppressed = new Set<string>();
  for (let i = 0; i < unique.length; i += LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await admin
      .from("suppressed_emails")
      .select("email")
      .or(chunk.map(suppressionOperand).join(","));
    if (error) throw new Error(`suppression read failed: ${error.message}`);
    for (const row of (data ?? []) as Array<{ email: string | null }>) {
      if (row.email) suppressed.add(row.email.trim().toLowerCase());
    }
  }
  return suppressed;
}

/**
 * Addresses on this page that have already used their unsubscribe link.
 *
 * THIS IS THE OTHER HALF OF THE SUPPRESSION READ ABOVE, and it is separate
 * because the two tables are written by different populations.
 * `suppressed_emails` takes rows from humans and from bounce handling, so its
 * spellings are unnormalised and it has to be matched case-INSENSITIVELY with
 * `ilike`. `email_unsubscribe_tokens` has exactly ONE producer — this function
 * — which writes through `normalizeUnsubscribeEmail`, so every row in it is
 * already lower-cased and an exact `.in()` both matches everything and uses the
 * `UNIQUE(email)` index.
 *
 * READ PER PAGE, PRE-CLAIM, on purpose. `ensureUnsubscribeCredential` re-checks
 * the same flag per dispatch and would catch an opted-out address anyway, but
 * only AFTER the rung was claimed, which spends it. Someone who asked us to
 * stop should not be silently burning through their own ladder one rung per
 * tick, so the decision is made before the claim and the per-dispatch check
 * stays what it is: the last-moment close on the window between the two.
 *
 * THROWS rather than returning a short set. An error swallowed here reads as
 * "nobody opted out" and mails everybody who did, which is the exact failure
 * `loadSuppressedEmails` refuses `fetchSuppressedSet` over.
 */
async function loadOptedOutEmails(admin: AdminClient, emails: string[]): Promise<Set<string>> {
  const wanted = new Set<string>();
  for (const email of emails) {
    const key = normalizeUnsubscribeEmail(email);
    if (key) wanted.add(key);
  }
  const unique = [...wanted];

  const optedOut = new Set<string>();
  for (let i = 0; i < unique.length; i += LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await admin
      .from("email_unsubscribe_tokens")
      .select("email")
      .in("email", chunk)
      .not("used_at", "is", null);
    if (error) throw new Error(`unsubscribe opt-out read failed: ${error.message}`);
    for (const row of (data ?? []) as Array<{ email: string | null }>) {
      if (row.email) optedOut.add(normalizeUnsubscribeEmail(row.email));
    }
  }
  return optedOut;
}

/** The `email_unsubscribe_tokens` columns the mint reads. */
interface UnsubscribeTokenRow {
  id: string;
  issued_at: string | null;
  token_hash: string | null;
  used_at: string | null;
}

/** What one dispatch needs to know about an address's opt-out state. */
interface UnsubscribeState {
  /** `<token>.<tag>` — what goes in the link. Empty when `optedOut`. */
  credential: string;
  /** `used_at` is set: this person clicked unsubscribe. Do not send. */
  optedOut: boolean;
}

/**
 * The credential an EXISTING row still yields, or `null` when this send has to
 * rotate the row instead.
 *
 * Reuse is only safe when the re-derived token would actually open the row it
 * came from, and there are three independent ways it would not:
 *   1. the row has no `token_hash` or no `issued_at` (it predates hashed
 *      storage, or `issued_at` arrived from the column DEFAULT);
 *   2. the token aged past `UNSUBSCRIBE_TTL_MS`, the ordinary rotation trigger;
 *   3. THE DERIVED TOKEN DOES NOT HASH TO THE STORED HASH. This is the check
 *      whose absence made every link after the first a lie. `issued_at` is a
 *      string inside the HMAC, the mint writes JS `toISOString()` and the reuse
 *      path reads back PostgREST's `timestamptz` rendering of the same instant
 *      (`+00:00` for `Z`, trailing fraction zeros dropped, microseconds where
 *      the DEFAULT filled it), so the two spellings differ.
 *      `canonicalUnsubscribeIssuedAt` inside `unsubscribeTokenMessage` makes
 *      them agree; this verifies that it did, and catches a secret rotation in
 *      the same motion. Without it a divergence is undetectable — the endpoint
 *      renders the same "you are unsubscribed" page for a token it cannot find
 *      as for one it can, on purpose, so nothing downstream would ever complain.
 * All three funnel to the same answer, `null`, which the caller reads as
 * "rotate". A mismatch is logged because it should be rare enough to explain:
 * a live run producing these is either a secret rotation or a derivation bug.
 */
async function reusableUnsubscribeCredential(
  row: UnsubscribeTokenRow,
  now: Date,
): Promise<string | null> {
  if (!row.token_hash || !row.issued_at) return null;
  // Also the guard that keeps the derivation below from throwing: an
  // unparseable issue time reads as expired, so it never reaches the HMAC.
  if (isUnsubscribeTokenExpired(row.issued_at, now)) return null;

  const { token, credential } = await deriveUnsubscribeCredential(
    UNSUBSCRIBE_SECRET,
    row.id,
    row.issued_at,
  );
  if (!(await unsubscribeTokenMatchesStoredHash(token, row.token_hash))) {
    log("warn", "unsubscribe_token_hash_mismatch", {
      tokenId: row.id,
      reason: "re-derived token does not match the stored hash; rotating rather than mailing a dead link",
    });
    return null;
  }
  return credential;
}

/**
 * Re-derive against a fresh issue time and write the new hash. Retires the old
 * token by simply no longer matching it, and touches NOTHING else on the row —
 * in particular never `used_at`, which is somebody's recorded opt-out.
 *
 * THE WRITE IS CONDITIONAL ON THE ROW WE READ, AND THE ROW COUNT IS CHECKED.
 * `.eq("id", …)` alone is a blind write: it lands on whatever the row has become
 * since the read, and reports success either way. Two things can have happened
 * in that window, and both are silent disasters:
 *   • THE PERSON CLICKED UNSUBSCRIBE. `used_at` is now set. A blind rotate
 *     re-keys their row and the caller mails them another reminder, which is the
 *     exact thing `used_at` exists to prevent.
 *   • ANOTHER INVOCATION ROTATED FIRST. Its credential is the live one and may
 *     already be in an email. A blind rotate overwrites `token_hash` with ours,
 *     the loser's link goes into an inbox already dead, and the endpoint answers
 *     it with the same "these reminders are off" page it gives a stranger. The
 *     person is told they are unsubscribed and is not. That lie is the single
 *     failure the derived-token design exists to make impossible, so it cannot
 *     be left to chance here.
 * So the predicate pins BOTH derivation inputs we read (`token_hash`, plus the
 * `used_at IS NULL` guard) and `.select("id")` returns the rows that actually
 * matched. This is the same shape `recordOptOut` uses in `email-unsubscribe`.
 *
 * A zero-row result is not an error, it is stale state, so it is re-read once
 * and answered off what the row ACTUALLY holds now: opted out means do not send;
 * a live rotated token means adopt the winner's credential. Exactly one retry —
 * a second miss means something is wrong beyond a race, and the caller turning
 * that into a burned rung with a `last_error` is better than looping or than
 * mailing a reminder with a dead opt-out link in it.
 */
async function rotateUnsubscribeCredential(
  admin: AdminClient,
  row: UnsubscribeTokenRow,
  now: Date,
): Promise<UnsubscribeState> {
  const issuedAt = now.toISOString();
  const { token, credential } = await deriveUnsubscribeCredential(UNSUBSCRIBE_SECRET, row.id, issuedAt);
  const tokenHash = await hashUnsubscribeToken(token);

  const conditional = admin
    .from("email_unsubscribe_tokens")
    .update({ token_hash: tokenHash, issued_at: issuedAt })
    .eq("id", row.id)
    .is("used_at", null);
  // A legacy row can carry a NULL hash, and `.eq(col, null)` is not `IS NULL` in
  // PostgREST, so the two cases need the two different predicates.
  const pinned = row.token_hash === null
    ? conditional.is("token_hash", null)
    : conditional.eq("token_hash", row.token_hash);

  const { data, error } = await pinned.select("id");
  if (error) throw new Error(`unsubscribe token rotate failed: ${error.message}`);
  if (((data ?? []) as Array<{ id: string }>).length === 1) {
    return { credential, optedOut: false };
  }

  // Nothing matched: the row moved under us. Ask it what it is now.
  log("warn", "unsubscribe_token_rotate_raced", {
    tokenId: row.id,
    reason: "row changed between read and rotate; re-reading rather than trusting our write",
  });
  const { data: fresh, error: reReadError } = await admin
    .from("email_unsubscribe_tokens")
    .select("id, issued_at, token_hash, used_at")
    .eq("id", row.id)
    .maybeSingle();
  if (reReadError) throw new Error(`unsubscribe token rotate re-read failed: ${reReadError.message}`);

  const current = (fresh as unknown as UnsubscribeTokenRow | null) ?? null;
  if (!current) throw new Error("unsubscribe token rotate found no row to re-read");
  if (current.used_at) return { credential: "", optedOut: true };

  const adopted = await reusableUnsubscribeCredential(current, now);
  if (adopted) return { credential: adopted, optedOut: false };
  throw new Error("unsubscribe token rotate lost the race and the winning token does not verify");
}

/**
 * The per-recipient opt-out credential for one address (U-1), minted on first
 * contact and REUSED on every send after that — and, in the same round trip,
 * the last-moment answer to "has this person already opted out?".
 *
 * WHY REUSE RATHER THAN RE-MINT. `email_unsubscribe_tokens` is one row per
 * address and stores only `sha256(token)`, so the plaintext cannot be read back
 * for the next email. A fresh random token per send would therefore invalidate
 * the link in every message already delivered, and a person clicking last
 * week's email would be shown "you are unsubscribed" and would not be — the
 * endpoint cannot tell them otherwise without becoming an enumeration oracle.
 * So the token is DERIVED from the row (`_shared/unsubscribe.ts`): the same row
 * and issue time always produce the same 256-bit token, reproducible by this
 * function and by nothing that lacks the secret.
 *
 * REUSE IS NEVER ASSUMED, IT IS VERIFIED. `reusableUnsubscribeCredential` above
 * re-hashes what it derived and compares it to the row, so the link in rung 2
 * is known to open the same row rung 1's did rather than merely intended to.
 * Anything that fails that check is rotated.
 *
 * `used_at` IS NEVER CLEARED HERE, and rotation is skipped entirely for a row
 * that has it set. That is not tidiness: `used_at` is the opt-out record, so a
 * rotation that reset it would resurrect somebody who had asked us to stop, and
 * an opted-out address is never mailed again anyway, so it has nothing to
 * rotate for. Only support clearing `used_at` deliberately undoes an opt-out.
 *
 * Throws on a database fault rather than returning "no credential". A message
 * with a hole where its opt-out should be is not a degraded send, it is one we
 * should not make: the caller turns this into a dispatch failure, which burns
 * the rung and records `last_error` instead of mailing an unopt-outable
 * reminder.
 *
 * EXPORTED so `src/lib/__tests__/unsubscribe.test.ts` can drive mint, reuse and
 * the lost-rotation race against a real client rather than asserting that the
 * right words appear in this file. Nothing in this module imports it; the export
 * exists for the test and changes no runtime behaviour.
 */
export async function ensureUnsubscribeCredential(
  admin: AdminClient,
  email: string,
  now: Date,
): Promise<UnsubscribeState> {
  const key = normalizeUnsubscribeEmail(email);
  const { data, error } = await admin
    .from("email_unsubscribe_tokens")
    .select("id, issued_at, token_hash, used_at")
    .eq("email", key)
    .maybeSingle();
  if (error) throw new Error(`unsubscribe token read failed: ${error.message}`);

  const existing = (data as unknown as UnsubscribeTokenRow | null) ?? null;
  if (existing?.used_at) return { credential: "", optedOut: true };

  if (existing) {
    const reused = await reusableUnsubscribeCredential(existing, now);
    if (reused) return { credential: reused, optedOut: false };
    return await rotateUnsubscribeCredential(admin, existing, now);
  }

  // FIRST CONTACT. The id is generated HERE, not by the column default, because
  // the token derives from it: it has to be known before the row exists. The
  // address is stored normalised so the page-level `.in()` read can be exact.
  const issuedAt = now.toISOString();
  const id = crypto.randomUUID();
  const { token, credential } = await deriveUnsubscribeCredential(UNSUBSCRIBE_SECRET, id, issuedAt);
  const tokenHash = await hashUnsubscribeToken(token);

  const { error: insertError } = await admin
    .from("email_unsubscribe_tokens")
    .insert({ id, email: key, token_hash: tokenHash, issued_at: issuedAt });
  if (insertError) {
    if (insertError.code !== "23505") {
      throw new Error(`unsubscribe token mint failed: ${insertError.message}`);
    }
    // Another invocation minted for this address between the read and the
    // insert (`email` is UNIQUE). ITS token is the live one and may already be
    // in an email, so adopt it rather than overwrite it.
    const { data: raced, error: reReadError } = await admin
      .from("email_unsubscribe_tokens")
      .select("id, issued_at, token_hash, used_at")
      .eq("email", key)
      .maybeSingle();
    if (reReadError) throw new Error(`unsubscribe token re-read failed: ${reReadError.message}`);
    const winner = (raced as unknown as UnsubscribeTokenRow | null) ?? null;
    if (!winner) throw new Error("unsubscribe token race left no row to adopt");
    if (winner.used_at) return { credential: "", optedOut: true };
    // Same verify-then-rotate as the ordinary path: the winner's row gets the
    // same scrutiny our own would, rather than being trusted for having won.
    // Rotating it is safe precisely because we only get there when its token
    // does not open its own row, so the winner's link would not have worked
    // either and there is nothing live to invalidate.
    const adopted = await reusableUnsubscribeCredential(winner, now);
    if (adopted) return { credential: adopted, optedOut: false };
    return await rotateUnsubscribeCredential(admin, winner, now);
  }
  return { credential, optedOut: false };
}

/**
 * The ledger's daily-cap UNIQUE, by name. A 23505 quoting it means "this
 * application already spent today", which is a DIFFERENT event from losing the
 * race for one rung, and the two are told apart so the counters do not lie.
 */
const DAILY_CAP_CONSTRAINT = "reentry_notif_daily_unique";

/** Which of the ledger's two UNIQUEs a 23505 came from. */
type ClaimRace = "rung" | "day";

/**
 * Read the losing constraint out of a unique violation. PostgREST passes
 * Postgres's own message and detail through, so both carry the constraint name
 * or the column list; the column list is checked too because `details` is the
 * field that survives when the message is truncated.
 *
 * An unattributable 23505 is reported as a rung race — the historical meaning,
 * and the safe default: BOTH races end in the same behaviour (skip without
 * sending, which is correct for either), so only the label is at stake.
 */
function claimRaceKind(error: { message?: string | null; details?: string | null }): ClaimRace {
  const blob = `${error.message ?? ""} ${error.details ?? ""}`;
  return blob.includes(DAILY_CAP_CONSTRAINT) || blob.includes("application_id, ist_day") ? "day" : "rung";
}

/** A won claim, or the constraint that refused it. */
type ClaimOutcome =
  | { claimed: true; id: string }
  | { claimed: false; race: ClaimRace };

/**
 * Claim a rung. The INSERT is built from `ledgerKey()` and nothing else, so two
 * invocations deciding the same rung produce byte-identical key columns and
 * Postgres serialises them on `reentry_notif_unique`. Returns the claim's id,
 * or the race that refused it (23505) — in which case this one skips WITHOUT
 * sending. That is the whole double-send proof: it rests on the constraint, not
 * on how long a run happens to take.
 *
 * `now` is the SAME clock `decide` judged this row against, and it is an
 * argument rather than a wall-clock read here for that reason: `ledgerKey()`
 * derives the `ist_day` column from it, and a claim filed under a different day
 * from the one the cap was evaluated against is exactly the disagreement the
 * daily UNIQUE exists to prevent.
 *
 * TWO CONSTRAINTS CAN NOW REFUSE THE SAME INSERT, and they mean different
 * things. `reentry_notif_unique` means another invocation is already sending
 * THIS rung. `reentry_notif_daily_unique` means the application's one message
 * for today has been claimed by a different rung — the cross-pool race the ≤1/day
 * cap cannot catch in the engine, because each invocation evaluated it against a
 * history it read before either wrote. Skipping is right for both; conflating
 * them in the summary would file a cap enforcement under "overlapping run" and
 * send an operator looking for a scheduling problem that is not there.
 *
 * `attempts` is left at its DEFAULT 0. A claim is a reservation, not a delivery
 * attempt; `settleClaim` sets it to 1 once the sender has actually been called.
 * Inserting 1 here would make the column read the same for a rung that was
 * dispatched and one that never left the reservation, which is no information
 * at all.
 */
async function claimRung(
  admin: AdminClient,
  applicationId: string,
  templateKey: string,
  channel: LadderChannel,
  now: Date,
): Promise<ClaimOutcome> {
  const { data, error } = await admin
    .from("reentry_notifications_log")
    .insert({ ...ledgerKey(applicationId, templateKey, now), channel })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { claimed: false, race: claimRaceKind(error) };
    throw new Error(`ledger claim failed: ${error.message}`);
  }
  return { claimed: true, id: (data as { id: string }).id };
}

/**
 * Record the outcome of a claimed rung, including that the sender was called
 * exactly once. Never throws — reporting must not abort a run.
 */
async function settleClaim(
  admin: AdminClient,
  claimId: string,
  outcome: { ok: true } | { ok: false; error: string },
): Promise<void> {
  const patch = outcome.ok
    ? { attempts: 1, dispatched_at: new Date().toISOString(), last_error: null }
    : { attempts: 1, last_error: outcome.error.slice(0, 500) };
  const { error } = await admin.from("reentry_notifications_log").update(patch).eq("id", claimId);
  if (error) log("warn", "claim_settle_failed", { claimId, message: error.message });
}

/** How a dispatch ended. `suppressed` is a settled outcome, not a fault. */
type DispatchResult =
  | { ok: true }
  | { ok: false; suppressed?: true; error: string };

/**
 * The email sender. Queues onto the existing, proven
 * `queue-transactional-email` → `process-email-queue` pipeline via the shared
 * `enqueueEmail` helper.
 *
 * It goes through the QUEUE rather than the `queue-transactional-email`
 * function because that function requires a `user_id` and looks the address up
 * from `public.users` — and this population is defined by NOT having a
 * `public.users` row. The address comes off the application itself, which is
 * `NOT NULL`.
 *
 * THE LAST-MOMENT SUPPRESSION CHECK. `isEmailSuppressed` runs here, one row
 * before the enqueue, and it is not redundant with the page-level
 * `loadSuppressedEmails`: a page is read once and then walked, so a suppression
 * that lands mid-page would otherwise still be mailed. It is the narrower of
 * the two checks (exact, case-sensitive `.eq`), which is why it supplements
 * rather than replaces the case-insensitive page read. When it fires the CLAIM
 * STANDS and the rung is spent on purpose — a released claim is a second chance
 * to mail someone who asked us to stop.
 *
 * The self-service opt-out has the SAME two-layer shape, one level up in
 * `dispatch`: `loadOptedOutEmails` per page, and `ensureUnsubscribeCredential`'s
 * own read per dispatch. That one lands before this function is reached, so a
 * person who clicked the link mid-page never gets as far as the enqueue.
 *
 * THE IDEMPOTENCY KEY IS DETERMINISTIC. `(templateKey, applicationId)` are the
 * ledger's own key columns, so the provider sees the same key for the same rung
 * however many times anything upstream retries. A random component here would
 * make every retry look like a new message to the provider, discarding the one
 * dedupe the sender offers.
 */
async function sendEmail(
  admin: AdminClient,
  to: string,
  applicationId: string,
  templateKey: string,
  message: ReentryMessage,
  unsubscribeCredential: string,
): Promise<DispatchResult> {
  if (await isEmailSuppressed(admin, to)) {
    return { ok: false, suppressed: true, error: "recipient suppressed at dispatch" };
  }

  const messageId = crypto.randomUUID();
  const { error } = await enqueueEmail(admin, {
    runId: crypto.randomUUID(),
    to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    label: templateKey,
    idempotencyKey: `${templateKey}:${applicationId}`,
    messageId,
    // The same credential the body's `{{unsubscribe_url}}` was built from, on
    // the field `process-email-queue:284` already forwards to the sender. It is
    // an EXTRA, not a dependency: nothing in this repo emits a
    // `List-Unsubscribe` header, and `npm:@lovable.dev/email-js` is absent from
    // this repo's package.json, so whether the provider turns it into an
    // inbox-level one-click is unverified from here. The link in the body is the path that
    // is guaranteed to work, and it carries the same credential to the same
    // provider either way, so passing it adds no exposure the body did not.
    unsubscribeToken: unsubscribeCredential,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── THE COPY (E-2) ──────────────────────────────────────────────────────────
// Everything from here to `dispatch` renders the two nudges the brief calls for:
// `completed_no_fee` → "complete your ₹400", handing back the EXISTING in-app
// fee link, and fee-paid-no-interview → "you paid, book your interview",
// handing back the EXISTING `offerings.calendly_url`. No link is minted, no
// order is originated, nothing is inserted into the intake chain
// (INTEG-PAY-1) — both are strings that already exist elsewhere in the product.

/**
 * The active `email_templates` row for every rung key, read ONCE per run.
 *
 * Throws on error rather than degrading. An unreadable templates table looks
 * exactly like "no copy exists" to the renderability check below, which would
 * turn a database fault into a clean-looking run that reached nobody. The same
 * reasoning as `loadHistory`: a partial read here is worse than no run.
 */
async function loadTemplates(admin: AdminClient): Promise<Map<string, EmailTemplateRow>> {
  const { data, error } = await admin
    .from("email_templates")
    .select("template_key, subject, html_body, text_body")
    .in("template_key", LADDER_TEMPLATE_KEYS)
    .eq("is_active", true);
  if (error) throw new Error(`template read failed: ${error.message}`);

  const byKey = new Map<string, EmailTemplateRow>();
  for (const row of (data ?? []) as EmailTemplateRow[]) byKey.set(row.template_key, row);
  return byKey;
}

/** The embedded offering, tolerating either PostgREST embed shape. */
function offeringOf(row: ApplicationRow): OfferingRow | null {
  const embedded = row.offerings;
  if (!embedded) return null;
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

/**
 * The application fee as a rendered amount, or null when the offering does not
 * carry one. `numeric(10,2)` arrives as a JSON number here but has been seen as
 * a string from other PostgREST versions, so both are accepted and anything
 * else is treated as absent.
 *
 * NULL/≤0 makes the fee rungs UNRENDERABLE (below) rather than defaulting to
 * 400. The deck writes ₹400 because that is this cohort's fee, but the column
 * is per-offering and other LevelUp SKUs charge a different application fee —
 * mailing a number the database does not hold is the one error a nudge about
 * money must never make.
 */
function feeAmount(offering: OfferingRow | null): string | null {
  const raw = offering?.app_fee_inr;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * The existing Calendly link, or null.
 *
 * Pinned to calendly.com over https, mirroring `isCalendlyUrl` in
 * `src/pages/ThankYou.tsx` and for the same reason: the column is
 * admin-authored, and a misconfigured or compromised admin account must not be
 * able to put an arbitrary destination behind a "Book my interview" button in
 * mail we send. A URL that does not clear this makes the interview rungs
 * unrenderable, which is reported as a `no-copy` skip.
 */
function calendlyLink(offering: OfferingRow | null): string | null {
  const url = offering?.calendly_url;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname !== "calendly.com" && !parsed.hostname.endsWith(".calendly.com")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * THE EXISTING in-app ₹400 link — the same route the application surface
 * already offers at this exact stage
 * (`RECONCILED_STAGE_UI['completed-no-fee']` in `src/pages/ApplicationStatus.tsx`).
 * It is a link to a page, not an order: nothing is created until the applicant
 * acts on it, exactly as today (INTEG-PAY-1).
 */
function feeLink(row: ApplicationRow): string {
  return `${SITE_URL}/checkout/${row.offering_id}?type=app_fee&app=${row.id}`;
}

/**
 * The deadline sentence (`CD-04-DRAFT-04`), or "" when we cannot stand behind
 * it. Two conditions, both necessary:
 *   • the column is set — it is nullable, and an unset deadline must produce no
 *     sentence rather than a sentence with a hole in it;
 *   • the date has not already passed in IST — "applications close on the 12th"
 *     mailed on the 20th is simply false. `istDayKey` is the pure layer's own
 *     IST arithmetic, so this comparison cannot drift from the quiet-hours one.
 *
 * It renders a DATE and never a time, because `offerings.application_deadline`
 * is a `date` column with no time-of-day and a wall-clock close time would be
 * invented (deck WORD-2 settles this the same way).
 */
function deadlineLine(offering: OfferingRow | null, now: Date): string {
  const raw = offering?.application_deadline;
  if (!raw) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return "";
  if (raw.trim() < istDayKey(now)) return "";

  const month = MONTH_NAMES[Number(m[2]) - 1];
  if (!month) return "";
  return `Applications for this cohort close ${Number(m[3])} ${month} ${m[1]}.`;
}

/**
 * Which rung keys the EMAIL channel can render FOR THIS APPLICATION, handed to
 * `decide()` as `channelTemplates`.
 *
 * This is computed per row, not per run, and that is the whole mechanism by
 * which "we have no link to hand back" stays a counted, tested decision instead
 * of an `if` in the loop or a burned rung. A fee rung needs an active template
 * row AND a fee amount; an interview rung needs an active template row AND a
 * Calendly URL that cleared the host check. Anything missing and `decide()`
 * returns `{ send: false, reason: "no-copy" }` — nothing is claimed, nothing is
 * spent, and the next tick reconsiders it once the offering is configured.
 */
function renderableEmailKeys(
  templates: Map<string, EmailTemplateRow>,
  offering: OfferingRow | null,
): ReadonlySet<string> {
  const keys = new Set<string>();
  const hasFee = feeAmount(offering) !== null;
  const hasCalendly = calendlyLink(offering) !== null;

  for (const key of FEE_TEMPLATE_KEYS) {
    if (hasFee && templates.has(key)) keys.add(key);
  }
  for (const key of INTERVIEW_TEMPLATE_KEYS) {
    if (hasCalendly && templates.has(key)) keys.add(key);
  }
  return keys;
}

/**
 * The variables a nudge may interpolate — STRUCTURED FIELDS ONLY (NFR-COPY-1).
 * The 100-word essay lives in `cohort_applications.bio` and raw inside
 * `tally_data`, and neither column is in `APPLICATION_COLUMNS`, so no value
 * built here can contain it. What is here: a first name, the offering title,
 * the fee amount, a deadline date, and two links that already exist.
 */
function templateVariables(
  row: ApplicationRow,
  offering: OfferingRow | null,
  now: Date,
  unsubscribeUrl: string,
): Record<string, string> {
  const first = (row.full_name ?? "").trim().split(/\s+/)[0] ?? "";
  return {
    first_name: first.length > 0 ? first : "there",
    cohort_name: (offering?.title ?? "").trim() || "your cohort",
    app_fee: feeAmount(offering) ?? "",
    deadline_line: deadlineLine(offering, now),
    app_url: SITE_URL,
    fee_link: feeLink(row),
    calendly_link: calendlyLink(offering) ?? "",
    // U-1. This map is EXHAUSTIVE by contract: `UNRESOLVED_PLACEHOLDER` is
    // checked after render and an unfilled `{{…}}` is a post-claim failure, so
    // a template variable that exists in the copy and not here does not degrade
    // the ladder, it takes the whole ladder dark one burned rung at a time. The
    // six bodies in `20260730110000_unsubscribe_tokens.sql` all reference this
    // key, and `src/lib/__tests__/unsubscribe.test.ts` asserts the two agree.
    unsubscribe_url: unsubscribeUrl,
  };
}

/** Any `{{placeholder}}` the variable map did not fill. */
const UNRESOLVED_PLACEHOLDER = /\{\{\s*[\w.]+\s*\}\}/;

/**
 * Interpolate one template. Every variable goes through `sanitizeVar` from
 * `_shared/email.ts` — the same helper `queue-transactional-email` uses — with
 * the same carve-out that function makes for `app_url`: `sanitizeVar` strips
 * `https?://\S+`, so putting a link through it deletes the link. Hence
 * `URL_VARIABLES`, whose members are length-capped instead and are all
 * URLs this function built or validated itself.
 */
function renderTemplate(template: EmailTemplateRow, vars: Record<string, string>): ReentryMessage {
  let subject = template.subject;
  let html = template.html_body;
  let text = template.text_body ?? "";

  for (const [key, raw] of Object.entries(vars)) {
    const value = URL_VARIABLES.has(key) ? raw.slice(0, 500) : sanitizeVar(raw);
    const placeholder = `{{${key}}}`;
    // `() => value`, NOT `value`. THE ARROW IS THE FIX AND IT IS NOT STYLE.
    //
    // `String.replaceAll(search, replacement)` treats a STRING replacement as a
    // substitution pattern: `$&` inserts the match, `$'` the text after it,
    // "$`" the text before it, `$$` a literal `$`. `first_name` comes from
    // `full_name` — applicant-supplied, through `sanitizeVar`, which strips
    // newlines, angle brackets and URLs but has no reason to strip `$`.
    //
    // So a person whose name begins `$'` renders THE ENTIRE REMAINDER OF THE
    // EMAIL BODY into the greeting, and it does not trip the
    // UNRESOLVED_PLACEHOLDER check below, so it SENDS. `$&` renders a literal
    // `{{first_name}}`, which does trip the check — but only AFTER the rung was
    // claimed, so it burns that rung silently and the applicant hears nothing.
    // A name containing `{{fee_link}}` renders the checkout URL where the
    // person's name belongs, and also sends.
    //
    // A function replacement is never pattern-interpreted: the value goes in
    // verbatim, whatever characters it holds. Fixing it here rather than in
    // `sanitizeVar` is deliberate — `$` is a legal character in a human name,
    // and the defect is in how the substitution reads it, not in the name.
    subject = subject.replaceAll(placeholder, () => value);
    html = html.replaceAll(placeholder, () => value);
    text = text.replaceAll(placeholder, () => value);
  }
  return { subject, html, text };
}

/**
 * Render and hand off. Every guard below is a post-claim FAILURE path, not a
 * send/no-send rule: `decide()` can only name a channel and a key that
 * `renderableEmailKeys` already vouched for, so none of them is reachable in a
 * consistent system — they exist so an impossible state becomes a recorded
 * `last_error` rather than a thrown TypeError that aborts the run, or worse, a
 * literal `{{first_name}}` in somebody's inbox.
 *
 * The WhatsApp sender is deliberately absent rather than stubbed. Interakt can
 * only call a template Meta has already approved (Δ2), and no such template
 * exists for these six rungs — so `resolveChannel` in the pure layer can never
 * return "whatsapp" until a template name is registered. Adding WhatsApp is
 * supplying that name plus a sender here; it is not a rebuild.
 */
async function dispatch(
  admin: AdminClient,
  channel: LadderChannel,
  row: ApplicationRow,
  templateKey: string,
  templates: Map<string, EmailTemplateRow>,
  now: Date,
): Promise<DispatchResult> {
  if (channel !== "email") return { ok: false, error: `no sender wired for channel '${channel}'` };

  const template = templates.get(templateKey);
  if (!template) return { ok: false, error: `no active email template for '${templateKey}'` };

  // THE OPT-OUT IS RESOLVED BEFORE THE BODY IS RENDERED, and a failure here
  // stops the send rather than degrading it. Every alternative is worse: an
  // empty variable would trip nothing (it is a legal empty string) and would
  // mail a body whose "unsubscribe" link goes nowhere, and skipping the
  // variable entirely would leave `{{unsubscribe_url}}` in somebody's inbox. A
  // run-level guard already refused to start if the secret is unset, so
  // reaching this catch means the database itself is failing, which the ledger
  // records.
  let unsubscribe: UnsubscribeState;
  try {
    unsubscribe = await ensureUnsubscribeCredential(admin, row.email, now);
  } catch (err) {
    return { ok: false, error: `unsubscribe token unavailable: ${(err as Error).message}` };
  }

  // THE LAST-MOMENT OPT-OUT CHECK, and it cost no extra round trip: the read
  // that fetches the token row is the read that answers this. `loadOptedOutEmails`
  // already filtered the page pre-claim, so getting here means the click landed
  // mid-page. Reported as `suppressed`, not as a fault: burning the rung is
  // exactly right for somebody who asked us to stop.
  if (unsubscribe.optedOut) {
    return { ok: false, suppressed: true, error: "recipient unsubscribed from reminders" };
  }

  const unsubscribeUrl = buildUnsubscribeUrl(SUPABASE_URL, unsubscribe.credential);

  const offering = offeringOf(row);
  const message = renderTemplate(template, templateVariables(row, offering, now, unsubscribeUrl));
  if (
    UNRESOLVED_PLACEHOLDER.test(message.subject) ||
    UNRESOLVED_PLACEHOLDER.test(message.html) ||
    UNRESOLVED_PLACEHOLDER.test(message.text)
  ) {
    return { ok: false, error: `template '${templateKey}' has a placeholder with no variable` };
  }

  return await sendEmail(admin, row.email, row.id, templateKey, message, unsubscribe.credential);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── AUTH ──────────────────────────────────────────────────────────────────
  // The caller must present the shared secret byte for byte. `verify_jwt` only
  // proves the caller holds SOME project JWT (the anon key qualifies), so it
  // cannot be the gate for a function that sends mail to applicants.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const expected = POLL_AUTH_TOKEN || SERVICE_KEY;
  if (!expected) {
    // An unset secret and an empty bearer both compare equal as "" — so a
    // missing secret is a hard 401 BEFORE the compare, with its own event, or
    // an operator would burn the outage chasing the vault secret instead of
    // this function's env.
    log("error", "auth_misconfigured", { reason: "poll_auth_token_unset" });
    return jsonRes({ error: "Unauthorized" }, 401);
  }
  if (!token || !timingSafeEqual(token, expected)) {
    log("warn", "auth_rejected", { hasAuthHeader: authHeader.length > 0, tokenLength: token.length });
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  // ── THE KILL SWITCH ───────────────────────────────────────────────────────
  // Read the body first. It is the request, not a row, and the switch has to
  // know whether this is the scheduled live tick or an operator asking for a
  // preview.
  const body = await req.json().catch(() => null);
  const requestedDryRun = !!(body && typeof body === "object" && (body as Record<string, unknown>).dry_run === true);

  // A LIVE tick against a disabled ladder returns HERE — before the client is
  // built, before a single applicant row is read, before any sender exists. The
  // pg_cron schedule posts `'{}'::jsonb`, so every scheduled tick takes exactly
  // this path until `REMINDER_LADDER_ENABLED` is set to 'true'.
  if (!LADDER_ENABLED && !requestedDryRun) {
    log("info", "ladder_disabled", { reason: "REMINDER_LADDER_ENABLED not 'true'" });
    return jsonRes({ ok: true, enabled: false, skipped: "REMINDER_LADDER_ENABLED not set" });
  }

  // A live ladder with no server-side reconciler has a structurally empty (or
  // permanently stale) candidate pool. Refuse that rollout combination rather
  // than reporting a healthy zero-send cron while `VITE_FUNNEL_RECON` stays off.
  if (LADDER_ENABLED && !requestedDryRun && !REENTRY_RECONCILE_ENABLED) {
    log("error", "reconciler_disabled", {
      reason: "REENTRY_RECONCILE_ENABLED not 'true'",
    });
    return jsonRes(
      { error: "server-side funnel reconciliation is not enabled; refusing to run ladder" },
      503,
    );
  }

  // An explicit dry run IS allowed through the disabled switch, because a
  // preview that requires arming the live cron is not a pre-flight check — it
  // is the live run. It cannot send: `dryRun` is forced true whenever the
  // switch is off, and the claim and the dispatch both sit inside `if
  // (!dryRun)` below, so a disabled ladder has no code path to a sender at all.
  const dryRun = requestedDryRun || !LADDER_ENABLED;

  // ── THE OPT-OUT PRECONDITION (U-1) ────────────────────────────────────────
  // A live run needs a usable `UNSUBSCRIBE_TOKEN_SECRET`, because every body it
  // sends carries an unsubscribe link derived from it. Checked HERE, before a
  // row is read, for the same reason the kill switch is: minting happens after
  // the ledger claim, so an unset secret discovered per row would burn one rung
  // per applicant and write a `last_error` for each while sending nothing.
  // A dry run is allowed through — it renders nothing and reaches no sender.
  if (!dryRun && !isUsableUnsubscribeSecret(UNSUBSCRIBE_SECRET)) {
    log("error", "unsubscribe_secret_unset", {
      reason: `UNSUBSCRIBE_TOKEN_SECRET missing or under ${MIN_UNSUBSCRIBE_SECRET_LENGTH} characters`,
    });
    return jsonRes({ error: "unsubscribe secret not configured; refusing to send" }, 500);
  }

  const admin = createAdminClient();
  const now = new Date();
  const counters: SkipCounters = {};
  const summary: RunSummary = {
    ok: true,
    enabled: LADDER_ENABLED,
    dryRun,
    pages: 0,
    scanned: 0,
    eligible: 0,
    claimed: 0,
    dispatched: 0,
    raced: 0,
    racedDailyCap: 0,
    dispatchFailed: 0,
    claimFailed: 0,
    suppressedAtDispatch: 0,
    deferred: 0,
    skips: counters,
  };

  try {
    // THE COPY, READ ONCE. This happens before the candidate scan because the
    // set of keys with an active template row IS the email channel's
    // renderable set, and a decision made without it would claim rungs this
    // function cannot render. Against a database where
    // `20260730100200_reentry_email_templates.sql` has not been applied the map
    // is empty, every rung is unrenderable and the run reports `no-copy` for
    // every eligible applicant — which is the state this phase ships in.
    const templates = await loadTemplates(admin);

    // THE CANDIDATE READ. Every filter here is a restatement of a rule the pure
    // layer enforces again on each row — none of them is a second opinion, and
    // `decide` still reports `silenced-status` / `reconciled-no-pool` /
    // `expired` if it ever disagrees.
    //
    // `status IN (CANDIDATE_STATUSES)` is the complement of the nine silencing
    // statuses over the eleven the CHECK allows. A reconciled
    // `fee-paid-no-interview` row whose ₹400 arrived off-app still reads
    // `submitted` here, which is exactly the applicant the reconciler exists to
    // discover, so both statuses have to stay in.
    //
    // `reconciled_stage IN (the two ladder stages)` is the one filter that is
    // load-bearing for REACH rather than for cost. The pool is read off that
    // column and nothing else, so an unreconciled row can only ever produce an
    // `unreconciled` skip — and unreconciled rows outnumber reconciled ones by
    // a wide margin in this table. Without this predicate an oldest-first scan
    // would spend its whole 1000-row ceiling on rows that can never send and
    // might never reach a single eligible applicant.
    //
    // The window filter bounds the pool. This function never writes
    // `cohort_applications`, so a row that never pays keeps its stage forever;
    // without the window an oldest-first read would fill every batch with the
    // same permanently-`expired` rows and never scan a live applicant again.
    // `anchorFor` returns `created_at` or `app_fee_paid_at`, so "either column
    // is inside the window" is a strict superset of "not expired" — the pure
    // layer still re-checks, and still reports `expired` if it disagrees.
    const windowStart = new Date(now.getTime() - LADDER_WINDOW_MS).toISOString();

    for (let page = 0; page < MAX_CANDIDATE_PAGES; page++) {
      const from = page * REENTRY_BATCH_LIMIT;
      const { data, error } = await admin
        .from("cohort_applications")
        .select(APPLICATION_COLUMNS)
        .in("status", CANDIDATE_STATUSES)
        .in("reconciled_stage", [POOL_STAGE.fee, POOL_STAGE.interview])
        .or(`created_at.gte.${windowStart},app_fee_paid_at.gte.${windowStart}`)
        // Oldest-first is fair here ONLY because the window keeps the set live:
        // every row in it can still produce a send, and every row leaves it
        // after 14 days, so the head of the queue cannot become permanent.
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + REENTRY_BATCH_LIMIT - 1);

      if (error) {
        log("error", "candidate_query_failed", { page, message: error.message });
        return jsonRes({ error: error.message, partial: summary }, 500);
      }

      // Through `unknown`: the embedded `offerings(...)` in APPLICATION_COLUMNS
      // is opaque to supabase-js's string-literal select parser, which falls
      // back to `GenericStringError[]`. The shape is asserted at runtime by
      // `offeringOf` rather than by this cast.
      const rows = (data ?? []) as unknown as ApplicationRow[];
      summary.pages++;
      summary.scanned += rows.length;
      if (rows.length === 0) break;

      const history = await loadHistory(admin, rows.map((r) => r.id));
      // Two reads per page rather than two per send, unioned into ONE set: the
      // people a human silenced (`suppressed_emails`) and the people who
      // silenced themselves through the link (`email_unsubscribe_tokens.used_at`).
      // Both feed the SAME `suppressedChannels` input `decide` already takes, so
      // this adds no new skip reason and no new mechanism to the pure layer.
      const pageEmails = rows.map((r) => r.email);
      const suppressed = await loadSuppressedEmails(admin, pageEmails);
      for (const optedOut of await loadOptedOutEmails(admin, pageEmails)) suppressed.add(optedOut);

      for (const row of rows) {
        const decision: LadderDecision = decide({
          now,
          reconciledStage: row.reconciled_stage,
          reconciledAt: row.reconciled_at,
          status: row.status,
          completedNoFee: row.completed_no_fee === true,
          createdAt: row.created_at,
          appFeePaidAt: row.app_fee_paid_at,
          history: history.get(row.id) ?? [],
          contact: { email: row.email, phone: row.phone },
          // Per-row, not per-run: a rung is renderable only if its template row
          // is active AND this offering carries the thing the copy hands back
          // (a fee amount, or a Calendly URL). Missing either is a counted
          // `no-copy` skip, never a claimed-and-burned rung.
          channelTemplates: { email: renderableEmailKeys(templates, offeringOf(row)) },
          suppressedChannels: suppressed.has(row.email.trim().toLowerCase()) ? EMAIL_SUPPRESSED : undefined,
          feeEvidenceMaxAgeMs: FEE_EVIDENCE_MAX_AGE_MS,
        });

        if (!decision.send) {
          bump(counters, decision.reason);
          continue;
        }
        summary.eligible++;

        // The dry-run exit, and it is the LAST thing before the first write.
        // Past this line the function claims and sends; before it, it has only
        // read. `eligible` above is what a dry run reports — "this many would
        // have gone out" — with `dispatched` necessarily 0. Because `dryRun` is
        // forced true whenever the kill switch is off, this `continue` is also
        // what makes a disabled ladder incapable of dispatch.
        if (dryRun) continue;

        if (claimAttempts(summary) >= MAX_CLAIM_ATTEMPTS_PER_RUN) {
          // Out of ledger budget for this pass — counting races and claim
          // errors, both of which cost a round trip and send nothing. Nothing
          // is claimed for this row, so the next tick reaches exactly the same
          // decision for it.
          summary.deferred++;
          continue;
        }

        // CLAIM FIRST, THEN SEND. The reverse order would make the ledger a
        // record of past sends instead of a mutex, and two overlapping ticks
        // would both send before either wrote a row.
        let claim: ClaimOutcome;
        try {
          claim = await claimRung(admin, row.id, decision.templateKey, decision.channel, now);
        } catch (err) {
          log("error", "claim_failed", { applicationId: row.id, message: (err as Error).message });
          summary.claimFailed++;
          continue;
        }
        if (!claim.claimed) {
          // Not an error — this is a constraint doing its job. WHICH constraint
          // is the whole difference between "another invocation owns this rung"
          // and "this applicant's one message for today is already claimed by a
          // different rung", so the two are counted apart.
          if (claim.race === "day") summary.racedDailyCap++;
          else summary.raced++;
          continue;
        }
        summary.claimed++;

        const result = await dispatch(admin, decision.channel, row, decision.templateKey, templates, now);
        if (result.ok) {
          summary.dispatched++;
          await settleClaim(admin, claim.id, { ok: true });
        } else {
          // The claim STANDS and the rung is spent. That is deliberate: the only
          // way to retry is to release the claim, and a released claim is a
          // second chance for an overlapping tick to send the same message. A
          // failed rung is therefore a visible one — `dispatched_at` stays NULL,
          // which the partial index `reentry_notif_undelivered_idx` exists to
          // surface — never an unbounded redelivery loop into someone's inbox.
          // A last-moment suppression is counted apart because it is a settled
          // outcome, not a fault: burning the rung is exactly what we want for
          // an address that asked us to stop.
          if (result.suppressed) summary.suppressedAtDispatch++;
          else summary.dispatchFailed++;
          log(result.suppressed ? "info" : "warn", result.suppressed ? "dispatch_suppressed" : "dispatch_failed", {
            applicationId: row.id,
            templateKey: decision.templateKey,
            channel: decision.channel,
            message: result.error,
          });
          await settleClaim(admin, claim.id, { ok: false, error: result.error });
        }
      }

      // A short page is the end of the candidate set — stop rather than pay for
      // a read that can only come back empty.
      if (rows.length < REENTRY_BATCH_LIMIT) break;

      if (!dryRun && claimAttempts(summary) >= MAX_CLAIM_ATTEMPTS_PER_RUN) {
        // The budget is spent, so a further page could only add skips. Say the
        // scan was cut short and why; the backlog drains on the next tick.
        summary.truncated = true;
        summary.truncatedReason = "claim-budget";
        break;
      }

      if (page === MAX_CANDIDATE_PAGES - 1) {
        summary.truncated = true;
        summary.truncatedReason = "page-cap";
      }
    }

    if (summary.truncatedReason === "page-cap") {
      log("warn", "scan_truncated", {
        reason: "page-cap",
        scanned: summary.scanned,
        pageCap: MAX_CANDIDATE_PAGES,
        batchLimit: REENTRY_BATCH_LIMIT,
        note: "more live candidates may exist than this run scanned; raise MAX_CANDIDATE_PAGES",
      });
    }

    log("info", "run_complete", { ...summary, cronPeriodMs: CRON_PERIOD_MS });
    return jsonRes(summary);
  } catch (err) {
    log("error", "run_failed", { message: (err as Error).message, ...summary });
    return jsonRes({ error: (err as Error).message, partial: summary }, 500);
  }
});
