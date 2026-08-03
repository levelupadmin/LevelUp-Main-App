import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DECISION_FLOW, flag } from "@/lib/flags";
import { isNative } from "@/lib/platform";
import { useDecision } from "@/hooks/useDecision";

/**
 * The locked future view (REQ-DEC-4 · DL-018 · FLOW-FEEDBACK-R1 §9i).
 *
 * There is NO seat number on this card, and no count of any kind that could
 * stand in for one. Rahul's §9i correction: a low number signals an empty
 * cohort, so scarcity-by-number is replaced by desire — the student SEES the
 * shape of what is inside, and confirming is what unlocks it.
 *
 * VEIL-SOURCE-1 / MEMBER-1: an `accepted` student holds ZERO read grant into any
 * room-content table and there is no preview RPC to call. This list is therefore
 * static chrome — the same marketing-class copy the public offering page already
 * carries. It reads no room row, so the veil can never leak one.
 */
const LOCKED_PREVIEWS = [
  {
    title: "The cohort room",
    teaser: "Your batch, your mentors and every week of the build, in one place.",
  },
  {
    title: "Week one",
    teaser: "The first brief lands the day the cohort opens.",
  },
  {
    title: "Mentor reviews",
    teaser: "Your work read line by line, on the record.",
  },
  {
    title: "Your cohort-mates",
    teaser: "The people you will be making things alongside.",
  },
  {
    title: "Sessions and resources",
    teaser: "Every session kept for the length of the cohort.",
  },
] as const;

/**
 * AcceptanceCard — the status beat between the reveal and the claim (REQ-DEC-4).
 *
 * Route: `/decision/:applicationId/accepted`, full-bleed and auth-guarded.
 *
 * READ-ONLY, like every surface in this phase: it renders what `useDecision`
 * observed and writes nothing. NFR-COPY-1 holds structurally — the only student
 * data on this card is `firstName` and `cohort`, both structured fields off
 * `useDecision`, which never selects `bio` or `tally_data`.
 *
 * Motion is transform/opacity only (`fade-in-up` via the shared `.stagger-in`
 * idiom), so reduced motion collapses it and leaves the content in place. No
 * blur or filter: the Android-WebView compositing budget.
 *
 * **Store guard:** the forward CTA keeps its destination on every platform and
 * loses its purchase LABEL on the native shells, on the same `isNative()` test
 * ClaimSeat's own guard uses. See the note at the CTA for why the label is the
 * guarded thing here, and for the one surface still out of line with it.
 */
const AcceptanceCard = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { decision, isLoading, isOffline } = useDecision(applicationId);

  /* Read once and used for the label alone: this card states no figure on any
     platform, so there is nothing else on it for a platform branch to own. */
  const native = isNative();

  const todaysPath = `/my-application/${applicationId ?? ""}`;

  // Flag off → today's TeleCRM-managed admin + email path. <Navigate> renders
  // nothing, so the flag-off surface is byte-identical.
  if (!flag(DECISION_FLOW)) return <Navigate to={todaysPath} replace />;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Offline with no answer yet. `useDecision` PAUSES rather than fails
  // (react-query's `networkMode: "online"`), so a null decision here is "no
  // answer", not "no decision" — and redirecting on it lands the student on
  // /my-application/:id, whose own fetch is a raw uncached supabase call that
  // fails offline and renders "Application Not Found". Same branch, and same
  // reason, as DecisionReveal: this card holds instead of degrading to a
  // not-found page. react-query resumes the paused fetch on the `online` event,
  // so it replaces itself the moment the connection returns.
  if (isOffline && (!decision || decision.verdict !== "accepted")) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Offline
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-foreground md:text-3xl">
          We'll have this for you in a moment
        </h1>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          You're not connected right now, so nothing is loading yet. Nothing is
          lost either. Your seat is not affected by this, and this page opens
          itself the moment you're back online.
        </p>
      </main>
    );
  }

  // This card is the ACCEPTED surface only. A rejection, a waitlist or a
  // decision that has not reached the app yet belongs to DecisionReveal and the
  // status timeline — never here, and never implied by this page rendering.
  if (!decision || decision.verdict !== "accepted") {
    return <Navigate to={todaysPath} replace />;
  }

  return (
    <main className="min-h-screen bg-canvas">
      {/* This route is full-bleed (App.tsx registers it OUTSIDE StudentLayout,
          like ChapterViewer), so nothing above it supplies the safe-area
          insets and `index.html` ships `viewport-fit=cover`. A flat `py-10` is
          40px against a ~59px top inset, which puts the "Accepted" eyebrow and
          part of the headline under the Dynamic Island and the last link on the
          home indicator. The insets are 0 on Android WebView and web, so this
          resolves to the same 40/56px there. */}
      <div className="mx-auto max-w-2xl px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] md:px-8 md:pt-[calc(3.5rem+env(safe-area-inset-top))] md:pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <header className="motion-safe:animate-fade-in-up">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--cream))]/70">
            Accepted
          </p>
          <h1 className="mt-3 text-2xl font-bold text-foreground md:text-3xl">
            {decision.firstName ? `You're in, ${decision.firstName}.` : "You're in."}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {decision.cohort
              ? `A seat in ${decision.cohort} is yours to take.`
              : "A seat is yours to take."}
          </p>
        </header>

        <section className="mt-10" aria-labelledby="locked-future-heading">
          <h2 id="locked-future-heading" className="text-sm font-medium text-foreground">
            What is waiting behind the lock
          </h2>
          {/* `.stagger-in` (src/index.css) is the repo's stagger idiom and the
              only correct one here: it sets `opacity: 0` on each child AND
              `animation-fill-mode: forwards`, so a delayed item starts hidden
              instead of painting at full opacity for its delay and then
              snapping back to the keyframe's `opacity: 0`. The Tailwind
              `animate-fade-in-up` utility has neither, so it cannot carry a
              delay. Transform/opacity only, and the global
              `prefers-reduced-motion: reduce` block collapses the duration so
              reduced-motion readers get the list already in place. */}
          <ul className="stagger-in mt-3 space-y-2">
            {LOCKED_PREVIEWS.map((item) => (
              <li
                key={item.title}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">Locked</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground/80">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground/70">
                    {item.teaser}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Confirming your seat is what opens these.
          </p>
        </section>

        {/* Beat 3 of REQ-DEC-1. On web it renders verbatim; on a native shell it
            keeps its DESTINATION and drops its purchase label.

            This replaces the reasoning that used to sit here — "this is
            navigation, not a payment entry point: the money CTA and its iOS
            guard live on ClaimSeat" — which is true about where the money is and
            is the wrong test. Play's Reader Rule (Path B) and Apple's 3.1.1 bar
            a purchase AFFORDANCE, not only a checkout link, and a full-width
            "Claim my seat" one tap above an ₹8,000 confirmation is read as one
            by a reviewer who never sees our route table. The LABEL is what is
            guarded here. ClaimSeat's guard over the amounts and the checkout
            link is untouched and is still the guard that owns the money.

            The test is `isNative()`, the same one ClaimSeat and the policy in
            `src/lib/platform.ts` use: the Play shell is to carry no purchase UI
            at all under Path B, and Apple bars both the purchase and the steer
            toward one. `ContinueOnWebCTA` is deliberately NOT cited as a
            precedent for that test — it branches on `isIOS()` alone, and
            whether it renders at all on Android vs web is decided entirely by
            its callers. It does not self-guard, and a maintainer who reads it as
            though it did would drop a caller-side gate and ship the Play-only
            "Continue on web" bounce to desktop web.

            The KNOWN GAP in that claim, stated here rather than papered over:
            `ApplicationStatus.tsx` still renders a "Pay Confirmation" checkout
            Link inside the Play shell behind an `isIOS()`-only gate, and it is
            the page this card redirects to and links back to. So the Play shell
            is not purchase-free today. That surface is outside this pass, and it
            is the one left to bring in line — not a reason to leave these two
            out of line, and not licence to describe the shell as already clean.

            And it is a RELABEL, never a deletion. Deleting it would leave an
            accepted Android student stranded on this card with no route to
            ClaimSeat, which is where the money step is explained and where the
            instruction to complete it in a web browser lives — the same
            dead-end this pass exists to close, moved one surface upstream. The native label also has to keep its forward momentum
            without borrowing the SECOND link's job below — this one IS the next
            step, that one describes it — which is why it reads as a move
            forward rather than as a second "see the details". `DecisionReveal.tsx`
            carries the identical treatment for the identical reason: the two are
            one decision surface pair, they change together, and
            `AcceptanceCard.test.tsx` / `DecisionReveal.test.tsx` pin both halves
            — no purchase affordance under ANY name (the sweep is on the rendered
            label, not on an expected string), and the path forward still
            traversable, found by `data-testid` so a rename cannot be made green
            by editing the test. */}
        <div className="mt-8">
          <Link to={`/decision/${applicationId}/claim`} className="block">
            <Button size="lg" className="w-full" data-testid="decision-forward-cta">
              {native ? "Continue to the next step" : "Claim my seat"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
          {/* Reading material, on both platforms: EnrollmentDetails carries its
              own guard over the figures.

              The copy change here is a consequence of the guard above, and this
              comment is its only record, so it is stated plainly: this link read
              "Read what happens when you claim" before this pass, and that
              wording cannot survive inside a native shell. The store rule is
              about affordances, and a LINK is one — a button that has just given
              up the word "claim" sitting above a link that still says it puts
              the same purchase word back on the same screen. It is one string on
              both platforms rather than a second platform branch: the neutral
              phrasing is equally true on web, and a reading link is not worth
              the branch or the second label to keep in step. */}
          <Link
            to={`/decision/${applicationId}/details`}
            className="mt-3 block text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Read what the next step involves
          </Link>
        </div>

        {/* Lapse behaviour, said on the FIRST surface that mentions a window at
            all rather than buried at the deadline. It removes the resentment a
            hidden deadline creates, and it is true: release is a manual admin
            action in v1 (SEAT-1) and the acceptance is not spent by missing a
            batch. It promises exactly what ClaimSeat's lapsed branch delivers —
            the ACCEPTANCE survives the window — and no more than that. This is
            the pre-deadline surface, and the most screenshotted one; saying
            here that the confirmation step itself outlives the countdown would
            spend the v1 conversion lever (REQ-DEC-5) before it is pulled. The
            lapsed screen is where the way forward is offered.

            The seat clause is HEDGED and in the future tense, and must stay
            that way: SEAT-1 means nothing happens at the deadline by itself, so
            "the seat goes back to the list" would be a promise about an event
            no clock performs — and ClaimSeat's lapsed screen tells the same
            student, correctly, that their seat may well still be open. Two
            surfaces disagreeing about one seat is the defect this flow was
            rewritten to remove; it does not get to return as copy. Keep this
            sentence and ClaimSeat's pre-deadline footnote saying the same
            thing. */}
        <p className="mt-8 rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
          Your seat is held for a window. If the window closes before you
          confirm, we may pass the seat to someone else in this batch, but your
          acceptance stays valid and carries to the next batch. Being accepted is
          not something you lose by being slow.
        </p>

        <Link
          to={todaysPath}
          className="mt-6 block text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Back to your application
        </Link>
      </div>
    </main>
  );
};

export default AcceptanceCard;
