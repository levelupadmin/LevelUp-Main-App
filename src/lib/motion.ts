// Motion token module — single source of truth for framer-motion physics.
// Mirrors the CSS motion vars in src/index.css:163-169 so JS-driven springs and
// CSS transitions stay in lockstep. Typed, tree-shakeable, no side effects.

import * as React from "react";
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
  // Progress-ring arc sweep. Longer than --motion-slow so the needle's travel
  // reads as a deliberate fill rather than a UI transition. Not a --motion-*
  // var; it's a one-off editorial timing shared by every <ProgressRing>.
  sweep: 700,
  // Slow hero drift. Mirrors the `.kenburns` CSS class (index.css: `animation:
  // motion-kenburns 9s …`) so the JS-driven and CSS-driven ken-burns stay in
  // lockstep. Not a --motion-* var; it's a one-off editorial timing.
  kenburns: 9000,
} as const;

// ── Durations (seconds) ── framer `transition.duration` is in seconds.
export const durations = {
  fast: 0.16, // --motion-fast
  base: 0.24, // --motion-base
  slow: 0.4, // --motion-slow
  sweep: 0.7, // progress-ring arc sweep — mirrors durationsMs.sweep (700ms)
  kenburns: 9, // ken-burns hero drift — mirrors the `.kenburns` CSS class (9s)
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

// ── useFinePointer() ── shared `(pointer: fine)` subscription. A single
// module-level matchMedia listener is fanned out to every subscriber via
// useSyncExternalStore, so a grid of N MotionCards adds ONE listener rather than
// N duplicates and each card re-renders off the same source on pointer-type change.
const FINE_POINTER_QUERY = "(pointer: fine)";

// Lazily-created singleton MediaQueryList — one per document, shared by all hooks.
// Keyed to the current window.matchMedia so that if the environment swaps the
// implementation (e.g. jsdom in tests) the singleton transparently rebuilds; in
// production matchMedia identity is stable, so this stays a true singleton.
let finePointerMql: MediaQueryList | null = null;
let finePointerMqlSource: typeof window.matchMedia | null = null;
const getFinePointerMql = (): MediaQueryList | null => {
  const source =
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia : null;
  if (source !== finePointerMqlSource) {
    finePointerMqlSource = source;
    finePointerMql = source ? source.call(window, FINE_POINTER_QUERY) : null;
  }
  return finePointerMql;
};

// useSyncExternalStore subscribe: attach the single listener on the first
// subscriber and detach it when the last one unsubscribes (reference-counted).
let finePointerListeners = 0;
const subscribeFinePointer = (onChange: () => void): (() => void) => {
  const mql = getFinePointerMql();
  if (!mql) return () => {};
  if (finePointerListeners === 0) {
    mql.addEventListener?.("change", notifyFinePointer);
  }
  finePointerListeners += 1;
  finePointerSubscribers.add(onChange);
  return () => {
    finePointerSubscribers.delete(onChange);
    finePointerListeners -= 1;
    if (finePointerListeners === 0) {
      mql.removeEventListener?.("change", notifyFinePointer);
    }
  };
};

// Fan the single change event out to every React subscriber.
const finePointerSubscribers = new Set<() => void>();
const notifyFinePointer = () => {
  finePointerSubscribers.forEach((cb) => cb());
};

const getFinePointerSnapshot = (): boolean => getFinePointerMql()?.matches ?? false;
// Server render (and non-matchMedia environments): assume coarse — the hover lift
// stays off until the client confirms a fine pointer, matching the old default.
const getFinePointerServerSnapshot = (): boolean => false;

/**
 * True on devices with a fine (mouse/trackpad) pointer. Backed by ONE shared
 * matchMedia listener regardless of how many components call it.
 */
export function useFinePointer(): boolean {
  return React.useSyncExternalStore(
    subscribeFinePointer,
    getFinePointerSnapshot,
    getFinePointerServerSnapshot,
  );
}

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
