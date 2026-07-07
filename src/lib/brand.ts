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
