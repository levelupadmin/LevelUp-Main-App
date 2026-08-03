import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/platform";
import { COHORT_INTERVIEW, DECISION_FLOW, flag } from "@/lib/flags";
import { useFunnelStage } from "@/hooks/useFunnelStage";
import { InterviewSlots } from "@/components/interview/SlotButtons";
import { InterviewerCard } from "@/components/interview/InterviewerCard";
import {
  RescheduleControl,
  RebookPrompt,
  isLiveBooking,
} from "@/components/interview/RescheduleControl";
import InstallNudge from "@/components/install/InstallNudge";
import { isInstallNudgeEnabled } from "@/hooks/useInstallMoment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  Loader2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

/* ── Step definitions ──
   Each step carries a one-line expectation so the student knows what happens
   next at that stage (item 36). */
const STEPS = [
  { key: "submitted", label: "Applied", expect: "We've received your application." },
  { key: "app_fee_paid", label: "App Fee Paid", expect: "Pay the application fee to unlock your interview." },
  { key: "interview_done", label: "Interview", expect: "We review your work in a short interview." },
  { key: "accepted", label: "Accepted", expect: "We let you know if you've earned a seat." },
  { key: "confirmation_paid", label: "Confirmation Paid", expect: "Confirm your seat with the booking amount." },
  { key: "balance_paid", label: "Balance Paid", expect: "Clear the remaining fee before the cohort starts." },
  { key: "enrolled", label: "Enrolled", expect: "You're in. Welcome to the cohort." },
] as const;

/* Which step index each status maps to (the highest completed step) */
const STATUS_TO_STEP: Record<string, number> = {
  submitted: 0,
  app_fee_paid: 1,
  interview_scheduled: 2,
  interview_done: 2,
  accepted: 3,
  confirmation_paid: 4,
  balance_paid: 5,
  enrolled: 6,
  rejected: -1,
  withdrawn: -1,
  waitlisted: -1,
};

/* ── Where the interview sits, per reconciled stage ──
   The booking gate's ceiling, stated as an explicit TOTAL table over the `Stage`
   union in `supabase/functions/_shared/reconcile.ts` rather than derived by
   subtracting from `RECONCILED_STAGE_STEP`.
   That distinction is the whole point. `RECONCILED_STAGE_STEP` deliberately does
   not map `accepted` or `unknown` (they open no chip/CTA here — see the comment
   above it), so a ceiling phrased as "step is defined AND above the fee rung"
   evaluates to FALSE for both, i.e. the two stages a subtraction cannot see are
   waved straight through the gate. `accepted` is a real emitted stage sitting
   between `awaiting-decision` and `confirm-paid-no-balance`, and it is precisely
   a student whose interview is over and already decided; `unknown` is the
   reconciler reporting that it resolved this applicant to no source at all, or
   to a bare NEW/WARM/Lost lead. Neither may be handed an interviewer's slot.
   Listing every member — including the two the step map omits — is what makes
   the ceiling total. A stage this table has never heard of falls to
   "unplaced", the same conservative reading as `unknown`.
     • "ahead"    — the interview is still to come and nothing says it is booked
     • "at"       — the funnel says an interview EXISTS. Ambiguous by construction:
                    `deriveStage` collapses the TeleCRM literals "interview
                    scheduled" and "need to reschedule interview" into this one
                    stage, so a booked applicant and one told to rebook are
                    indistinguishable from here (see the gate below)
     • "behind"   — the interview has happened, or a decision is already past it
     • "unplaced" — the reconciler placed this applicant nowhere
   Keys mirror `RECONCILED_STAGE_UI` / `RECONCILED_STAGE_STEP`; keep in sync. */
type InterviewPosition = "ahead" | "at" | "behind" | "unplaced";
const INTERVIEW_POSITION: Record<string, InterviewPosition> = {
  partial: "ahead",
  "completed-no-fee": "ahead",
  "fee-paid-no-interview": "ahead",
  "interview-scheduled": "at",
  "awaiting-decision": "behind",
  accepted: "behind",
  "confirm-paid-no-balance": "behind",
  enrolled: "behind",
  unknown: "unplaced",
};

/* The stage's position, or `undefined` when there is no stage at all — the flag
   is off, or the reconciler read has not landed. "No opinion" and "placed
   nowhere" are different answers and the gate treats them differently. */
function interviewPositionOf(stage: string | undefined): InterviewPosition | undefined {
  if (stage == null) return undefined;
  return INTERVIEW_POSITION[stage] ?? "unplaced";
}

/* The only two local statuses a rebooking path may be offered on. Both mean the
   fee is paid and the interview is still ahead of them; `interview_done` and
   everything past it share step 2 with `interview_scheduled` on the STEPS
   ladder, so the ladder alone cannot make this distinction and the statuses are
   named instead. */
const REBOOKABLE_STATUSES = new Set<string>(["app_fee_paid", "interview_scheduled"]);

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ApplicationData {
  id: string;
  user_id: string;
  offering_id: string;
  status: string;
  created_at: string;
  rejection_reason: string | null;
  /* ── The Calendly booking facts (`20260728100000`, `20260728130000`) ──
     Mirrored onto this row by `calendly-webhook` under the service role and read
     back here through the existing `students_read_own_applications` policy; the
     explicit column list below returns them. Facts only — none of them is a
     funnel stage, and nothing here derives one from them (SOR-1). */
  interview_date: string | null;
  interview_modality: string | null;
  interview_interviewer_name: string | null;
  reschedule_count: number | null;
  calendly_canceled_at: string | null;
  offerings: {
    title: string;
    price_inr: number | null;
    app_fee_inr: number | null;
    confirmation_amount_inr: number | null;
  } | null;
}

/**
 * The EXPLICIT column list this page reads. Never `*` — NFR-COPY-1.
 *
 * `select("*")` here shipped the WHOLE row to the browser: `bio` (the applicant's
 * 100-word essay, which no client is ever allowed to receive), `tally_data` (the
 * raw submission, essay included) and `interview_notes` (internal reviewer prose
 * ABOUT the applicant). None of the three was ever rendered — which is precisely
 * why it went unnoticed for so long: the leak was in the network response, legible
 * to the applicant themselves from their own devtools, not on the screen.
 *
 * The list mirrors `ApplicationData` one-to-one, so a field added to the render
 * has to be added here deliberately. Everything reconciled comes from
 * `useFunnelStage`, not from this row, so no reconciler mirror column is read.
 * Contact fields (email, phone) are omitted too: this page prints neither.
 *
 * Shaped as a named constant, like `DECISION_COLUMNS` in `src/hooks/useDecision.ts`,
 * so the list is greppable as a unit — and the repo-wide guard in
 * `src/lib/__tests__/admissionPublicPolicy.test.ts` §12 fails the suite if any
 * client surface reverts this table to a wildcard select.
 */
const APPLICATION_COLUMNS =
  "id, user_id, offering_id, status, created_at, rejection_reason, " +
  "interview_date, interview_modality, interview_interviewer_name, " +
  "reschedule_count, calendly_canceled_at, " +
  "offerings(title, price_inr, app_fee_inr, confirmation_amount_inr)";

/* ── Reconciled funnel stage → home chip + single CTA (RC-T4) ──
   Consumed ONLY under `VITE_FUNNEL_RECON`, from the useFunnelStage/edge-fn
   payload — never off the `reconciled_*` mirror columns. Maps the reconciler's
   derived §6 stage to the label chip + one next-action CTA. Keys are the exact
   kebab strings of the `Stage` union in `supabase/functions/_shared/reconcile.ts`
   (the reconciler's `deriveStage` output) — the single source of the stage
   vocabulary. Stages that open no action here (`"unknown"` orphan, and
   `"accepted"`, which fires its own experience in a later phase) are left
   unmapped, so the surface falls back to the status-driven view below — the
   same degrade path as an unreachable fn.
   Payment CTAs reuse the existing checkout routes and stay hidden in native
   shells under the Reader Rule, mirroring the staged-payment guard below. */
type ReconciledCta = { to: string; label: string; payment?: boolean };
const RECONCILED_STAGE_UI: Record<
  string,
  { chip: string; cta?: (app: ApplicationData) => ReconciledCta }
> = {
  partial: { chip: "Application started" },
  "completed-no-fee": {
    chip: "Application fee due",
    cta: (app) => ({
      to: `/checkout/${app.offering_id}?type=app_fee&app=${app.id}`,
      label: "Pay application fee",
      payment: true,
    }),
  },
  "fee-paid-no-interview": { chip: "Book your interview" },
  "interview-scheduled": { chip: "Interview scheduled" },
  "awaiting-decision": { chip: "Awaiting decision" },
  "confirm-paid-no-balance": {
    chip: "Balance due",
    cta: (app) => ({
      to: `/checkout/${app.offering_id}?type=balance&app=${app.id}`,
      label: "Pay balance",
      payment: true,
    }),
  },
  enrolled: { chip: "Enrolled" },
};

/* ── v1: reconciler drives NON-MONEY stages only ──
   Rahul RULED (2026-07-22, cohort-rc-v1-scope V1-1): disable reconciler payment
   CTAs in v1 — the reconciler's payment-CTA attribution from shared external
   amounts is structurally fragile (P1 null-floor, P2/P3 shared-amount wrong-
   cohort). MONEY_STAGES are the reconciled stages whose RECONCILED_STAGE_UI CTA
   carries `payment: true` (`completed-no-fee` → "Pay application fee",
   `confirm-paid-no-balance` → "Pay balance"). For these the client SUPPRESSES the
   entire reconciled override: the badge falls back to `statusLabel` and no
   reconciled CTA renders, so no reconciler-driven payment CTA can surface in v1.
   The status-driven timeline below still owns the staged payment CTAs. Money CTAs
   re-enable as a fast-follow once Phase-2 staged payments populate `payment_orders`
   for offering-exact, first-party attribution. Keep in sync with RECONCILED_STAGE_UI. */
const MONEY_STAGES = new Set<string>([
  "completed-no-fee",
  "confirm-paid-no-balance",
]);

/* Each reconciled stage's position on the STEPS ladder (the highest step it
   implies), used as a FLOOR against the application's own status. The reconciler
   is allowed to run AHEAD of `cohort_applications.status` (its whole purpose:
   surface an external signal the app hasn't mirrored yet), but it must never
   render BEHIND a positive local status — a derived `confirm-paid-no-balance`
   on an already-`enrolled` row would otherwise stamp a stale 'Pay balance' CTA
   on a paid student. Keys mirror RECONCILED_STAGE_UI exactly; keep them in sync. */
const RECONCILED_STAGE_STEP: Record<string, number> = {
  partial: 0,
  "completed-no-fee": 0,
  "fee-paid-no-interview": 1,
  "interview-scheduled": 2,
  "awaiting-decision": 2,
  "confirm-paid-no-balance": 4,
  enrolled: 6,
};

const ApplicationStatus = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  // Reconciler read (dark behind VITE_FUNNEL_RECON). Flag off → `undefined`, so
  // every reconciled branch below is inert and the page renders byte-identically.
  // Scoped to THIS application's offering so the derived chip/CTA reflect this
  // offering only (no global-stage contamination); `offering_id` is undefined
  // while the application loads, which keeps the query disabled until it lands.
  const reconciled = useFunnelStage(user?.id, application?.offering_id).data;

  useEffect(() => {
    if (!applicationId || !user?.id) return;

    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("cohort_applications")
        .select(APPLICATION_COLUMNS)
        .eq("id", applicationId)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      // Auth guard: only the owning user can view
      if (data.user_id !== user.id) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      setApplication(data);
      setLoading(false);
    })();
  }, [applicationId, user?.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground mb-2">
            Unauthorized
          </p>
          <p className="text-muted-foreground mb-4">
            You don't have permission to view this application.
          </p>
          <Button variant="outline" onClick={() => navigate("/home")}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground mb-2">
            Application Not Found
          </p>
          <p className="text-muted-foreground mb-4">
            We couldn't find this application.
          </p>
          <Button variant="outline" onClick={() => navigate("/home")}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const isRejected = application.status === "rejected";
  const isWithdrawn = application.status === "withdrawn";
  const isFailed = isRejected || isWithdrawn;
  const currentStepIndex = STATUS_TO_STEP[application.status] ?? -1;

  /* Reconciled chip + single CTA — present only when the flag is on AND the
     derived stage maps to a known row. Two floors keep a POSITIVE derived stage
     from contaminating a row it shouldn't touch, because `deriveStage`'s Stage
     union has no rejected/withdrawn/waitlisted state and never reads
     `cohort_applications.status`:
       1. Non-progressing statuses (rejected, withdrawn, waitlisted — every status
          STATUS_TO_STEP maps to -1) suppress it entirely: a failed/held application
          whose offering still carries a captured payment in the externals would
          otherwise stamp a progress chip over its badge and route a payment CTA at
          a dead/un-accepted application (`currentStepIndex >= 0` gate).
       2. The derived stage must sit AT or AHEAD of the local status on the STEPS
          ladder. Running ahead is intended (reconciler surfaces an un-mirrored
          external signal); running BEHIND (e.g. `confirm-paid-no-balance` derived
          for an already-`enrolled` row) would show a stale 'Pay balance' CTA to a
          paid student, so it falls back to the status-driven UI instead.
     Flag off → `reconciled?.stage` is undefined → both floors are inert and this
     is byte-identical to the status-driven view below. */
  const reconciledStage = reconciled?.stage;
  const reconciledStep =
    reconciledStage != null ? RECONCILED_STAGE_STEP[reconciledStage] : undefined;
  const reconciledUiCandidate =
    currentStepIndex >= 0 &&
    reconciledStage &&
    reconciledStep !== undefined &&
    reconciledStep >= currentStepIndex
      ? RECONCILED_STAGE_UI[reconciledStage]
      : undefined;
  /* v1 money-stage suppression (V1-1). When the reconciled stage is money-
     bearing — in MONEY_STAGES OR its candidate CTA carries `payment: true` —
     suppress the ENTIRE reconciled override: `reconciledUi` goes undefined, so
     the badge falls back to `statusLabel(application.status)` and no reconciled
     CTA is computed. NON-money stages (partial, fee-paid-no-interview,
     interview-scheduled, awaiting-decision, enrolled) still let the reconciler
     drive chip + CTA exactly as before. The `payment: true` check makes this
     robust even if a new money CTA is added to RECONCILED_STAGE_UI without being
     listed in MONEY_STAGES. Flag off → `reconciledStage` is undefined → not money
     → inert, byte-identical to the status-driven view. */
  const reconciledIsMoney =
    !!reconciledStage &&
    (MONEY_STAGES.has(reconciledStage) ||
      reconciledUiCandidate?.cta?.(application)?.payment === true);
  const reconciledUi = reconciledIsMoney ? undefined : reconciledUiCandidate;
  /* Ambiguous money — withhold the CTA, keep the chip. When the reconciler
     can't pin a shared-tier amount to exactly one offering it flags
     `ambiguous`; we then render chip-only (information) and suppress any
     money CTA, degrading to the status-driven timeline below, which owns
     payments. In v1 this is a strict SUBSET of the money-stage suppression
     above (all money stages are already suppressed regardless of `ambiguous`),
     so it never fires today — kept intact and ready for the fast-follow
     re-enable. Flag off → `reconciled` is undefined → `ambiguous` is falsy →
     this is inert and byte-identical to the pre-reconciler CTA. */
  const reconciledCtaCandidate = reconciledUi?.cta?.(application);
  const reconciledCta =
    reconciledCtaCandidate?.payment && reconciled?.ambiguous
      ? undefined
      : reconciledCtaCandidate;

  /* ── The optional in-app Calendly embed (INTEG-CAL-1, dark behind
     VITE_COHORT_INTERVIEW) ──
     This is the OUTRIGHT rung: the fee is paid, no signal on the page claims an
     interview exists, and booking is the one thing left to do — the "fee paid,
     interview not scheduled" loss this phase exists to close. A stage that says
     an interview DOES exist does not qualify here; it goes to the pending rung
     below, which opens the same calendar on the narrower `!hasLiveBooking` test
     and puts `RebookPrompt`'s warning over it, because re-offering a calendar to
     someone who already holds a slot invites a second booking on the same
     applicant.
     That distinction has to hold against BOTH stage signals this page carries,
     not just the slower one. `application.status` is the local mirror; the reconciler
     exists specifically to run AHEAD of it (see the floors above), and
     `deriveStage` emits `interview-scheduled` from the external signal without
     ever reading `cohort_applications.status`. Gating on the mirror alone meant
     an applicant who had already booked but whose webhook had not yet landed got
     the chip "Interview scheduled" AND a live calendar underneath it. So the
     derived stage is a CEILING too: anything above the app-fee rung on the STEPS
     ladder means the interview is booked or already behind them, and the calendar
     is withdrawn. That ceiling is read off `INTERVIEW_POSITION`, the total table
     at the top of this file, and NOT off `RECONCILED_STAGE_STEP`: the step map
     leaves `accepted` and `unknown` unmapped by design, so a ceiling phrased as a
     step comparison silently admits exactly those two (an already-decided
     applicant would have been handed a calendar). The raw stage is read here
     rather than `reconciledUi` — the v1 money-stage suppression is about payment
     CTAs and must not hand a booked applicant a calendar back.
     `unplaced` (the reconciler's `unknown`) does NOT withdraw this calendar, and
     that asymmetry with the rebooking path below is deliberate. This branch turns
     on a fact this app owns outright — the ₹400 is paid and the local status says
     so — and a reconciler that could not resolve the applicant to any source has
     not unpaid it. Withdrawing here on `unknown` would mean that turning the
     reconciler flag ON stops an unresolvable fee-paid student from booking at
     all, which is the exact loss this phase exists to close.
     It renders BESIDE the payment pipeline, never through it: no step branch, no
     native payment guard and no checkout route is touched, and a Reader Rule
     guard would be wrong here anyway — booking an interview moves no money.
     Flag off → `interviewPosition` is undefined, the ceiling is inert, and this is
     byte-identical to today; the embed's own hook never mounts, so no request is
     made. */
  const interviewPosition = interviewPositionOf(reconciledStage);
  const funnelHoldsInterview =
    interviewPosition === "at" || interviewPosition === "behind";
  /* THE THIRD SIGNAL, AND THE FASTEST OF THE THREE. `calendly-webhook` writes the
     booking onto this very row the moment Calendly delivers, which is well before
     either stage signal above catches up: `application.status` is only moved by an
     admin, and the reconciled stage is derived from an external read on its own
     cadence. So an applicant who booked minutes ago has a live booking on the row
     while both stage signals still say "fee paid, no interview" — and the ceiling
     above, which reads only the derived stage, would hand them the calendar again
     with the reschedule card sitting right underneath it. Two live booking surfaces
     at once is the double-booking hazard `04-INTEGRATION-CONTRACTS.md` §6.4 names,
     and it is worse than it looks: Calendly reports a second BOOKING (not a move),
     so it carries no `old_invitee`, the receiver does not count it, and the
     one-reschedule budget quietly stops binding.
     `isLiveBooking` is the reschedule card's OWN predicate, imported rather than
     restated, so "booked" means exactly one thing on this page. Flag off → the row
     is never written by anything in this phase and both branches stay inert. */
  const hasLiveBooking = isLiveBooking(
    application.interview_date,
    application.calendly_canceled_at,
  );
  /* ── THE CEILING'S OWN CASUALTY, AND THE WAY OUT (P-1) ──
     The ceiling above is correct about a booked applicant and catastrophic about
     one other person. `_shared/reconcile.ts` derives `interview-scheduled` from
     TWO TeleCRM literals — "interview scheduled" AND "need to reschedule
     interview" — and collapses them before the client is handed anything, so the
     ONE status whose literal meaning is "this person must rebook" arrives here as
     the stage that WITHDRAWS the calendar. After a cancellation in that state the
     student saw no calendar, no appointment card, and a chip reading "Interview
     scheduled": stranded, which is the precise failure this phase exists to
     remove. The same dead end swallows a locally-`interview_scheduled` row whose
     booking was cancelled, since that status never satisfied the fee-paid branch
     either.
     The literal is unrecoverable from this page (`useFunnelStage` exposes
     `{ stage, resolvedKey, markers, ambiguous }` and nothing else), and it is the
     reconciler's to own (SOR-1), so this cannot be fixed by branching on which
     literal produced the stage. It is fixed literal-AGNOSTICALLY instead: this
     rung joins the one below in opening the calendar whenever `!hasLiveBooking`,
     so whichever literal produced the stage, a student with no booking has a way
     to take one. `RebookPrompt` stands over that calendar rather than in front of
     it, carrying the warning for the applicant who may already hold a slot
     elsewhere and a human route that does not depend on the calendar rendering.
     `!hasLiveBooking` gates this rung exactly as it gates the appointment card
     below, through the single shared `isLiveBooking` predicate, so a live calendar
     and a reschedule card can never be on screen together. The two branches are
     disjoint by construction: this rung is only reachable when the fee-paid branch
     is false (an `app_fee_paid` row at `interview-scheduled` is by definition
     ahead of the fee-paid rung), so they never double-count a single row.
     Flag off → both are inert.
     `interviewRungPending` keeps the rest of the ceiling standing. It carves ONLY
     the one ambiguous stage out of it, so every stage past the interview —
     `awaiting-decision` (the interview happened), `accepted` (it was decided), and
     the two beyond — still withdraws every booking surface, including from a local
     `interview_scheduled` row the admin has not caught up on. A calendar offered to
     someone whose interview is behind them is a different lie, not a fix. It is
     stated as an ALLOWLIST over `INTERVIEW_POSITION` rather than as "not behind",
     because "not behind" is a subtraction and subtraction is what let `accepted`
     and `unknown` through: an accepted applicant on a stale local
     `interview_scheduled` row would have been offered a rebooking prompt for an
     interview that already happened and was already decided.
     The three admissible positions, and why each is admissible:
       • "at" — the funnel itself says an interview exists, which is the ambiguous
         stage this whole block is about;
       • undefined — no stage at all (flag off, or the read has not landed), so the
         page degrades to the status-driven view and the local mirror stands alone,
         exactly as it did before the reconciler existed;
       • "ahead" — the funnel says the interview is still to come while the local
         mirror already reads `interview_scheduled`; nobody holds a booking on
         either signal, so a way to take one has to exist.
     `"unplaced"` is admissible on NEITHER, and unlike the fee-paid branch above
     that is the conservative reading, not a regression: this path is offered off a
     claim that an INTERVIEW EXISTS, which only the funnel can make, and `unknown`
     is the funnel affirmatively reporting that it placed this applicant nowhere —
     including a lead TeleCRM has marked Lost. A local `interview_scheduled` mirror
     stands on its own where the reconciler has no opinion; it does not outvote the
     reconciler saying it has none to give. */
  const interviewRungPending =
    REBOOKABLE_STATUSES.has(application.status) &&
    (interviewPosition === "at" ||
      ((interviewPosition === undefined || interviewPosition === "ahead") &&
        application.status === "interview_scheduled"));
  /* The rung where the calendar is offered outright: the fee is paid, nothing
     says an interview exists, and booking is the one thing left to do. */
  const interviewRungOpen =
    application.status === "app_fee_paid" && !funnelHoldsInterview;
  /* ── ONE SWITCH: IS THERE A BOOKING SURFACE ON THIS PAGE AT ALL? ──
     `!hasLiveBooking` is the whole of it, over both rungs, and it is the SAME
     `isLiveBooking` call the appointment card below turns on, read in the
     opposite direction. So the calendar and the card are two views of one switch
     and cannot drift: a booked-but-not-yet-reconciled student gets the card and
     no calendar, and never both (§6.4).

     NOTHING ELSE NARROWS IT, and the two things that used to are the P-1 review's
     findings:

     • NOT A TAP. The calendar at the pending rung used to be hidden behind an
       explicit "pick a new time" control on `RebookPrompt`. `InterviewEmbed`
       renders NULL on three admin-owned states (booking switched off, no Calendly
       URL, the offering archived — `INTERVIEW_BOOKING_SILENT_REASONS`), and the
       prompt was defined as this switch MINUS the embed, so the tap destroyed the
       prompt that rendered it and could leave a blank page with no way back short
       of a reload. That is the P-1 stranding, one tap later. The calendar is now
       reachable outright and the prompt stands over it as a note, so no state of
       the embed can consume the only surface on the page.

     • NOT THE RESCHEDULE BUDGET. `reschedule_count` counts MOVES of a live
       booking; where `isLiveBooking` is false there is none to move, and
       `calendly-webhook` states that outright when it cancels one ("`reschedule_
       count` is deliberately untouched — a cancel is not by itself a reschedule,
       and the replacement booking is what counts"), nulling `interview_date` and
       writing the tombstone as it goes. Gating on it closed the calendar on a
       student who had used their one move and whose replacement slot was then
       cancelled — a cancellation the interviewer or LevelUp may have initiated —
       under copy blaming them for a move they did not make. That is a new
       stranding class, and it also put a budget on the plain fee-paid rung, which
       has never carried one. The budget belongs to `RescheduleControl`, where a
       live booking exists to move.

     The §6.4 second-booking hazard those two were reaching for is a hazard of
     handing a calendar to somebody who ALREADY HOLDS a slot. `!hasLiveBooking`
     forecloses it on every signal this row carries; the residue — a holder whose
     booking this row has never heard of, because it was made outside the app or
     the webhook is still in flight — is answered by `RebookPrompt`'s copy, which
     leads with the confirmation that holds their slot and says in as many words
     that booking below makes a second interview rather than moving the first. */
  const showInterviewEmbed =
    flag(COHORT_INTERVIEW) &&
    !hasLiveBooking &&
    (interviewRungOpen || interviewRungPending);
  /* The note that stands over the calendar, at the ambiguous rung ONLY. The
     plain fee-paid rung (`interviewRungOpen`) is not ambiguous — nothing there
     claims an interview exists — so a note about a booking the student may
     already hold would be noise, and this page renders exactly what it rendered
     before at that rung. */
  const showRebookPrompt = showInterviewEmbed && interviewRungPending;

  /* ── Phase DC beat 1: "Your decision is ready" (REQ-DEC-1) ──
     This is the surface the comment on RECONCILED_STAGE_UI pointed at: the
     `accepted` stage is deliberately unmapped there because it fires its own
     experience, and this is it. Purely a READ — the app never writes a funnel
     status (SOR-1); the announcement appears because the reconciler OBSERVED
     TeleCRM flip to `accepted`. The verdict itself stays sealed behind
     /decision/:id, so nothing here (and no notification payload) reveals it.
     Gated on BOTH flags by construction: `reconciledStage` is only ever set
     under VITE_FUNNEL_RECON, and VITE_DECISION_FLOW gates the beat itself, so
     with either off this is `false` and nothing renders — byte-identical to
     today.

     BOTH floors from the reconciled chip apply here too, because this beat leads
     to a money CTA and the chip only leads to a label:
       1. `currentStepIndex >= 0` — the non-progressing-status floor: a
          rejected/withdrawn/waitlisted row can never show it.
       2. `currentStepIndex <= STATUS_TO_STEP.accepted` — the ladder floor. The
          derived `accepted` stage sits at step 3, so it must not render behind a
          local status already past it. The reconciler's stage is NOT a reliable
          "has not paid yet" signal: `deriveStage` only advances past `accepted`
          when it can SEE the seat-confirm in Razorpay under the join key, so a
          ₹8k paid from another phone/email — or any run where Razorpay is
          unavailable and the fn fail-softs — falls through to `accepted` for a
          `confirmation_paid`/`balance_paid`/`enrolled` row. Without this floor
          that student is shown "Your decision is ready" over an "Enrolled" badge
          and walked back into the confirmation checkout: a pay-twice chase.
          `cohort_applications.status` is first-party truth (the app's own
          payment webhook writes it), so it wins. `useDecision` applies the same
          floor, which is what keeps the reveal and the claim page in step. */
  const decisionReady =
    flag(DECISION_FLOW) &&
    reconciledStage === "accepted" &&
    currentStepIndex >= 0 &&
    currentStepIndex <= STATUS_TO_STEP.accepted;

  /* Determine which step was "failed" at, for rejected/withdrawn */
  // For rejected, show failure at the step after the last completed step
  const failedAtIndex = isFailed
    ? Math.max(currentStepIndex + 1, 1)
    : -1;

  const getStepState = (
    index: number
  ): "completed" | "current" | "upcoming" | "failed" => {
    if (isFailed && index === failedAtIndex) return "failed";
    if (isFailed && index < failedAtIndex) return "completed";
    if (isFailed && index > failedAtIndex) return "upcoming";

    if (index < currentStepIndex) return "completed";
    if (index === currentStepIndex) return "current";
    return "upcoming";
  };

  /* ── Progress summary (item 36) ──
     "Step N of M" + a thin cream progress bar. We count the active step as the
     current one (1-based); failed applications show how far they reached. */
  const totalSteps = STEPS.length;
  const stepNumber = isFailed
    ? Math.max(failedAtIndex, 1)
    : Math.min(currentStepIndex + 1, totalSteps);
  const progressPct = Math.round(
    ((isFailed ? failedAtIndex : currentStepIndex + 1) / totalSteps) * 100
  );

  /* The first step's date is the real application date; later steps are
     forward-looking, so we show "Applied <date>" only on step 0 and a soft
     "Pending" hint on the active step. */
  const appliedDate = new Date(application.created_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="sticky top-0 z-40 h-16 flex items-center px-4 md:px-8 border-b border-border bg-canvas/90 backdrop-blur-lg">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/home")}
          className="mr-3"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-lg font-semibold">Application Status</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Offering title + status badge */}
        <div className="mb-8">
          <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">
            {application.offerings?.title || "Application"}
          </h2>
          <Badge
            variant="outline"
            className="text-sm border-[hsl(var(--cream))]/30 bg-[hsl(var(--cream))]/10 text-[hsl(var(--cream))]"
          >
            {reconciledUi?.chip ?? statusLabel(application.status)}
          </Badge>

          {/* Single reconciled CTA (dark behind the flag). Payment CTAs stay
              hidden in native shells per the Reader Rule — same rule as the staged
              timeline guard, kept as its own branch here. */}
          {reconciledCta &&
            (reconciledCta.payment && isNative() ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Complete this step from a web browser.
              </p>
            ) : (
              <div className="mt-4">
                <Link to={reconciledCta.to}>
                  <Button size="sm">
                    {reconciledCta.label}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            ))}

          {/* Beat 1 of the three kept beats (REQ-DEC-1), verbatim. The verdict
              is NOT here — it stays sealed until "Open your decision" on
              /decision/:id. Dark behind VITE_DECISION_FLOW. */}
          {decisionReady && (
            <div className="mt-6 rounded-lg border border-[hsl(var(--cream))]/30 bg-surface p-4">
              <p className="text-sm font-medium text-foreground">
                Your decision is ready
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sealed until you open it.
              </p>
              <Link to={`/decision/${application.id}`}>
                <Button size="sm" className="mt-3">
                  Open your decision
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* The note for a student the funnel calls scheduled while this row holds
            no live booking — the "need to reschedule" population, which reaches
            us wearing the same stage as the booked one (see the gate).

            ABOVE the calendar and not instead of it. It is read before the slot
            is picked, which is where a warning to somebody who may already hold
            one belongs, and it carries a human route (reply to the confirmation)
            that survives every state in which the calendar below renders nothing
            at all. */}
        {showRebookPrompt && <RebookPrompt className="mb-4" />}

        {/* Book the interview, in place — the three soonest slots as one-tap
            buttons (REQ-INT-0, reinstated by Rahul 2026-07-28; see
            `04-INTEGRATION-CONTRACTS.md` §6.4).

            THIS PAGE STILL HOLDS NO BOOKING. The slot list it renders is read
            server-side and is only ever an OFFER: Calendly's API cannot create a
            booking, so each button opens Calendly's own deep link to that slot and
            Calendly confirms it. The calendar keeps exactly one writer, which is
            what the earlier "the embed inherits availability truth" note was
            really protecting. What a rendered list CAN be is stale, and the
            component re-checks availability on every tap for precisely that
            reason. When availability cannot be read at all it falls back to the
            hosted calendar this page shipped with. */}
        {showInterviewEmbed && (
          <InterviewSlots
            offeringId={application.offering_id}
            applicationId={application.id}
            name={profile?.full_name}
            email={profile?.email ?? user?.email}
            className="mb-8"
          />
        )}

        {/* The booked interview: when it is, how it happens, who is taking it, and
            the one move that is available. The mutually-exclusive twin of the
            calendar above — `hasLiveBooking` gates both, in opposite directions.

            THE INTERVIEWER CARD CAN ONLY LIVE HERE, and that is a fact about the
            source rather than a layout choice. The one thing in this repo that can
            name an interviewer is the Calendly delivery itself, so the name does not
            exist until a booking does; rendering the card beside the calendar above
            would be rendering it at the one moment nothing is known. It supplies its
            own empty state — no name, no card — which is what a delivery that named
            no single host (or named several) correctly produces.

            NO SELECTIVITY FIGURE IS PASSED, because the component accepts none and
            no source for one exists (see its header: no reconciler aggregate, no
            interviewer outcome column). A number typed in here and attributed by
            name to a real colleague, shown to the applicant about to meet them, is
            the exact failure REQ-INT-2 guards against. */}
        {flag(COHORT_INTERVIEW) && hasLiveBooking && (
          <div className="mb-8 space-y-4">
            <RescheduleControl
              interviewDate={application.interview_date}
              interviewModality={application.interview_modality}
              rescheduleCount={application.reschedule_count}
              canceledAt={application.calendly_canceled_at}
            />
            <InterviewerCard name={application.interview_interviewer_name} />
          </div>
        )}

        {/* Rejection reason: neutral surface, no red, to match the
            monochrome timeline. The reason text is still surfaced. */}
        {isRejected && application.rejection_reason && (
          <div className="mb-8 p-4 rounded-lg bg-surface border border-border">
            <p className="text-sm font-medium text-foreground mb-1">
              Decision note
            </p>
            <p className="text-sm text-muted-foreground">
              {application.rejection_reason}
            </p>
          </div>
        )}

        {/* Step summary + thin cream progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-foreground">
              Step {stepNumber} of {totalSteps}
            </p>
            <p className="text-xs font-mono text-muted-foreground">{progressPct}%</p>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-[hsl(var(--cream))] transition-[width] duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Timeline: monochrome cream */}
        <div className="relative">
          {STEPS.map((step, index) => {
            const state = getStepState(index);
            const isLast = index === STEPS.length - 1;
            const isDone = state === "completed";
            const isCurrent = state === "current";

            return (
              <div key={step.key} className="relative flex gap-4 pb-8">
                {/* Vertical line: cream once the step is done, dim otherwise */}
                {!isLast && (
                  <div
                    className={`absolute left-[15px] top-[32px] w-0.5 h-[calc(100%-16px)] ${
                      isDone ? "bg-[hsl(var(--cream))]" : "bg-border"
                    }`}
                  />
                )}

                {/* Icon: filled cream check (done), pulsing cream ring
                    (current), dim ring (future / not reached) */}
                <div className="relative z-10 shrink-0 flex items-center justify-center w-[32px] h-[32px]">
                  {isDone ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--cream))]">
                      <Check className="h-4 w-4 text-[hsl(var(--cream-text))]" strokeWidth={3} />
                    </div>
                  ) : isCurrent ? (
                    <div className="relative flex h-7 w-7 items-center justify-center">
                      <div className="absolute inset-0 rounded-full bg-[hsl(var(--cream))]/25 animate-pulse" />
                      <div className="h-7 w-7 rounded-full border-2 border-[hsl(var(--cream))] bg-canvas" />
                      <div className="absolute h-2 w-2 rounded-full bg-[hsl(var(--cream))]" />
                    </div>
                  ) : (
                    <div className="h-7 w-7 rounded-full border-2 border-border bg-canvas" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pt-0.5">
                  <p
                    className={`font-medium ${
                      isDone
                        ? "text-foreground"
                        : isCurrent
                          ? "text-[hsl(var(--cream))]"
                          : "text-muted-foreground/60"
                    }`}
                  >
                    {step.label}
                  </p>

                  {/* Date + one-line expectation copy per step */}
                  <p className="mt-0.5 text-xs text-muted-foreground/80">
                    {step.expect}
                  </p>
                  {index === 0 && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/60">
                      Applied {appliedDate}
                    </p>
                  )}
                  {isCurrent && index !== 0 && (
                    <p className="mt-0.5 font-mono text-[11px] text-[hsl(var(--cream))]/70">
                      In progress
                    </p>
                  )}

                  {/* Pay buttons: hidden in every native shell per the Reader
                      Rule (no in-app purchase entry points or external-pay
                      links). Web keeps the existing checkout flow. */}
                  {state === "upcoming" &&
                    step.key === "confirmation_paid" &&
                    application.status === "accepted" &&
                    (isNative() ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Complete this step from a web browser.
                      </p>
                    ) : (
                      <Link
                        to={`/checkout/${application.offering_id}?type=confirmation&app=${application.id}`}
                      >
                        <Button size="sm" className="mt-2">
                          Pay Confirmation
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    ))}

                  {state === "upcoming" &&
                    step.key === "balance_paid" &&
                    application.status === "confirmation_paid" &&
                    (isNative() ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Complete this step from a web browser.
                      </p>
                    ) : (
                      <Link
                        to={`/checkout/${application.offering_id}?type=balance&app=${application.id}`}
                      >
                        <Button size="sm" className="mt-2">
                          Pay Balance
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Install offer at two value moments (E-3, REQ-INSTALL-1/2) ──
            Purely additive and purely optional. The whole journey — application,
            fee, interview, decision, room — completes in the browser, so this
            gates nothing, covers nothing, and renders NOTHING unless the browser
            has actually handed us a `beforeinstallprompt` to fire (it has not,
            today: no service worker is registered in this repo). Exactly two
            applicant states qualify, both moments where they just GAINED
            something rather than moments where they are trying to get somewhere:
            the ₹400 has landed (interview next), and the seat has been offered.
            The two statuses are mutually exclusive, so at most one ever mounts.
            It sits BELOW the timeline and below every step CTA on purpose: the
            applicant's status and their next action are what the page is for,
            and an offer that pushed them down the page would be the wall this
            requirement exists to prevent. Already-installed native shells see
            nothing at all — that check is `isNative()` inside the hook, which
            asks "is this the installed app?" and is a different question from
            the native Reader Rule guards above, which this block does not
            touch. (The token those guards grep for is deliberately not repeated
            here, so the phase's verification grep stays a clean four hits.)

            BOTH mounts are behind `VITE_INSTALL_NUDGE`, which defaults OFF
            (src/lib/flags.ts). Flag down, this whole block is exactly the empty
            space it was before E-3 — no card, and, upstream of it, no listener
            on `window` and no `preventDefault()` of the browser's own install
            bar. The status conditions below are unchanged; the flag is simply
            the first thing each of them has to get past. */}
        {isInstallNudgeEnabled() && application.status === "app_fee_paid" && (
          <InstallNudge moment="fee-paid" />
        )}
        {isInstallNudgeEnabled() && application.status === "accepted" && (
          <InstallNudge moment="accepted" />
        )}
      </div>
    </div>
  );
};

export default ApplicationStatus;
