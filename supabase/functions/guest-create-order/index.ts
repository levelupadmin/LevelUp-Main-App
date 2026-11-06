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
import { canonicalBuyerPhone, isIndianBuyerPhone, resolveOrCreateBuyer } from "../_shared/buyerIdentity.ts";
import { requestClientMeta, sanitizeAttribution, utmColumns } from "../_shared/attribution.ts";
import { requestReuseKey, reuseKeyMatches } from "../_shared/guestOrderKey.ts";
import { checkoutRefusal, freeEnrolmentRefusal } from "../_shared/freeEnrolment.ts";
import { MAX_BUMPS, priceBumps } from "../_shared/bumps.ts";

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
      bump_ids,
      custom_field_values,
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

    // Indian numbers keep the bare 10 digits this column has always held (every
    // downstream reader expects that). Other countries (2026-11-04, the
    // pay-first checkout) are stored as +E.164; their buyers sign in by email.
    const canonicalPhone = canonicalBuyerPhone(guest_phone);
    const normalizedPhone = canonicalPhone && isIndianBuyerPhone(canonicalPhone)
      ? normalizePhone(canonicalPhone)
      : canonicalPhone;
    if (!normalizedPhone) {
      return jsonRes({ error: "Please enter a valid phone number" }, 400);
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
      .select("id, title, price_inr, gst_mode, gst_rate, status, is_public, payment_mode, product_tier, tally_form_url, access")
      .eq("id", offering_id)
      .single();

    if (offErr || !offering) return jsonRes({ error: "Offering not found" }, 404);
    if (offering.status !== "active") return jsonRes({ error: "Offering is not active" }, 400);
    // Whether a guest may pay is decided by how people get the offering
    // (offerings.access, migration 20261106120000), no longer by whether a
    // page lists it: an offering can be sold on a direct checkout link.
    {
      const refusal = checkoutRefusal(offering);
      if (refusal) return jsonRes({ error: "Offering is not available for public purchase" }, 400);
    }
    if (offering.payment_mode === "staged") {
      return jsonRes({ error: "Offering is not available for public purchase" }, 400);
    }

    /* ── Add-ons (bumps) ── priced on the server from the parent's list. */
    if (Array.isArray(bump_ids) && bump_ids.length > MAX_BUMPS) {
      return jsonRes({ error: "Too many bump selections" }, 400);
    }
    const { bumpTotal, validBumpIds } = await priceBumps(admin, offering_id, bump_ids);

    /* ── Answers to the offering's own questions (custom_field_definitions) ──
       Guests' answers used to be dropped (always {}). Only this offering's
       field ids are kept, as short strings. A missing answer never refuses
       the sale here: the checkout asks for required ones before Pay. */
    const answers: Record<string, string> = {};
    if (custom_field_values && typeof custom_field_values === "object" && !Array.isArray(custom_field_values)) {
      const { data: defs } = await admin
        .from("custom_field_definitions")
        .select("id")
        .eq("offering_id", offering_id);
      for (const d of (defs ?? []) as { id: string }[]) {
        const v = (custom_field_values as Record<string, unknown>)[d.id];
        if (typeof v === "string" && v.trim()) answers[d.id] = v.trim().slice(0, 500);
      }
    }

    /* ── No identity gate before payment (2026-11-04) ──
       This used to refuse (403) when the typed email belonged to an account
       with a different phone, which killed the sale before Razorpay opened.
       Payment never changes an account: capture only ADDS the course to the
       account the phone (India) or email (elsewhere) finds, and writes nothing
       onto it (_shared/buyerIdentity.ts). So the order goes through, and the
       mismatch is noted on the order for a person to look at. The answer is
       the same either way, so it tells a stranger nothing. */
    const { data: emailUser } = await admin
      .from("users")
      .select("id, phone")
      .eq("email", String(guest_email).trim().toLowerCase())
      .maybeSingle();
    const identityConflict = !!(emailUser && emailUser.phone &&
      canonicalBuyerPhone(emailUser.phone) !== canonicalPhone);

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
        // The coupon applies to the whole order (price + add-ons), the same
        // as the signed-in path and the on-screen preview. With no add-on this
        // is the base price, exactly as before. An invalid coupon is silently
        // skipped (discount stays 0); the validity + discount math is shared.
        if (couponInvalidReason(coupon, offering_id, new Date()) === null) {
          couponDbId = coupon.id;
          discountInr = couponDiscountInr(
            coupon.discount_type,
            Number(coupon.discount_value),
            Number(offering.price_inr) + bumpTotal,
          );
        }
      }
    }

    /* ── Totals ── */
    const subtotalInr = Number(offering.price_inr) + bumpTotal;
    const afterDiscount = Math.max(subtotalInr - discountInr, 0);
    const gstInr = computeGstInr(afterDiscount, offering.gst_mode, Number(offering.gst_rate || 18));
    const totalInr = computeTotalInr(afterDiscount, offering.gst_mode, gstInr);

    // A ₹0 total on a live-cohort / application / staged offering is not a
    // free claim: refuse before any order row is written.
    if (totalInr <= 0) {
      const refusal = freeEnrolmentRefusal(offering);
      if (refusal) return jsonRes({ error: refusal }, 400);
    }

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
        .select("id, razorpay_order_id, total_inr, coupon_id, guest_email, guest_name, notes, bump_offering_ids")
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
        (Array.isArray(row.bump_offering_ids) ? [...(row.bump_offering_ids as string[])].sort().join(",") : "") === validBumpIds.join(",") &&
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
        bump_offering_ids: validBumpIds,
        custom_field_values: answers,
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
          ...(identityConflict ? { identity_conflict: "email_belongs_to_another_phone" } : {}),
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
        { tag: "guest-create-order", paid: false, orderId: po.id },
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
