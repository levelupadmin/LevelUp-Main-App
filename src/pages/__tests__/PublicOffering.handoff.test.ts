import { describe, it, expect } from "vitest";
import { resolveHandoff } from "../publicOfferingHandoff";

/**
 * Regression coverage for the sticky→inline pay-bar handoff (phase-3 punch list).
 *
 * The bug: at scrollY=0 a tall hero leaves the inline Enrol CTA straddling the
 * fold from BELOW — its top edge still on-screen (boundingTop > 0), its bottom
 * clipped — so intersectionRatio reads ~0.5. Scrubbing on that ratio alone parked
 * the bar mid-band (~0.34 opacity), double-exposing two CTAs over the hero. The
 * fix: only engage the scrub once the inline CTA has scrolled off the TOP
 * (boundingTop < rootTop); otherwise the bar is fully ceded.
 */
describe("resolveHandoff", () => {
  const rootTop = 0; // viewport top, no rootMargin

  describe("scroll-0 rest state (the bug)", () => {
    it("cedes fully when the inline CTA straddles the fold from below (ratio ~0.58, top > 0)", () => {
      // scrollY=0: inline CTA top at 664 in an 812px viewport, ratio ~0.58.
      const s = resolveHandoff(0.58, 664, rootTop, false);
      expect(s.opacity).toBe(0);
      expect(s.mounted).toBe(false);
      expect(s.ceded).toBe(true);
    });

    it("cedes fully when the inline CTA is entirely below the fold (ratio 0, top > 0)", () => {
      const s = resolveHandoff(0, 900, rootTop, false);
      expect(s.opacity).toBe(0);
      expect(s.mounted).toBe(false);
    });

    it("never rests mid-scrub for any below-the-fold straddle ratio", () => {
      // Sweep the whole straddle band from below: opacity must be binary 0, not
      // the ~0.34 double-exposure the bug produced.
      for (let ratio = 0; ratio <= 1; ratio += 0.05) {
        const s = resolveHandoff(ratio, 300 /* top > 0 */, rootTop, false);
        expect(s.opacity).toBe(0);
        expect(s.mounted).toBe(false);
      }
    });
  });

  describe("real upward traversal (inline CTA exits via the top)", () => {
    it("lights the bar fully once the inline CTA has scrolled off the top (ratio 0, top < 0)", () => {
      const s = resolveHandoff(0, -300, rootTop, false);
      expect(s.opacity).toBe(1);
      expect(s.mounted).toBe(true);
      expect(s.ceded).toBe(false);
    });

    it("scrubs across the 25%→75% band while exiting via the top", () => {
      // Mid-band: ratio 0.5, top just above the fold. o = (0.75-0.5)/0.5 = 0.5.
      const s = resolveHandoff(0.5, -10, rootTop, false);
      expect(s.opacity).toBeCloseTo(0.5, 5);
      expect(s.scaleX).toBeCloseTo(0.96, 5);
      expect(s.mounted).toBe(true);
    });

    it("is fully lit at/below HANDOFF_START (ratio 0.25)", () => {
      const s = resolveHandoff(0.25, -10, rootTop, false);
      expect(s.opacity).toBe(1);
    });

    it("is faded and ceded past HANDOFF_END (ratio ≥ 0.75)", () => {
      const s = resolveHandoff(0.8, -10, rootTop, false);
      expect(s.opacity).toBe(0);
      expect(s.ceded).toBe(true);
      expect(s.mounted).toBe(false);
    });

    it("scaleX stays within [0.92, 1] across the band", () => {
      for (let ratio = 0; ratio <= 1; ratio += 0.05) {
        const s = resolveHandoff(ratio, -10, rootTop, false);
        expect(s.scaleX).toBeGreaterThanOrEqual(0.92);
        expect(s.scaleX).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("reduced motion (binary swap, still guarded)", () => {
    it("stays ceded at scroll-0 straddle even under reduced motion (top > 0)", () => {
      const s = resolveHandoff(0.3, 664, rootTop, true);
      expect(s.opacity).toBe(0);
      expect(s.mounted).toBe(false);
      expect(s.scaleX).toBe(1); // no scale under reduced motion
    });

    it("swaps on at <50% only once exited via the top", () => {
      const s = resolveHandoff(0.3, -10, rootTop, true);
      expect(s.opacity).toBe(1);
      expect(s.mounted).toBe(true);
      expect(s.scaleX).toBe(1);
    });

    it("swaps off at ≥50% visible", () => {
      const s = resolveHandoff(0.6, -10, rootTop, true);
      expect(s.opacity).toBe(0);
      expect(s.mounted).toBe(false);
    });
  });
});
