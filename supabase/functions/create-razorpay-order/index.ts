import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeaders } from "../_shared/cors.ts";

function encodeBase64(str: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    /* ── Auth ── */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return jsonRes({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims)
      return jsonRes({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    /* ── Input ── */
    const { offering_id, coupon_id, bump_ids, custom_field_values } =
      await req.json();
    if (!offering_id)
      return jsonRes({ error: "offering_id is required" }, 400);
    if (
      custom_field_values &&
      typeof custom_field_values === "object" &&
      JSON.stringify(custom_field_values).length > 10000
    )
      return jsonRes({ error: "custom_field_values too large" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* ── Offering ── */
    const { data: offering, error: offErr } = await admin
      .from("offerings")
      .select("id, title, price_inr, gst_mode, gst_rate, status")
      .eq("id", offering_id)
      .single();
    if (offErr || !offering)
      return jsonRes({ error: "Offering not found" }, 404);
    if (offering.status !== "active")
      return jsonRes({ error: "Offering is not active" }, 400);

    /* ── Bumps ── */
    let bumpTotal = 0;
    const validBumpIds: string[] = [];
    if (bump_ids && Array.isArray(bump_ids) && bump_ids.length > 20)
      return jsonRes({ error: "Too many bump selections" }, 400);
    if (bump_ids && Array.isArray(bump_ids) && bump_ids.length > 0) {
      const { data: bumps } = await admin
        .from("offering_bumps")
        .select("bump_offering_id, bump_price_override_inr")
        .eq("parent_offering_id", offering_id)
        .in("bump_offering_id", bump_ids);

      if (bumps) {
        for (const b of bumps) {
          // Verify the bump offering itself is active
          const { data: bo } = await admin
            .from("offerings")
            .select("price_inr, status")
            .eq("id", b.bump_offering_id)
            .single();
          if (!bo || bo.status !== "active") continue; // skip inactive bumps

          if (b.bump_price_override_inr != null) {
            bumpTotal += Number(b.bump_price_override_inr);
          } else {
            if (bo) bumpTotal += Number(bo.price_inr);
          }
          validBumpIds.push(b.bump_offering_id);
        }
      }
    }

    /* ── Coupon ── */
    let discountInr = 0;
    let couponDbId: string | null = null;
    if (coupon_id) {
      const { data: coupon } = await admin
        .from("coupons")
        .select("*")
        .eq("id", coupon_id)
        .eq("is_active", true)
        .single();

      if (coupon) {
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

        if (withinDates && underMax && appliesToThis) {
          couponDbId = coupon.id;
          const subtotalBeforeDiscount =
            Number(offering.price_inr) + bumpTotal;
          if (coupon.discount_type === "percent") {
            discountInr = Math.round(
              (subtotalBeforeDiscount * Number(coupon.discount_value)) / 100
            );
          } else {
            discountInr = Math.min(
              Number(coupon.discount_value),
              subtotalBeforeDiscount
            );
          }
        }
      }
    }

    /* ── Totals ── */
    const subtotalInr = Number(offering.price_inr) + bumpTotal;
    const afterDiscount = Math.max(subtotalInr - discountInr, 0);
    let gstInr = 0;
    if (offering.gst_mode === "inclusive") {
      gstInr = Math.round(
        afterDiscount - afterDiscount / (1 + Number(offering.gst_rate || 18) / 100)
      );
    } else if (offering.gst_mode === "exclusive") {
      gstInr = Math.round(
        (afterDiscount * Number(offering.gst_rate || 18)) / 100
      );
    }
    const totalInr =
      offering.gst_mode === "exclusive" ? afterDiscount + gstInr : afterDiscount;

    if (totalInr <= 0)
      return jsonRes({ error: "Total must be > 0" }, 400);

    const amountPaise = Math.round(totalInr * 100);

    /* ── Idempotency ──
       If the user already has a recent 'created' payment_order for the
       same offering + total + bump set + coupon that hasn't been captured
       or failed yet, reuse the already-placed Razorpay order instead of
       creating a duplicate. Stops double-click / retry storms from
       littering payment_orders and razorpay with zombie rows and lets
       the user land on a consistent payment modal state. */
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: existingPending } = await admin
      .from("payment_orders")
      .select("id, total_inr, razorpay_order_id, bump_offering_ids, coupon_id")
      .eq("user_id", userId)
      .eq("offering_id", offering_id)
      .eq("status", "created")
      .gte("created_at", tenMinAgo)
      .order("created_at", { ascending: false })
      .limit(5);

    if (existingPending && existingPending.length > 0) {
      const sortedNewBumps = [...validBumpIds].sort().join(",");
      const match = existingPending.find((row: any) => {
        const rowBumps = Array.isArray(row.bump_offering_ids)
          ? [...row.bump_offering_ids].sort().join(",")
          : "";
        return (
          Number(row.total_inr) === totalInr &&
          rowBumps === sortedNewBumps &&
          (row.coupon_id ?? null) === (couponDbId ?? null) &&
          row.razorpay_order_id
        );
      });
      if (match) {
        return jsonRes({
          razorpay_order_id: match.razorpay_order_id,
          amount: amountPaise,
          currency: "INR",
          key_id: Deno.env.get("RAZORPAY_KEY_ID")?.trim(),
          payment_order_id: match.id,
          offering_title: offering.title,
          reused: true,
        });
      }
    }

    /* ── payment_orders row ── */
    const { data: po, error: poErr } = await admin
      .from("payment_orders")
      .insert({
        user_id: userId,
        offering_id,
        subtotal_inr: subtotalInr,
        discount_inr: discountInr,
        gst_inr: gstInr,
        total_inr: totalInr,
        coupon_id: couponDbId,
        bump_offering_ids: validBumpIds.length ? validBumpIds : [],
        custom_field_values: custom_field_values || {},
        status: "created",
      })
      .select("id")
      .single();

    if (poErr || !po)
      return jsonRes({ error: "Failed to create payment order" }, 500);

    /* ── Razorpay order ── */
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID")?.trim();
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();
    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error("Razorpay keys not configured");
      return jsonRes({ error: "Payment system not configured" }, 500);
    }

    const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + encodeBase64(`${razorpayKeyId}:${razorpayKeySecret}`),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: po.id,
        notes: {
          offering_id,
          user_id: userId,
          payment_order_id: po.id,
        },
      }),
    });

    if (!rpRes.ok) {
      console.error("Razorpay error:", await rpRes.text());
      await admin
        .from("payment_orders")
        .update({ status: "failed" })
        .eq("id", po.id);
      return jsonRes({ error: "Failed to create Razorpay order" }, 500);
    }

    const rpOrder = await rpRes.json();

    /* Update payment_orders with razorpay_order_id */
    await admin
      .from("payment_orders")
      .update({ razorpay_order_id: rpOrder.id })
      .eq("id", po.id);

    /* Coupon redemption is deferred to verify-razorpay-payment so the
       used_count only increments on successfully captured payments. If
       Razorpay fails after this point, or the buyer abandons the modal,
       no coupon usage is consumed and they can retry. The atomic
       redeem_coupon() RPC is still called at capture time and will
       enforce the cap there. */

    return jsonRes({
      razorpay_order_id: rpOrder.id,
      amount: amountPaise,
      currency: "INR",
      key_id: razorpayKeyId,
      payment_order_id: po.id,
      offering_title: offering.title,
    });
  } catch (err) {
    console.error("Error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
