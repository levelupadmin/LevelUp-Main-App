// The sign-in moment: the beat between a correct OTP and the app.
// Target path: src/components/brand/SignInMoment.tsx
//
// Used by every place a correct OTP lands a learner in the app: Login, Signup
// and ClaimApplication (all three run the OtpEntryStep success path today).
//
// Hand-off: OtpEntryStep's digits condense (otpSuccess) as today. Instead of
// the champagne check, mount this overlay. The rising line draws node by node
// with a ripple on each; the full sonic logo starts on the first node (audio
// is unlocked: the learner just typed six digits) and four haptic taps land
// with the four notes; then the greeting fades up; then everything lifts away
// to reveal Home (or onboarding for a first sign-in). Tap anywhere after 1s to
// skip straight in: returning learners should never feel held.
//
// Copy, by case (spec section 11):
//   returning learner   eyebrow "Welcome back"      title first name, e.g. "Arjun"
//   first sign-in       eyebrow "You're in"         title first name, or "Let's set you up" if no name yet

import * as React from "react";
import { motion } from "framer-motion";
import { useMotionSafe } from "@/lib/motion";
import { brandEase, signInMoment } from "@/lib/brand-moments";
import { hapticImpact } from "@/lib/haptics";
import { playSonicLogo } from "@/lib/sound";
import { LevelUpMark, type NodeIndex } from "@/components/brand/LevelUpMark";

export interface SignInMomentProps {
  eyebrow: string;
  title: string;
  /** Fires when the overlay starts to leave: navigate / render Home underneath here. */
  onReveal?: () => void;
  /** Fires once the overlay is gone. Unmount it here. */
  onDone: () => void;
}

const SKIP_AFTER_MS = 1000;

export function SignInMoment({ eyebrow, title, onReveal, onDone }: SignInMomentProps) {
  const { reduced } = useMotionSafe();
  const [leaving, setLeaving] = React.useState(false);
  const mountedAt = React.useRef(performance.now());
  const revealRef = React.useRef(onReveal);
  const doneRef = React.useRef(onDone);
  revealRef.current = onReveal;
  doneRef.current = onDone;
  const revealed = React.useRef(false);
  const finished = React.useRef(false);

  const leave = React.useCallback(() => {
    if (revealed.current) return;
    revealed.current = true;
    setLeaving(true);
    revealRef.current?.();
  }, []);
  const finish = React.useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    doneRef.current();
  }, []);

  React.useEffect(() => {
    // Reduced motion: no sound and no staged draw, but one tap so the success is still felt.
    if (reduced) void hapticImpact("medium");
    const t = window.setTimeout(leave, reduced ? signInMoment.reducedHoldMs : signInMoment.holdMs);
    return () => window.clearTimeout(t);
  }, [reduced, leave]);

  const outMs = reduced ? 150 : signInMoment.outMs;
  // Never strand a full-screen layer if the animation callback is missed.
  React.useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(finish, outMs + 250);
    return () => window.clearTimeout(t);
  }, [leaving, outMs, finish]);

  // Sound and haptics start from the SAME cue (LevelUpMark's node timer). The
  // notes then run on the audio clock, so they land within ~50ms of their
  // taps (the 4th note has a deliberate 20ms breath). Close enough to feel as one.
  const onNode = React.useCallback((i: NodeIndex) => {
    if (i === 0) playSonicLogo();
    void hapticImpact(i === 3 ? "medium" : "light");
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-[30px] text-foreground"
      style={{
        background: "radial-gradient(70% 45% at 50% 42%, hsl(var(--foreground) / 0.07) 0%, hsl(var(--background)) 72%)",
        pointerEvents: leaving ? "none" : "auto",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: leaving ? outMs / 1000 : 0.3, ease: brandEase }}
      onAnimationComplete={() => leaving && finish()}
      onClick={() => {
        if (performance.now() - mountedAt.current > SKIP_AFTER_MS) leave();
      }}
      role="status"
      aria-live="polite"
    >
      <motion.div
        className="w-[64%] max-w-[320px]"
        initial={false}
        animate={leaving && !reduced ? { y: -40, scale: 0.8 } : { y: 0, scale: 1 }}
        transition={{ duration: outMs / 1000, ease: [0.65, 0, 0.35, 1] }}
      >
        <LevelUpMark play="signin" showWord={false} title="" onNode={onNode} />
      </motion.div>

      <motion.div
        className="px-6 text-center"
        initial={reduced ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: signInMoment.text.duration, delay: signInMoment.text.delay, ease: brandEase }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        <p className="mt-2.5 font-display text-[32px] font-bold leading-[1.05] tracking-[-0.035em]">{title}</p>
      </motion.div>
    </motion.div>
  );
}

export default SignInMoment;
