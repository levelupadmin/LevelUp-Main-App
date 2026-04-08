import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Public coupon validation endpoint. Guests on PublicOffering used to read
 * the `coupons` table directly, but the coupons_read_lockdown migration
 * revoked anon/authenticated SELECT. This function lets the UI preview a
 * discount without exposing the full coupons row (which includes
 * max_redemptions, used_count, admin-only fields).
 *
 * It is intentionally read-only — redemption still happens atomically at
 * capture time inside verify-razorpay-payment / razorpay-webhook.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { coupon_code, offering_id } = await req.json();
    if (!coupon_code || !offering_id) {
      return jsonRes({ valid: false, error: "coupon_code and offering_id are required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: offering, error: offErr } = await admin
      .from("offerings")
      .select("id, price_inr, status, is_public")
      .eq("id", offering_id)
      .maybeSingle();

    if (offErr || !offering) return jsonRes({ valid: false, error: "Offering not found" }, 404);
    if (offering.status !== "active" || !offering.is_public) {
      return jsonRes({ valid: false, error: "Offering not available" }, 400);
    }

    const { data: coupon } = await admin
      .from("coupons")
      .select("id, code, discount_type, discount_value, valid_from, valid_until, max_redemptions, used_count, applies_to_offering_id, is_active")
      .eq("code", String(coupon_code).toUpperCase().trim())
      .eq("is_active", true)
      .maybeSingle();

    if (!coupon) return jsonRes({ valid: false, error: "Invalid coupon" });

    const now = new Date();
    const validFrom = coupon.valid_from ? new Date(coupon.valid_from) : null;
    const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null;
    const withinDates =
      (!validFrom || now >= validFrom) && (!validUntil || now <= validUntil);
    const underMax =
      !coupon.max_redemptions || coupon.used_count < coupon.max_redemptions;
    const appliesToThis =
      !coupon.applies_to_offering_id ||
      coupon.applies_to_offering_id === offering_id;

    if (!withinDates) return jsonRes({ valid: false, error: "Coupon has expired" });
    if (!underMax) return jsonRes({ valid: false, error: "Coupon has reached its limit" });
    if (!appliesToThis) return jsonRes({ valid: false, error: "Coupon does not apply to this offering" });

    const price = Number(offering.price_inr);
    let discountInr = 0;
    if (coupon.discount_type === "percent") {
      discountInr = Math.round((price * Number(coupon.discount_value)) / 100);
    } else {
      discountInr = Math.min(Number(coupon.discount_value), price);
    }

    // Only return fields the UI needs — never expose used_count / max_redemptions.
    // id and code are safe: create-razorpay-order re-fetches and re-validates
    // the coupon row before writing it to payment_orders, so nothing trusts
    // this value alone.
    return jsonRes({
      valid: true,
      id: coupon.id,
      code: coupon.code,
      discount_inr: discountInr,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
    });
  } catch (err) {
    console.error("validate-coupon error:", err);
    return jsonRes({ valid: false, error: "Internal server error" }, 500);
  }
});
