/**
 * The masterclass refund rule, in the exact words the marketing site uses
 * (levelupnewsite src/data/masterclass/shared.ts, REFUND.sentence / .short).
 * One rule everywhere: full refund within 7 days of buying, if the buyer has
 * watched less than a quarter of the course. Change it on the site and here
 * together, never one alone.
 *
 * It applies to masterclasses only (offerings.product_tier = "masterclass").
 * Live programmes, workshops and their resource bundles have their own terms
 * (see the app's /refunds page), so callers must check `watchRuleApplies`.
 *
 * Pure and dependency-free: used by the browser (via `@shared`) and by Deno.
 */

export const MASTERCLASS_REFUND_DAYS = 7;

/** Full sentence: checkout, offering page, receipts, the /refunds page. */
export const MASTERCLASS_REFUND_SENTENCE =
  "Full refund within 7 days of buying, if you have watched less than a quarter of the course.";

/** Short form for tight spots. */
export const MASTERCLASS_REFUND_SHORT = "Full refund within 7 days if you've watched less than a quarter.";

/** The site's refund policy page. */
export const SITE_REFUND_POLICY_URL = "https://www.leveluplearning.in/refund-policy";

/** True when the masterclass rule is the one that applies to this offering. */
export function watchRuleApplies(productTier: string | null | undefined): boolean {
  return (productTier ?? "").trim().toLowerCase() === "masterclass";
}

function validDays(days: number | null | undefined): number {
  const n = Math.floor(Number(days ?? MASTERCLASS_REFUND_DAYS));
  return Number.isFinite(n) && n > 0 ? n : MASTERCLASS_REFUND_DAYS;
}

/**
 * The sentence for an offering's refund window. Seven days (every masterclass
 * today) gives the site's exact words; another window keeps the same rule with
 * that number, so the page never states a window the offering does not have.
 */
export function masterclassRefundSentence(days?: number | null): string {
  const n = validDays(days);
  return n === MASTERCLASS_REFUND_DAYS
    ? MASTERCLASS_REFUND_SENTENCE
    : `Full refund within ${n} days of buying, if you have watched less than a quarter of the course.`;
}

export function masterclassRefundShort(days?: number | null): string {
  const n = validDays(days);
  return n === MASTERCLASS_REFUND_DAYS
    ? MASTERCLASS_REFUND_SHORT
    : `Full refund within ${n} days if you've watched less than a quarter.`;
}
