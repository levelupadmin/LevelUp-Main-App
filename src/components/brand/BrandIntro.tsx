// The opening brand moment.
// Target path: src/components/brand/BrandIntro.tsx
//
// Two modes (spec section 8):
//   "first"  The first launch on this device, for someone who is not signed
//            in (see pickIntroMode). The lights come down, a thin line of light
//            crosses, the name rises, the four nodes draw (each a note of the
//            sonic logo, each a light haptic), "learning" fades up, the mark
//            lifts away. Skippable after 0.9s. ~3.4s.
//   "return" Cold start for a signed-in learner whose Home is NOT cached yet.
//            The boot splash, continued: the same still mark, size, position,
//            colour and breathe. It leaves the moment Home is ready by
//            shrinking up into the header wordmark. Finished by 1s after
//            navigation start, always. Silent, no haptic.
//
// Never for deep links, notification opens, resume from background, or route
// changes. Mount above the router output; it removes itself via onDone.

import * as React from "react";
import { motion } from "framer-motion";
import { useMotionSafe } from "@/lib/motion";
import { brandEase, brandIntro, returnBeat } from "@/lib/brand-moments";
import { hapticImpact } from "@/lib/haptics";
import { playLogoNote } from "@/lib/sound";
import { LevelUpMark, type NodeIndex } from "@/components/brand/LevelUpMark";
import { markIntroSeen } from "@/lib/intro";


export interface BrandIntroProps {
  mode: "first" | "return";
  /** First launch only: up to 12 already-cached catalogue poster URLs. Omit if none are cached. */
  posters?: string[];
  /** Return mode: true once Home's first query has settled. */
  ready?: boolean;
  onDone: () => void;
}

// Order the montage tiles light up in, so it reads as scattered, not a wipe.
const TILE_ORDER = [4, 9, 1, 6, 11, 2, 7, 0, 10, 5, 3, 8];

export function BrandIntro({ mode, posters = [], ready = true, onDone }: BrandIntroProps) {
  const { reduced } = useMotionSafe();
  const [leaving, setLeaving] = React.useState(false);
  const [canSkip, setCanSkip] = React.useState(false);
  const first = mode === "first";
  const doneRef = React.useRef(false);
  const onDoneRef = React.useRef(onDone);
  onDoneRef.current = onDone;
  const finish = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  React.useEffect(() => {
    if (first) markIntroSeen(); // counted as seen the moment it starts, even if skipped or killed
  }, [first]);

  // When to leave.
  React.useEffect(() => {
    if (leaving) return;
    if (first) {
      const t = window.setTimeout(() => setLeaving(true), reduced ? 700 : brandIntro.holdMs);
      const s = window.setTimeout(() => setCanSkip(true), brandIntro.skipAfter * 1000);
      return () => {
        window.clearTimeout(t);
        window.clearTimeout(s);
      };
    }
    // Return beat: leave the moment Home is ready. Hard deadline from navigation start.
    if (ready) {
      setLeaving(true);
      return;
    }
    const t = window.setTimeout(() => setLeaving(true), Math.max(0, returnBeat.latestExitStartMs - performance.now()));
    return () => window.clearTimeout(t);
  }, [first, ready, reduced, leaving]);

  const outMs = reduced ? 200 : first ? brandIntro.outMs : returnBeat.outMs;

  // Belt and braces: never leave a full-screen layer over the app if the
  // animation-complete callback is missed (tab hidden, WebView throttled).
  React.useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(finish, outMs + 250);
    return () => window.clearTimeout(t);
  }, [leaving, outMs, finish]);

  const onNode = React.useCallback(
    (i: NodeIndex) => {
      if (!first) return; // the return beat is silent
      playLogoNote(i);
      void hapticImpact(i === 3 ? "medium" : "light");
    },
    [first],
  );

  return (
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-background text-foreground"
      initial={false}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: outMs / 1000, ease: [0.65, 0, 0.35, 1] }}
      onAnimationComplete={() => leaving && finish()}
      style={{ pointerEvents: leaving ? "none" : "auto" }}
      aria-hidden={leaving}
    >
      {first && !reduced && (
        <>
          {/* the lights come down: a faint white glow behind the mark */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 45% at 50% 50%, hsl(var(--foreground) / 0.07) 0%, hsl(var(--background)) 70%)",
            }}
          />
          {posters.length >= 6 && (
            <div className="absolute -inset-[3%] grid grid-cols-3 auto-rows-fr gap-1.5">
              {posters.slice(0, 12).map((src, i) => (
                <motion.div
                  key={src}
                  className="overflow-hidden rounded-[4px]"
                  initial={{ opacity: 0, scale: 1.06 }}
                  animate={{ opacity: [0, brandIntro.montage.peakOpacity, 0.35, 0], scale: [1.06, 1.04, 1.02, 1] }}
                  transition={{
                    duration: brandIntro.montage.duration,
                    delay: brandIntro.montage.start + TILE_ORDER[i % 12] * brandIntro.montage.stagger,
                    times: [0, 0.28, 0.7, 1],
                    ease: brandEase,
                  }}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" decoding="async" />
                </motion.div>
              ))}
              {/* keep the centre calm so the name always reads */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(56% 30% at 50% 50%, hsl(var(--background) / 0.94) 0%, hsl(var(--background) / 0.6) 58%, hsl(var(--background) / 0.15) 100%)",
                }}
              />
            </div>
          )}
          {/* a thin line of light crosses behind the name */}
          <motion.div
            className="absolute left-[-20%] right-[-20%] top-1/2 h-px"
            style={{
              background: "linear-gradient(90deg, transparent, hsl(var(--foreground) / 0.8) 50%, transparent)",
              transformOrigin: "center",
            }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: [0, 0.6, 1, 1], opacity: [0, 1, 0.9, 0] }}
            transition={{ duration: brandIntro.beam.duration, delay: brandIntro.beam.delay, times: [0, 0.25, 0.6, 1], ease: brandEase }}
          />
        </>
      )}

      {first ? (
        <motion.div
          className="relative"
          style={{ width: "min(64vw, 300px)" }}
          initial={false}
          animate={leaving ? { scale: 1.08 } : { scale: 1 }} // lifts toward you as it fades
          transition={{ duration: outMs / 1000, ease: [0.65, 0, 0.35, 1] }}
        >
          <LevelUpMark play="intro" onNode={onNode} />
        </motion.div>
      ) : (
        // The boot splash, continued: same still mark, same colour, same breathe.
        <motion.div
          className="relative"
          style={{ width: returnBeat.markPx }}
          initial={{ opacity: reduced ? 1 : returnBeat.breathe.from }}
          animate={
            leaving
              ? { y: "-38vh", scale: 0.6, opacity: 1 } // flies up to where the header wordmark sits (tune to the real header)
              : reduced
                ? { opacity: 1 }
                : { opacity: [returnBeat.breathe.from, returnBeat.breathe.to, returnBeat.breathe.from] }
          }
          transition={
            leaving || reduced
              ? { duration: outMs / 1000, ease: [0.65, 0, 0.35, 1] }
              : { duration: returnBeat.breathe.period, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <LevelUpMark />
        </motion.div>
      )}

      {first && (
        <motion.button
          type="button"
          onClick={() => setLeaving(true)}
          className="absolute right-[18px] rounded-full bg-foreground/10 px-3.5 py-2 text-xs font-semibold text-foreground"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 22px)", pointerEvents: canSkip && !leaving ? "auto" : "none" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: canSkip && !leaving ? 1 : 0 }}
          transition={{ duration: 0.4 }}
          tabIndex={canSkip ? 0 : -1}
          aria-hidden={!canSkip}
        >
          Skip
        </motion.button>
      )}
    </motion.div>
  );
}

export default BrandIntro;
