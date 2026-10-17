import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  couponDiscountInr,
  couponInvalidReason,
  gstInr as computeGstInr,
  totalInr as computeTotalInr,
  toPaise,
} from "../_shared/pricing.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { resolveOrCreateBuyer } from "../_shared/buyerIdentity.ts";
import { requestClientMeta, sanitizeAttribution, utmColumns } from "../_shared/attribution.ts";
import { requestReuseKey, reuseKeyMatches } from "../_shared/guestOrderKey.ts";

function encodeBase64(str: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      offering_id,
      guest_name,
      guest_email,
      guest_phone,
      coupon_code,
    } = body;
    // Ad attribution from the checkout link (utm_*, fbclid, gclid, ic_eid,
    // _fbp/_fbc). Older clients send utm_* at the top level only; both are read.
    const attribution = sanitizeAttribution(body?.attribution, body ?? {});
    // The checkout's per-browser token (_shared/guestOrderKey.ts). Its hash
    // goes on the order; with none, the order can be neither reused nor read
    // by a guest status check.
    const reuseKey = await requestReuseKey(body?.reuse_token);

    /* ── Validate required fields ── */
    if (!offering_id || !guest_name || !guest_email || !guest_phone) {
      return jsonRes({ error: "offering_id, guest_name, guest_email, and guest_phone are required" }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guest_email)) {
      return jsonRes({ error: "Invalid email format" }, 400);
    }

    const normalizedPhone = normalizePhone(guest_phone);
    if (!normalizedPhone) {
      return jsonRes({ error: "Invalid phone number, must be 10 digits" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* ── Rate limit: 8 guest orders per 15 min per (ip, offering) ──
       Without this an attacker could:
         - flood payment_orders with junk rows
         - use the scenario-validation 403s as a user-existence oracle
         - rack up Razorpay API calls until our daily quota is hit
       8 per 15 min is enough for a real shopper who fat-fingers their
       card a few times but cuts an automated scanner off quickly.   */
    const ip = getClientIp(req);
    const { data: rlAllowed, error: rlErr } = await admin.rpc(
      "check_and_increment_rate_limit",
      {
        p_key: `guest-create-order:${ip}:${offering_id}`,
        p_max_count: 8,
        p_window_seconds: 900,
      }
    );
    if (rlErr) {
      console.error("rate-limit rpc failed:", rlErr);
      return jsonRes({ error: "Internal error" }, 500);
    }
    if (rlAllowed === false) {
      return jsonRes({ error: "Too many requests, please try again shortly." }, 429);
    }

    /* ── Offering ── */
    const { data: offering, error: offErr } = await admin
      .from("offerings")
      .select("id, title, price_inr, gst_mode, gst_rate, status, is_public")
      .eq("id", offering_id)
      .single();

    if (offErr || !offering) return jsonRes({ error: "Offering not found" }, 404);
    if (offering.status !== "active") return jsonRes({ error: "Offering is not active" }, 400);
    if (!offering.is_public) return jsonRes({ error: "Offering is not available for public purchase" }, 400);

    /* ── SCENARIO VALIDATION (server-side security gate) ──
       Email half only, as it has always worked: an account found by the
       typed email whose phone differs is refused. There is no phone half.
       This function needs no login, so an answer that changed with whether
       a typed phone has an account would tell a stranger that it does (and,
       with a guessed email, whose it is). It would protect nothing either:
       capture credits the phone's account whatever email is typed
       (_shared/buyerIdentity.ts). The old phone half compared
       public.users.phone with the bare 10 digits, a form that column never
       holds (0 of 2,983 on 2026-10-18), so it never fired; dropping it
       changes no answer. */
    const { data: emailUser } = await admin
      .from("users")
      .select("id, phone")
      .eq("email", guest_email)
      .maybeSingle();

    if (emailUser && emailUser.phone && normalizePhone(emailUser.phone) !== normalizedPhone) {
      return jsonRes({ error: "Phone number doesn't match the account on file. Please verify your identity." }, 403);
    }

    /* Whether this phone's account already owns the course is NOT checked
       here. This function runs for anyone who types a phone number (no
       login), so any answer that depends on ownership would tell a stranger
       what that person bought. A returning owner who signs in first
       ("Already have an account? Sign in" on the checkout) is stopped by
       create-razorpay-order, which checks only the caller's own account. */

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
        // Guests get no add-on bumps, so the coupon applies to the base price
        // only. An invalid coupon is silently skipped (discount stays 0) — same
        // behaviour as before; the validity + discount math is now shared.
        if (couponInvalidReason(coupon, offering_id, new Date()) === null) {
          couponDbId = coupon.id;
          discountInr = couponDiscountInr(
            coupon.discount_type,
            Number(coupon.discount_value),
            Number(offering.price_inr),
          );
        }
      }
    }

    /* ── Totals ── */
    const subtotalInr = Number(offering.price_inr);
    const afterDiscount = Math.max(subtotalInr - discountInr, 0);
    const gstInr = computeGstInr(afterDiscount, offering.gst_mode, Number(offering.gst_rate || 18));
    const totalInr = computeTotalInr(afterDiscount, offering.gst_mode, gstInr);

    /* ── Reuse a pending order from the last 10 minutes ──
       Only an order this browser made (the same reuse token), with the same
       phone, offering, email, name, coupon and total and a Razorpay order on
       it: return that order instead of making another. A retry after a closed
       payment sheet or a failed attempt lands on the same Razorpay order, which
       accepts one successful payment only, so a double tap or a second attempt
       cannot charge twice. Anything else gets a fresh order: an existing
       order's id never goes to a caller without its token, and a corrected
       name reaches the receipt and the invoice. The answer has the same shape
       either way. */
    if (totalInr > 0 && reuseKey) {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: pending } = await admin
        .from("payment_orders")
        .select("id, razorpay_order_id, total_inr, coupon_id, guest_email, guest_name, notes")
        .is("user_id", null)
        .eq("offering_id", offering_id)
        .eq("guest_phone", normalizedPhone)
        .eq("status", "created")
        .eq("notes->>reuse_key", reuseKey)
        .gte("created_at", tenMinAgo)
        .order("created_at", { ascending: false })
        .limit(5);
      const reuse = (pending ?? []).find((row: Record<string, unknown>) =>
        reuseKeyMatches(row.notes, reuseKey) &&
        typeof row.razorpay_order_id === "string" &&
        Number(row.total_inr) === totalInr &&
        (row.coupon_id ?? null) === (couponDbId ?? null) &&
        String(row.guest_email ?? "").trim().toLowerCase() === String(guest_email).trim().toLowerCase() &&
        String(row.guest_name ?? "").trim() === String(guest_name).trim()
      );
      const reuseKeyId = Deno.env.get("RAZORPAY_KEY_ID")?.trim();
      if (reuse && reuseKeyId) {
        return jsonRes({
          razorpay_order_id: reuse.razorpay_order_id,
          amount: toPaise(totalInr),
          currency: "INR",
          key_id: reuseKeyId,
          payment_order_id: reuse.id,
          offering_title: offering.title,
        });
      }
    }

    /* ── payment_orders row (guest, no user_id) ── */
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
        ...utmColumns(attribution),
        // The rest of the attribution, plus the buyer's IP and user agent for
        // the server-side Purchase (Meta matching), lives in the notes jsonb.
        // notes.reuse_key ties the order to this browser (see above).
        notes: {
          attribution: { ...attribution, ...requestClientMeta(req.headers) },
          ...(reuseKey ? { reuse_key: reuseKey } : {}),
        },
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
      // Free offering: capture is happening right now, redeem the coupon.
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
      // Find or create the account keyed on the PHONE (shared rule, see
      // _shared/buyerIdentity.ts): an existing phone account is never written
      // to, and a new one carries only the synthetic auth email.
      const buyer = await resolveOrCreateBuyer(
        admin,
        { name: guest_name, email: guest_email, phone: normalizedPhone },
        { tag: "guest-create-order", paid: false },
      );
      if (!buyer.ok) {
        console.error("Guest user resolution error:", buyer.error);
        return jsonRes({ error: "Failed to create user account" }, 500);
      }
      const userId: string = buyer.userId;
      await admin
        .from("payment_orders")
        .update({ user_id: userId })
        .eq("id", po.id);

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
          // The row above selected only `id`, so po.total_inr was undefined:
          // Number(undefined) is NaN, which JSON sends as null. The free
          // path's total is the computed one.
          total_paid_inr: totalInr,
        });
      }

      return jsonRes({
        success: true,
        payment_order_id: po.id,
        offering_title: offering.title,
      });
    }

    /* ── Razorpay order (paid offerings) ── */
    const amountPaise = toPaise(totalInr);
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
