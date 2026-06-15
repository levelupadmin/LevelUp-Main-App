/**
 * Pure pricing math — the single home for "what the customer actually pays".
 *
 * Before this file the discount / GST / paise arithmetic was copy-pasted into
 * create-razorpay-order, guest-create-order, validate-coupon and the checkout
 * UI preview. They happened to agree; this removes the class of bug where they
 * drift after someone edits one copy.
 *
 * IMPORTANT — keep this file dependency-free (no imports; no Deno/Node/DOM-only
 * globals). It is imported by Deno edge functions ("../_shared/pricing.ts") AND
 * bundled into the Vite frontend (the "@shared" alias). An import that exists in
 * only one runtime would break the other.
 *
 * Convention: all amounts are whole rupees (INR) unless a name ends in Paise.
 */

export type GstMode = "inclusive" | "exclusive" | "none" | (string & {}) | null | undefined;
export type DiscountType = "percent" | "flat" | (string & {});

/** Clamp a percentage into [0, 100] so a mis-entered coupon (e.g. 150) can't over-discount. */
export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Coupon discount in rupees against `base`.
 *   percent → round(base * clamp(value, 0, 100) / 100)
 *   flat    → min(value, base)   — never discount more than the base
 *
 * `base` is the caller's responsibility: the full order (price + bumps) at
 * checkout/order creation, price-only on the guest path and the public coupon
 * preview. That difference is intentional, not a bug — see ARCHITECTURE.md.
 */
export function couponDiscountInr(
  discountType: DiscountType,
  discountValue: number,
  base: number,
): number {
  if (discountType === "percent") {
    return Math.round((base * clampPercent(Number(discountValue))) / 100);
  }
  return Math.min(Number(discountValue), base);
}

/**
 * GST in rupees on an already-discounted subtotal, for a resolved rate.
 *   inclusive → tax already inside the price; extract it
 *   exclusive → tax added on top; compute it
 *   anything else ("none" / null) → 0
 *
 * The caller resolves `gstRate` (each runtime keeps its own default), so this
 * stays pure arithmetic with no magic defaults baked in.
 */
export function gstInr(afterDiscount: number, gstMode: GstMode, gstRate: number): number {
  if (gstMode === "inclusive") {
    return Math.round(afterDiscount - afterDiscount / (1 + gstRate / 100));
  }
  if (gstMode === "exclusive") {
    return Math.round((afterDiscount * gstRate) / 100);
  }
  return 0;
}

/**
 * Final payable rupees. Only exclusive GST is added on top of the discounted
 * subtotal; inclusive GST is already contained within it.
 */
export function totalInr(afterDiscount: number, gstMode: GstMode, gst: number): number {
  return gstMode === "exclusive" ? afterDiscount + gst : afterDiscount;
}

/** Rupees → paise. Razorpay charges in the minor unit. */
export function toPaise(inr: number): number {
  return Math.round(inr * 100);
}

export interface CouponWindow {
  valid_from?: string | null;
  valid_until?: string | null;
  max_redemptions?: number | null;
  used_count?: number | null;
  applies_to_offering_id?: string | null;
}

export type CouponInvalidReason =
  | "not_yet_active"
  | "expired"
  | "limit_reached"
  | "not_applicable";

/**
 * Why a coupon is not usable right now, or null if it is. Pure given `now`
 * (the caller passes `new Date()`). Returns the FIRST failing check, in the
 * order date-window → redemption-cap → offering-applicability, so each caller
 * can map the reason to its own message/behaviour (loud error vs. silent skip).
 */
export function couponInvalidReason(
  coupon: CouponWindow,
  offeringId: string,
  now: Date,
): CouponInvalidReason | null {
  const validFrom = coupon.valid_from ? new Date(coupon.valid_from) : null;
  const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null;
  if (validFrom && now < validFrom) return "not_yet_active";
  if (validUntil && now > validUntil) return "expired";
  if (coupon.max_redemptions && (coupon.used_count ?? 0) >= coupon.max_redemptions) {
    return "limit_reached";
  }
  if (coupon.applies_to_offering_id && coupon.applies_to_offering_id !== offeringId) {
    return "not_applicable";
  }
  return null;
}
