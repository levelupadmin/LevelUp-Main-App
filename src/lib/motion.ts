// Motion token module — single source of truth for framer-motion physics.
// Mirrors the CSS motion vars in src/index.css:163-169 so JS-driven springs and
// CSS transitions stay in lockstep. Typed, tree-shakeable, no side effects.

import { useReducedMotion } from "framer-motion";
import type { TargetAndTransition, Transition } from "framer-motion";

// ── Springs ── framer-motion `type: "spring"` presets, tuned per interaction class.
export const springs = {
  // Buttons / toggles — stiff and immediate, no visible overshoot.
  snap: { type: "spring", stiffness: 500, damping: 30 },
  // Screens / sheets — smooth settle for larger surfaces.
  glide: { type: "spring", stiffness: 300, damping: 35 },
  // Celebrations — low damping for a deliberate, visible bounce.
  bounce: { type: "spring", stiffness: 400, damping: 22 },
} as const satisfies Record<string, Transition>;

// Collapses any spring to an instant cut — used under reduced motion.
export const instant = { duration: 0 } as const satisfies Transition;

// ── Durations ── milliseconds, mirroring --motion-fast/base/slow.
export const durationsMs = {
  fast: 160, // --motion-fast
  base: 240, // --motion-base
  slow: 400, // --motion-slow
} as const;

// ── Durations (seconds) ── framer `transition.duration` is in seconds.
export const durations = {
  fast: 0.16, // --motion-fast
  base: 0.24, // --motion-base
  slow: 0.4, // --motion-slow
} as const;

// ── Easings ── cubic-bezier control points, mirroring the CSS --ease-* vars.
export const easings = {
  out: [0.2, 0.8, 0.2, 1], // --ease-out
  inOut: [0.4, 0, 0.2, 1], // --ease-in-out
  spring: [0.34, 1.56, 0.64, 1], // --ease-spring (overshoot curve)
} as const satisfies Record<string, [number, number, number, number]>;

// ── pressTap ── canonical `whileTap` prop: subtle press-in on the snap spring.
export const pressTap = {
  scale: 0.97,
  transition: springs.snap,
} as const satisfies TargetAndTransition;

// Reduced-motion press: state change only, no scale animation.
export const pressTapReduced = {
  transition: instant,
} as const satisfies TargetAndTransition;

// What useMotionSafe() returns — presets pre-resolved for the active preference.
export interface MotionSafe {
  // True when the user has NOT requested reduced motion (animations allowed).
  enabled: boolean;
  // True when reduced motion IS requested (springs collapse to instant).
  reduced: boolean;
  // Spring presets — each collapses to `instant` under reduced motion.
  springs: Record<keyof typeof springs, Transition>;
  // Canonical whileTap prop — drops the scale animation under reduced motion.
  pressTap: TargetAndTransition;
}

// Springs with every preset swapped for an instant cut — reduced-motion variant.
const reducedSprings = {
  snap: instant,
  glide: instant,
  bounce: instant,
} as const satisfies Record<keyof typeof springs, Transition>;

// ── useMotionSafe() ── wraps framer's useReducedMotion (which does NOT honour the
// CSS media query for JS springs) and returns presets that respect the preference.
export function useMotionSafe(): MotionSafe {
  const reduced = useReducedMotion() ?? false;
  return {
    enabled: !reduced,
    reduced,
    springs: reduced ? reducedSprings : springs,
    pressTap: reduced ? pressTapReduced : pressTap,
  };
}
