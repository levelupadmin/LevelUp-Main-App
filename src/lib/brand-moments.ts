// Stage brand moments: the timelines for the logo intro, the returning-user
// beat and the sign-in moment.
// Target path: src/lib/brand-moments.ts (a sibling of motion.ts).
//
// Same pattern as otpSuccess and decisionReveal in motion.ts: one named
// timeline per moment, seconds for framer `delay`/`duration`, ms only where a
// setTimeout needs it, so the animation, the sound and the haptics can never
// drift apart. Everything that animates the mark imports from here.
//
// Every value here animates TRANSFORM, OPACITY or SVG pathLength only. No
// filter, no backdrop-filter (the Android WebView budget in ORCHESTRATION.md).

// Cubic-bezier used by every arrival in these moments. Slightly softer than
// easings.out; it is what makes the letters "settle" rather than "slide".
export const brandEase = [0.16, 1, 0.3, 1] as const;

// ── brandIntro ── first launch after install only. The name rises letter by
// letter, the four nodes of the rising line draw one after another (each one
// is a note of the sonic logo), "learning" fades up, then the whole thing
// lifts away. Total on screen: hold + out = 3.4s. Skippable after 0.9s.
export const brandIntro = {
  // A thin line of accent light sweeps across the centre (a static 9% accent
  // glow sits behind the mark from the first frame).
  beam: { delay: 0.1, duration: 1.5 },
  // 7 letter paths ("L","e","v","e","l","U","p"): each rises 6% and settles.
  letters: { start: 0.45, stagger: 0.07, duration: 0.9 },
  // 4 nodes. Draw = pathLength 0→1. Pop = scale 0.2→1 on a soft spring.
  nodes: { start: 1.25, stagger: 0.2, draw: 0.45 },
  // 3 connecting lines, each drawn just after the node before it.
  links: { start: 1.36, stagger: 0.2, draw: 0.22 },
  // The "learning" sub-line.
  sub: { delay: 2.05, duration: 0.7 },
  // Optional montage of real catalogue posters behind the mark (see spec 8.2).
  montage: { start: 0.55, stagger: 0.11, duration: 2.3, peakOpacity: 0.45 },
  skipAfter: 0.9, // seconds before the Skip button appears
  holdMs: 2700, // when the exit starts
  outMs: 700, // exit: opacity 1→0, mark scale 1→1.08 (no blur)
} as const;

// Sound + haptic cue times (ms), one per node: 1250, 1450, 1650, 1850.
// Derived from the node timings, never typed by hand.
export const brandIntroNodeCuesMs: readonly number[] = [0, 1, 2, 3].map((i) =>
  Math.round((brandIntro.nodes.start + i * brandIntro.nodes.stagger) * 1000),
);

// ── returnBeat ── cold start for a signed-in learner (not resume, not route
// changes, not deep links). The repo's rule is "a returning student sees their
// momentum within 1 second of opening the app", so the beat only ever covers
// REAL loading and never adds a millisecond:
//   - Home cached (see pickIntroMode) → no beat at all.
//   - Otherwise the beat IS the boot splash, continued: the same full mark,
//     same 132px, same centre, same foreground colour, same gentle opacity
//     breathe. Nothing redraws, nothing changes colour, so the hand-over from
//     index.html's #boot-splash is invisible. The only brand motion is the
//     exit: the moment Home is ready the mark shrinks up into the header
//     wordmark and fades (outMs).
//   - Hard deadline, measured from navigation start (performance.now()), not
//     from mount: the exit must FINISH by deadlineMs. If Home is not ready by
//     latestExitStartMs the beat leaves anyway and Home's skeletons take over.
//     If the app mounts after latestExitStartMs, there is no beat at all.
// Silent, no haptic.
export const returnBeat = {
  outMs: 300, // exit: translateY toward the header + scale to header size + fade
  deadlineMs: 1000, // since navigation start; the exit is finished by then
  latestExitStartMs: 700, // deadlineMs - outMs
  markPx: 132, // matches #boot-splash svg { width: 132px } in index.html
  // matches index.html's boot-splash-pulse: opacity 0.5 → 0.92 → 0.5 over 1.6s
  breathe: { from: 0.5, to: 0.92, period: 1.6 },
} as const;

// ── signInMoment ── the beat after a correct OTP. The digits' existing
// condense (otpSuccess) hands over to this: the rising line draws with a
// ripple on each node while the full sonic logo plays, then the greeting
// fades up, then the overlay lifts to reveal Home (or onboarding).
export const signInMoment = {
  nodes: { start: 0.3, stagger: 0.2, draw: 0.4 },
  links: { start: 0.4, stagger: 0.2, draw: 0.2 },
  ripple: { duration: 1.1, scaleTo: 3.4 },
  text: { delay: 1.0, duration: 0.7 },
  holdMs: 2300, // when the exit starts
  outMs: 650, // exit: graph rises 40px and scales to 0.8 while everything fades
  reducedHoldMs: 900, // reduced motion: static line + text, one crossfade out
  // Sonic logo note offsets (seconds from the first note). The logo starts at
  // nodes.start, so note i lands as node i starts drawing (the 4th note is
  // 20ms late on purpose: a small breath before the last, highest note).
  sonicLogo: [0, 0.2, 0.4, 0.62],
} as const;

// ── emptyDraw ── the rising line drawing itself on empty states, success
// sheets and "you're all caught up" moments. Short and quiet.
export const emptyDraw = {
  nodes: { start: 0.2, stagger: 0.14, draw: 0.5 },
  links: { start: 0.3, stagger: 0.14, draw: 0.2 },
} as const;

// ── loaderLoop ── the rising line as a loader: draw in, hold, draw out, repeat.
export const loaderLoop = {
  period: 1.6, // seconds per loop
  stagger: 0.16,
} as const;
