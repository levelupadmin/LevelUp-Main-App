import { STAGE_ENABLED } from "@/lib/appearance";

// Brand constants for contexts that need a literal color value and cannot
// consume a CSS custom property.
//
// The Razorpay checkout modal is configured in JS via `options.theme.color`,
// which only accepts a static hex string — the modal renders in its own
// iframe/overlay outside our DOM, so `hsl(var(--cream))` is not resolvable
// there. This constant pins that literal to the `--cream` champagne token
// defined in src/index.css:130 (`--cream: 40 60% 87%` → #F3E5C8). If the
// token ever moves, update this hex to match.
export const RAZORPAY_THEME_COLOR = "#F3E5C8" /* hsl(var(--cream)) — src/index.css:130 */;

/**
 * The colour to hand Razorpay's `options.theme.color` (STAGE-BRAND-SPEC
 * 12.1, checkout row): the Stage accent when VITE_BRAND_STAGE is on (Ember
 * #f0561a, or Mono #0f1216 when the person chose Mono), today's champagne
 * when it is off. Read at call time, so an accent switch applies to the next
 * payment without a reload.
 */
export function razorpayThemeColor(): string {
  if (!STAGE_ENABLED) return RAZORPAY_THEME_COLOR;
  return typeof document !== "undefined" && document.documentElement.getAttribute("data-accent") === "mono" ? "#0f1216" : "#f0561a";
}
