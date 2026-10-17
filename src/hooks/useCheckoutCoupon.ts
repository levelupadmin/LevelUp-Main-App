import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";

/**
 * The coupon preview the checkout page holds in state. We deliberately do NOT
 * reuse Tables<"coupons"> — that table is locked down (coupons_read_lockdown)
 * and the client should only ever hold the discount-preview fields. id/code are
 * safe: create-razorpay-order re-fetches and re-validates the full coupon row at
 * order time, so nothing here is authoritative.
 */
export interface AppliedCoupon {
  id: string;
  code: string;
  discount_type: "percent" | "flat" | string;
  discount_value: number;
}

/**
 * Coupon entry + apply/remove for the checkout page. All validation goes through
 * the validate-coupon edge function (the table is admin-read-only); it returns
 * only a discount preview, never used_count / max_redemptions.
 */
export function useCheckoutCoupon(offeringId: string | undefined, opts: { probe?: boolean } = {}) {
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  // Does any active coupon apply to this offering? The promo box is shown only
  // when one does (or the link carries ?coupon=). False until the probe answers,
  // and on any failure: a hidden box costs nothing, an empty one sends buyers
  // off to hunt for codes.
  const [couponAvailable, setCouponAvailable] = useState(false);
  const probe = opts.probe !== false;

  useEffect(() => {
    if (!offeringId || !probe) return;
    let cancelled = false;
    supabase.functions
      .invoke("validate-coupon", { body: { offering_id: offeringId, check_available: true } })
      .then(({ data }) => {
        if (!cancelled) setCouponAvailable(data?.available === true);
      })
      .catch(() => {
        /* stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [offeringId, probe]);

  const applyCoupon = useCallback(async (codeOverride?: string) => {
    const code = (typeof codeOverride === "string" ? codeOverride : couponCode).trim().toUpperCase();
    if (!code || !offeringId) return;
    setCouponLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-coupon", {
        body: {
          coupon_code: code,
          offering_id: offeringId,
        },
      });

      if (error || !data?.valid) {
        toast.error(data?.error || "Invalid coupon code");
        return;
      }

      setAppliedCoupon({
        id: data.id,
        code: data.code,
        discount_type: data.discount_type,
        discount_value: Number(data.discount_value),
      });
      toast.success("Coupon applied!");
    } catch {
      toast.error("Error applying coupon");
    } finally {
      setCouponLoading(false);
    }
  }, [couponCode, offeringId]);

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setCouponCode("");
    toast.success("Promo code removed");
  }, []);

  return {
    couponCode,
    setCouponCode,
    appliedCoupon,
    setAppliedCoupon,
    couponLoading,
    couponAvailable,
    applyCoupon,
    removeCoupon,
  };
}
