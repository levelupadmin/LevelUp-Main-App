import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import AssignmentModule, {
  ASSIGNMENT_STEPS,
  assignmentStepLabel,
  assignmentStepTone,
  assignmentTimeline,
  type AssignmentStepTone,
} from "@/components/room/AssignmentModule";

/**
 * R2-T4 — the assignment + feedback loop in the room register.
 *
 * Two things are pinned here, and they are the two that can silently break:
 *
 *  1. TIMELINE STATES MAP 1:1 TO THE DB STATUSES. `cohort_week_submissions.status`
 *     is a CHECK-constrained enum of seven values
 *     (20260526180000_cohort_weeks_submissions_attendance.sql:95). Every one of
 *     them, plus "no row yet" and an unknown future value, has exactly one
 *     answer on the rail — asserted as a TABLE, not walked by hand, so adding a
 *     status without deciding where it lands fails the suite.
 *
 *  2. THE SUBMIT → REVIEW → RESUBMIT LOOP REACHES THE FORM. The module wraps
 *     `AssignmentSubmissionForm`; what these tests guard is that the wrapper
 *     mounts it under the right conditions and with the right props — nothing
 *     submitted → the compact first-submission form; `needs_revision` → the
 *     resubmission form (the "Resubmit" affordance, which only appears when
 *     `existingSubmissionId` is threaded through). A wrapper that renders the
 *     status but forgets the resubmit branch would strand a student holding
 *     mentor feedback with no way to answer it.
 */

afterEach(cleanup);

const baseProps = {
  weekId: "week-1",
  userId: "user-1",
  prompt: "Cut a 60-second scene from your own footage.",
  onSubmitted: () => {},
};

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Status → timeline, as a table
 * ──────────────────────────────────────────────────────────────────────────── */

interface Expected {
  reached: number;
  currentIndex: number | null;
  needsRevision: boolean;
  late: boolean;
  awaitingSubmission: boolean;
  /** Tone of each of the four steps, in order. */
  tones: [AssignmentStepTone, AssignmentStepTone, AssignmentStepTone, AssignmentStepTone];
}

const TABLE: ReadonlyArray<[name: string, status: string | null | undefined, expected: Expected]> = [
  [
    "no submission row",
    null,
    {
      reached: 0,
      currentIndex: null,
      needsRevision: false,
      late: false,
      awaitingSubmission: true,
      tones: ["pending", "pending", "pending", "pending"],
    },
  ],
  [
    "draft",
    "draft",
    {
      reached: 0,
      currentIndex: null,
      needsRevision: false,
      late: false,
      awaitingSubmission: true,
      tones: ["pending", "pending", "pending", "pending"],
    },
  ],
  [
    "submitted",
    "submitted",
    {
      reached: 1,
      currentIndex: 0,
      needsRevision: false,
      late: false,
      awaitingSubmission: false,
      tones: ["current", "pending", "pending", "pending"],
    },
  ],
  [
    "late",
    "late",
    {
      reached: 1,
      currentIndex: 0,
      needsRevision: false,
      late: true,
      awaitingSubmission: false,
      tones: ["attention", "pending", "pending", "pending"],
    },
  ],
  [
    "under_review",
    "under_review",
    {
      reached: 2,
      currentIndex: 1,
      needsRevision: false,
      late: false,
      awaitingSubmission: false,
      tones: ["done", "current", "pending", "pending"],
    },
  ],
  [
    "reviewed",
    "reviewed",
    {
      reached: 3,
      currentIndex: 2,
      needsRevision: false,
      late: false,
      awaitingSubmission: false,
      tones: ["done", "done", "current", "pending"],
    },
  ],
  [
    "needs_revision",
    "needs_revision",
    {
      reached: 3,
      currentIndex: 2,
      needsRevision: true,
      late: false,
      awaitingSubmission: false,
      tones: ["done", "done", "attention", "pending"],
    },
  ],
  [
    "cleared",
    "cleared",
    {
      reached: 4,
      currentIndex: 3,
      needsRevision: false,
      late: false,
      awaitingSubmission: false,
      tones: ["done", "done", "done", "done"],
    },
  ],
  [
    "an unknown future status falls back to submitted",
    "escalated",
    {
      reached: 1,
      currentIndex: 0,
      needsRevision: false,
      late: false,
      awaitingSubmission: false,
      tones: ["current", "pending", "pending", "pending"],
    },
  ],
];

describe("assignmentTimeline", () => {
  it.each(TABLE)("maps %s", (_name, status, expected) => {
    const timeline = assignmentTimeline(status);
    expect(timeline.reached).toBe(expected.reached);
    expect(timeline.currentIndex).toBe(expected.currentIndex);
    expect(timeline.needsRevision).toBe(expected.needsRevision);
    expect(timeline.late).toBe(expected.late);
    expect(timeline.awaitingSubmission).toBe(expected.awaitingSubmission);

    const tones = ASSIGNMENT_STEPS.map((_step, index) => assignmentStepTone(timeline, index));
    expect(tones).toEqual(expected.tones);
  });

  it("covers every status the CHECK constraint allows", () => {
    const dbStatuses = [
      "draft",
      "submitted",
      "under_review",
      "reviewed",
      "cleared",
      "needs_revision",
      "late",
    ];
    const covered = new Set(TABLE.map(([, status]) => status));
    for (const status of dbStatuses) expect(covered.has(status)).toBe(true);
  });

  it("never colours a late submission as an error — amber, not destructive", () => {
    // `attention` is the amber tone; there is no destructive tone on the rail.
    expect(assignmentStepTone(assignmentTimeline("late"), 0)).toBe("attention");
  });

  it("renames step three on the needs_revision branch only", () => {
    expect(assignmentStepLabel(assignmentTimeline("needs_revision"), 2)).toBe("Needs revision");
    expect(assignmentStepLabel(assignmentTimeline("reviewed"), 2)).toBe("Reviewed");
    // The branch never rewrites a step it does not own.
    expect(assignmentStepLabel(assignmentTimeline("needs_revision"), 0)).toBe("Submitted");
    expect(assignmentStepLabel(assignmentTimeline("needs_revision"), 3)).toBe("Cleared");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 2. The loop
 * ──────────────────────────────────────────────────────────────────────────── */

describe("AssignmentModule — the submit → review → resubmit loop", () => {
  it("offers the first-submission form when nothing has been submitted", () => {
    render(<AssignmentModule {...baseProps} submissionId={null} submissionStatus={null} />);
    expect(screen.getByRole("button", { name: /submit assignment/i })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /submission status/i })).not.toBeInTheDocument();
  });

  it("replaces the form with the four-step rail once the work is in", () => {
    render(
      <AssignmentModule {...baseProps} submissionId="sub-1" submissionStatus="under_review" />,
    );
    const rail = screen.getByRole("list", { name: /submission status/i });
    expect(rail).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(ASSIGNMENT_STEPS.length);
    expect(screen.getByText("Under review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit assignment/i })).not.toBeInTheDocument();
  });

  it("marks the step the submission is sitting on for assistive tech", () => {
    render(<AssignmentModule {...baseProps} submissionId="sub-1" submissionStatus="reviewed" />);
    const current = screen
      .getAllByRole("listitem")
      .filter((item) => item.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Reviewed");
  });

  it("renders mentor feedback in place, attributed", () => {
    render(
      <AssignmentModule
        {...baseProps}
        submissionId="sub-1"
        submissionStatus="reviewed"
        submissionFeedback="The cut lands, the sound does not."
        submissionRating={4}
        mentorName="Nelson"
      />,
    );
    expect(screen.getByText("The cut lands, the sound does not.")).toBeInTheDocument();
    expect(screen.getByText(/reviewed by nelson/i)).toBeInTheDocument();
  });

  it("falls back to an honest attribution when no mentor name is known", () => {
    render(
      <AssignmentModule
        {...baseProps}
        submissionId="sub-1"
        submissionStatus="cleared"
        submissionFeedback="Cleared."
      />,
    );
    expect(screen.getByText(/reviewed by your mentor/i)).toBeInTheDocument();
  });

  it("opens the resubmission form on needs_revision, threaded to the same submission", () => {
    render(
      <AssignmentModule
        {...baseProps}
        submissionId="sub-1"
        submissionStatus="needs_revision"
        submissionFeedback="Recut the opening."
      />,
    );
    // "Resubmit" (not "Submit") is the proof `existingSubmissionId` was threaded
    // through: the wrapped form only says it when it is updating an existing row.
    expect(screen.getByRole("button", { name: /resubmit/i })).toBeInTheDocument();
    expect(screen.getByText(/asked for a revision/i)).toBeInTheDocument();
  });

  it("does not open a resubmission form on any other status", () => {
    for (const status of ["submitted", "under_review", "reviewed", "cleared", "late"]) {
      render(<AssignmentModule {...baseProps} submissionId="sub-1" submissionStatus={status} />);
      expect(screen.queryByRole("button", { name: /resubmit/i })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("keeps the no-assignment week honest", () => {
    render(<AssignmentModule {...baseProps} prompt={null} />);
    expect(screen.getByText("No assignment this week")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit assignment/i })).not.toBeInTheDocument();
  });

  it("never strands a submission behind an un-authored prompt", () => {
    // An admin clearing `assignment_prompt` after a student submitted must not
    // swallow the work, the feedback, or the way to answer it.
    render(
      <AssignmentModule
        {...baseProps}
        prompt={null}
        submissionId="sub-1"
        submissionStatus="needs_revision"
        submissionFeedback="Recut the opening."
      />,
    );
    expect(screen.getByRole("list", { name: /submission status/i })).toBeInTheDocument();
    expect(screen.getByText("Recut the opening.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resubmit/i })).toBeInTheDocument();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 3. The batch prop
 * ──────────────────────────────────────────────────────────────────────────── */

describe("AssignmentModule — peer review scoping", () => {
  it("renders no peer-review disclosure without a batch id", () => {
    render(<AssignmentModule {...baseProps} batchId={null} />);
    expect(screen.queryByRole("button", { name: /peer reviews/i })).not.toBeInTheDocument();
  });

  it("offers the disclosure collapsed when the room supplies its batch", () => {
    render(<AssignmentModule {...baseProps} batchId="batch-1" />);
    const toggle = screen.getByRole("button", { name: /peer reviews/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
