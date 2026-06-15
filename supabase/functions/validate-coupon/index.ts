import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeaders } from "../_shared/cors.ts";
import { couponDiscountInr, couponInvalidReason } from "../_shared/pricing.ts";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Public coupon validation endpoint. Guests on PublicOffering used to read
 * the `coupons` table directly, but the coupons_read_lockdown migration
 * revoked anon/authenticated SELECT. This function lets the UI preview a
 * discount without exposing the full coupons row (which includes
 * max_redemptions, used_count, admin-only fields).
 *
 * It is intentionally read-only; redemption still happens atomically at
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

    // ── Rate limit: 20 coupon probes per 15 min per (ip, offering). ──
    // Without this the endpoint is a public coupon oracle: an attacker
    // could brute-force short alpha codes (ABC, LAUNCH, etc.) at
    // thousands of rps. 20/15min is generous enough for a real shopper
    // who mis-types a few times but cuts automated scanners off early.
    const ip = getClientIp(req);
    const { data: rlAllowed, error: rlErr } = await admin.rpc(
      "check_and_increment_rate_limit",
      {
        p_key: `validate-coupon:${ip}:${offering_id}`,
        p_max_count: 20,
        p_window_seconds: 900,
      }
    );
    if (rlErr) {
      console.error("rate-limit rpc failed:", rlErr);
      return jsonRes({ valid: false, error: "Internal error" }, 500);
    }
    if (rlAllowed === false) {
      return jsonRes({ valid: false, error: "Too many requests" }, 429);
    }

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

    // Validity (dates / cap / applicability) is shared with the order paths.
    // This preview has always shown a single "expired" message for any date
    // failure, so not_yet_active maps there too (behaviour preserved).
    const reason = couponInvalidReason(coupon, offering_id, new Date());
    if (reason === "not_yet_active" || reason === "expired") {
      return jsonRes({ valid: false, error: "Coupon has expired" });
    }
    if (reason === "limit_reached") return jsonRes({ valid: false, error: "Coupon has reached its limit" });
    if (reason === "not_applicable") return jsonRes({ valid: false, error: "Coupon does not apply to this offering" });

    // Public preview discounts the base price only (bumps are chosen later, on
    // the checkout page). That's an intentional difference from the order paths.
    const price = Number(offering.price_inr);
    const discountInr = couponDiscountInr(coupon.discount_type, Number(coupon.discount_value), price);

    // Only return fields the UI needs. Never expose used_count / max_redemptions.
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
