import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { motion, useAnimationControls } from "framer-motion";
import type { TargetAndTransition } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DECISION_FLOW, flag } from "@/lib/flags";
import { decisionReveal, useMotionSafe } from "@/lib/motion";
import { isNative } from "@/lib/platform";
import { useDecision } from "@/hooks/useDecision";

/**
 * DecisionReveal — the sealed decision and its full-viewport reveal (REQ-DEC-1/2).
 *
 * READ-ONLY, by rule. The app never writes a funnel status (SOR-1) and there is
 * no in-app admin decision RPC; this screen fires because `useDecision` observed
 * the reconciler's flip to `accepted`. Grep this file for a write: there isn't one.
 *
 * The three kept beats render verbatim: "Your decision is ready" (here and on
 * ApplicationStatus) → "Open your decision" (the seal) → "Claim my seat" (last).
 * Notifications announce only that a decision is READY — no payload carries the
 * verdict, which is why the seal exists at all.
 *
 * The one exception to "verbatim" is the third beat inside a NATIVE shell, where
 * the store rule outranks the copy lock: it keeps its destination and drops its
 * purchase label. This is the most prominent surface in the phase and therefore
 * the likeliest one to be screenshotted into a review, so it is guarded the same
 * way `AcceptanceCard.tsx` is, and for the same reason — the two carry the same
 * CTA and must be changed together. See the note at the CTA below.
 *
 * Motion: transform/opacity only, every value from `decisionReveal` in
 * `src/lib/motion.ts`. The staged timeline settles at 2.3s (`letter` + `beat`),
 * inside the ≤2.6s ceiling; `prefers-reduced-motion` collapses it to one ≤200ms
 * crossfade that STILL reveals the verdict. No blur, no filter, no
 * backdrop-filter — the Android-WebView compositing budget.
 */

/** Staged timeline, or the single reduced-motion/skipped crossfade. */
type RevealMode = "staged" | "crossfade";

/** framer's cubic-bezier tuple. `decisionReveal`'s easings are `as const`, so
    they widen here once rather than at every call site. */
type Bezier = [number, number, number, number];
const EASE_ARRIVE: Bezier = [...decisionReveal.ease];
const EASE_SWEEP: Bezier = [...decisionReveal.ruleEase];

/**
 * One element's place in the timeline, passed through framer's `custom` prop and
 * read back by the single animation definition below. Static, so these are
 * module constants rather than per-render objects.
 */
interface RevealBeat {
  /** Where the element settles. Transform/opacity keys only. */
  to: TargetAndTransition;
  /** Its staged offset from the tap on "Open your decision" (seconds). */
  delay: number;
  /** Arrivals ride --ease-out; the rule sweep rides --ease-in-out. */
  ease: Bezier;
}

const BEAT_CREST: RevealBeat = {
  to: { opacity: 1, scale: 1 },
  delay: decisionReveal.crest,
  ease: EASE_ARRIVE,
};
const BEAT_VERDICT: RevealBeat = {
  to: { opacity: 1, y: 0 },
  delay: decisionReveal.verdict,
  ease: EASE_ARRIVE,
};
const BEAT_RULE: RevealBeat = {
  to: { opacity: 1, scaleX: 1 },
  delay: decisionReveal.rule,
  ease: EASE_SWEEP,
};
const BEAT_LETTER: RevealBeat = {
  to: { opacity: 1, y: 0 },
  delay: decisionReveal.letter,
  ease: EASE_ARRIVE,
};

const DecisionReveal = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const { reduced } = useMotionSafe();
  const { decision, isLoading, isOffline, isError, refetch } = useDecision(applicationId);

  /* Read once, for the CTA label alone. This screen states no figure on any
     platform and nothing else on it is platform-dependent, so the branch stays
     one word wide. It is NOT part of the timeline: the beats, their delays and
     their easings are identical on every platform, so the ≤2.6s ceiling and the
     ≤200ms reduced-motion crossfade are untouched by it. */
  const native = isNative();

  // The seal. Nothing about the outcome is shown until the student opens it.
  const [opened, setOpened] = useState(false);
  // Skipping collapses the staged timeline to the crossfade — the PRD's
  // "skippable at any frame" without a second set of motion values.
  const [skipped, setSkipped] = useState(false);
  const mode: RevealMode = reduced || skipped ? "crossfade" : "staged";

  /* The reveal is driven IMPERATIVELY, and that is load-bearing rather than a
     style choice. framer only re-runs an animation when a target VALUE changed
     or a variant label changed AND its resolved values changed: `transition` is
     stripped before that diff (`buildResolvedTypeValues`) and unchanged keys are
     added to `protectedKeys`. Both modes land on the SAME settled values by
     design — the outcome must never depend on the timing — so a declarative
     `animate` prop cannot express "same destination, get there faster": tapping
     Skip would re-render, flip the label, and leave the 2.3s timeline running
     underneath a control that appears to have done something. Driving it through
     `controls.start()` bypasses that diff entirely: every element is re-issued
     toward the same target with the crossfade transition, so a mid-flight
     element completes in one ≤200ms beat and a settled one simply stays put (no
     remount, so nothing that is already on screen flashes back out).

     Reduced motion never enters the staged branch at all — it mounts in
     crossfade mode and runs exactly one ≤200ms opacity beat. */
  const controls = useAnimationControls();
  useEffect(() => {
    // Nothing is subscribed until the seal is opened and the elements mount.
    if (!opened) return;
    void controls.start((custom: RevealBeat) => ({
      ...custom.to,
      transition:
        mode === "crossfade"
          ? { duration: decisionReveal.reducedCrossfade, delay: 0, ease: EASE_ARRIVE }
          : { duration: decisionReveal.beat, delay: custom.delay, ease: custom.ease },
    }));
  }, [controls, mode, opened]);

  const todaysPath = `/my-application/${applicationId ?? ""}`;

  // Flag off → today's TeleCRM-managed admin + email path, no in-app reveal.
  // <Navigate> renders nothing, so the flag-off surface is byte-identical.
  if (!flag(DECISION_FLOW)) return <Navigate to={todaysPath} replace />;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── The two "no answer yet" states ──
  // Both exist for the same reason: a null decision here does NOT mean "no
  // decision", and redirecting on it lands the student on /my-application/:id,
  // whose own fetch is a raw uncached supabase call that is failing for the same
  // reason and renders "Application Not Found". The emotional peak must not
  // degrade to a not-found page on a flaky connection.
  //
  //   • OFFLINE — react-query PAUSED the read (`networkMode: "online"`). There is
  //     nothing to retry: it resumes itself on the `online` event, so this screen
  //     replaces itself with the reveal the moment the connection returns.
  //   • ERRORED — the read FAILED after its retries. `navigator.onLine` reports
  //     true on the common Android-WebView failures (captive portal, Wi-Fi with
  //     no internet, edge-of-signal mobile data), so this is the branch most of
  //     those take, and it is the one that used to be collapsed into a redirect.
  //     Here it gets its own state, and a retry the student can press.
  //
  // Neither screen names the verdict, or even whether there is one.
  if (isOffline && (!decision || decision.verdict === "pending")) {
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
          lost either. This opens itself the moment you're back online.
        </p>
      </main>
    );
  }

  if (isError && (!decision || decision.verdict === "pending")) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Not loading
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-foreground md:text-3xl">
          This didn't load. It's still here.
        </h1>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          Something went wrong on the way to your application, not with it.
          Nothing has changed and nothing is lost. Try again, or come back in a
          few minutes.
        </p>
        <Button variant="outline" className="mt-8" onClick={() => refetch()}>
          Try again
        </Button>
      </main>
    );
  }

  // No decision has reached the app yet (or this isn't the caller's row) — the
  // status-driven timeline still owns the surface.
  if (!decision || decision.verdict === "pending") {
    return <Navigate to={todaysPath} replace />;
  }

  const admitted = decision.verdict === "accepted";

  /* `initial` is read ONCE, at mount, and the elements mount when the seal
     opens — so it keys off `reduced` (fixed for the session), never off `mode`
     (which Skip can flip afterwards). Under reduced motion the arrival is
     opacity-only: no transform anywhere. */
  const rise = { opacity: 0, y: reduced ? 0 : 16 };

  if (!opened) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {decision.cohort}
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-foreground md:text-3xl">
          Your decision is ready
        </h1>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          It stays sealed until you open it. Take a breath first if you want to.
        </p>
        <Button className="mt-8" onClick={() => setOpened(true)}>
          Open your decision
        </Button>
      </main>
    );
  }

  return (
    <main
      data-reveal-mode={mode}
      className="relative flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center"
    >
      {/* Skippable at any frame — collapses to the same crossfade the
          reduced-motion path uses, so there is only ever one alternate timing.
          This route runs full-bleed (no StudentLayout chrome), so the insets are
          this control's own problem: without them it sits under the Dynamic
          Island / a display cutout, exactly as ChapterViewer's back button would.
          The insets resolve to 0 on Android WebView and desktop web. */}
      {mode === "staged" && (
        <button
          type="button"
          onClick={() => setSkipped(true)}
          className="absolute right-[calc(1rem+env(safe-area-inset-right))] top-[calc(1rem+env(safe-area-inset-top))] font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
        >
          Skip
        </button>
      )}

      {/* F2 — the crest. Scale + opacity only. */}
      <motion.p
        custom={BEAT_CREST}
        initial={{ opacity: 0, scale: reduced ? 1 : 0.92 }}
        animate={controls}
        className="font-mono text-[11px] uppercase tracking-[0.2em] text-cream"
      >
        The admissions panel
      </motion.p>

      {/* F3 — name + verdict. The verdict is in the DOM the moment the seal is
          opened, so no motion preference can ever withhold the outcome. */}
      <motion.div custom={BEAT_VERDICT} initial={rise} animate={controls} className="mt-6">
        {decision.firstName && (
          <p className="text-lg text-muted-foreground md:text-xl">{decision.firstName},</p>
        )}
        <h1 className="mt-1 text-4xl font-semibold text-foreground md:text-5xl">
          {admitted
            ? "you're in."
            : decision.verdict === "waitlisted"
              ? "you're on the waitlist."
              : "not this cohort."}
        </h1>
      </motion.div>

      {/* F4 — the rule sweeps. Admitted only: the quieter path gets the same
          staging without the flourish. scaleX, so it stays transform-only. */}
      {admitted && (
        <motion.div
          custom={BEAT_RULE}
          initial={{ opacity: 0, scaleX: reduced ? 1 : 0 }}
          animate={controls}
          data-testid="decision-rule"
          className="mt-8 h-px w-40 origin-center bg-cream"
        />
      )}

      {/* F5 — the letter, and "Claim my seat" last of all. Personalised from
          STRUCTURED fields only (name, cohort, craft, city) — never the essay. */}
      <motion.div
        custom={BEAT_LETTER}
        initial={rise}
        animate={controls}
        className="mt-8 max-w-md"
      >
        <p className="text-sm text-muted-foreground">
          {decision.cohort}
          {decision.city ? ` · ${decision.city}` : ""}
        </p>

        {admitted ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              The panel read your application twice and wants you in this room.
            </p>
            {/* Beat 3, and the same store guard `AcceptanceCard.tsx` carries:
                on web this is verbatim, on a native shell it keeps its
                destination and drops the purchase label. Both stores bar a
                purchase AFFORDANCE, not merely a checkout link, and this is the
                largest, most screenshot-prone surface in the funnel — "Claim my
                seat" two taps above an ₹8,000 confirmation reads as one to a
                reviewer. The money itself, its figures and its external link
                stay guarded where they live, on ClaimSeat.

                `isNative()`, the test ClaimSeat's own guard already uses — not
                `ContinueOnWebCTA`'s, which is `isIOS()` alone with its Android
                vs web gating left to its callers. The same known gap
                `AcceptanceCard.tsx` records applies
                here and is not restated: `ApplicationStatus.tsx` still ships a
                "Pay Confirmation" checkout Link inside the Play shell on an
                `isIOS()`-only gate, so the shell is not purchase-free yet. That
                surface is the one still to bring in line.

                RELABELLED, not removed. The accepted student on Android reaches
                ClaimSeat — and the instruction to complete the money step in a
                web browser — through this button and the acceptance card behind
                it; deleting it would dead-end them at the reveal, which is the
                failure mode this pass is closing.
                `DecisionReveal.test.tsx` pins both halves, and pins them against
                a RENAME: the label is swept as rendered, and the traversal finds
                this button by `data-testid` so no expected-label string in the
                test can be edited to make a purchase CTA green again. */}
            <Button
              className="mt-8"
              data-testid="decision-forward-cta"
              onClick={() => navigate(`/decision/${applicationId}/accepted`)}
            >
              {native ? "See what's next" : "Claim my seat"}
            </Button>
          </>
        ) : (
          <>
            {/* The dignified path. No artifact, no share affordance, no claim
                CTA — a rejection is never made shareable (REQ-DEC-2 / D-1). */}
            <p className="mt-3 text-sm text-muted-foreground">
              {decision.verdict === "waitlisted"
                ? "A strong application the panel wants to keep in reach. If a seat opens you are first, and your place carries to the next cohort either way."
                : "This is not the end of the road. The panel left a note on what would make the next application stronger, and the door for the next cohort stays open."}
            </p>
            <Button variant="outline" className="mt-8" onClick={() => navigate(todaysPath)}>
              Read the panel's note
            </Button>
          </>
        )}
      </motion.div>
    </main>
  );
};

export default DecisionReveal;
