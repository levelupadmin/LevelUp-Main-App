import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useMotionSafe } from "@/lib/motion";
import type { InterviewModality } from "@shared/calendly";

/**
 * How many reschedules the applicant is offered. ONE (REQ-INT-3 / STATE §5 T4r).
 *
 * Named rather than inlined because the number is the requirement: the count on
 * the row is storage (`calendly-webhook` increments it and says in as many words
 * that this control owns what it MEANS), and this constant is that meaning.
 */
const RESCHEDULE_BUDGET = 1;

/**
 * The modality enum, mirrored from the CHECK on
 * `cohort_applications.interview_modality` (migration `20260728100000`) and
 * `04-INTEGRATION-CONTRACTS.md` §6.3.
 *
 * The column is `text` and its constraint was added NOT VALID, so a legacy or
 * hand-edited row can hold something outside the enum. Anything unrecognised
 * resolves to `null` and takes the neutral line below — never a guess, and in
 * particular never a platform the student did not choose.
 */
const MODALITIES = new Set<string>(["google_meet", "phone"]);

/** Narrow the stored text to the modality union, or `null`. Pure; unit-tested. */
export function modalityOf(value: string | null | undefined): InterviewModality | null {
  return typeof value === "string" && MODALITIES.has(value)
    ? (value as InterviewModality)
    : null;
}

/**
 * Format the ONE interview start instant for display, or `null` when it is not a
 * usable instant.
 *
 * Rendered in the device's own timezone on purpose: the column is `timestamptz`,
 * and an applicant travelling or abroad should read the time their phone will
 * ring at, not ours. An unparseable value returns `null`, which the component
 * treats exactly like an absent booking — a card headed by "Invalid Date" is
 * worse than no card.
 */
export function formatInterviewStart(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Does this row hold a LIVE Calendly booking? The single definition, exported so
 * that the card below and the page that decides whether to offer a booking calendar
 * cannot drift apart.
 *
 * That drift is a real hazard, not a tidiness point. `ApplicationStatus` withdraws
 * the inline Calendly embed once a booking exists; if its idea of "booked" were
 * looser or tighter than this card's, a student could see a live availability
 * calendar AND this card at the same time — the double-booking hazard
 * `04-INTEGRATION-CONTRACTS.md` §6.4 names, where the second booking Calendly
 * reports carries no `old_invitee`, so the receiver does not count it and the
 * one-reschedule budget quietly stops binding.
 *
 * Both halves matter. `calendly_canceled_at` is the cancellation SIGNAL and outranks
 * everything (the start column is shared with manual/admin scheduling, so a date may
 * legitimately sit beside a tombstone); and the start must actually PARSE, since a
 * value this component could only render as "Invalid Date" is not a booking anyone
 * can be said to hold.
 */
export function isLiveBooking(
  interviewDate: string | null | undefined,
  canceledAt: string | null | undefined,
): boolean {
  return canceledAt == null && formatInterviewStart(interviewDate) !== null;
}

export interface RescheduleControlProps {
  /**
   * `cohort_applications.interview_date` — THE interview start instant, and the
   * only one. V-1 deliberately reused this pre-existing column rather than
   * minting a Calendly-owned twin (migration `20260728100000` header), so there
   * is no `interview_starts_at` to read and nothing for this card to drift from.
   */
  interviewDate: string | null | undefined;
  /** `cohort_applications.interview_modality` — the student's own choice. */
  interviewModality: string | null | undefined;
  /** `cohort_applications.reschedule_count` — how many times it has been moved. */
  rescheduleCount: number | null | undefined;
  /**
   * `cohort_applications.calendly_canceled_at` — the cancellation SIGNAL.
   *
   * Read this and never an empty `interview_date`: the start column is shared
   * with manual/admin scheduling, so an absent start proves nothing about
   * whether the booking is live (the reason the migration gave this fact a
   * column of its own).
   */
  canceledAt: string | null | undefined;
  className?: string;
}

/**
 * RescheduleControl — the appointment card for a LIVE interview booking, and
 * the one-reschedule guardrail that sits on it (REQ-INT-1 / REQ-INT-3).
 *
 * ── WHAT IT READS ──
 * Four booking facts off the applicant's own `cohort_applications` row, all
 * written by `calendly-webhook` under the service role and readable by the
 * student through `students_read_own_applications`. The three row states the
 * migration documents map straight onto what renders:
 *   • `calendly_canceled_at` set → that booking was cancelled → nothing renders
 *     (the booking surface owns re-offering a calendar; a reschedule card for a
 *     cancelled interview is a card about nothing);
 *   • no usable `interview_date` → no booking to hold or to move → nothing;
 *   • otherwise → a live booking → the card.
 *
 * ── THE MODALITY IS THE STUDENT'S, AND ZOOM IS NEVER ASSUMED (REQ-INT-1) ──
 * The interview happens on Google Meet or by phone, whichever the student chose
 * at booking; `modalityFromEvent` maps Calendly's location object onto that
 * enum and returns `null` rather than guessing when the location is one the
 * contract does not pin down. This card honours all three cases, and the third
 * one is the point: an unrecognised location gets a line that names no platform
 * at all. Zoom is a legitimate delivery-side tool for cohort sessions
 * (`get_live_session_zoom_link`) and has no business on the interview.
 *
 * ── EXACTLY ONE RESCHEDULE, AND NO PRICE ANYWHERE NEAR IT (NFR-COPY-4) ──
 * `reschedule_count` is the durable budget. At zero the card states that one
 * move is available; at or above `RESCHEDULE_BUDGET` it says the slot is fixed
 * and points at a human. Neither branch mentions money, in either direction —
 * NFR-COPY-4 bans the word "free" precisely because announcing that something
 * costs nothing plants the idea that it could have cost something, and a
 * reassurance that there is no charge is still charge copy sitting next to
 * reschedule.
 *
 * ── WHY THERE IS NO IN-APP RESCHEDULE BUTTON ──
 * Moving a Calendly booking requires that invitee's own reschedule URL. We do
 * not hold one: the row stores the SCHEDULED-EVENT URI (never an invitee URI,
 * by explicit design in migration `20260728100000`), and `bookingFromEvent`
 * never reads a reschedule link, so there is no column and no value to link to.
 * The one thing we could link — `offerings.calendly_url`, the booking page —
 * would create a SECOND interview rather than move the first: it is the
 * double-booking hazard §6.4 names, and because Calendly would report no
 * `old_invitee`, the receiver would not count it, so the budget this card
 * enforces would quietly not bind. The reschedule link on the student's own
 * Calendly confirmation is the real one, and a move made through it comes back
 * as `invitee.created` carrying `old_invitee` — which is exactly the delivery
 * that increments the count this card reads. Pointing at the control that
 * actually works beats shipping one that looks native and is not.
 *
 * Consequently this component renders no interactive element, so it adds no tap
 * target; the surrounding page's controls keep their own ≥44px sizing. Motion is
 * opacity + translate only, from `src/lib/motion.ts`, and collapses to an
 * instant cut under `prefers-reduced-motion`.
 */
export const RescheduleControl = ({
  interviewDate,
  interviewModality,
  rescheduleCount,
  canceledAt,
  className,
}: RescheduleControlProps) => {
  const m = useMotionSafe();

  // Cancelled (the tombstone outranks everything else on the row, including a start
  // instant a human may since have scheduled into the shared column) or no usable
  // start → nothing to hold and nothing to move. Decided by `isLiveBooking`, the
  // same predicate the page uses to withdraw the booking calendar, so the two
  // surfaces can never both be on screen.
  const startsAt = formatInterviewStart(interviewDate);
  if (!isLiveBooking(interviewDate, canceledAt) || startsAt === null) return null;

  const modality = modalityOf(interviewModality);
  const budgetSpent = (rescheduleCount ?? 0) >= RESCHEDULE_BUDGET;

  // One line per modality, and a third that names no platform. The joining
  // details live on Calendly's own confirmation in every case, which is a thing
  // the student can verify rather than a promise about a surface we have not
  // built (there is no T-15 link delivery in this app today).
  const modalityLine =
    modality === "google_meet"
      ? "Google Meet. The joining link is on your Calendly confirmation."
      : modality === "phone"
        ? "Phone call. The admissions team calls the number on your application, so keep the line open."
        : "Your Calendly confirmation carries the joining details.";

  return (
    <motion.section
      initial={{ opacity: 0, y: m.reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={m.springs.glide}
      aria-label="Your interview"
      className={cn("rounded-xl border border-border bg-surface p-4", className)}
    >
      <h3 className="text-sm font-semibold text-foreground">Your interview</h3>
      <p className="mt-1 text-sm text-foreground">{startsAt}</p>
      <p className="mt-1 text-sm text-muted-foreground">{modalityLine}</p>

      <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
        {budgetSpent
          ? "You have already moved this once, so this time is now fixed. If something has changed, reply to your confirmation and we will find a time with you."
          : "One reschedule is available if plans change. The reschedule link is on your Calendly confirmation, and this page follows the change once it reaches us."}
      </p>
    </motion.section>
  );
};

export default RescheduleControl;
