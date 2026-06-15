import { useMemo } from "react";
import type { Tables } from "@/integrations/supabase/types";
import {
  couponDiscountInr,
  gstInr as computeGstInr,
  totalInr as computeTotalInr,
} from "@shared/pricing";
import type { AppliedCoupon } from "./useCheckoutCoupon";

type Offering = Tables<"offerings"> & { mrp_inr?: number | null };
type Bump = Tables<"offering_bumps">;
type BumpWithDetail = Bump & { offeringDetail?: Offering };

export interface CheckoutPricingInput {
  offering: Offering | null;
  bumps: BumpWithDetail[];
  selectedBumps: Set<string>;
  appliedCoupon: AppliedCoupon | null;
  isStaged: boolean;
  paymentType: "full" | "app_fee" | "confirmation" | "balance";
  totalPreviouslyPaid: number;
}

export interface CheckoutPricing {
  subtotal: number;
  discount: number;
  afterDiscount: number;
  gstRate: number;
  gstAmount: number;
  total: number;
  mrpInr: number;
  mrpSavings: number;
  totalSavings: number;
}

/**
 * Derives the checkout order summary from the same pricing math the server uses
 * (@shared/pricing), so the preview can't silently disagree with what the buyer
 * is actually charged. The server still recomputes the authoritative total at
 * order creation — this is the on-screen preview only.
 */
export function useCheckoutPricing({
  offering,
  bumps,
  selectedBumps,
  appliedCoupon,
  isStaged,
  paymentType,
  totalPreviouslyPaid,
}: CheckoutPricingInput): CheckoutPricing {
  return useMemo(() => {
    // Subtotal: a single stage amount for staged cohorts, otherwise the
    // offering price plus any selected add-on bumps.
    const subtotal = (() => {
      if (!offering) return 0;
      if (isStaged) {
        if (paymentType === "app_fee") return Number((offering as Offering).app_fee_inr ?? 0);
        if (paymentType === "confirmation") return Number((offering as Offering).confirmation_amount_inr ?? 0);
        if (paymentType === "balance") return Math.max(Number(offering.price_inr) - totalPreviouslyPaid, 0);
      }
      let sum = Number(offering.price_inr);
      for (const bId of selectedBumps) {
        const bump = bumps.find((b) => b.bump_offering_id === bId);
        if (bump) {
          sum += bump.bump_price_override_inr
            ? Number(bump.bump_price_override_inr)
            : Number(bump.offeringDetail?.price_inr ?? 0);
        }
      }
      return sum;
    })();

    const discount = appliedCoupon
      ? couponDiscountInr(appliedCoupon.discount_type, Number(appliedCoupon.discount_value), subtotal)
      : 0;

    const afterDiscount = Math.max(subtotal - discount, 0);

    const gstRate = offering?.gst_mode !== "none" ? Number(offering?.gst_rate ?? 18) : 0;
    const gstAmount = offering ? computeGstInr(afterDiscount, offering.gst_mode, gstRate) : 0;
    const total = offering ? computeTotalInr(afterDiscount, offering.gst_mode, gstAmount) : 0;

    // Combined "you saved" figure: MRP markdown (sticker → price) plus any
    // coupon discount. Only meaningful on full (non-staged) purchases.
    const mrpInr = Number((offering as Offering | null)?.mrp_inr || 0);
    const mrpSavings = !isStaged && mrpInr > subtotal ? mrpInr - subtotal : 0;
    const totalSavings = mrpSavings + discount;

    return { subtotal, discount, afterDiscount, gstRate, gstAmount, total, mrpInr, mrpSavings, totalSavings };
  }, [offering, bumps, selectedBumps, appliedCoupon, isStaged, paymentType, totalPreviouslyPaid]);
}
