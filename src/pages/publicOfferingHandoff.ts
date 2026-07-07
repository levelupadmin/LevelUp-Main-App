/**
 * Pure decision logic for the mobile sticky→inline pay-bar handoff on
 * PublicOffering (INTERACTION-STEALS STEAL #1). Kept in its own module — not
 * inline in the page — so the scrub math and the scroll-0 direction guard are
 * unit-testable without a live IntersectionObserver, and so the page file keeps
 * exporting only its component (React Fast Refresh).
 */

// The inline CTA's visible band the handoff scrubs across: fully lit until it is
// 25% visible, fully ceded once it is 75% visible.
export const HANDOFF_START = 0.25;
export const HANDOFF_END = 0.75;

/** Resolved sticky-bar state for one IntersectionObserver sample. */
export type HandoffState = {
  opacity: number;
  scaleX: number;
  mounted: boolean;
  ceded: boolean;
};

/**
 * Resolve the sticky bar's state from one IntersectionObserver sample of the
 * inline hero CTA.
 *
 * `ratio` is the inline CTA's intersectionRatio; `boundingTop`/`rootTop` are the
 * entry's `boundingClientRect.top` / `rootBounds.top`. The sticky bar only takes
 * over once the inline CTA has scrolled UP and off the TOP of the viewport
 * (`boundingTop < rootTop`). At first paint (scrollY≈0) a tall hero leaves the
 * inline CTA straddling the fold from BELOW — its top edge still on-screen while
 * its bottom is clipped — so the ratio reads low (~0.5) even though the user has
 * not scrolled past it. Scrubbing on that low ratio alone parks the bar mid-band
 * (~0.34 opacity): a double-exposed second CTA over the hero. The guard treats
 * "not yet exited via the top" as fully ceded, so the scrub band only engages
 * during real upward traversal — geometry, not just ratio, decides the handoff.
 */
export function resolveHandoff(
  ratio: number,
  boundingTop: number,
  rootTop: number,
  reduced: boolean,
): HandoffState {
  const exitingViaTop = boundingTop < rootTop;
  if (reduced) {
    // Instant swap at 50%: lit while the inline CTA is minority-visible AND it has
    // actually scrolled off the top; gone otherwise. No scrub, no scale.
    const show = exitingViaTop && ratio < 0.5;
    return { opacity: show ? 1 : 0, scaleX: 1, mounted: show, ceded: !show };
  }
  if (!exitingViaTop) {
    // Inline CTA is at/below the fold (page top or below-fold on load): cede fully
    // so the parked rest state is binary, never mid-scrub.
    return { opacity: 0, scaleX: 0.92, mounted: false, ceded: true };
  }
  // Scrub opacity 1→0 (and scaleX 1→0.92) across the 25%→75%-visible band.
  const o = Math.min(
    1,
    Math.max(0, (HANDOFF_END - ratio) / (HANDOFF_END - HANDOFF_START)),
  );
  return {
    opacity: o,
    scaleX: 0.92 + 0.08 * o,
    // Keep the bar mounted through the whole scrub, unmount once ceded so the
    // slide-down exit tween runs on an already-faded (invisible) bar.
    mounted: ratio < HANDOFF_END,
    ceded: o < 0.5,
  };
}
