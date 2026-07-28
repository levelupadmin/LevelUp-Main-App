import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useMotionSafe } from "@/lib/motion";

/**
 * The student-facing title for the person who runs the admissions conversation.
 *
 * Locked by RAHUL DECISION TITLE-1 (`01-PRD.md` §5.5) and its wording form
 * WORD-1 (`07-COPY-DECK.md` §4.6): "Admissions Interviewer" for the person,
 * "the admissions team" as the collective noun in prose. REQ-INT-2 / NFR-COPY-4
 * forbid the two titles this could drift into — the interviewer is admissions,
 * not teaching staff, and conflating them spends trust the room needs later.
 * Hoisted to a constant so the title has ONE spelling to grep, not N literals.
 */
const INTERVIEWER_TITLE = "Admissions Interviewer";

/**
 * The real first name, and only the first name (REQ-INT-2).
 *
 * Applied at the component boundary rather than trusted from the caller: a
 * roster row very plausibly holds a full name, and rendering the surname would
 * quietly reintroduce the identity detail "no bio" exists to withhold. Pure and
 * exported so the rule is unit-testable on its own.
 *
 * Returns `null` for anything that is not a usable name — the card's own signal
 * that it has nothing real to show.
 */
export function firstNameOf(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const [first = ""] = name.trim().split(/\s+/);
  return first.length > 0 ? first : null;
}

export interface InterviewerCardProps {
  /**
   * The interviewer's REAL name — in this repo, `cohort_applications.
   * interview_interviewer_name`, the host Calendly named on the booking. May be
   * a full name; only the first token is ever rendered (see `firstNameOf`).
   *
   * There is deliberately NO default and no placeholder. A caller that cannot
   * name the interviewer passes nothing and the card renders nothing, which is
   * the honest outcome — a stand-in name on this surface is a claim about a
   * person the applicant is about to meet.
   */
  name: string | null | undefined;
  className?: string;
}

/**
 * InterviewerCard — REQ-INT-2's presentation of the person who runs the
 * admissions conversation: real first name, the admissions title, NO bio.
 *
 * ── WHERE THE NAME COMES FROM ──
 *
 * `cohort_applications.interview_interviewer_name` (migration `20260728130000`),
 * written by `calendly-webhook` from the HOST half of the booking payload
 * (`scheduled_event.event_memberships[].user_name`, read by
 * `_shared/calendly.ts` `interviewerNameFromEvent`). That is the only thing in
 * this repo that can name an interviewer, and it exists only once a booking
 * does — so this card belongs beside the booked-interview surface, never beside
 * a booking calendar, where by definition nothing is yet known.
 *
 * The parser yields `null` unless the delivery names EXACTLY ONE host, so a
 * collective event type (two or more hosts) and a leaner envelope that carries
 * no `user_name` both arrive here as "no name" and render nothing. The host's
 * email is never read and never stored; a name derived from an address would be
 * a guess, which is the thing this whole surface refuses.
 *
 * ── THE SELECTIVITY LINE IS ABSENT, AND THAT IS THE FINDING, NOT AN OMISSION ──
 *
 * The requirement asks for a selectivity figure beside the name ("accepts about
 * 24% of the applicants he interviews", `07-COPY-DECK.md` CD-05-INT-02), and
 * `01-PRD.md` REQ-INT-2 sources it from REQ-RECON-1's TeleCRM read. THAT source
 * — the rate, as opposed to the name — still does not exist. Traced end to end,
 * in this repo, today:
 *
 *   • `supabase/functions/reconcile-funnel-stage/index.ts` is the only TeleCRM
 *     reader. `readTeleCrm()` POSTs `/lead/search` for ONE caller's phone (then
 *     email) and maps each returned lead to `{resolvedKey, product1, status,
 *     mql, essayPresent, timestamp}`. No lead field it reads names an
 *     interviewer, and the call is per-caller — there is no aggregate query
 *     anywhere in the function, so no denominator exists to divide by.
 *   • Its response body (the whole of what `useFunnelStage` can ever surface)
 *     is `{stage, resolvedKey, markers, telecrmStatus, amounts, ambiguous,
 *     mirrored, joinCompleteness, health, sources}`. Nothing there is an
 *     interviewer, an outcome-by-interviewer, or a rate.
 *   • No column holds an interview OUTCOME, so nothing in the app can count
 *     admits per interviewer even in principle:
 *     `interview_interviewer_name` records who took the interview and nothing
 *     about how it went. (`offerings.instructor_name` is the TEACHING
 *     instructor, and reaching for it — for a name or for a rate — would be
 *     exactly the conflation REQ-INT-2 exists to forbid.)
 *   • Calendly supplies the NAME and nothing beyond it: a delivery describes one
 *     booking, so even reading every delivery ever sent would give a count of
 *     interviews booked, never a count of applicants ADMITTED. There is no
 *     numerator.
 *   • "Arjun" and "Meera" in `07-COPY-DECK.md` §4.6 and PRD persona P4 are
 *     `✎ draft` copy placeholders illustrating the shape of the line. They are
 *     not a directory, and this component must not read them as one.
 *
 * So this component takes no selectivity input and contains no code path that
 * renders a percentage. That is stronger than an optional prop left unset:
 * every caller in this repo would have to TYPE the number to fill such a prop,
 * and a typed-in figure attributed by name to a real colleague, shown to the
 * applicant he is about to interview, is the one failure this requirement's own
 * edge case ("selectivity number missing → show name only, never a fake %")
 * rules out. When a genuine source lands — an aggregate the reconciler exposes,
 * or an app-side interview-outcome writer per Open Q1 — the line is added in the
 * SAME change that creates it, so the number and its provenance ship together.
 *
 * The card is otherwise deliberately thin: no bio, no avatar, no credentials.
 * The credibility a bio would have carried is the credibility the selectivity
 * line was meant to carry, and neither is invented here.
 */
export const InterviewerCard = ({ name, className }: InterviewerCardProps) => {
  const m = useMotionSafe();

  // No real name, no card. Nothing on this surface is worth a placeholder.
  const firstName = firstNameOf(name);
  if (!firstName) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: m.reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={m.springs.glide}
      aria-label="Your interviewer"
      className={cn("rounded-xl border border-border bg-surface p-4", className)}
    >
      <p className="text-sm font-semibold text-foreground">{firstName}</p>
      <p className="text-sm text-muted-foreground">{INTERVIEWER_TITLE}</p>
    </motion.section>
  );
};

export default InterviewerCard;
