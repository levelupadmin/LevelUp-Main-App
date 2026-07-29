import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Users,
} from "lucide-react";

import AssignmentSubmissionForm from "@/components/cohort/AssignmentSubmissionForm";
import AssignmentFeedbackView from "@/components/cohort/AssignmentFeedbackView";
import PeerReviewBoard from "@/components/cohort/PeerReviewBoard";
import { tapTick } from "@/lib/haptics";
import { useMotionSafe } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * AssignmentModule — the assignment + feedback loop in the room register (R2-T4).
 *
 * ── This file WRAPS. It does not reimplement. ──────────────────────────────
 * `AssignmentSubmissionForm` and `AssignmentFeedbackView` are mounted here
 * VERBATIM, with the same props and the same conditions the shipped `/cohort`
 * page mounts them under (CohortDashboard's `ThisWeekCard`). The submit →
 * review → resubmit loop is the only path a student's paid work travels, so
 * this module owns the CHROME around it and nothing inside it: the upload
 * limits, the TUS upload, the offline error path and every toast stay exactly
 * where they were, untouched.
 *
 * What actually changes is the READOUT. The old page compressed the whole
 * review cycle into a lone badge, so "submitted" and "reviewed" looked like the
 * same kind of fact and a student could not tell whether anyone had their work
 * yet. Here it travels as a four-step timeline — Submitted → Under review →
 * Reviewed → Cleared — with `needs_revision` as a visible BRANCH at step three
 * rather than a dead end, because that status is the one that asks the student
 * to do something.
 *
 * ── Data ownership ────────────────────────────────────────────────────────
 * This module runs NO query of its own. Every field it renders comes from
 * `get_cohort_progress` via the shared room progress hook (R2-T1) and arrives
 * as props from the mount point in `ThisWeekCard`. A second read of the same
 * RPC would give the room two opinions about one submission, and the one that
 * lost the race would be the one the student saw.
 *
 * The single exception is `PeerReviewBoard`, which owns its own reads. It takes
 * `cohortBatchId` — and the batch id handed to it here is `envelope.batch_id`
 * from the room envelope, passed down explicitly. That is the point: the batch
 * a peer board scopes to is a fact about the ROOM, never something to infer
 * from whichever progress row happened to sort first.
 *
 * ── Colour ────────────────────────────────────────────────────────────────
 * One local status→token map, `STEP_TONES`, built from tokens that already
 * exist (`--success`, `--room-accent`, `--accent-amber`, `--muted-foreground`).
 * No new palette entries, no raw hex, no `*-500` utilities. `late` is AMBER,
 * never red: a late submission is still a submission, and colouring it as an
 * error tells the student their work did not land.
 *
 * Tone is never the only signal — every step carries its own word, and the step
 * the submission is sitting on is marked `aria-current="step"`.
 */

/* ──────────────────────────────────────────────────────────────────────────
 * The timeline model — pure, and the thing the tests pin
 * ────────────────────────────────────────────────────────────────────────── */

/** The four steps, in order. Index is the step's position on the rail. */
export const ASSIGNMENT_STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under review" },
  { key: "reviewed", label: "Reviewed" },
  { key: "cleared", label: "Cleared" },
] as const;

export type AssignmentStepKey = (typeof ASSIGNMENT_STEPS)[number]["key"];

/** How a single step reads. `attention` is the amber branch, never red. */
export type AssignmentStepTone = "done" | "current" | "attention" | "pending";

export interface AssignmentTimeline {
  /**
   * How many of the four steps have been ATTAINED (0–4). Zero means nothing has
   * been submitted yet, so the rail renders as an unlit outline.
   */
  reached: number;
  /**
   * Index of the step the submission is sitting on, or null when nothing has
   * been submitted. Always `reached - 1` when `reached > 0`.
   */
  currentIndex: number | null;
  /** The mentor asked for a revision — the branch at step three. */
  needsRevision: boolean;
  /** `late`. Renders amber (see the file header), never destructive. */
  late: boolean;
  /** `draft`, or no submission row at all: the form is the whole story. */
  awaitingSubmission: boolean;
}

/**
 * Map a `cohort_week_submissions.status` to the timeline, 1:1.
 *
 * The seven statuses are the CHECK constraint verbatim
 * (`20260526180000_cohort_weeks_submissions_attendance.sql:95`): draft,
 * submitted, under_review, reviewed, cleared, needs_revision, late.
 *
 * An UNKNOWN status resolves to the same place `submitted` does. That mirrors
 * the shipped badge's `config[status] || config.submitted` fallback: a status
 * this client has not been taught about still means the work is in, and the
 * honest failure is to under-claim progress rather than to render nothing.
 */
export function assignmentTimeline(status: string | null | undefined): AssignmentTimeline {
  const base: AssignmentTimeline = {
    reached: 0,
    currentIndex: null,
    needsRevision: false,
    late: false,
    awaitingSubmission: false,
  };

  switch (status) {
    case null:
    case undefined:
    case "":
    case "draft":
      return { ...base, awaitingSubmission: true };
    case "under_review":
      return { ...base, reached: 2, currentIndex: 1 };
    case "reviewed":
      return { ...base, reached: 3, currentIndex: 2 };
    case "cleared":
      return { ...base, reached: 4, currentIndex: 3 };
    case "needs_revision":
      return { ...base, reached: 3, currentIndex: 2, needsRevision: true };
    case "late":
      return { ...base, reached: 1, currentIndex: 0, late: true };
    case "submitted":
    default:
      return { ...base, reached: 1, currentIndex: 0 };
  }
}

/** The tone of step `index` under a given timeline. Pure — tested as a table. */
export function assignmentStepTone(
  timeline: AssignmentTimeline,
  index: number,
): AssignmentStepTone {
  if (timeline.awaitingSubmission || timeline.currentIndex === null) return "pending";
  if (index < timeline.currentIndex) return "done";
  if (index > timeline.currentIndex) return "pending";
  // The step the submission is sitting on.
  if (timeline.needsRevision || timeline.late) return "attention";
  // `cleared` is terminal: the last step is an outcome, not a wait.
  return timeline.reached === ASSIGNMENT_STEPS.length ? "done" : "current";
}

/** The label of step `index` — step three renames itself on the branch. */
export function assignmentStepLabel(timeline: AssignmentTimeline, index: number): string {
  if (index === 2 && timeline.needsRevision) return "Needs revision";
  return ASSIGNMENT_STEPS[index].label;
}

/**
 * The ONE status→token map for this module (brief V5: there was no P5-T7 map to
 * follow, and there is no raw palette left in `src/components/cohort/` to
 * remove). Every value is an existing semantic token.
 */
const STEP_TONES: Record<AssignmentStepTone, { dot: string; label: string }> = {
  done: { dot: "bg-success", label: "text-success" },
  current: { dot: "bg-room-accent", label: "text-room-accent-text" },
  attention: { dot: "bg-accent-amber", label: "text-accent-amber" },
  // `bg-muted` is 1.06:1 against the card here — a dot nobody can see is a step
  // the rail never drew. The muted-foreground tint reads as deliberately quiet
  // (≈2.2:1) instead of absent.
  pending: { dot: "bg-muted-foreground/40", label: "text-muted-foreground" },
};

/* ──────────────────────────────────────────────────────────────────────────
 * Dates — IST-pinned, like the rest of the room
 * ────────────────────────────────────────────────────────────────────────── */

const IST_TIME_ZONE = "Asia/Kolkata";

const dueFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const sentFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "numeric",
  month: "short",
});

/** Uppercase the meridiem so this agrees with `eventDateTimeLabel` elsewhere. */
function istDueLabel(ms: number): string {
  return dueFormat.format(ms).replace(/\b([ap])\.?m\.?\b/gi, (match) => match.toUpperCase());
}

/** Epoch ms for a nullable ISO string, or NaN. */
function parseMs(value: string | null | undefined): number {
  return value ? Date.parse(value) : NaN;
}

/** The window the old page called "Due soon". */
const DUE_SOON_MS = 48 * 60 * 60 * 1000;

/* ──────────────────────────────────────────────────────────────────────────
 * Props — the contract R2-T1's ThisWeekCard mounts against
 * ────────────────────────────────────────────────────────────────────────── */

export interface AssignmentModuleProps {
  /** `cohort_weeks.id` — the week this assignment belongs to. */
  weekId: string;
  /** `cohort_weeks.week_number`. Carried by the slot; unused here. */
  weekNumber?: number;
  /** The signed-in student's id. Both wrapped components need it. */
  userId: string;
  /** `cohort_weeks.assignment_prompt`. Null renders the no-assignment line. */
  prompt: string | null;
  /** `cohort_weeks.assignment_due_at` (ISO). */
  dueAt?: string | null;
  /** `cohort_week_submissions.id` — null until the student submits. */
  submissionId?: string | null;
  /** `cohort_week_submissions.status`, verbatim. Drives the timeline. */
  submissionStatus?: string | null;
  /** `cohort_week_submissions.rating` (1–5) or null. */
  submissionRating?: number | null;
  /** `cohort_week_submissions.feedback_text` or null. */
  submissionFeedback?: string | null;
  /** `cohort_week_submissions.submitted_at` (ISO). */
  submittedAt?: string | null;
  /**
   * Re-read the week rows after a submit or a resubmit — R2-T1's
   * `RoomAssignmentSlotProps.onChange`, passed straight through so this module
   * never learns which query key the weeks live under and never refetches
   * itself. Named to match the slot exactly, so `ThisWeekCard`'s
   * `renderAssignment={(props) => <AssignmentModule {...props} />}` is the
   * whole integration.
   */
  onChange: () => Promise<void> | void;
  /**
   * `CohortRoomEnvelope.batch_id`. Present → the peer-review disclosure
   * renders and scopes `PeerReviewBoard` to THIS room's batch. Absent → no
   * disclosure at all, rather than a board scoped to a guess.
   */
  batchId?: string | null;
  /**
   * Display name for the reviewing mentor, when the caller has one.
   * `get_cohort_progress` does not return `reviewed_by`, so the honest
   * fallback is "your mentor" — see the note in the phase report.
   */
  mentorName?: string | null;
  className?: string;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function AssignmentModule({
  weekId,
  userId,
  prompt,
  dueAt,
  submissionId,
  submissionStatus,
  submissionRating,
  submissionFeedback,
  submittedAt,
  onChange,
  batchId,
  mentorName,
  className,
}: AssignmentModuleProps) {
  const motionSafe = useMotionSafe();
  const [peerOpen, setPeerOpen] = useState(false);

  const timeline = useMemo(() => assignmentTimeline(submissionStatus), [submissionStatus]);

  const dueMs = parseMs(dueAt);
  const hasDue = Number.isFinite(dueMs);
  const untilDue = hasDue ? dueMs - Date.now() : NaN;
  // Both chips are suppressed once work is in. The shipped page kept showing
  // "Due soon" over a submitted assignment; a deadline the student has already
  // met is not news, and the timeline below says the true thing instead.
  const dueSoon = hasDue && !submissionId && untilDue > 0 && untilDue < DUE_SOON_MS;
  const overdue = hasDue && !submissionId && untilDue <= 0;

  // The same three conditions the shipped page uses, verbatim in meaning:
  // feedback panel, resubmission block, first-submission form.
  const showFeedback =
    !!submissionId &&
    (!!submissionFeedback ||
      submissionStatus === "reviewed" ||
      submissionStatus === "cleared");
  const showResubmit = !!submissionId && submissionStatus === "needs_revision";
  const hasRating = submissionRating !== null && submissionRating !== undefined;

  return (
    <section className={cn("rounded-xl border border-border bg-surface p-5", className)}>
      <div className="flex items-center gap-2">
        <ClipboardCheck
          size={14}
          strokeWidth={1.5}
          className="shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          Assignment
        </h2>
        {dueSoon && (
          <span className="ml-auto rounded bg-accent-amber/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-amber">
            Due soon
          </span>
        )}
        {overdue && (
          <span className="ml-auto rounded bg-destructive/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-destructive-text">
            Overdue
          </span>
        )}
      </div>

      {prompt ? (
        <>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground">
            {prompt}
          </p>

          {hasDue && (
            <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <Clock size={12} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
              <span>Due {istDueLabel(dueMs)} IST</span>
            </p>
          )}

          {/* The first-submission form is gated on the PROMPT, like the shipped
              page: with nothing asked for there is nothing to answer. */}
          {!submissionId && (
            <div className="mt-4">
              <AssignmentSubmissionForm
                weekId={weekId}
                userId={userId}
                compact
                onSubmitted={onChange}
              />
            </div>
          )}
        </>
      ) : (
        <p className="body-muted mt-3 text-sm">No assignment this week</p>
      )}

      {/* Everything below is gated on the SUBMISSION, not the prompt — an
          assignment un-authored after a student submitted must not swallow
          their work, their mentor's feedback or their way to answer it. That
          is the shipped page's structure too (both blocks sit outside its
          prompt branch), and it is the loop this task exists to preserve. */}
      {submissionId && (
        <motion.div
          className="mt-5"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionSafe.springs.glide}
        >
          <StatusTimeline timeline={timeline} />
          {(submittedAt || hasRating) && (
            <p className="body-muted mt-3 text-xs">
              {submittedAt && Number.isFinite(parseMs(submittedAt)) && (
                <span>Sent {sentFormat.format(parseMs(submittedAt))}</span>
              )}
              {submittedAt && hasRating && <span aria-hidden="true"> · </span>}
              {hasRating && <span>Rated {submissionRating}/5</span>}
            </p>
          )}
        </motion.div>
      )}

      {showFeedback && (
        <div className="mt-5">
          <AssignmentFeedbackView
            status={submissionStatus ?? "reviewed"}
            feedback={submissionFeedback ?? null}
            rating={submissionRating ?? null}
          />
          <p className="body-muted mt-2 font-mono text-[10px] uppercase tracking-[0.16em]">
            Reviewed by {mentorName?.trim() || "your mentor"}
          </p>
        </div>
      )}

      {showResubmit && (
        <div className="mt-5 border-t border-border pt-5">
          <p className="mb-3 flex items-center gap-2 text-sm text-accent-amber">
            <AlertTriangle size={16} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
            <span>Your mentor asked for a revision. Resubmit below.</span>
          </p>
          <AssignmentSubmissionForm
            weekId={weekId}
            userId={userId}
            existingSubmissionId={submissionId ?? undefined}
            onSubmitted={onChange}
          />
        </div>
      )}

      {batchId && (
        <div className="mt-5 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => {
              tapTick();
              setPeerOpen((open) => !open);
            }}
            aria-expanded={peerOpen}
            className="focus-ring pressable flex min-h-[44px] w-full items-center gap-2 text-left"
          >
            <Users
              size={14}
              strokeWidth={1.5}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Peer reviews
            </span>
            <ChevronDown
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
              className={cn(
                "ml-auto shrink-0 text-muted-foreground transition-transform",
                peerOpen && "rotate-180",
              )}
            />
          </button>
          {/* Mounted only when opened: the board runs its own reads, and a
              collapsed disclosure must not spend a student's data on them. */}
          {peerOpen && (
            <div className="mt-3">
              <PeerReviewBoard cohortBatchId={batchId} currentUserId={userId} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * The rail
 * ────────────────────────────────────────────────────────────────────────── */

function StatusTimeline({ timeline }: { timeline: AssignmentTimeline }) {
  return (
    <ol className="grid grid-cols-4 gap-x-1" aria-label="Submission status">
      {ASSIGNMENT_STEPS.map((step, index) => {
        const tone = assignmentStepTone(timeline, index);
        const tokens = STEP_TONES[tone];
        const isCurrent = timeline.currentIndex === index && !timeline.awaitingSubmission;
        const connectorLit =
          timeline.currentIndex !== null && index < timeline.currentIndex;

        return (
          <li key={step.key} aria-current={isCurrent ? "step" : undefined}>
            <div className="flex items-center gap-1" aria-hidden="true">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", tokens.dot)} />
              {index < ASSIGNMENT_STEPS.length - 1 && (
                <span
                  className={cn(
                    "h-px flex-1",
                    connectorLit ? "bg-success" : "bg-border",
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "mt-2 block font-mono text-[10px] uppercase leading-tight tracking-[0.12em]",
                tokens.label,
              )}
            >
              {assignmentStepLabel(timeline, index)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default AssignmentModule;
