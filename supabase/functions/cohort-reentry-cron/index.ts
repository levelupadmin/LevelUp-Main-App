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
 * ── WHO THIS CAN ACTUALLY REACH, AND WHO IT DELIBERATELY CANNOT ─────────────
 * ONLY applications the reconciler has read. `reconciled_stage` has exactly one
 * writer in this repo — `reconcile-funnel-stage`, which authenticates the
 * caller and mirrors with `.eq("user_id", user.id)` — so an application
 * inserted by `tally-application-poll` with `user_id` NULL never acquires a
 * stage, and this cron never messages it. That is a real and known limitation:
 * it excludes part of the drop-off population this phase is about.
 *
 * It is still the correct behaviour, and the alternative was tried. Deriving
 * the pool from the application's own `status` / `app_fee_paid_at` where the
 * reconciler is silent reaches those rows by ASSERTING something no column in
 * this database supports: `tally-application-poll` writes `status='submitted'`
 * on insert and never updates it, and neither the reconciler nor
 * `razorpay-webhook` (which keys on a `payment_orders` row only a signed-in
 * user can create) can touch a `user_id`-NULL row. Their `status` is
 * permanently 'submitted' and their `app_fee_paid_at` permanently NULL whether
 * they ignored us or paid, interviewed and enrolled off-app — and off-app is
 * the norm, which is why the reconciler matches raw Razorpay captures and
 * TeleCRM statuses instead of reading `payment_orders`. Silence for those rows
 * is a smaller error than mailing "complete your ₹400" to someone who is
 * already enrolled. The reasoning is recorded in full above `POOL_STAGE` in
 * `_shared/ladder.ts`; the `unreconciled` skip counter below is how a run that
 * reaches nobody says so out loud instead of looking healthy.
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
 * Three independent reasons, any one sufficient:
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
 * ── CONSENT, AND THE OPT-OUT THAT ACTUALLY EXISTS ───────────────────────────
 * `user_marketing_prefs` holds zero rows, so no consent is claimed anywhere in
 * the copy: these are service messages to someone who submitted an application,
 * and every body says so. No unsubscribe ENDPOINT is invented here —
 * `email_unsubscribe_tokens` exists but no producer issues a token and
 * `_shared/email.ts`'s `enqueueEmail` accepts none, and that file is not this
 * task's to change. What every body does carry is the opt-out that provably
 * works today: a reply, which a human puts into `suppressed_emails`, which
 * silences the ladder through the two suppression checks below.
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
 *   • ledger history + suppression: chunked at `LOOKUP_CHUNK` (50) ids/addresses
 *     → ≤20 + ≤20 round trips (one lookup key per address, see
 *     `loadSuppressedEmails`).
 *   • copy: ONE read of `email_templates` for all six rung keys, per run.
 *   • the ledger: at most `MAX_CLAIM_ATTEMPTS_PER_RUN` (50) CLAIM ATTEMPTS,
 *     each costing one INSERT plus, when the claim is won, one last-moment
 *     suppression check, one enqueue and one settle update → ≤200 round trips.
 * ≤246 sequential round trips against the same region; at even 100 ms each that
 * is ~25 s, a 2.4x margin inside the 60 s timeout.
 *
 * THE BUDGET COUNTS CLAIM ATTEMPTS, NOT DELIVERIES, and that distinction is the
 * whole reason the bound holds. Counting only successful dispatches leaves the
 * two paths that consume a round trip and produce no message — a 23505 race
 * against an overlapping invocation, and a ledger INSERT that errors — free of
 * charge, so a transient ledger outage or one overlapping tick would turn a
 * single pass into up to 1000 sequential INSERTs and blow straight through the
 * timeout. `claimAttempts()` therefore counts `dispatched + dispatchFailed +
 * raced + claimFailed`: every path that touched the ledger, which is every path
 * that cost time. Anything past the ceiling is left for the next tick 15
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
 * itself (`SITE_URL`, the existing checkout route, and a `calendly_url` that
 * cleared `isCalendlyUrl`), never a string an applicant supplied.
 */
const URL_VARIABLES: ReadonlySet<string> = new Set(["app_url", "fee_link", "calendly_link"]);

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
  /** Rungs another overlapping invocation had already claimed (23505). */
  raced: number;
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
 * counts: a won claim (dispatched / dispatchFailed), a lost race (raced) and an
 * errored INSERT (claimFailed) all cost one INSERT against the same database.
 * Counting only the ones that produced a message would leave the two failure
 * paths unbounded — which is exactly how one overlapping invocation, or a
 * minute of ledger unavailability, becomes a thousand sequential INSERTs and a
 * pg_net timeout.
 */
function claimAttempts(summary: RunSummary): number {
  return summary.dispatched + summary.dispatchFailed + summary.suppressedAtDispatch + summary.raced +
    summary.claimFailed;
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
 * Claim a rung. The INSERT is built from `ledgerKey()` and nothing else, so two
 * invocations deciding the same rung produce byte-identical key columns and
 * Postgres serialises them on `reentry_notif_unique`. Returns the claim's id,
 * or null when another invocation got there first (23505) — in which case this
 * one skips WITHOUT sending. That is the whole double-send proof: it rests on
 * the constraint, not on how long a run happens to take.
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
): Promise<{ id: string } | null> {
  const { data, error } = await admin
    .from("reentry_notifications_log")
    .insert({ ...ledgerKey(applicationId, templateKey), channel })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`ledger claim failed: ${error.message}`);
  }
  return data as { id: string };
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
 * `loadSuppressedEmails`: a page is read once and then walked, so an
 * unsubscribe that lands mid-page would otherwise still be mailed. It is the
 * narrower of the two checks (exact, case-sensitive `.eq`), which is why it
 * supplements rather than replaces the case-insensitive page read. When it
 * fires the CLAIM STANDS and the rung is spent on purpose — a released claim is
 * a second chance to mail someone who asked us to stop.
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
function templateVariables(row: ApplicationRow, offering: OfferingRow | null, now: Date): Record<string, string> {
  const first = (row.full_name ?? "").trim().split(/\s+/)[0] ?? "";
  return {
    first_name: first.length > 0 ? first : "there",
    cohort_name: (offering?.title ?? "").trim() || "your cohort",
    app_fee: feeAmount(offering) ?? "",
    deadline_line: deadlineLine(offering, now),
    app_url: SITE_URL,
    fee_link: feeLink(row),
    calendly_link: calendlyLink(offering) ?? "",
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
    subject = subject.replaceAll(placeholder, value);
    html = html.replaceAll(placeholder, value);
    text = text.replaceAll(placeholder, value);
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

  const offering = offeringOf(row);
  const message = renderTemplate(template, templateVariables(row, offering, now));
  if (
    UNRESOLVED_PLACEHOLDER.test(message.subject) ||
    UNRESOLVED_PLACEHOLDER.test(message.html) ||
    UNRESOLVED_PLACEHOLDER.test(message.text)
  ) {
    return { ok: false, error: `template '${templateKey}' has a placeholder with no variable` };
  }

  return await sendEmail(admin, row.email, row.id, templateKey, message);
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

  // An explicit dry run IS allowed through the disabled switch, because a
  // preview that requires arming the live cron is not a pre-flight check — it
  // is the live run. It cannot send: `dryRun` is forced true whenever the
  // switch is off, and the claim and the dispatch both sit inside `if
  // (!dryRun)` below, so a disabled ladder has no code path to a sender at all.
  const dryRun = requestedDryRun || !LADDER_ENABLED;

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
      // One suppression read per page rather than one per send.
      const suppressed = await loadSuppressedEmails(admin, rows.map((r) => r.email));

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
        let claim: { id: string } | null;
        try {
          claim = await claimRung(admin, row.id, decision.templateKey, decision.channel);
        } catch (err) {
          log("error", "claim_failed", { applicationId: row.id, message: (err as Error).message });
          summary.claimFailed++;
          continue;
        }
        if (!claim) {
          // Another invocation owns this rung. Not an error — this is the
          // constraint doing its job.
          summary.raced++;
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
