import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeadersFor } from "../_shared/cors.ts";

/* ── create-free-enrolment ──
   Authenticated path for zero-rupee checkouts. Free offerings advertised
   "Start for free" previously dead-ended for signed-in users: the checkout
   Pay button is disabled at total <= 0, create-razorpay-order rejects
   amounts <= 0, and the only free-capture logic lived in guest-create-order.

   POST { offering_id, coupon_id? }
   Recomputes the total server-side (price + coupon + GST, same rules as
   create-razorpay-order; bumps are deliberately unsupported because any
   bump makes the order paid). Only enrols when the computed total <= 0,
   so a tampered client can't enrol free into a paid offering. */

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonRes({ error: "Sign in to continue" }, 401);
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return jsonRes({ error: "Sign in to continue" }, 401);

    const { offering_id, coupon_id } = await req.json();
    if (!offering_id) return jsonRes({ error: "offering_id is required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: offering, error: offErr } = await admin
      .from("offerings")
      .select("id, title, price_inr, gst_mode, gst_rate, status, payment_mode")
      .eq("id", offering_id)
      .single();
    if (offErr || !offering) return jsonRes({ error: "Offering not found" }, 404);
    if (offering.status !== "published") {
      return jsonRes({ error: "This offering is not available" }, 400);
    }
    if (offering.payment_mode === "staged") {
      return jsonRes({ error: "This offering uses applications, not direct enrolment" }, 400);
    }

    /* Server-side total: price - coupon discount, then GST. Mirrors
       create-razorpay-order's loud-failure coupon validation. */
    const subtotalInr = Number(offering.price_inr ?? 0);
    let discountInr = 0;
    let couponDbId: string | null = null;
    if (coupon_id) {
      const { data: coupon } = await admin
        .from("coupons")
        .select("id, discount_type, discount_value, valid_from, valid_until, max_redemptions, used_count, applies_to_offering_id, is_active")
        .eq("id", coupon_id)
        .maybeSingle();
      if (!coupon || !coupon.is_active) {
        return jsonRes({ error: "This coupon is no longer valid" }, 400);
      }
      const now = new Date();
      if (
        (coupon.valid_from && now < new Date(coupon.valid_from)) ||
        (coupon.valid_until && now > new Date(coupon.valid_until)) ||
        (coupon.max_redemptions && coupon.used_count >= coupon.max_redemptions) ||
        (coupon.applies_to_offering_id && coupon.applies_to_offering_id !== offering_id)
      ) {
        return jsonRes({ error: "This coupon is no longer valid" }, 400);
      }
      couponDbId = coupon.id;
      if (coupon.discount_type === "percent") {
        const pct = Math.min(100, Math.max(0, Number(coupon.discount_value)));
        discountInr = Math.round((subtotalInr * pct) / 100);
      } else {
        discountInr = Math.min(subtotalInr, Math.max(0, Number(coupon.discount_value)));
      }
    }

    const taxable = Math.max(0, subtotalInr - discountInr);
    const gstInr =
      offering.gst_mode === "exclusive"
        ? Math.round(taxable * (Number(offering.gst_rate ?? 0) / 100))
        : 0;
    const totalInr = taxable + gstInr;

    if (totalInr > 0) {
      return jsonRes({ error: "This offering isn't free. Use the regular checkout." }, 400);
    }

    // Duplicate guard (the partial unique index is the real arbiter; this
    // keeps the common path idempotent and quiet).
    const { data: existing } = await admin
      .from("enrolments")
      .select("id")
      .eq("user_id", user.id)
      .eq("offering_id", offering_id)
      .eq("status", "active")
      .maybeSingle();
    if (existing) {
      return jsonRes({ success: true, already_enrolled: true, offering_title: offering.title });
    }

    // Coupon redemption happens at capture, which for a free order is now.
    if (couponDbId) {
      const { data: redeemed, error: redeemErr } = await admin.rpc("redeem_coupon", {
        p_coupon_id: couponDbId,
      });
      if (redeemErr || redeemed === false) {
        return jsonRes(
          { error: "This coupon has just reached its limit. Please try again without it." },
          409
        );
      }
    }

    const { data: po, error: poErr } = await admin
      .from("payment_orders")
      .insert({
        user_id: user.id,
        offering_id,
        subtotal_inr: subtotalInr,
        discount_inr: discountInr,
        gst_inr: gstInr,
        total_inr: 0,
        coupon_id: couponDbId,
        bump_offering_ids: [],
        custom_field_values: {},
        status: "captured",
        captured_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (poErr || !po) {
      console.error("[create-free-enrolment] payment order error:", poErr);
      return jsonRes({ error: "Could not record the enrolment" }, 500);
    }

    const { error: enrolErr } = await admin.from("enrolments").insert({
      user_id: user.id,
      offering_id,
      payment_order_id: po.id,
      status: "active",
      source: "checkout",
      total_paid_inr: 0,
    });
    if (enrolErr && (enrolErr as { code?: string }).code !== "23505") {
      console.error("[create-free-enrolment] enrolment error:", enrolErr);
      return jsonRes({ error: "Could not complete the enrolment" }, 500);
    }

    return jsonRes({
      success: true,
      payment_order_id: po.id,
      offering_title: offering.title,
    });
  } catch (err) {
    console.error("[create-free-enrolment] error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
