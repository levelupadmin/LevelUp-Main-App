import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeaders } from "../_shared/cors.ts";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      offering_id,
      guest_name,
      guest_email,
      guest_phone,
      coupon_code,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
    } = await req.json();

    /* ── Validate required fields ── */
    if (!offering_id || !guest_name || !guest_email || !guest_phone) {
      return jsonRes({ error: "offering_id, guest_name, guest_email, and guest_phone are required" }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guest_email)) {
      return jsonRes({ error: "Invalid email format" }, 400);
    }

    const normalizedPhone = normalizePhone(guest_phone);
    if (normalizedPhone.length < 10) {
      return jsonRes({ error: "Invalid phone number" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* ── Offering ── */
    const { data: offering, error: offErr } = await admin
      .from("offerings")
      .select("id, title, price_inr, gst_mode, gst_rate, status, is_public")
      .eq("id", offering_id)
      .single();

    if (offErr || !offering) return jsonRes({ error: "Offering not found" }, 404);
    if (offering.status !== "active") return jsonRes({ error: "Offering is not active" }, 400);
    if (!offering.is_public) return jsonRes({ error: "Offering is not available for public purchase" }, 400);

    /* ── SCENARIO VALIDATION (server-side security gate) ── */
    const { data: emailUser } = await admin
      .from("users")
      .select("id, phone")
      .eq("email", guest_email)
      .maybeSingle();

    const { data: phoneUser } = await admin
      .from("users")
      .select("id, email")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (emailUser && phoneUser && emailUser.id !== phoneUser.id) {
      return jsonRes({ error: "Email and phone number are linked to different accounts. Please verify your identity." }, 403);
    }

    if (emailUser && emailUser.phone && normalizePhone(emailUser.phone) !== normalizedPhone) {
      return jsonRes({ error: "Phone number doesn't match the account on file. Please verify your identity." }, 403);
    }

    if (phoneUser && phoneUser.email !== guest_email) {
      return jsonRes({ error: "This phone number is linked to a different account. Please verify your identity." }, 403);
    }

    /* ── Coupon (by code, not ID) ── */
    let discountInr = 0;
    let couponDbId: string | null = null;

    if (coupon_code) {
      const { data: coupon } = await admin
        .from("coupons")
        .select("*")
        .eq("code", coupon_code)
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
          const subtotalBeforeDiscount = Number(offering.price_inr);
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
    const subtotalInr = Number(offering.price_inr);
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

    /* ── payment_orders row (guest — no user_id) ── */
    const { data: po, error: poErr } = await admin
      .from("payment_orders")
      .insert({
        user_id: null,
        offering_id,
        subtotal_inr: subtotalInr,
        discount_inr: discountInr,
        gst_inr: gstInr,
        total_inr: totalInr,
        coupon_id: couponDbId,
        bump_offering_ids: [],
        custom_field_values: {},
        status: totalInr <= 0 ? "captured" : "created",
        guest_name,
        guest_email,
        guest_phone: normalizedPhone,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        utm_content: utm_content || null,
        utm_term: utm_term || null,
        captured_at: totalInr <= 0 ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (poErr || !po) {
      console.error("Payment order error:", poErr);
      return jsonRes({ error: "Failed to create payment order" }, 500);
    }

    /* Coupon redemption is deferred to capture-time (verify-razorpay-payment
       for paid orders, or right below for free orders that are auto-captured).
       This ensures used_count only goes up on real conversions. */
    if (couponDbId && totalInr <= 0) {
      // Free offering — capture is happening right now, redeem the coupon.
      const { data: redeemed, error: redeemErr } = await admin.rpc(
        "redeem_coupon",
        { p_coupon_id: couponDbId }
      );
      if (redeemErr || redeemed === false) {
        console.warn(
          "[guest-create-order] Coupon redemption failed at free-capture:",
          couponDbId,
          redeemErr
        );
        await admin
          .from("payment_orders")
          .update({ status: "failed" })
          .eq("id", po.id);
        return jsonRes(
          {
            error:
              "This coupon has just reached its limit or become invalid. Please try again without the coupon.",
          },
          409
        );
      }
    }

    /* ── FREE OFFERING: skip Razorpay, grant access immediately ── */
    if (totalInr <= 0) {
      // Create or find user account
      let userId: string | null = null;

      const { data: existingUser } = await admin
        .from("users")
        .select("id, phone")
        .eq("email", guest_email)
        .maybeSingle();

      if (existingUser) {
        userId = existingUser.id;
        await admin
          .from("payment_orders")
          .update({ user_id: userId })
          .eq("id", po.id);
      } else {
        const { data: newUser, error: createError } =
          await admin.auth.admin.createUser({
            email: guest_email,
            email_confirm: true,
            user_metadata: {
              full_name: guest_name,
              phone: normalizedPhone,
            },
          });

        if (createError) {
          console.error("Guest user creation error:", createError);
          return jsonRes({ error: "Failed to create user account" }, 500);
        }

        userId = newUser.user.id;
        await admin
          .from("payment_orders")
          .update({ user_id: userId })
          .eq("id", po.id);

        if (normalizedPhone) {
          await admin
            .from("users")
            .update({ phone: normalizedPhone })
            .eq("id", userId);
        }
      }

      // Check for duplicate enrolment
      const { data: existingEnrolment } = await admin
        .from("enrolments")
        .select("id")
        .eq("user_id", userId)
        .eq("offering_id", offering_id)
        .maybeSingle();

      if (!existingEnrolment) {
        await admin.from("enrolments").insert({
          user_id: userId,
          offering_id,
          payment_order_id: po.id,
          status: "active",
          source: "checkout",
        });
      }

      // Send magic link
      try {
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: guest_email,
          options: {
            redirectTo: `${Deno.env.get("SITE_URL") || "https://levelup-creator-os.lovable.app"}/home`,
          },
        });
      } catch (linkErr) {
        console.error("Magic link generation error:", linkErr);
      }

      return jsonRes({
        success: true,
        payment_order_id: po.id,
        offering_title: offering.title,
      });
    }

    /* ── Razorpay order (paid offerings) ── */
    const amountPaise = Math.round(totalInr * 100);
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
        Authorization: "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: po.id,
        notes: {
          offering_id,
          guest_email,
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

    return jsonRes({
      razorpay_order_id: rpOrder.id,
      amount: amountPaise,
      currency: "INR",
      key_id: razorpayKeyId,
      payment_order_id: po.id,
      offering_title: offering.title,
    });
  } catch (err) {
    console.error("guest-create-order error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
