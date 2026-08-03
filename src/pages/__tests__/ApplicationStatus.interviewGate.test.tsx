import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * PHASE IV / P-1 — a student who needs to rebook always has a way to rebook.
 *
 * THE BUG THIS PINS. `_shared/reconcile.ts` derives the SAME `interview-scheduled`
 * stage from two TeleCRM literals: "interview scheduled" AND "need to reschedule
 * interview". The literal is collapsed before the client sees anything, so the one
 * status whose literal meaning is "this person must rebook" arrived at
 * `ApplicationStatus` as the stage that WITHDREW the booking calendar. After a
 * cancellation in that state the student was shown no calendar and no appointment
 * card, under a chip reading "Interview scheduled" — stranded.
 *
 * WHAT THE FIX HAS TO KEEP TRUE while removing that dead end:
 *   • a cancelled booking (`calendly_canceled_at` set) returns them to the calendar,
 *     even with a start instant still sitting in the shared `interview_date` column,
 *     and REGARDLESS of `reschedule_count` — the receiver leaves that count untouched
 *     on a cancel precisely because the replacement booking is what counts;
 *   • an EMPTY `interview_date` is never read as a cancellation — the column is
 *     shared with manual/admin scheduling, so its absence proves nothing;
 *   • a booked-but-not-yet-reconciled student never sees a live calendar AND a
 *     reschedule surface at once (`04-INTEGRATION-CONTRACTS.md` §6.4);
 *   • the way forward is never behind a tap that can reveal nothing: `InterviewSlots`
 *     renders null on three admin-owned states, so the calendar is offered outright
 *     and the note above it carries a human route of its own.
 *
 * `isLiveBooking` stays the SINGLE predicate behind both halves, so these are two
 * views of one switch rather than two rules that can drift.
 *
 * useFunnelStage + useAuth + platform + the supabase client are mocked so the page
 * renders without the flag/edge-fn/network, mirroring ApplicationStatus.ambiguous
 * .test.tsx. `InterviewSlots` is stubbed: this file is about WHICH surface the gate
 * opens, and the embed's own states (native hand-off, retry, booked-in-place) are
 * its component's business.
 */

const TEST_UID = "user-1";
const TEST_APP_ID = "app-1";
const TEST_OFFERING_ID = "off-1";

/** A parseable, uncancelled start — `isLiveBooking`'s true case. */
const START = "2026-08-05T13:00:00.000Z";
/** The cancellation SIGNAL, and the only one. */
const CANCELED = "2026-08-01T09:00:00.000Z";

let mockFunnelData: unknown = null;
let mockRow: Record<string, unknown>;
/** The interview cluster's flag, flipped per-test. Default ON here. */
let interviewFlagOn = true;

// The whole cluster ships dark behind `VITE_COHORT_INTERVIEW`. `flag()` resolves
// through localStorage, which this jsdom does not provide (see
// AuthContext.authgate.test.ts), so the registry is mocked rather than the
// storage — the flag NAMES stay real, so a renamed flag still breaks this file.
vi.mock("@/lib/flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags")>();
  return {
    ...actual,
    flag: (name: string) =>
      name === actual.COHORT_INTERVIEW ? interviewFlagOn : false,
  };
});

vi.mock("@/hooks/useFunnelStage", () => ({
  useFunnelStage: () => ({ data: mockFunnelData }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: TEST_UID, email: "a@example.com" },
    profile: { full_name: "Arun", email: "a@example.com" },
  }),
}));

// Web: the staged-payment Reader Rule guard is not what any assertion here turns
// on, and booking an interview moves no money.
vi.mock("@/lib/platform", () => ({
  isNative: () => false,
}));

// The booking surface, stubbed. Its presence IS "a live way to book is on
// screen". (It renders three one-tap slots since the 2026-07-28 REQ-INT-0
// reversal, with the hosted calendar behind every failure — which of those two
// shapes it takes is asserted in `components/interview/__tests__`, not here.)
vi.mock("@/components/interview/SlotButtons", () => ({
  InterviewSlots: () => <div data-testid="interview-booking" />,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: mockRow, error: null }),
        }),
      }),
    }),
  },
}));

import ApplicationStatus from "@/pages/ApplicationStatus";

/** The row the page reads, with only the booking facts a test cares about set. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_APP_ID,
    user_id: TEST_UID,
    offering_id: TEST_OFFERING_ID,
    status: "app_fee_paid",
    created_at: "2026-07-01T00:00:00.000Z",
    rejection_reason: null,
    interview_date: null,
    interview_modality: null,
    interview_interviewer_name: null,
    reschedule_count: 0,
    calendly_canceled_at: null,
    offerings: {
      title: "Live Filmmaking Cohort",
      price_inr: 30000,
      app_fee_inr: 400,
      confirmation_amount_inr: 8000,
    },
    ...overrides,
  };
}

/** The reconciled payload, shaped as `useFunnelStage` returns it. */
function stage(stageKey: string) {
  return {
    stage: stageKey,
    resolvedKey: "phone",
    markers: { completedNoFee: false, contactablePartial: false },
    ambiguous: false,
  };
}

async function renderPage() {
  render(
    <MemoryRouter initialEntries={[`/application/${TEST_APP_ID}`]}>
      <Routes>
        <Route path="/application/:applicationId" element={<ApplicationStatus />} />
      </Routes>
    </MemoryRouter>,
  );
  // The row lands asynchronously; everything under test renders after it.
  await screen.findByText("Live Filmmaking Cohort");
}

const calendar = () => screen.queryByTestId("interview-booking");
const rebookNote = () => screen.queryByLabelText("Booking your interview");
const appointmentCard = () => screen.queryByLabelText("Your interview");

beforeEach(() => {
  mockFunnelData = null;
  mockRow = row();
  interviewFlagOn = true;
});

afterEach(() => {
  cleanup();
});

describe("ApplicationStatus — nobody at the interview rung is left without a way forward (P-1)", () => {
  it("opens the calendar when the funnel says scheduled but no booking is live", async () => {
    // THE BUG, exactly: fee paid, the reconciler derived `interview-scheduled`
    // (which is also what "need to reschedule interview" derives), and the row
    // holds no live booking. Before the fix this rendered neither surface.
    mockFunnelData = stage("interview-scheduled");
    await renderPage();

    expect(calendar()).not.toBeNull();
    expect(appointmentCard()).toBeNull();
    // The note stands OVER the calendar rather than in front of it: no tap gates
    // the way forward, so no state of the embed can consume it.
    expect(rebookNote()).not.toBeNull();
  });

  it("opens it on a locally interview_scheduled row with no live booking", async () => {
    // The local mirror can reach the interview rung on its own (an admin moves
    // it), and that row never satisfied the fee-paid branch either.
    mockRow = row({ status: "interview_scheduled" });
    await renderPage();

    expect(calendar()).not.toBeNull();
    expect(rebookNote()).not.toBeNull();
  });

  it("returns a cancelled booking to the calendar, with the start still on the row", async () => {
    // `calendly_canceled_at` is the signal; `interview_date` legitimately keeps
    // its value beside the tombstone because the column is shared with
    // manual/admin scheduling.
    mockRow = row({
      status: "interview_scheduled",
      interview_date: START,
      calendly_canceled_at: CANCELED,
    });
    await renderPage();

    // No appointment card for a cancelled interview...
    expect(appointmentCard()).toBeNull();
    // ...and a way back to a time, with no tap in between.
    expect(calendar()).not.toBeNull();
  });

  it("returns a cancelled booking to the calendar under a reconciled interview stage too", async () => {
    mockFunnelData = stage("interview-scheduled");
    mockRow = row({ interview_date: START, calendly_canceled_at: CANCELED });
    await renderPage();

    expect(appointmentCard()).toBeNull();
    expect(calendar()).not.toBeNull();
  });

  it("never reads an EMPTY interview_date as a cancellation", async () => {
    // An unbooked fee-paid applicant has an empty start and no tombstone. That is
    // "not booked yet", not "cancelled": they get the calendar straight away, and
    // no reschedule surface of any kind.
    for (const empty of [null, ""]) {
      mockRow = row({ interview_date: empty, calendly_canceled_at: null });
      await renderPage();

      expect(calendar()).not.toBeNull();
      expect(appointmentCard()).toBeNull();
      // The plain fee-paid rung is not ambiguous: nothing there claims an
      // interview exists, so the note would be noise and does not render.
      expect(rebookNote()).toBeNull();
      cleanup();
    }
  });

  it("treats an empty start at the interview rung as unbooked, not cancelled", async () => {
    // Same absence, one rung further on: still no cancellation inferred, and the
    // way forward is the calendar rather than an appointment card.
    mockRow = row({ status: "interview_scheduled", interview_date: "" });
    await renderPage();

    expect(appointmentCard()).toBeNull();
    expect(calendar()).not.toBeNull();
  });

  it("shows the appointment card and NO calendar surface once a booking is live", async () => {
    // The booked-but-not-yet-reconciled student: the row carries the booking while
    // both stage signals still say "fee paid, no interview". Exactly one surface.
    mockRow = row({ interview_date: START, interview_modality: "google_meet" });
    await renderPage();

    expect(appointmentCard()).not.toBeNull();
    expect(calendar()).toBeNull();
    expect(rebookNote()).toBeNull();
  });

  it("keeps that exclusivity when the reconciler has caught up", async () => {
    mockFunnelData = stage("interview-scheduled");
    mockRow = row({
      status: "interview_scheduled",
      interview_date: START,
      interview_modality: "phone",
    });
    await renderPage();

    expect(appointmentCard()).not.toBeNull();
    expect(calendar()).toBeNull();
    expect(rebookNote()).toBeNull();
  });

  it("offers nothing to a student whose interview is already behind them", async () => {
    // `awaiting-decision` means the interview HAPPENED. Re-offering a calendar
    // there would be a different lie, so the rebooking path turns on the one
    // stage that means an interview is still ahead.
    mockFunnelData = stage("awaiting-decision");
    await renderPage();

    expect(calendar()).toBeNull();
    expect(rebookNote()).toBeNull();
    expect(appointmentCard()).toBeNull();
  });

  it("offers nothing when the funnel has moved past a stale interview_scheduled row", async () => {
    // The local mirror lags: it still reads `interview_scheduled` while the
    // reconciler has the student somewhere past the interview. The rest of the
    // ceiling has to keep standing — only the ONE ambiguous stage is carved out
    // of it.
    //
    // `accepted` is in this list and is the reason the ceiling is a total table
    // rather than a step comparison: `RECONCILED_STAGE_STEP` deliberately does
    // not map it (it opens no chip or CTA here), so a ceiling phrased as "the
    // mapped step is above the fee rung" reads `undefined` and waves it through.
    // An accepted applicant would be handed a live availability calendar for an
    // interview that already happened and was already decided — burning a real
    // interviewer slot and, once the webhook wrote the booking back, showing them
    // an appointment card for it.
    for (const behind of [
      "awaiting-decision",
      "accepted",
      "confirm-paid-no-balance",
      "enrolled",
    ]) {
      mockFunnelData = stage(behind);
      mockRow = row({ status: "interview_scheduled" });
      await renderPage();

      expect(rebookNote(), `stage ${behind} offered a rebooking note`).toBeNull();
      expect(calendar(), `stage ${behind} opened a calendar`).toBeNull();
      expect(appointmentCard()).toBeNull();
      cleanup();
    }
  });

  it("withdraws every booking surface from an accepted student, however stale the row", async () => {
    // The sibling of the hole above, one branch across: the ceiling also guards
    // the calendar that is offered at the fee-paid rung, and a stale local
    // `app_fee_paid` row under a reconciled `accepted` must not be handed one.
    mockFunnelData = stage("accepted");
    mockRow = row({ status: "app_fee_paid" });
    await renderPage();

    expect(calendar()).toBeNull();
    expect(rebookNote()).toBeNull();
    expect(appointmentCard()).toBeNull();
  });

  it("opens no booking surface off `unknown` — the stage that means 'placed nowhere'", async () => {
    // `deriveStage` returns `unknown` when it resolved the applicant to no source
    // at all, or to a bare NEW/WARM/Lost lead. It is also absent from
    // `RECONCILED_STAGE_STEP`, so the same subtraction that admitted `accepted`
    // admitted this. A rebooking path is offered off a claim that an interview
    // EXISTS, and this stage is the funnel affirmatively making no such claim.
    mockFunnelData = stage("unknown");
    mockRow = row({ status: "interview_scheduled" });
    await renderPage();

    expect(rebookNote()).toBeNull();
    expect(calendar()).toBeNull();
  });

  it("still lets an unresolvable fee-paid student book", async () => {
    // The other half of `unknown`, and the reason it is not simply a ceiling. The
    // ₹400 is paid and the local status says so — a reconciler that could not
    // resolve this applicant has not unpaid it. If `unknown` withdrew this
    // calendar, switching the reconciler flag ON would stop an unresolvable
    // fee-paid student from booking at all: the exact loss this phase closes.
    mockFunnelData = stage("unknown");
    await renderPage();

    expect(calendar()).not.toBeNull();
    expect(rebookNote()).toBeNull();
  });

  it("opens the calendar when the funnel is BEHIND a locally scheduled row", async () => {
    // The mirror runs ahead this time: `fee-paid-no-interview` says no interview
    // exists while the local status says one does. Neither signal claims a
    // booking, so a way to take one still has to exist.
    mockFunnelData = stage("fee-paid-no-interview");
    mockRow = row({ status: "interview_scheduled" });
    await renderPage();

    expect(calendar()).not.toBeNull();
    expect(rebookNote()).not.toBeNull();
  });

  /* ── THE REVIEW'S FIRST FINDING, PINNED ──
     `reschedule_count` counts MOVES of a live booking. Gating the calendar on it
     stranded the student who spent their one move and whose replacement slot was
     then cancelled — a cancellation LevelUp or the interviewer may have initiated.
     `calendly-webhook` nulls `interview_date` and writes the tombstone on cancel
     while leaving the count alone, saying in as many words that "the replacement
     booking is what counts", so there is no live booking to double up on and no
     budget to escape. Both rungs are pinned: the fee-paid one never carried a
     budget at all, and the pending one must not invent one. */
  it("returns a cancelled booking to the calendar however many moves are on the row", async () => {
    for (const count of [1, 2, 7]) {
      mockFunnelData = stage("interview-scheduled");
      mockRow = row({
        status: "interview_scheduled",
        interview_date: START,
        calendly_canceled_at: CANCELED,
        reschedule_count: count,
      });
      await renderPage();

      expect(calendar(), `count ${count} closed the calendar`).not.toBeNull();
      expect(appointmentCard()).toBeNull();
      cleanup();
    }
  });

  it("keeps the fee-paid rung's calendar open regardless of reschedule_count", async () => {
    // `application.status` is admin-driven and lags, so a row can still read
    // `app_fee_paid` after a move and a cancellation. Origin/main put no budget on
    // this rung; adding one is a new stranding class, not a guardrail.
    mockRow = row({
      status: "app_fee_paid",
      interview_date: START,
      calendly_canceled_at: CANCELED,
      reschedule_count: 2,
    });
    await renderPage();

    expect(calendar()).not.toBeNull();
    expect(appointmentCard()).toBeNull();
    expect(rebookNote()).toBeNull();
  });

  /* ── THE REVIEW'S SECOND FINDING, PINNED ──
     The way forward used to sit behind a one-way tap on a control that destroyed
     the section rendering it, while `InterviewSlots` returns null on three
     admin-owned states (`INTERVIEW_BOOKING_SILENT_REASONS`). The calendar is now
     reachable with no tap at all, so there is no state to get stuck in — and the
     note carries a human route that survives an embed rendering nothing. */
  it("puts no control between the student and the calendar", async () => {
    mockFunnelData = stage("interview-scheduled");
    mockRow = row({ status: "interview_scheduled" });
    await renderPage();

    expect(calendar()).not.toBeNull();
    // Nothing on the rebooking note is tappable: it cannot be spent, and it
    // cannot hide the calendar.
    const note = rebookNote();
    expect(note).not.toBeNull();
    expect(note?.querySelectorAll("button, a").length).toBe(0);
    // The route out does not depend on the calendar rendering at all.
    expect(note?.textContent).toMatch(/admissions team/i);
  });

  /* ── THE REVIEW'S THIRD FINDING, PINNED ──
     The §6.4 residue is a student who ALREADY holds a slot this row has never
     heard of. The old copy solicited exactly them ("Need a different interview
     time?" over "Pick a new time"); it now leads with their confirmation and
     names the consequence of booking again. */
  it("leads the note with the holder's confirmation, not with an invitation", async () => {
    mockFunnelData = stage("interview-scheduled");
    await renderPage();

    const note = rebookNote();
    const heading = note?.querySelector("h3")?.textContent ?? "";
    expect(heading).toMatch(/calendly confirmation/i);
    // The deterrent is stated, not buried: booking again makes a second interview.
    expect(note?.textContent).toMatch(/second interview/i);
    // And the population P-1 exists for is still addressed.
    expect(note?.textContent).toMatch(/cancelled|pick again/i);
  });

  it("keeps the interview copy clean (REQ-INT-2 / NFR-COPY-4)", async () => {
    mockFunnelData = stage("interview-scheduled");
    await renderPage();

    const note = rebookNote();
    expect(note?.textContent).not.toMatch(/free|mentor|counsell?or|zoom/i);
    // No charge copy beside the move, in either direction: saying a second move
    // costs nothing plants the idea that it could have cost something.
    expect(note?.textContent).not.toMatch(/₹|charge|cost|fee|extra|pay/i);
  });

  it("stays fully dark with the flag off", async () => {
    interviewFlagOn = false;
    mockFunnelData = stage("interview-scheduled");
    mockRow = row({ interview_date: START, calendly_canceled_at: CANCELED });
    await renderPage();

    expect(calendar()).toBeNull();
    expect(rebookNote()).toBeNull();
    expect(appointmentCard()).toBeNull();
  });
});
