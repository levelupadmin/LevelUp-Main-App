import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_APPLICATION_STATUSES,
  anchorFor,
  CANDIDATE_STATUSES,
  CRON_PERIOD_MS,
  decide,
  feeAlreadyPaid,
  isQuietHour,
  istDayKey,
  istMinutesOfDay,
  LADDER_TEMPLATE_KEYS,
  LADDER_WINDOW_MS,
  LADDERS,
  ledgerKey,
  MAX_PER_APPLICATION,
  MAX_PER_DAY,
  nextRung,
  pickChannel,
  POOL_STAGE,
  QUIET_END_MIN,
  QUIET_START_MIN,
  reconciledPoolFor,
  resolveChannel,
  resolvePool,
  sentToday,
  SILENCING_STATUSES,
  type LadderChannel,
  type LadderInput,
  type LadderSend,
} from "@shared/ladder";

/**
 * The re-entry ladder's decision layer (PHASE RE, E-1).
 *
 * Every one of these runs with ZERO mocking: `_shared/ladder.ts` imports
 * nothing and takes its clock as an argument, so a cap, a quiet-hours boundary
 * minute and the one-cron-cycle silence guarantee are all ordinary function
 * calls. That property is itself asserted at the bottom of this file — if
 * someone adds an import to that module, this suite fails before the rules do.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The UTC instant whose IST wall clock reads `day hh:mm`. IST is UTC+5:30. */
function ist(day: string, hh: number, mm: number): Date {
  const istMidnightUtc = new Date(`${day}T00:00:00.000Z`).getTime();
  return new Date(istMidnightUtc + (hh * 60 + mm - 330) * 60_000);
}

/** Noon IST on a fixed day — the "nothing else is in the way" clock. */
const NOW = ist("2026-07-28", 12, 0);

function send(templateKey: string, sentAt: Date, channel: LadderChannel = "email"): LadderSend {
  return { templateKey, channel, sentAt: sentAt.toISOString() };
}

/** A fee-pool application, reconciled, submitted 3h ago, contactable by email. */
function feeInput(overrides: Partial<LadderInput> = {}): LadderInput {
  return {
    now: NOW,
    reconciledStage: POOL_STAGE.fee,
    reconciledAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
    status: "submitted",
    completedNoFee: true,
    createdAt: new Date(NOW.getTime() - 3 * HOUR).toISOString(),
    appFeePaidAt: null,
    history: [],
    contact: { email: "applicant@example.com", phone: "+919000000000" },
    ...overrides,
  };
}

/** A fee-paid-no-interview application, fee captured 3h ago. */
function interviewInput(overrides: Partial<LadderInput> = {}): LadderInput {
  return feeInput({
    reconciledStage: POOL_STAGE.interview,
    completedNoFee: false,
    appFeePaidAt: new Date(NOW.getTime() - 3 * HOUR).toISOString(),
    ...overrides,
  });
}

/**
 * A row the reconciler has NEVER read. `tally-application-poll` inserts with
 * `user_id` NULL when no `public.users` row matches the email, and
 * `reconcile-funnel-stage` — the ONLY writer of `reconciled_stage` — updates
 * `.eq("user_id", user.id)` behind an authenticated `auth.getUser()`. So these
 * rows can never acquire a stage or a `reconciled_at`, ever, and every column
 * on them is frozen at whatever the Tally insert wrote.
 */
function unreconciledInput(overrides: Partial<LadderInput> = {}): LadderInput {
  return feeInput({
    reconciledStage: null,
    reconciledAt: null,
    completedNoFee: false, // NOT NULL DEFAULT false — a default, not a reading
    ...overrides,
  });
}

describe("IST clock helpers", () => {
  it("maps a UTC instant to minutes since IST midnight", () => {
    expect(istMinutesOfDay(ist("2026-07-28", 12, 0))).toBe(12 * 60);
    expect(istMinutesOfDay(ist("2026-07-28", 0, 0))).toBe(0);
    expect(istMinutesOfDay(ist("2026-07-28", 23, 59))).toBe(23 * 60 + 59);
  });

  it("puts 02:00 IST on the IST day, not the UTC day it falls in", () => {
    // 02:00 IST on the 28th is 20:30 UTC on the 27th. A UTC day key would put
    // this send on the previous day and hand the ≤1/day cap a free extra message.
    const at = ist("2026-07-28", 2, 0);
    expect(at.toISOString().slice(0, 10)).toBe("2026-07-27");
    expect(istDayKey(at)).toBe("2026-07-28");
  });
});

describe("quiet hours — 21:30 to 09:00 IST, both boundaries, both directions", () => {
  it("uses the copy deck's window, not an invented one", () => {
    expect(QUIET_START_MIN).toBe(21 * 60 + 30);
    expect(QUIET_END_MIN).toBe(9 * 60);
  });

  it("21:29 IST is allowed and 21:30 IST is the first suppressed minute", () => {
    expect(isQuietHour(ist("2026-07-28", 21, 29))).toBe(false);
    expect(isQuietHour(ist("2026-07-28", 21, 30))).toBe(true);
  });

  it("08:59 IST is still suppressed and 09:00 IST is the first allowed minute", () => {
    expect(isQuietHour(ist("2026-07-28", 8, 59))).toBe(true);
    expect(isQuietHour(ist("2026-07-28", 9, 0))).toBe(false);
  });

  it("covers the wrap across midnight", () => {
    expect(isQuietHour(ist("2026-07-28", 23, 59))).toBe(true);
    expect(isQuietHour(ist("2026-07-28", 0, 0))).toBe(true);
    expect(isQuietHour(ist("2026-07-28", 3, 0))).toBe(true);
  });

  it("suppresses a rung that is otherwise due, at the boundary minute itself", () => {
    const dueAt2130 = feeInput({
      now: ist("2026-07-28", 21, 30),
      createdAt: new Date(ist("2026-07-28", 21, 30).getTime() - 3 * HOUR).toISOString(),
    });
    expect(decide(dueAt2130)).toEqual({ send: false, reason: "quiet-hours" });

    // …and the same application one minute earlier does send.
    const dueAt2129 = feeInput({
      now: ist("2026-07-28", 21, 29),
      createdAt: new Date(ist("2026-07-28", 21, 29).getTime() - 3 * HOUR).toISOString(),
    });
    expect(decide(dueAt2129)).toMatchObject({ send: true, templateKey: "reentry_fee_nudge_1" });
  });
});

describe("pool selection — the reconciler wins where it has spoken", () => {
  it("maps only the two stages that have a population", () => {
    expect(reconciledPoolFor(POOL_STAGE.fee)).toBe("fee");
    expect(reconciledPoolFor(POOL_STAGE.interview)).toBe("interview");
    expect(reconciledPoolFor("partial")).toBeNull();
    expect(reconciledPoolFor("enrolled")).toBeNull();
    expect(reconciledPoolFor(null)).toBeNull();
  });

  it("treats a reconciler reading with no ladder stage as silence, not as absence", () => {
    // The reconciler's terminal-negative floor writes `reconciled_stage = NULL`
    // with `reconciled_at = now()`. That is a deliberate reading: it must NOT
    // fall through to the first-party derivation and start nudging.
    const nulledByReconciler = feeInput({ reconciledStage: null, status: "submitted" });
    expect(decide(nulledByReconciler)).toEqual({ send: false, reason: "reconciled-no-pool" });
  });

  it("goes silent when the stage marker disagrees with the stage", () => {
    expect(decide(feeInput({ completedNoFee: false }))).toEqual({ send: false, reason: "marker-disagrees" });
  });

  it("resolves a reconciled row to its pool", () => {
    expect(resolvePool(feeInput())).toEqual({ pool: "fee" });
    expect(resolvePool(interviewInput())).toEqual({ pool: "interview" });
  });
});

describe("an unreconciled row is SILENT — the columns it has cannot say otherwise", () => {
  /**
   * The rule this suite pins down, and the reason the engine gave it up:
   * `tally-application-poll` writes `status = 'submitted'` on INSERT and never
   * updates it; a `user_id`-NULL row can be touched by neither
   * `reconcile-funnel-stage` (`.eq("user_id", …)`) nor `razorpay-webhook`
   * (which keys on a `payment_orders` row only a signed-in user can create).
   * So on exactly these rows `status`/`app_fee_paid_at` are frozen whatever the
   * applicant did — and paying, interviewing and enrolling off-app is the norm,
   * which is why the reconciler reads Razorpay captures and TeleCRM statuses
   * instead. Reading 'submitted' as "has not paid" mails "complete your ₹400"
   * to enrolled people. Silence is the cheaper error.
   */
  it("stays silent on the fresh drop-off row a first-party fee pool would have mailed", () => {
    expect(decide(unreconciledInput())).toEqual({ send: false, reason: "unreconciled" });
  });

  it("stays silent ten days on, when that row may have paid and enrolled off-app", () => {
    const tenDaysOld = unreconciledInput({ createdAt: new Date(NOW.getTime() - 10 * DAY).toISOString() });
    expect(decide(tenDaysOld)).toEqual({ send: false, reason: "unreconciled" });
  });

  it("stays silent even when the row's own columns look like a clean interview pool", () => {
    const paid = unreconciledInput({
      status: "app_fee_paid",
      appFeePaidAt: new Date(NOW.getTime() - 3 * HOUR).toISOString(),
    });
    expect(decide(paid)).toEqual({ send: false, reason: "unreconciled" });
  });

  it("counts that silence under its own reason, so a run reaching nobody says why", () => {
    // `unreconciled` is deliberately distinct from `reconciled-no-pool`: the
    // first means "we have never had a reading on this applicant", the second
    // means "we have one and it is not a ladder stage". A run that is all
    // `unreconciled` is a reach problem, not a cadence one.
    expect(resolvePool(unreconciledInput())).toEqual({ pool: null, reason: "unreconciled" });
    expect(resolvePool(feeInput({ reconciledStage: "interview-scheduled" }))).toEqual({
      pool: null,
      reason: "reconciled-no-pool",
    });
  });
});

describe("a fee nudge never reaches somebody who already paid", () => {
  /**
   * `razorpay-webhook` writes `status='app_fee_paid'` + `app_fee_paid_at` the
   * instant a capture lands and does NOT touch `reconciled_stage` /
   * `completed_no_fee`, whose only writer is the user-authenticated reconciler.
   * So a stale `completed-no-fee` stage sitting on a row that was stamped paid
   * minutes ago is routine — pay, close the app, the webhook lands after — and
   * it is E-2's "the marker clears mid-ladder (₹400 lands) → the fee nudge
   * stops", except the marker does not clear on its own.
   */
  it("disqualifies the fee pool on a ten-minute-old app_fee_paid_at", () => {
    const justPaid = feeInput({ appFeePaidAt: new Date(NOW.getTime() - 10 * 60_000).toISOString() });
    expect(feeAlreadyPaid(justPaid)).toBe(true);
    expect(decide(justPaid)).toEqual({ send: false, reason: "fee-already-paid" });
  });

  it("disqualifies it on the status alone, for the same reason", () => {
    const paidStatus = feeInput({ status: "app_fee_paid" });
    expect(decide(paidStatus)).toEqual({ send: false, reason: "fee-already-paid" });
  });

  it("is checked BEFORE the marker, so the report names the actual reason", () => {
    // Both faults present: the money landed AND the stage/marker disagree. The
    // payment is the one an operator needs to see.
    const both = feeInput({ completedNoFee: false, status: "app_fee_paid" });
    expect(decide(both)).toEqual({ send: false, reason: "fee-already-paid" });
  });

  it("does not touch the interview pool, which is defined by that same payment", () => {
    expect(feeAlreadyPaid(interviewInput())).toBe(true);
    expect(decide(interviewInput())).toMatchObject({ send: true, pool: "interview" });
  });
});

describe("the eligible statuses are a complement, not a second list", () => {
  it("is exactly the CHECK vocabulary minus every silencing status", () => {
    expect(ALL_APPLICATION_STATUSES).toHaveLength(11);
    expect(CANDIDATE_STATUSES).toEqual(["submitted", "app_fee_paid"]);
    for (const status of ALL_APPLICATION_STATUSES) {
      expect(CANDIDATE_STATUSES.includes(status)).toBe(!SILENCING_STATUSES.has(status));
    }
  });

  it("treats it as a whitelist, so an unrecognised status is silence too", () => {
    // Fail-closed: a status added by some future migration is mute here until
    // somebody decides which side it belongs on.
    expect(decide(feeInput({ status: "some_new_status" }))).toEqual({ send: false, reason: "silenced-status" });
    expect(decide(feeInput({ status: null }))).toEqual({ send: false, reason: "silenced-status" });
    expect(decide(feeInput({ status: "  Submitted " }))).toMatchObject({ send: true, pool: "fee" });
  });
});

describe("anchors", () => {
  it("anchors the fee ladder on submission and the interview ladder on the fee payment", () => {
    const fee = feeInput();
    const interview = interviewInput();
    expect(anchorFor("fee", fee)?.toISOString()).toBe(fee.createdAt);
    expect(anchorFor("interview", interview)?.toISOString()).toBe(interview.appFeePaidAt);
  });

  it("falls back to created_at when the ₹400 landed off-app and left no timestamp", () => {
    // `app_fee_paid_at` has exactly two writers, both in-app Razorpay flows,
    // while `fee-paid-no-interview` is ALSO derived from a Razorpay
    // reconciliation match or a TeleCRM tag. A payment-link payer therefore has
    // the stage and a NULL timestamp — and used to be silent forever.
    const offApp = interviewInput({ appFeePaidAt: null });
    expect(anchorFor("interview", offApp)?.toISOString()).toBe(offApp.createdAt);
    expect(decide(offApp)).toMatchObject({
      send: true,
      pool: "interview",
      templateKey: "reentry_interview_nudge_1",
    });
  });

  it("has no anchor only when created_at is missing too", () => {
    expect(anchorFor("interview", interviewInput({ appFeePaidAt: null, createdAt: null }))).toBeNull();
    expect(decide(feeInput({ createdAt: null }))).toEqual({ send: false, reason: "no-anchor" });
  });
});

describe("silence within one cron cycle", () => {
  it("emits nothing on the very next tick once the reconciler advances the stage", () => {
    const before = feeInput();
    expect(decide(before)).toMatchObject({ send: true });

    // The reconciler moved them on between ticks. One cron period later — the
    // soonest this function can possibly run again — the ladder is silent.
    const oneCycleLater = new Date(NOW.getTime() + CRON_PERIOD_MS);
    const after = feeInput({
      now: oneCycleLater,
      reconciledStage: "interview-scheduled",
      reconciledAt: oneCycleLater.toISOString(),
    });
    expect(decide(after)).toEqual({ send: false, reason: "reconciled-no-pool" });
  });

  it("silences on the applicant's own status too, one cycle after the app moves it", () => {
    // The status gate runs before the pool, so a row whose in-app status
    // advanced since the last reconcile pass is silent on the very next tick
    // rather than waiting for the reconciler to catch up.
    const oneCycleLater = new Date(NOW.getTime() + CRON_PERIOD_MS);
    const booked = feeInput({ now: oneCycleLater, status: "interview_scheduled" });
    expect(decide(booked)).toEqual({ send: false, reason: "silenced-status" });
  });

  it("goes silent on withdrawal even while the stage still reads a ladder stage", () => {
    expect(decide(feeInput({ status: "withdrawn" }))).toEqual({ send: false, reason: "silenced-status" });
    expect(decide(interviewInput({ status: "enrolled" }))).toEqual({ send: false, reason: "silenced-status" });
    expect(decide(interviewInput({ status: "interview_scheduled" }))).toEqual({
      send: false,
      reason: "silenced-status",
    });
  });
});

describe("rung scheduling", () => {
  it("holds rung 1 until its offset and releases it at the boundary", () => {
    const anchor = new Date(NOW.getTime() - 2 * HOUR);
    const justShort = new Date(anchor.getTime() + 2 * HOUR - 60_000);
    expect(nextRung("fee", [], anchor, justShort)).toBeNull();
    expect(nextRung("fee", [], anchor, new Date(anchor.getTime() + 2 * HOUR))).toEqual({
      rung: 1,
      templateKey: "reentry_fee_nudge_1",
    });
  });

  it("walks to the next unsent rung and never revisits a sent one", () => {
    const anchor = new Date(NOW.getTime() - 30 * HOUR);
    const history = [send("reentry_fee_nudge_1", new Date(NOW.getTime() - 28 * HOUR))];
    expect(nextRung("fee", history, anchor, NOW)).toEqual({ rung: 2, templateKey: "reentry_fee_nudge_2" });
  });

  it("stops at the end of the ladder", () => {
    const anchor = new Date(NOW.getTime() - 10 * DAY);
    const history = LADDERS.fee.map((r, i) => send(r.templateKey, new Date(NOW.getTime() - (9 - i) * DAY)));
    expect(nextRung("fee", history, anchor, NOW)).toBeNull();
  });

  it("expires the whole ladder after its window, whatever the history says", () => {
    const stale = feeInput({ createdAt: new Date(NOW.getTime() - LADDER_WINDOW_MS - HOUR).toISOString() });
    expect(decide(stale)).toEqual({ send: false, reason: "expired" });
  });

  it("keeps a recent off-app payment alive on an old application", () => {
    // The handler's candidate read ORs the window across `created_at` and
    // `app_fee_paid_at` precisely so this row is still fetched; the pure layer
    // must agree that it is live.
    const oldApplicationFreshPayment = interviewInput({
      createdAt: new Date(NOW.getTime() - LADDER_WINDOW_MS - 5 * DAY).toISOString(),
      appFeePaidAt: new Date(NOW.getTime() - 3 * HOUR).toISOString(),
    });
    expect(decide(oldApplicationFreshPayment)).toMatchObject({ send: true, pool: "interview" });
  });
});

describe("no channel double-fire for the same step", () => {
  it("treats a step as spent regardless of which channel carried it", () => {
    // Rung 1 went out over WhatsApp. Email must not re-fire the same step.
    const anchor = new Date(NOW.getTime() - 30 * HOUR);
    const history = [send("reentry_fee_nudge_1", new Date(NOW.getTime() - 28 * HOUR), "whatsapp")];
    const decision = decide(feeInput({ createdAt: anchor.toISOString(), history }));
    expect(decision).toMatchObject({ send: true, templateKey: "reentry_fee_nudge_2" });
  });

  it("keys the ledger on exactly the columns the UNIQUE covers", () => {
    expect(ledgerKey("app-1", "reentry_fee_nudge_1")).toEqual({
      application_id: "app-1",
      template_key: "reentry_fee_nudge_1",
    });
  });

  it("makes two overlapping invocations collide on that key rather than double-send", () => {
    // The proof is against the CONSTRAINT, not against timing: `decide` is a
    // pure function of the row and the ledger, so two invocations seeing the
    // same state cannot pick different rungs — they produce byte-identical
    // (application_id, template_key), which `reentry_notif_unique` admits once.
    const a = decide(feeInput());
    const b = decide(feeInput());
    expect(a).toEqual(b);
    if (!a.send || !b.send) throw new Error("fixture should be sendable");
    expect(ledgerKey("app-1", a.templateKey)).toEqual(ledgerKey("app-1", b.templateKey));
  });

  it("gives every rung its own key, so the ledger's UNIQUE is per-step not per-pool", () => {
    // A single key per pool would mean one send per pool forever: the ≤4 cap
    // would be unreachable and the "ladder" would have exactly one rung.
    expect(LADDER_TEMPLATE_KEYS).toHaveLength(6);
    expect(new Set(LADDER_TEMPLATE_KEYS).size).toBe(6);
    expect(LADDERS.fee.map((r) => r.templateKey)).toEqual([
      "reentry_fee_nudge_1",
      "reentry_fee_nudge_2",
      "reentry_fee_nudge_3",
    ]);
    expect(LADDERS.interview.map((r) => r.templateKey)).toEqual([
      "reentry_interview_nudge_1",
      "reentry_interview_nudge_2",
      "reentry_interview_nudge_3",
    ]);
  });
});

describe("the ≤1 per day cap", () => {
  it("counts sends by IST day, not UTC day", () => {
    // 02:00 IST today = 20:30 UTC yesterday. It still spends today's budget.
    const earlyToday = send("reentry_fee_nudge_1", ist("2026-07-28", 2, 0));
    expect(sentToday([earlyToday], NOW)).toBe(1);
    expect(sentToday([send("reentry_fee_nudge_1", ist("2026-07-27", 23, 0))], NOW)).toBe(0);
  });

  it("blocks a second message on the same IST day", () => {
    expect(MAX_PER_DAY).toBe(1);
    const history = [send("reentry_fee_nudge_1", ist("2026-07-28", 9, 30))];
    const input = feeInput({ createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString(), history });
    expect(decide(input)).toEqual({ send: false, reason: "cap-day" });
  });

  it("releases the next day", () => {
    const history = [send("reentry_fee_nudge_1", ist("2026-07-27", 21, 0))];
    const input = feeInput({ createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString(), history });
    expect(decide(input)).toMatchObject({ send: true, templateKey: "reentry_fee_nudge_2" });
  });
});

describe("the ≤4 per application cap", () => {
  it("is REACHABLE — an application that changes pool mid-ladder can hit it", () => {
    expect(MAX_PER_APPLICATION).toBe(4);
    // Three fee rungs went out on three earlier days; the ₹400 then landed and
    // the reconciler moved them to the interview pool. The 4th message is the
    // last one this application may ever receive.
    const threeFeeRungs = LADDERS.fee.map((r, i) => send(r.templateKey, ist(`2026-07-2${5 + i}`, 12, 0)));
    const fourth = decide(interviewInput({ history: threeFeeRungs }));
    expect(fourth).toMatchObject({ send: true, templateKey: "reentry_interview_nudge_1" });

    const withFourSent = [...threeFeeRungs, send("reentry_interview_nudge_1", ist("2026-07-27", 12, 0))];
    expect(decide(interviewInput({ history: withFourSent }))).toEqual({ send: false, reason: "cap-total" });
  });

  it("counts across pools and channels", () => {
    const history = [
      send("reentry_fee_nudge_1", ist("2026-07-24", 12, 0)),
      send("reentry_fee_nudge_2", ist("2026-07-25", 12, 0), "whatsapp"),
      send("reentry_fee_nudge_3", ist("2026-07-26", 12, 0)),
      send("reentry_interview_nudge_1", ist("2026-07-27", 12, 0), "whatsapp"),
    ];
    expect(decide(interviewInput({ history }))).toEqual({ send: false, reason: "cap-total" });
  });
});

describe("channel selection", () => {
  it("prefers email, the only fully-built sender in v1", () => {
    expect(pickChannel("reentry_fee_nudge_1", { email: "a@b.com", phone: "+919000000000" })).toBe("email");
  });

  it("keeps WhatsApp inert until a Meta-approved template name is registered", () => {
    const phoneOnly = { email: null, phone: "+919000000000" };
    expect(pickChannel("reentry_fee_nudge_1", phoneOnly)).toBeNull();
    expect(
      pickChannel("reentry_fee_nudge_1", phoneOnly, { whatsapp: new Set(["reentry_fee_nudge_1"]) }),
    ).toBe("whatsapp");
  });

  it("reports an application with no contactable channel instead of sending", () => {
    const decision = decide(feeInput({ contact: { email: "", phone: null } }));
    expect(decision).toEqual({ send: false, reason: "no-channel" });
  });

  it("never retries an uncontactable application forever — the ladder expires", () => {
    const uncontactable = feeInput({
      contact: { email: "", phone: null },
      createdAt: new Date(NOW.getTime() - LADDER_WINDOW_MS - HOUR).toISOString(),
    });
    expect(decide(uncontactable)).toEqual({ send: false, reason: "expired" });
  });
});

describe("the handler's two old `if`s, now pure and tested", () => {
  it("reports `no-copy` when no channel can render the rung", () => {
    // The handler derives `channelTemplates.email` from its copy registry, so
    // an empty registry — the state E-1 ships in — is a counted decision here
    // rather than an untestable skip twelve lines into the loop.
    const empty = { email: new Set<string>() };
    expect(resolveChannel("reentry_fee_nudge_1", { email: "a@b.com" }, { channelTemplates: empty })).toEqual({
      channel: null,
      reason: "no-copy",
    });
    expect(decide(feeInput({ channelTemplates: empty }))).toEqual({ send: false, reason: "no-copy" });
  });

  it("sends once the registry carries that rung", () => {
    const registered = { email: new Set(["reentry_fee_nudge_1"]) };
    expect(decide(feeInput({ channelTemplates: registered }))).toMatchObject({
      send: true,
      templateKey: "reentry_fee_nudge_1",
      channel: "email",
    });
  });

  it("reports `suppressed` — distinct from `no-channel` — for an unsubscribed address", () => {
    const suppressedChannels = new Set<LadderChannel>(["email"]);
    expect(decide(feeInput({ suppressedChannels }))).toEqual({ send: false, reason: "suppressed" });
    // …and it is genuinely a different outcome from having no address at all,
    // because the two call for different operator responses.
    expect(decide(feeInput({ contact: { email: "", phone: null }, suppressedChannels }))).toEqual({
      send: false,
      reason: "no-channel",
    });
  });

  it("falls through to a non-suppressed channel rather than going silent", () => {
    expect(
      resolveChannel(
        "reentry_fee_nudge_1",
        { email: "a@b.com", phone: "+919000000000" },
        {
          channelTemplates: { whatsapp: new Set(["reentry_fee_nudge_1"]) },
          suppressedChannels: new Set<LadderChannel>(["email"]),
        },
      ),
    ).toEqual({ channel: "whatsapp" });
  });
});

describe("the happy paths", () => {
  it("fires the fee nudge for a completed_no_fee fixture", () => {
    expect(decide(feeInput())).toEqual({
      send: true,
      pool: "fee",
      rung: 1,
      templateKey: "reentry_fee_nudge_1",
      channel: "email",
    });
  });

  it("fires the interview nudge for a fee-paid-no-interview fixture", () => {
    expect(decide(interviewInput())).toEqual({
      send: true,
      pool: "interview",
      rung: 1,
      templateKey: "reentry_interview_nudge_1",
      channel: "email",
    });
  });

  it("reports no-rung-due between rungs rather than sending something early", () => {
    const history = [send("reentry_fee_nudge_1", ist("2026-07-27", 12, 0))];
    // Rung 2 is due at T+26h; the anchor here is only 4h old.
    const input = feeInput({ createdAt: new Date(NOW.getTime() - 4 * HOUR).toISOString(), history });
    expect(decide(input)).toEqual({ send: false, reason: "no-rung-due" });
  });
});

describe("the module is pure by construction", () => {
  it("has zero imports, exactly like _shared/phone.ts", () => {
    // This is the property the whole suite rests on: every test above runs with
    // no mocking because there is nothing to mock. Asserted on the source so
    // adding a dependency fails here loudly rather than silently coupling the
    // decision layer to Deno, a database client or a timezone library.
    // Resolved off the vitest cwd (the repo root) rather than `import.meta.url`,
    // which under the jsdom environment is an http: URL that `readFileSync` refuses.
    const src = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/ladder.ts"), "utf8");
    const offenders = src
      .split("\n")
      .filter((line) => /^\s*(import\s|export\s+\*\s+from|export\s+\{[^}]*\}\s+from)/.test(line));
    expect(offenders).toEqual([]);
    expect(src).not.toMatch(/\brequire\s*\(/);
    expect(src).not.toMatch(/\bDeno\./);
    expect(src).not.toMatch(/\bDate\.now\s*\(/);
  });
});
