/**
 * Pure decision logic for the mobile sticky pay bar on PublicOffering. Kept in
 * its own module, not inline in the page, so the rule is unit-testable without
 * a live IntersectionObserver, and so the page file keeps exporting only its
 * component (React Fast Refresh).
 *
 * The rule: on a phone the buyer always has a price and an Enrol button on
 * screen. The sticky bar is the default. It steps aside only while the inline
 * hero CTA is itself on screen, so the two never show at once.
 *
 * The old rule waited for the inline CTA to scroll off the TOP before the bar
 * could appear. At first paint the inline CTA sat below the fold, so the buyer
 * saw neither (UI/UX audit, 30 Oct 2026, top-10 #2). Direction no longer
 * matters: below the fold or above it, an off-screen inline CTA means the bar
 * shows.
 */

/** How much of the inline CTA must be on screen for the bar to step aside. */
export const INLINE_CTA_ON_SCREEN = 0.5;

/**
 * Height the sticky bar covers at the bottom of the viewport. The observer
 * shrinks its root by this much, so an inline CTA hidden behind the bar does
 * not count as on screen.
 */
export const STICKY_BAR_CLEARANCE_PX = 96;

/**
 * Whether the sticky bar should show for one IntersectionObserver sample.
 * `ratio` is the inline CTA's intersectionRatio against the viewport minus the
 * bar's own band (0 when it is not intersecting at all).
 */
export function stickyBarVisible(ratio: number): boolean {
  return ratio < INLINE_CTA_ON_SCREEN;
}
