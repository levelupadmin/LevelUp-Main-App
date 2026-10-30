import { describe, it, expect } from "vitest";
import { INLINE_CTA_ON_SCREEN, stickyBarVisible } from "../publicOfferingHandoff";

/**
 * The mobile sticky pay bar (UI/UX audit, 30 Oct 2026, top-10 #2).
 *
 * The old rule kept the bar hidden until the inline Enrol CTA had scrolled off
 * the TOP of the screen. At first paint that CTA sat below the fold, so a phone
 * buyer saw neither a price nor a button. The rule now ignores direction: the
 * bar shows whenever the inline CTA is off screen, and steps aside only while
 * it is on screen, so exactly one is in view.
 */
describe("stickyBarVisible", () => {
  it("shows the bar at first paint when the inline CTA is below the fold", () => {
    // Not intersecting at all: the observer reports ratio 0.
    expect(stickyBarVisible(0)).toBe(true);
  });

  it("shows the bar when the inline CTA only peeks in at the fold", () => {
    expect(stickyBarVisible(0.25)).toBe(true);
  });

  it("hides the bar while the inline CTA is on screen", () => {
    expect(stickyBarVisible(INLINE_CTA_ON_SCREEN)).toBe(false);
    expect(stickyBarVisible(0.75)).toBe(false);
    expect(stickyBarVisible(1)).toBe(false);
  });

  it("is a clean switch with no in-between state", () => {
    for (let ratio = 0; ratio <= 1; ratio += 0.05) {
      expect(stickyBarVisible(ratio)).toBe(ratio < INLINE_CTA_ON_SCREEN);
    }
  });
});
