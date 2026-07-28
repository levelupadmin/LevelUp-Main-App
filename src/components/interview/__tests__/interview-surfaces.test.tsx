import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { InterviewerCard, firstNameOf } from "@/components/interview/InterviewerCard";
import { BatchLedger, isRenderableBatch } from "@/components/interview/BatchLedger";
import {
  RescheduleControl,
  formatInterviewStart,
  isLiveBooking,
  modalityOf,
} from "@/components/interview/RescheduleControl";

/**
 * PHASE IV / V-3 — the three interview surfaces, pinned on the rules that make
 * them honest rather than on their layout.
 *
 * Every assertion here is one of the task's acceptance lines: a fabricated
 * selectivity percentage, an invented batch count, a second reschedule, charge
 * copy near the first one, or a modality the student did not choose are the
 * five ways these components could ship a lie, and each has a test.
 */

afterEach(() => {
  cleanup();
});

/** REQ-INT-2 / NFR-COPY-4 — the words no interview surface may ever render. */
const FORBIDDEN = [/mentor/i, /counsell?or/i, /free/i, /zoom/i];

function expectCleanCopy(text: string | null) {
  for (const pattern of FORBIDDEN) {
    expect(text ?? "", `copy matched ${pattern}`).not.toMatch(pattern);
  }
}

describe("firstNameOf — REQ-INT-2's first-name-only rule, at the boundary", () => {
  it("keeps the first token and drops the rest of a full name", () => {
    expect(firstNameOf("Arundhati Menon")).toBe("Arundhati");
    expect(firstNameOf("  Kavya   Rao  ")).toBe("Kavya");
  });

  it("returns null for anything that is not a usable name", () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
  });

  it("strips an honorific instead of rendering it as the first name", () => {
    // The unguarded rule — first whitespace token — renders "Dr. Kavya Rao" as
    // "Dr.", a fabricated given name attributed to a real colleague.
    expect(firstNameOf("Dr. Kavya Rao")).toBe("Kavya");
    expect(firstNameOf("Prof Arundhati Menon")).toBe("Arundhati");
    expect(firstNameOf("Dr.")).toBeNull();
  });

  it("refuses an ORGANISATION rather than inventing a person from it", () => {
    // INTEG-CAL-1 puts every interviewer on ONE shared org-level Calendly account,
    // whose free-text `user_name` is likeliest of all to be the organisation. The
    // second gate holds for rows written before the parser's guard existed.
    expect(firstNameOf("LevelUp Learning")).toBeNull();
    expect(firstNameOf("LevelUp Learning Pvt Ltd")).toBeNull();
    expect(firstNameOf("Admissions Team")).toBeNull();
    expect(firstNameOf("Cohort Bookings")).toBeNull();
  });

  it("refuses the brand SPACED and the function a shared account is named for", () => {
    // "Level Up" has no token a name guard may reject on its own, so a per-token
    // list rendered the invented interviewer "Level"; and a shared org-level account
    // is as likely to be called after the job it does ("Interview", "Front Desk") as
    // after the company. Each of these otherwise reaches the applicant as a person.
    for (const stored of [
      "Level Up",
      "Level-Up",
      "The Forge",
      "Interview",
      "Interviews",
      "Front Desk",
      "Reception",
      "Hiring",
      "Talent",
      "Sales",
      "Calendly",
    ]) {
      expect(firstNameOf(stored), `named a person from ${stored}`).toBeNull();
    }
  });

  it("still keeps ordinary real names — a wrong rejection is a permanent blank", () => {
    expect(firstNameOf("Kavya Rao")).toBe("Kavya");
    expect(firstNameOf("Aditi Upadhyay")).toBe("Aditi");
  });

  it("keeps a single-word personal name — a mononym is a real name", () => {
    expect(firstNameOf("Arundhati")).toBe("Arundhati");
  });

  it("renders the NAME beside an initial, a prefix or a particle rather than the scaffolding", () => {
    // Each of these is a real person whose stored name the first version of this
    // guard rejected outright (a permanent blank) or, worse, rendered the wrong
    // part of ("de", "Van"). Nothing here is invented — every rendered value is a
    // token of the person's own name.
    expect(firstNameOf("S. Kumar")).toBe("Kumar");
    expect(firstNameOf("Prof. R Iyer")).toBe("Iyer");
    expect(firstNameOf("Md. Imran")).toBe("Imran");
    expect(firstNameOf("Ravi.Kumar")).toBe("Ravi");
    expect(firstNameOf("de Souza Silva")).toBe("Souza");
    expect(firstNameOf("Van Der Berg")).toBe("Berg");
    // …and a value with no name in it at all still renders nothing.
    expect(firstNameOf("A. B.")).toBeNull();
    expect(firstNameOf("Van Der")).toBeNull();
  });
});

describe("InterviewerCard — first name, the admissions title, no bio, no invented figure", () => {
  it("renders the first name and the title, and never the surname", () => {
    render(<InterviewerCard name="Arundhati Menon" />);
    const card = screen.getByLabelText("Your interviewer");
    expect(card.textContent).toContain("Arundhati");
    expect(card.textContent).toContain("Admissions Interviewer");
    // "No bio" starts with not leaking the rest of the name.
    expect(card.textContent).not.toContain("Menon");
    expectCleanCopy(card.textContent);
  });

  it("renders NO percentage and no number at all (no source, so no selectivity line)", () => {
    // The failure this guards is the worst one available on this surface: a
    // typed-in rate attributed by name to a real colleague. The NAME now has a
    // real source (`interview_interviewer_name`, from the Calendly host), but
    // the RATE still has none — no reconciler aggregate and no interview-outcome
    // column exist, so there is no numerator to divide by anything. The line must
    // therefore stay absent rather than be approximated.
    render(<InterviewerCard name="Arundhati Menon" />);
    const card = screen.getByLabelText("Your interviewer");
    expect(card.textContent).not.toMatch(/%/);
    expect(card.textContent).not.toMatch(/\d/);
    expect(card.textContent).not.toMatch(/accepts/i);
  });

  it("renders nothing at all when no real name was supplied", () => {
    const { container } = render(<InterviewerCard name={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a blank name rather than an empty card", () => {
    const { container } = render(<InterviewerCard name="   " />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders NOTHING when the stored name is the organisation, not a person", () => {
    // The worst thing this card can do is name a colleague who does not exist.
    // "LevelUp Learning" → "LevelUp" is exactly that, and the ONE shared org-level
    // Calendly account (INTEG-CAL-1) is the configuration most likely to produce it.
    for (const stored of [
      "LevelUp Learning",
      "LevelUp Learning Pvt Ltd",
      "Level Up",
      "The Forge",
      "Admissions Team",
      "The Forge Admissions",
      "Interview",
      "Front Desk",
      "Kavya & Arjun",
    ]) {
      const { container } = render(<InterviewerCard name={stored} />);
      expect(container, `rendered a card for ${stored}`).toBeEmptyDOMElement();
      cleanup();
    }
  });

  it("renders the given name for an honorific-prefixed real name, never the honorific", () => {
    render(<InterviewerCard name="Dr. Kavya Rao" />);
    const card = screen.getByLabelText("Your interviewer");
    expect(card.textContent).toContain("Kavya");
    expect(card.textContent).not.toContain("Dr.");
    expect(card.textContent).not.toContain("Rao");
    expectCleanCopy(card.textContent);
  });

  it("renders a mononym as itself", () => {
    render(<InterviewerCard name="Arundhati" />);
    expect(screen.getByLabelText("Your interviewer").textContent).toContain("Arundhati");
  });
});

describe("isRenderableBatch — real numbers only", () => {
  const good = { label: "Batch 12", interviewed: 41, admitted: 11 };

  it("accepts a coherent batch, with or without the optional applications count", () => {
    expect(isRenderableBatch(good)).toBe(true);
    expect(isRenderableBatch({ ...good, applications: 180 })).toBe(true);
  });

  it("rejects an absent source rather than substituting anything", () => {
    expect(isRenderableBatch(null)).toBe(false);
    expect(isRenderableBatch(undefined)).toBe(false);
  });

  it("rejects counts that are not whole, non-negative numbers", () => {
    expect(isRenderableBatch({ ...good, admitted: -1 })).toBe(false);
    expect(isRenderableBatch({ ...good, admitted: 1.5 })).toBe(false);
    expect(isRenderableBatch({ ...good, interviewed: Number.NaN })).toBe(false);
    expect(
      isRenderableBatch({ ...good, admitted: "11" as unknown as number }),
    ).toBe(false);
  });

  it("rejects a shape that cannot be true, however reachable the source was", () => {
    expect(isRenderableBatch({ ...good, admitted: 60 })).toBe(false); // admitted > interviewed
    expect(isRenderableBatch({ ...good, applications: 10 })).toBe(false); // interviewed > applications
    expect(isRenderableBatch({ ...good, interviewed: 0, admitted: 0 })).toBe(false);
    expect(isRenderableBatch({ ...good, label: "  " })).toBe(false);
  });
});

describe("BatchLedger — REQ-INT-3: real numbers or the row hides", () => {
  it("renders the real counts when a source supplies them", () => {
    render(<BatchLedger batch={{ label: "Batch 12", interviewed: 41, admitted: 11 }} />);
    const row = screen.getByLabelText("Recent review batch");
    expect(row.textContent).toContain("Batch 12");
    expect(row.textContent).toContain("41 interviewed");
    expect(row.textContent).toContain("11 admitted");
    expectCleanCopy(row.textContent);
  });

  it("hides entirely when the source is unavailable — never zeroes", () => {
    // The zeroed row is the specific failure REQ-INT-3 names: "0 interviewed,
    // 0 admitted" reads as a real and catastrophic batch, not as a gap.
    const { container } = render(<BatchLedger batch={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("hides when no batch prop is passed at all (today's only reachable state)", () => {
    const { container } = render(<BatchLedger />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hides an impossible ledger instead of printing it", () => {
    const { container } = render(
      <BatchLedger batch={{ label: "Batch 12", interviewed: 41, admitted: 99 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("modalityOf / formatInterviewStart — the row's facts, narrowed", () => {
  it("accepts only the two contract modalities", () => {
    expect(modalityOf("google_meet")).toBe("google_meet");
    expect(modalityOf("phone")).toBe("phone");
    expect(modalityOf("zoom")).toBeNull();
    expect(modalityOf("")).toBeNull();
    expect(modalityOf(null)).toBeNull();
  });

  it("returns null for an unusable start instant rather than an Invalid Date", () => {
    expect(formatInterviewStart(null)).toBeNull();
    expect(formatInterviewStart("")).toBeNull();
    expect(formatInterviewStart("not-a-date")).toBeNull();
    expect(formatInterviewStart("2026-08-05T13:00:00.000Z")).not.toBeNull();
  });
});

describe("isLiveBooking — the ONE definition of 'booked', shared with the page", () => {
  /**
   * `ApplicationStatus` withdraws the inline Calendly calendar on `!isLiveBooking`
   * and renders the reschedule card on `isLiveBooking`, so these are the two halves
   * of one switch. A looser page-side idea of "booked" would put a live availability
   * calendar and a reschedule card on screen together — the double-booking hazard
   * `04-INTEGRATION-CONTRACTS.md` §6.4 names, where the resulting SECOND booking
   * carries no `old_invitee`, the receiver does not count it, and the one-reschedule
   * budget stops binding. These assertions are what keep the two in lockstep.
   */
  it("is true only for an uncancelled, parseable start", () => {
    expect(isLiveBooking("2026-08-05T13:00:00.000Z", null)).toBe(true);
    expect(isLiveBooking("2026-08-05T13:00:00.000Z", undefined)).toBe(true);
  });

  it("is false once the booking is cancelled, whatever the start column says", () => {
    // The signal is `calendly_canceled_at`, never an empty `interview_date`: the
    // start column is shared with manual/admin scheduling, so a date sitting beside
    // a tombstone is expected rather than contradictory.
    expect(isLiveBooking("2026-08-05T13:00:00.000Z", "2026-08-01T09:00:00.000Z")).toBe(false);
  });

  it("is false when there is no usable start instant", () => {
    expect(isLiveBooking(null, null)).toBe(false);
    expect(isLiveBooking(undefined, null)).toBe(false);
    expect(isLiveBooking("", null)).toBe(false);
    expect(isLiveBooking("not-a-date", null)).toBe(false);
  });

  it("agrees exactly with whether the card renders", () => {
    const cases: Array<[string | null, string | null]> = [
      ["2026-08-05T13:00:00.000Z", null],
      ["2026-08-05T13:00:00.000Z", "2026-08-01T09:00:00.000Z"],
      [null, null],
      ["not-a-date", null],
    ];
    for (const [interviewDate, canceledAt] of cases) {
      const { container } = render(
        <RescheduleControl
          interviewDate={interviewDate}
          interviewModality="google_meet"
          rescheduleCount={0}
          canceledAt={canceledAt}
        />,
      );
      expect(container.innerHTML !== "").toBe(isLiveBooking(interviewDate, canceledAt));
      cleanup();
    }
  });
});

describe("RescheduleControl — the live booking, the student's modality, one move", () => {
  const live = {
    interviewDate: "2026-08-05T13:00:00.000Z",
    interviewModality: "google_meet",
    rescheduleCount: 0,
    canceledAt: null,
  };

  it("honours a Google Meet booking without naming any other platform", () => {
    render(<RescheduleControl {...live} />);
    const card = screen.getByLabelText("Your interview");
    expect(card.textContent).toContain("Google Meet");
    expectCleanCopy(card.textContent);
  });

  it("honours a phone booking with no joining link", () => {
    render(<RescheduleControl {...live} interviewModality="phone" />);
    const card = screen.getByLabelText("Your interview");
    expect(card.textContent).toContain("Phone call");
    expect(card.textContent).not.toContain("Google Meet");
    expectCleanCopy(card.textContent);
  });

  it("names NO platform when the stored modality is not one of the two", () => {
    // `modalityFromEvent` returns null rather than guessing at an unrecognised
    // Calendly location, and the CHECK went on NOT VALID, so a legacy row can
    // hold anything. Neither case may become an assumption on screen.
    for (const stored of [null, "webex", "zoom"]) {
      render(<RescheduleControl {...live} interviewModality={stored} />);
      const card = screen.getByLabelText("Your interview");
      expect(card.textContent).not.toContain("Google Meet");
      expect(card.textContent).not.toContain("Phone call");
      expectCleanCopy(card.textContent);
      cleanup();
    }
  });

  it("offers exactly one reschedule, with no charge copy in either direction", () => {
    render(<RescheduleControl {...live} />);
    const card = screen.getByLabelText("Your interview");
    expect(card.textContent).toContain("One reschedule is available");
    expectCleanCopy(card.textContent);
    // No money anywhere near the reschedule line, including the reassuring kind.
    expect(card.textContent).not.toMatch(/₹|charge|cost|fee|extra|pay/i);
  });

  it("withdraws the offer once the one move has been used", () => {
    render(<RescheduleControl {...live} rescheduleCount={1} />);
    const card = screen.getByLabelText("Your interview");
    expect(card.textContent).not.toContain("One reschedule is available");
    expect(card.textContent).toContain("already moved this once");
    expectCleanCopy(card.textContent);
    expect(card.textContent).not.toMatch(/₹|charge|cost|fee|extra|pay/i);
  });

  it("stays withdrawn if the count somehow ran past the budget", () => {
    render(<RescheduleControl {...live} rescheduleCount={4} />);
    expect(screen.getByLabelText("Your interview").textContent).toContain(
      "already moved this once",
    );
  });

  it("renders nothing once the booking is cancelled, even with a start still on the row", () => {
    // The cancellation SIGNAL is `calendly_canceled_at`, never an empty
    // `interview_date` — that column is shared with manual/admin scheduling, so
    // a date sitting beside a tombstone is expected, not contradictory.
    const { container } = render(
      <RescheduleControl {...live} canceledAt="2026-08-01T09:00:00.000Z" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no usable interview start", () => {
    expect(
      render(<RescheduleControl {...live} interviewDate={null} />).container,
    ).toBeEmptyDOMElement();
    cleanup();
    expect(
      render(<RescheduleControl {...live} interviewDate="not-a-date" />).container,
    ).toBeEmptyDOMElement();
  });
});
