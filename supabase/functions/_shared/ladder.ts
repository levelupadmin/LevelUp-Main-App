/**
 * ladder.ts — the re-entry reminder ladder's DECISION LAYER (PHASE RE, task E-1).
 *
 * Given one application's markers, its timestamps, everything the ledger has
 * already sent for it, and an EXPLICIT clock, this module answers exactly one
 * question: "does this application get a message on this tick, and if so which
 * rung on which channel?" It answers it as a value, never as a side effect.
 *
 * PURE AND DEPENDENCY-FREE — the same contract `phone.ts` holds. There are no
 * imports in this file and there must never be any. It touches no network, no
 * database, no `Deno` global, no wall-clock read, no `Intl`, no timezone
 * database: every function that needs the time is handed a `Date`. A unit test
 * asserts all of that against the source itself. That is what lets vitest
 * import it through the `@shared` alias with zero mocking, and it is the whole
 * reason the caps below are testable at their boundary minute.
 *
 * THE RULE THAT MAKES THIS FILE WORTH HAVING: a rule implemented in the handler
 * is a rule nobody can test. Every cap — 1/day, 4 ever, IST quiet hours, no
 * channel double-fire, one-cron-cycle silence — lives HERE, and so does every
 * other reason a message does not go out, including "this address unsubscribed"
 * and "no copy is registered for this rung". `cohort-reentry-cron/index.ts` is
 * only allowed to fetch rows, call `decide`, write the ledger and dispatch. If
 * you find yourself adding an `if` about WHETHER to send inside the handler, it
 * belongs in this file instead.
 *
 * WHAT THE CALLER STILL OWNS: the ledger write. `decide` returning
 * `{ send: true }` is permission to ATTEMPT a rung, not proof that no other
 * invocation is attempting the same one. The two UNIQUEs in
 * `20260730100000_reentry_ledger.sql` — `(application_id, template_key)` for
 * the rung and `(application_id, ist_day)` for the ≤1/day cap — are the only
 * things that make a double-send impossible, and `ledgerKey()` below exists so
 * the columns they cover are derived in exactly one place, off the same
 * explicit clock `decide` was handed.
 */

/** The channels the engine can address. Email is the only one wired in v1 (Δ2). */
export type LadderChannel = "email" | "whatsapp";

/** The two drop-off pools that have a real, addressable population (Δ1). */
export type LadderPool = "fee" | "interview";

/**
 * WHOSE READING PUTS AN APPLICATION IN A POOL — `reconciled_stage`, AND NOTHING
 * ELSE. This is the most consequential rule in the file, and it was written the
 * other way once, so the reasoning is recorded rather than assumed.
 *
 * The temptation is obvious: derive the pool from the application's own
 * `status` / `app_fee_paid_at` wherever the reconciler is silent.
 *
 * THAT IS NOT EVIDENCE, BECAUSE THOSE COLUMNS ARE NEVER WRITTEN FOR THE
 * OFF-APP POPULATION.
 * `tally-application-poll` writes `status = 'submitted'` on INSERT and never
 * updates it. A `user_id`-NULL row cannot be touched by the reconciler
 * (`.eq("user_id", …)`), and cannot be touched by `razorpay-webhook` either:
 * that keys on `payment_orders.application_id`, and only a signed-in user can
 * create a `payment_orders` row. So for exactly the rows a first-party
 * derivation was meant to reach, `status` is permanently 'submitted' and
 * `app_fee_paid_at` permanently NULL — regardless of what actually happened to
 * that applicant. Paying off-app is the NORM here; that is precisely why the
 * reconciler derives `hasAppFee` by matching raw Razorpay captures against
 * amount bands and the TeleCRM 'application fee paid' status
 * (`_shared/reconcile.ts`) instead of reading `payment_orders`.
 *
 * `status = 'submitted'` on such a row therefore means "nobody has ever written
 * to this row", NOT "they have not paid". Reading it as the fee pool mails
 * "complete your ₹400" to people who paid, interviewed, were accepted or
 * enrolled entirely off-app — the worst output this system has, and one that no
 * cap, silence or ledger can undo after the fact.
 *
 * So the ladder remains "driven off the reconciled stage, never off a local
 * guess": where the reconciler has never spoken the answer is silence. The
 * follow-up schedule in `20260803173000_reentry_server_reconciliation.sql`
 * closes the reach gap correctly by invoking `reconcile-funnel-stage` under a
 * service-only, application-scoped contract for `user_id`-NULL rows. That path
 * reads the same external authorities; it does not weaken this decision rule.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** IST is UTC+05:30, fixed — India has no DST, so this is arithmetic, not a tz lookup. */
export const IST_OFFSET_MS = 5.5 * HOUR_MS;

/**
 * Quiet hours: 21:30 → 09:00 IST, taken from the copy deck
 * (`design/cohorts/docs/07-COPY-DECK.md` §4.4 — "none 9:30 PM–9:00 AM"), not
 * invented here. Expressed as minutes-from-IST-midnight because the window
 * WRAPS midnight and a pair of `Date`s cannot express that without a date.
 */
export const QUIET_START_MIN = 21 * 60 + 30; // 21:30 IST — first suppressed minute
export const QUIET_END_MIN = 9 * 60; //          09:00 IST — first allowed minute

/**
 * ≤1 message per application per IST calendar day. Enforced twice on purpose:
 * here, so a tick that can already see the day's send skips cheaply and reports
 * `cap-day`, and in the database, by `reentry_notif_daily_unique` over the
 * `ist_day` column `ledgerKey()` derives. The second is not belt-and-braces —
 * this check reads a `history` fetched once per page, so on its own it is a
 * read-then-write race between two invocations that see different state.
 */
export const MAX_PER_DAY = 1;
/** ≤4 messages per application, ever, across every pool and channel. */
export const MAX_PER_APPLICATION = 4;

/**
 * How often the cron fires — every 15 minutes, per
 * `20260730100100_reentry_cron.sql`. Exported so the one-cron-cycle silence
 * guarantee is asserted against the REAL period in tests rather than against a
 * number a test made up.
 */
export const CRON_PERIOD_MS = 15 * MINUTE_MS;

/**
 * A ladder stops existing this long after its anchor. Without an expiry an
 * application with no contactable channel is re-evaluated on every tick until
 * the heat death of the cron — the brief's "skipped and counted, never retried
 * forever". With it, the ladder is a bounded object: after the window it is
 * `expired` and can never send again, whatever the history says.
 *
 * The handler ALSO uses this to bound its candidate read (`created_at` or
 * `app_fee_paid_at` inside the window). That is not an optimisation: without it
 * the pool grows without bound, permanently-expired rows sort to the front of
 * an oldest-first batch, and the same dead rows fill every tick forever while
 * no live applicant is ever scanned.
 */
export const LADDER_WINDOW_MS = 14 * DAY_MS;

/** One step of a ladder: the template it sends and how long after the anchor it is due. */
export interface LadderRung {
  /**
   * The ledger's `template_key`, and it encodes the RUNG, not just the pool.
   * This is load-bearing: the ledger's UNIQUE is `(application_id,
   * template_key)`, so one key per pool would permit exactly one send per pool
   * forever and the ≤4 cap could never be reached — the "ladder" would be a
   * single rung wearing a ladder's name.
   */
  readonly templateKey: string;
  /** Offset from the pool's anchor at which this rung becomes due. */
  readonly dueAfterMs: number;
}

/**
 * The rungs, in order. Offsets are ≥24h apart on purpose so the cadence agrees
 * with the ≤1/day cap by construction; the cap is still enforced independently
 * below, because a rung can slip a day when the quiet window swallows its due
 * moment and the two must not be able to disagree.
 *
 * Three rungs per pool, six keys total. An application that pays the ₹400
 * mid-ladder moves from the fee pool to the interview pool, so a single
 * application CAN reach the ≤4 cap (3 fee rungs + 1 interview rung) — that is
 * why the cap is reachable at all and why it is tested rather than assumed.
 */
export const LADDERS: Readonly<Record<LadderPool, readonly LadderRung[]>> = {
  fee: [
    { templateKey: "reentry_fee_nudge_1", dueAfterMs: 2 * HOUR_MS },
    { templateKey: "reentry_fee_nudge_2", dueAfterMs: 26 * HOUR_MS },
    { templateKey: "reentry_fee_nudge_3", dueAfterMs: 74 * HOUR_MS },
  ],
  interview: [
    { templateKey: "reentry_interview_nudge_1", dueAfterMs: 2 * HOUR_MS },
    { templateKey: "reentry_interview_nudge_2", dueAfterMs: 26 * HOUR_MS },
    { templateKey: "reentry_interview_nudge_3", dueAfterMs: 74 * HOUR_MS },
  ],
};

/** Every template key this engine can ever write to the ledger. */
export const LADDER_TEMPLATE_KEYS: readonly string[] = [
  ...LADDERS.fee.map((r) => r.templateKey),
  ...LADDERS.interview.map((r) => r.templateKey),
];

/**
 * The reconciled stage each pool is defined by. Membership is read off
 * `reconciled_stage` and nothing else — the application's own `status` can
 * only ever REMOVE a row from a pool (`SILENCING_STATUSES`, `feeAlreadyPaid`),
 * never place one in it, because that column lags by weeks or forever whenever
 * the money and the interview happened outside the app. The moment the
 * reconciler writes a different stage, `reconciledPoolFor` returns null and the
 * ladder is silent on the very next tick.
 */
export const POOL_STAGE: Readonly<Record<LadderPool, string>> = {
  fee: "completed-no-fee",
  interview: "fee-paid-no-interview",
};

/**
 * The status `razorpay-webhook` and `verify-razorpay-payment` write the instant
 * an in-app ₹400 capture lands, alongside `app_fee_paid_at`. Used ONLY as
 * positive evidence that the fee arrived — see `feeAlreadyPaid`.
 */
export const APP_FEE_PAID_STATUS = "app_fee_paid";

/**
 * Statuses that silence the ladder outright, whatever the reconciled stage
 * says. `withdrawn` is the brief's explicit case; the rest are stages a nudge
 * about paying or booking would be actively wrong for.
 *
 * These silence a row that the reconciler has ALREADY placed in a pool, which
 * is the case that matters: `status` advances only for applicants the app can
 * see, and for them it is often fresher than the last reconcile.
 */
export const SILENCING_STATUSES: ReadonlySet<string> = new Set([
  "withdrawn",
  "rejected",
  "waitlisted",
  "interview_scheduled",
  "interview_done",
  "accepted",
  "confirmation_paid",
  "balance_paid",
  "enrolled",
]);

/**
 * Every value the `cohort_applications` status CHECK admits
 * (`20260413100000_cohort_applications_and_staged_payments.sql:17`). Listed so
 * the eligible set below is a COMPLEMENT rather than a second hand-maintained
 * list that can drift out of step with the silences.
 */
export const ALL_APPLICATION_STATUSES: readonly string[] = [
  "submitted",
  "app_fee_paid",
  "interview_scheduled",
  "interview_done",
  "accepted",
  "rejected",
  "confirmation_paid",
  "balance_paid",
  "enrolled",
  "withdrawn",
  "waitlisted",
];

/**
 * The only statuses a nudge may go out under, and `decide` treats this as a
 * WHITELIST — anything else, including a status no CHECK has ever allowed, is
 * silenced. Fail-closed by construction: a status added to the table in a
 * future migration is mute here until somebody decides which side it belongs
 * on, rather than inheriting eligibility by not having been forbidden yet.
 *
 * Exported because the handler's candidate query filters on it. That query is
 * an index-shaped restatement of this set, never a second opinion about it:
 * `decide` re-checks every row it is handed, so a query that let something else
 * through would still send nothing.
 */
export const CANDIDATE_STATUSES: readonly string[] = ALL_APPLICATION_STATUSES.filter(
  (s) => !SILENCING_STATUSES.has(s),
);

/** One row of the ledger, as the decision layer needs to see it. */
export interface LadderSend {
  templateKey: string;
  channel: LadderChannel;
  /** ISO timestamp of the send (the ledger's `claimed_at`). */
  sentAt: string;
}

/** Where a message could be delivered. Absent/blank means "no such channel". */
export interface LadderContact {
  email?: string | null;
  phone?: string | null;
}

/** Everything the decision needs about one application, plus the clock. */
export interface LadderInput {
  /** THE CLOCK, always explicit. No function in this file reads the wall time. */
  now: Date;
  /** `cohort_applications.reconciled_stage`. Null = the reconciler never ran here. */
  reconciledStage: string | null;
  /**
   * `cohort_applications.reconciled_at`. Non-null with a NULL stage is a real
   * and meaningful state — the reconciler read this row and deliberately wrote
   * no stage (its terminal-negative floor) — so it is treated as a reading, not
   * as absence.
   */
  reconciledAt: string | null;
  /** `cohort_applications.status`. Can only ever remove a row from a pool. */
  status: string | null;
  /**
   * `cohort_applications.completed_no_fee` — the reconciler's corroboration of
   * the fee stage. The column is `NOT NULL DEFAULT false` and the reconciler is
   * its only writer, so `false` on a row the reconciler never read is a
   * DEFAULT, not a reading. That never matters here, because such a row is
   * turned away as `unreconciled` before this field is consulted at all.
   */
  completedNoFee: boolean;
  /** `cohort_applications.created_at` — the fee ladder's anchor (form submitted). */
  createdAt: string | null;
  /** `cohort_applications.app_fee_paid_at` — the interview ladder's first-choice anchor. */
  appFeePaidAt: string | null;
  /** Every ledger row for this application, both pools, any channel. */
  history: readonly LadderSend[];
  /** Contact points, structured fields only — never the essay (NFR-COPY-1). */
  contact: LadderContact;
  /**
   * Template keys a channel can actually render right now. The handler builds
   * this from its own copy registry, so "no copy is registered for this rung"
   * is decided here, as a counted skip, rather than as an untestable `if` in
   * the handler. WhatsApp stays inert until a Meta-approved template name is
   * supplied (Δ2), so an absent entry means email-only and adding WhatsApp is a
   * data change, not a rebuild.
   */
  channelTemplates?: Partial<Record<LadderChannel, ReadonlySet<string>>>;
  /**
   * Channels this particular recipient must not be contacted on — today, an
   * email address in `suppressed_emails`. Also a pure input for the same
   * reason: "did this person unsubscribe" is a send/no-send rule and belongs
   * where a test can reach it.
   */
  suppressedChannels?: ReadonlySet<LadderChannel>;
  /**
   * How old a fee-pool reading may be and still dun somebody, in milliseconds.
   * Omitted uses `DEFAULT_FEE_EVIDENCE_MAX_AGE_MS` (26h, one cadence step); `0`
   * disables the bound entirely and restores the pre-fix behaviour, which is an
   * operational escape hatch and not a default anybody should reach for. See the
   * reasoning at the check itself in `resolvePool`.
   */
  feeEvidenceMaxAgeMs?: number | null;
}

/** Why a tick produced nothing. Every reason is counted by the handler. */
export type LadderSkipReason =
  | "unreconciled"
  | "reconciled-no-pool"
  | "marker-disagrees"
  | "fee-already-paid"
  | "fee-evidence-stale"
  | "silenced-status"
  | "no-anchor"
  | "expired"
  | "cap-total"
  | "cap-day"
  | "quiet-hours"
  | "no-rung-due"
  | "no-copy"
  | "suppressed"
  | "no-channel";

export type LadderDecision =
  | { send: false; reason: LadderSkipReason }
  | {
    send: true;
    pool: LadderPool;
    rung: number;
    templateKey: string;
    channel: LadderChannel;
  };

// ── Time helpers (pure arithmetic on UTC ms; no Intl, no tz database) ─────────

/** Minutes since IST midnight, 0–1439. */
export function istMinutesOfDay(at: Date): number {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** The IST calendar day as `YYYY-MM-DD`. The unit the ≤1/day cap counts in. */
export function istDayKey(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * True inside the 21:30–09:00 IST quiet window. The window wraps midnight, so
 * the test is a union, not a range: `>= 21:30` OR `< 09:00`. 21:29 sends,
 * 21:30 does not; 08:59 does not, 09:00 does — both boundaries are unit-tested
 * in both directions because an off-by-one minute here is a message at 4am.
 */
export function isQuietHour(at: Date): boolean {
  const m = istMinutesOfDay(at);
  return m >= QUIET_START_MIN || m < QUIET_END_MIN;
}

/** `Date` from an ISO string, or null for null/blank/unparseable input. */
export function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Trimmed, lower-cased status, or "" when the column is null/blank. */
export function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

// ── The individual rules, each testable on its own ───────────────────────────

/** The pool a RECONCILED stage names, or null for "no ladder stage". */
export function reconciledPoolFor(stage: string | null): LadderPool | null {
  if (stage === POOL_STAGE.fee) return "fee";
  if (stage === POOL_STAGE.interview) return "interview";
  return null;
}

/**
 * Does the application's OWN row say the ₹400 has already landed?
 *
 * NOTE THE ASYMMETRY WITH THE RULING ABOVE — it is deliberate, not an
 * inconsistency. `status` and `app_fee_paid_at` are worthless as evidence of a
 * NEGATIVE ("they have not paid": nobody ever writes those columns for a
 * `user_id`-NULL row) and conclusive as evidence of a POSITIVE. Only two
 * writers ever set them, `razorpay-webhook` and `verify-razorpay-payment`, and
 * both write `status = 'app_fee_paid'` together with `app_fee_paid_at` the
 * instant a capture is confirmed. Nothing else can produce that state.
 *
 * WHY THE FEE LADDER MUST CONSULT IT. Those two writers do NOT touch
 * `reconciled_stage` or `completed_no_fee`, whose only writer is the
 * reconciler (browser- or server-invoked). So "stage says completed-no-fee, marker still
 * true, and this row was stamped paid ten minutes ago" is a routine, reachable
 * state — pay, close the app, the webhook lands afterwards — and the stage
 * stays stale until the applicant next opens the app. Without this check the
 * ladder tells someone who just paid to pay. E-2's edge case "the marker clears
 * mid-ladder (₹400 lands) → the fee nudge stops" is satisfied HERE, because the
 * marker itself does not clear on its own.
 */
export function feeAlreadyPaid(input: LadderInput): boolean {
  return parseInstant(input.appFeePaidAt) !== null || normalizeStatus(input.status) === APP_FEE_PAID_STATUS;
}

export type PoolResolution =
  | { pool: LadderPool }
  | {
    pool: null;
    reason: Extract<
      LadderSkipReason,
      "unreconciled" | "reconciled-no-pool" | "marker-disagrees" | "fee-already-paid" | "fee-evidence-stale"
    >;
  };

/**
 * How old a fee-pool reading may be and still be allowed to dun somebody.
 *
 * 26 HOURS, WHICH IS ONE CADENCE STEP — the gap between fee rung 1 (+2h) and
 * rung 2 (+26h). It is not a round number picked for feel; it is the interval
 * this ladder already treats as "long enough that something might have changed".
 */
export const DEFAULT_FEE_EVIDENCE_MAX_AGE_MS = 26 * HOUR_MS;

/**
 * Which pool this application belongs to RIGHT NOW.
 *
 * THE RECONCILER IS THE ONLY AUTHORITY — that is both the "goes silent within
 * one cron cycle" guarantee (the next tick re-reads the column the reconciler
 * just overwrote and gets no pool here) and the reason no message can be built
 * on a column nobody writes. A reading with no ladder stage is still a reading:
 * it silences. NO reading at all silences too, and loudly enough to be counted
 * — `unreconciled` is the reason a run that reaches nobody says why.
 *
 * The fee pool then has to clear two further checks, and they fail in opposite
 * directions: `feeAlreadyPaid` catches a stage that is stale because the money
 * arrived AFTER the last reconcile, and `completed_no_fee` catches a stage and
 * a marker that disagree with each other. Both end in silence, because a "you
 * haven't paid" message to somebody who paid is the worst output this system
 * has and neither doubt is worth resolving in its favour.
 */
export function resolvePool(input: LadderInput): PoolResolution {
  const reconcilerSpoke = input.reconciledStage !== null || parseInstant(input.reconciledAt) !== null;
  if (!reconcilerSpoke) return { pool: null, reason: "unreconciled" };

  const pool = reconciledPoolFor(input.reconciledStage);
  if (!pool) return { pool: null, reason: "reconciled-no-pool" };

  if (pool === "fee") {
    if (feeAlreadyPaid(input)) return { pool: null, reason: "fee-already-paid" };
    if (!input.completedNoFee) return { pool: null, reason: "marker-disagrees" };

    // THE READING HAS A SHELF LIFE, AND ONLY THE FEE POOL HONOURS IT.
    //
    // `feeAlreadyPaid` above is the ONLY positive-payment test, and it reads two
    // columns — `app_fee_paid_at` and `status` — whose only writers are
    // `razorpay-webhook` and `verify-razorpay-payment`. BOTH are gated on a
    // `payment_orders` row (`if (po.payment_type && po.application_id)`, after a
    // lookup that returns `skipped: "no payment_order"` when absent). An off-app
    // Razorpay payment-LINK capture never creates that row, and this cron's own
    // header calls that flow the norm. So for a payment-link payer BOTH columns
    // stay empty and `feeAlreadyPaid` is false no matter how long ago they paid.
    //
    // `completed_no_fee` does not save it either: the reconciler is that column's
    // only writer, and every external mirror is necessarily a point-in-time read.
    // Get stamped `completed-no-fee`, pay by link before the next server refresh,
    // and the marker temporarily still says "owes ₹400". Before this check the ladder read that stale
    // marker and sent all three rungs. Three "Complete the ₹400 step" emails to
    // somebody who paid, unrecallable, which this file itself calls "the worst
    // output this system has".
    //
    // No amount of reasoning over these columns fixes that, because the money
    // simply is not in them. What IS knowable is how stale the reading is, so the
    // fee pool refuses to escalate on evidence older than one cadence step. A
    // creation-time reading still carries rung 1 (+2h) and rung 2 (+26h); rung 3
    // (+74h) — the loudest message, sent to the person most likely to have paid
    // some other way by then — goes silent unless the reconciler has spoken
    // again. Erring here costs a nudge; erring the other way bills a customer
    // twice in their inbox.
    //
    // Interview-pool messages are untouched: being wrong there means offering a
    // booking link to somebody who already booked, which is a nuisance, not a
    // false accusation about money.
    const maxAge = input.feeEvidenceMaxAgeMs ?? DEFAULT_FEE_EVIDENCE_MAX_AGE_MS;
    if (maxAge > 0) {
      const readAt = parseInstant(input.reconciledAt);
      // A null `reconciled_at` with a live stage cannot be aged, so it cannot be
      // shown to be fresh either. The fee pool is the one place that resolves
      // that doubt against sending.
      if (readAt === null || input.now.getTime() - readAt.getTime() > maxAge) {
        return { pool: null, reason: "fee-evidence-stale" };
      }
    }
  }
  return { pool };
}

/**
 * The instant a pool's rung offsets are measured from.
 *
 * The interview anchor FALLS BACK to `created_at`, and it has to. Only two
 * writers ever set `app_fee_paid_at` — `razorpay-webhook` and
 * `verify-razorpay-payment` — and both are in-app Razorpay flows. The
 * `fee-paid-no-interview` stage, meanwhile, is derived from off-app evidence
 * too (`hasAppFee || s === "application fee paid"` in `_shared/reconcile.ts`),
 * so an applicant whose ₹400 arrived by payment link or was only ever seen as a
 * TeleCRM tag has the stage and a NULL timestamp. Without a fallback that
 * applicant is silent forever, reported only as an anonymous `no-anchor`.
 *
 * `created_at` and not `reconciled_at`: `reconciled_at` is rewritten on EVERY
 * reconcile pass, so anchoring on it would restart the ladder each time the
 * applicant opened the app. `created_at` is `NOT NULL`, never moves, and is
 * necessarily EARLIER than any payment — so a fallback-anchored rung comes due
 * later in the applicant's story than a true-anchored one would, never earlier.
 */
export function anchorFor(pool: LadderPool, input: LadderInput): Date | null {
  const created = parseInstant(input.createdAt);
  if (pool === "fee") return created;
  return parseInstant(input.appFeePaidAt) ?? created;
}

/** Messages already sent on the IST day `now` falls in. */
export function sentToday(history: readonly LadderSend[], now: Date): number {
  const today = istDayKey(now);
  let n = 0;
  for (const h of history) {
    const at = parseInstant(h.sentAt);
    if (at && istDayKey(at) === today) n++;
  }
  return n;
}

/**
 * The next rung of `pool` that is due and has NOT been sent. A rung is "sent"
 * if its template key appears in the history on ANY channel — that single check
 * is the no-channel-double-fire rule: the ledger is keyed on the step, so
 * email-then-WhatsApp for the same step is the same key twice, which the
 * database refuses before the code has to.
 */
export function nextRung(
  pool: LadderPool,
  history: readonly LadderSend[],
  anchor: Date,
  now: Date,
): { rung: number; templateKey: string } | null {
  const sentKeys = new Set(history.map((h) => h.templateKey));
  const elapsed = now.getTime() - anchor.getTime();
  const rungs = LADDERS[pool];
  for (let i = 0; i < rungs.length; i++) {
    const r = rungs[i];
    if (sentKeys.has(r.templateKey)) continue;
    if (elapsed >= r.dueAfterMs) return { rung: i + 1, templateKey: r.templateKey };
    // Rungs are ordered, so the first not-yet-due rung ends the search: a later
    // rung cannot be due before an earlier one.
    return null;
  }
  return null;
}

/** Channel priority: email first, because email is the only fully-built sender (Δ2). */
const CHANNEL_ORDER: readonly LadderChannel[] = ["email", "whatsapp"];

export type ChannelResolution =
  | { channel: LadderChannel }
  | { channel: null; reason: Extract<LadderSkipReason, "no-copy" | "suppressed" | "no-channel"> };

/**
 * Where this rung can go, or the precise reason it can go nowhere. Three
 * distinct failures that used to be one, because they call for three different
 * responses: `no-copy` means a rung exists that nobody has written words for
 * (E-2's job), `suppressed` means this person unsubscribed, `no-channel` means
 * the application carries no address at all.
 *
 * Email is renderable by default so a caller that supplies no registry gets the
 * plain "does this application have an address" answer. WhatsApp is the
 * inverse: it is unreachable unless a Meta-approved template name has been
 * registered for this exact rung, so it can never be selected by accident.
 */
export function resolveChannel(
  templateKey: string,
  contact: LadderContact,
  opts: {
    channelTemplates?: Partial<Record<LadderChannel, ReadonlySet<string>>>;
    suppressedChannels?: ReadonlySet<LadderChannel>;
  } = {},
): ChannelResolution {
  const { channelTemplates, suppressedChannels } = opts;
  let anyRenderable = false;
  let anyReachable = false;

  for (const channel of CHANNEL_ORDER) {
    const renderable = channel === "email"
      ? (channelTemplates?.email ? channelTemplates.email.has(templateKey) : true)
      : !!channelTemplates?.whatsapp?.has(templateKey);
    if (!renderable) continue;
    anyRenderable = true;

    const address = channel === "email" ? contact.email : contact.phone;
    if (typeof address !== "string" || address.trim().length === 0) continue;
    anyReachable = true;

    if (suppressedChannels?.has(channel)) continue;
    return { channel };
  }

  if (!anyRenderable) return { channel: null, reason: "no-copy" };
  if (anyReachable) return { channel: null, reason: "suppressed" };
  return { channel: null, reason: "no-channel" };
}

/** The channel this rung goes out on, or null if there is nowhere to send it. */
export function pickChannel(
  templateKey: string,
  contact: LadderContact,
  channelTemplates?: Partial<Record<LadderChannel, ReadonlySet<string>>>,
): LadderChannel | null {
  return resolveChannel(templateKey, contact, { channelTemplates }).channel;
}

/** The ledger columns every claim is identified by. Both UNIQUEs read from here. */
export interface LedgerKey {
  application_id: string;
  template_key: string;
  /** The IST calendar day the claim is spent on — the ≤1/day cap's unit, as a column. */
  ist_day: string;
}

/**
 * The ledger's identity for a decision — the exact columns the two UNIQUEs
 * cover. Derived here, in the pure layer, so two invocations that decide the
 * same rung for the same application CANNOT produce different keys and slip
 * past a constraint. The handler must build its INSERT from this and nothing
 * else.
 *
 * WHY `ist_day` IS A COLUMN AND NOT JUST A CAP IN `decide`. The rung key alone
 * secures only the case everybody tests: two invocations that see the SAME
 * state pick the same `template_key`, collide on `reentry_notif_unique`, and
 * exactly one sends. Two invocations that see DIFFERENT state do not.
 * `resolvePool` can move an application from the fee pool to the interview pool
 * between two reads, and `anchorFor("interview", …)` falls back to `created_at`
 * whenever `app_fee_paid_at` is NULL — which is the norm, since the reconciler
 * never writes that column (see the note on `anchorFor`). So a row that flips
 * to `fee-paid-no-interview` has `reentry_interview_nudge_1` immediately due
 * while another in-flight invocation is still holding the fee pool's decision.
 * Different pools, different key pools, no collision, and BOTH SEND — on the
 * same day, to the same person.
 *
 * `MAX_PER_DAY` cannot stop that on its own: it is evaluated against a
 * `history` each invocation read once, before either wrote, so it is a
 * read-then-write race by construction. Putting the day in the row moves the
 * cap into `reentry_notif_daily_unique`, where Postgres serialises the two
 * INSERTs and the loser gets 23505 and sends nothing — the same proof the rung
 * key already gives, extended to the cap that protects a real person from being
 * mailed twice in a day.
 *
 * The day comes from the SAME explicit clock the decision was made on, never
 * from a database `now()` or a wall-clock read: a claim must be filed on the day
 * `decide` judged it against, or the cap and the constraint could disagree about
 * which day a message belongs to at exactly the moment they must not — the
 * boundary minute.
 */
export function ledgerKey(applicationId: string, templateKey: string, at: Date): LedgerKey {
  return {
    application_id: applicationId,
    template_key: templateKey,
    ist_day: istDayKey(at),
  };
}

// ── The decision ─────────────────────────────────────────────────────────────

/**
 * The whole ladder, as one pure function. Order matters only for which reason
 * is reported; every rule is independently enforced, so no ordering can let a
 * message through that another rule forbids.
 */
export function decide(input: LadderInput): LadderDecision {
  // The status gate comes first, because a withdrawn or already-enrolled
  // applicant should report exactly that rather than whichever pool rule they
  // also happened to fail. It is a whitelist, so an unrecognised status is
  // silence too — see `CANDIDATE_STATUSES`.
  if (!CANDIDATE_STATUSES.includes(normalizeStatus(input.status))) {
    return { send: false, reason: "silenced-status" };
  }

  const resolved = resolvePool(input);
  if (resolved.pool === null) return { send: false, reason: resolved.reason };
  const { pool } = resolved;

  const anchor = anchorFor(pool, input);
  if (!anchor) return { send: false, reason: "no-anchor" };

  if (input.now.getTime() - anchor.getTime() > LADDER_WINDOW_MS) {
    return { send: false, reason: "expired" };
  }

  if (input.history.length >= MAX_PER_APPLICATION) return { send: false, reason: "cap-total" };
  if (sentToday(input.history, input.now) >= MAX_PER_DAY) return { send: false, reason: "cap-day" };
  if (isQuietHour(input.now)) return { send: false, reason: "quiet-hours" };

  const rung = nextRung(pool, input.history, anchor, input.now);
  if (!rung) return { send: false, reason: "no-rung-due" };

  const channel = resolveChannel(rung.templateKey, input.contact, {
    channelTemplates: input.channelTemplates,
    suppressedChannels: input.suppressedChannels,
  });
  if (channel.channel === null) return { send: false, reason: channel.reason };

  return { send: true, pool, rung: rung.rung, templateKey: rung.templateKey, channel: channel.channel };
}
