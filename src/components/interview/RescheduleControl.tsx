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
 * Has the applicant spent their one move? The single definition of REQ-INT-3's
 * budget, named once so the number and its meaning cannot drift apart.
 *
 * ── IT IS SCOPED TO A LIVE BOOKING, AND ONLY TO A LIVE BOOKING ──
 * This predicate answers "may this interview be MOVED again", which is a question
 * about a slot the applicant currently holds. It deliberately does not gate the
 * booking calendar `ApplicationStatus` opens when `isLiveBooking` is false: there
 * is no booking to move there, so a slot taken is a first booking rather than a
 * second move, and `calendly-webhook` says exactly that when it cancels one
 * ("`reschedule_count` is deliberately untouched — a cancel is not by itself a
 * reschedule, and the replacement booking is what counts"). Read as a gate on
 * that calendar it strands the student whose one move was spent and whose
 * replacement slot was then cancelled, possibly by us — a student with a
 * cancellation tombstone on their row and nowhere to go.
 *
 * The §6.4 second-booking hazard it used to be pressed into service against
 * (a creation with no `old_invitee` is never counted, so the budget stops binding
 * rather than binds at one) is a hazard of handing a calendar to somebody who
 * ALREADY HOLDS a slot. `isLiveBooking` is the predicate for that, on every
 * signal the row carries, and `RebookPrompt` covers the residue in copy.
 *
 * `null`/`undefined` reads as zero: the column is nullable and a row that predates
 * the migration has moved nothing.
 */
export function rescheduleBudgetSpent(count: number | null | undefined): boolean {
  return (count ?? 0) >= RESCHEDULE_BUDGET;
}

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
  const budgetSpent = rescheduleBudgetSpent(rescheduleCount);

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

export interface RebookPromptProps {
  className?: string;
}

/**
 * RebookPrompt — the standing note above the booking calendar for a student the
 * funnel says holds an interview while this row holds no live booking (P-1).
 *
 * ── WHY THIS EXISTS ──
 * `_shared/reconcile.ts` derives the SAME `interview-scheduled` stage from two
 * different TeleCRM literals: "interview scheduled" AND "need to reschedule
 * interview". The client is handed the derived stage only — the literal never
 * reaches it — so the one status whose literal meaning is "this person must
 * rebook" arrives at `ApplicationStatus` indistinguishable from the one that
 * means "this person is booked". That stage used to withdraw the booking
 * calendar outright: a student told to rebook, or one whose slot was cancelled,
 * was shown no calendar and no appointment card under a chip reading "Interview
 * scheduled" — stranded, with no way forward. The calendar is now reachable at
 * that rung, and this section is what stands over it.
 *
 * ── IT IS A NOTE, NOT A GATE, AND THAT IS THE CORRECTION ──
 * This began as a gate: the calendar stayed hidden until an explicit tap here
 * revealed it. Two things were wrong with that, and both of them recreated the
 * stranding it was written to remove.
 *
 * The tap was IRREVERSIBLE and could reveal NOTHING. `InterviewEmbed` renders
 * null on three admin-owned states (booking switched off, no Calendly URL, the
 * offering archived — `INTERVIEW_BOOKING_SILENT_REASONS`), and this section was
 * defined as the open switch minus the calendar, so the control destroyed the
 * only surface on the page and left a blank one behind with no way back short of
 * a reload. A gate whose far side may be empty is not a way forward.
 *
 * And the gate stood on a BUDGET it had no business reading. `reschedule_count`
 * counts MOVES of a live booking; where `isLiveBooking` is false there is no
 * booking to move, and `calendly-webhook` says so in as many words when it
 * cancels ("`reschedule_count` is deliberately untouched — a cancel is not by
 * itself a reschedule, and the replacement booking is what counts"). Reading it
 * here closed the calendar on a student whose one move had been spent and whose
 * replacement slot was then cancelled — including by us — which is a fresh
 * stranding class, not a guardrail. The budget belongs to the card above, where
 * a live booking exists to move.
 *
 * ── SO THE §6.4 HAZARD IS ANSWERED WHERE IT ACTUALLY LIVES ──
 * The real hazard is a student who DOES hold a slot (booked outside the app, or
 * booked with the webhook still in flight) taking a SECOND one: Calendly reports
 * that as a creation with no `old_invitee`, so the receiver never counts it and
 * the one-reschedule budget stops binding rather than binding at one. The page's
 * `isLiveBooking` gate forecloses it on every signal the row carries, and what
 * remains — a holder whose booking this row has never heard of — is answered
 * here, by telling that student, FIRST and in the heading, that their time and
 * its reschedule link are on their Calendly confirmation and that booking again
 * sets up a second interview. The previous copy did the opposite: it led with
 * "Need a different interview time?" over a button reading "Pick a new time",
 * which is an invitation addressed to precisely the population it had to deter.
 *
 * ── AND IT NEVER LEAVES A BLANK PAGE ──
 * Every branch of the calendar below can render nothing, so this section carries
 * a route out that does not depend on it: replying to the Calendly confirmation
 * reaches the admissions team. It claims nothing about whether a calendar
 * follows, which is what lets it stand honestly over all three of the embed's
 * silent states without promising a surface that is not there.
 *
 * The counterpart of `RescheduleControl` above, and mutually exclusive with it
 * by construction: that card renders on `isLiveBooking`, this note only where
 * `isLiveBooking` is false. It renders no interactive element and adds no tap
 * target. Motion is opacity + translate only and collapses to an instant cut
 * under `prefers-reduced-motion`.
 */
export const RebookPrompt = ({ className }: RebookPromptProps) => {
  const m = useMotionSafe();

  return (
    <motion.section
      initial={{ opacity: 0, y: m.reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={m.springs.glide}
      aria-label="Booking your interview"
      className={cn("rounded-xl border border-border bg-surface p-4", className)}
    >
      <h3 className="text-sm font-semibold text-foreground">
        Already have a time? It is on your Calendly confirmation
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        That confirmation carries your slot and the link that moves it. Taking a
        time below would set up a second interview rather than move the one you
        hold.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        If your time was cancelled, or you have been asked to pick again, take a
        new one below. Either way, replying to your confirmation reaches the
        admissions team.
      </p>
    </motion.section>
  );
};

export default RescheduleControl;
