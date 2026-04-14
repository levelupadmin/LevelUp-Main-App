import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

// No CORS headers needed — this is a server-to-server webhook from Razorpay.
function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null; // Invalid phone length
}

/**
 * O(1) lookup of auth.users by email via the GoTrue admin REST API.
 * See the same helper in verify-razorpay-payment for rationale — the
 * supabase-js listUsers() call does not accept a filter and scans the
 * entire table with a default page size of 50, losing records past it.
 */
async function findAuthUserByEmail(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string
): Promise<{ id: string; email?: string } | null> {
  try {
    const res = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } }
    );
    if (!res.ok) return null;
    const body = await res.json();
    if (Array.isArray(body?.users) && body.users.length > 0) return body.users[0];
    if (body?.id && body?.email?.toLowerCase() === email.toLowerCase()) return body;
    return null;
  } catch {
    return null;
  }
}

async function verifySignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

/**
 * Resolve (or create) the public.users / auth.users id for a guest checkout
 * payment order. Mirrors the logic in verify-razorpay-payment so the webhook
 * can recover guest customers when the redirect path fails.
 */
async function resolveGuestUserId(
  admin: any,
  po: any
): Promise<{ userId: string | null; error?: string }> {
  if (!po.guest_email) {
    return { userId: null, error: "Guest order has no guest_email" };
  }

  const normalizedPhone = po.guest_phone ? normalizePhone(po.guest_phone) : null;

  // 1. existing public.users by email
  const { data: existingUser } = await admin
    .from("users")
    .select("id")
    .eq("email", po.guest_email)
    .maybeSingle();

  if (existingUser) {
    return { userId: existingUser.id };
  }

  // 2. existing auth.users by email — O(1) via REST, see helper
  let existingAuthUser: any = null;
  try {
    existingAuthUser = await findAuthUserByEmail(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      po.guest_email
    );
  } catch (err) {
    console.warn("[razorpay-webhook] findAuthUserByEmail failed:", err);
  }

  if (existingAuthUser) {
    await admin.from("users").upsert(
      {
        id: existingAuthUser.id,
        email: po.guest_email,
        full_name: po.guest_name,
        phone: normalizedPhone,
      },
      { onConflict: "id" }
    );
    return { userId: existingAuthUser.id };
  }

  // 3. create a fresh auth user
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: po.guest_email,
    email_confirm: true,
    user_metadata: {
      full_name: po.guest_name,
      phone: normalizedPhone,
    },
  });

  if (createError) {
    console.error("[razorpay-webhook] createUser failed:", createError.message);
    return { userId: null, error: createError.message };
  }

  if (normalizedPhone) {
    await admin
      .from("users")
      .update({ phone: normalizedPhone })
      .eq("id", newUser.user.id);
  }

  return { userId: newUser.user.id };
}

Deno.serve(async (req) => {
  // Reject anything except POST — webhooks are not browser-callable.
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const signature = req.headers.get("x-razorpay-signature");
    const body = await req.text();

    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error(
        "RAZORPAY_WEBHOOK_SECRET not configured. This is separate from RAZORPAY_KEY_SECRET. Set it in Supabase Edge Function Secrets."
      );
      return jsonRes({ error: "Webhook secret not configured" }, 500);
    }

    if (!signature || !(await verifySignature(body, signature, webhookSecret))) {
      console.error("Invalid webhook signature");
      return jsonRes({ error: "Invalid signature" }, 401);
    }

    const event = JSON.parse(body);
    const eventType = event.event;

    if (eventType !== "payment.captured") {
      return jsonRes({ received: true, ignored: eventType });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment) {
      return jsonRes({ error: "No payment entity" }, 400);
    }

    const razorpayOrderId = payment.order_id;
    const razorpayPaymentId = payment.id;
    if (!razorpayOrderId) {
      console.error("[razorpay-webhook] Missing order_id on payment");
      return jsonRes({ error: "Missing order_id" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up the payment_order by razorpay_order_id. This is the source of
    // truth for what was actually purchased — never trust payment.notes for
    // anything beyond a sanity check.
    const { data: po, error: poErr } = await admin
      .from("payment_orders")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (poErr || !po) {
      console.error(
        "[razorpay-webhook] payment_order not found for razorpay_order_id",
        razorpayOrderId,
        poErr
      );
      // Return 200 so Razorpay doesn't retry forever — this likely means
      // the payment was made against an order created outside this app
      // (e.g. event registration via verify-event-payment which doesn't
      // create a payment_orders row).
      return jsonRes({ received: true, skipped: "no payment_order" });
    }

    // Idempotency: if we've already processed this order, exit fast.
    if (po.status === "captured") {
      // Still ensure the payment_id is recorded
      if (!po.razorpay_payment_id) {
        await admin
          .from("payment_orders")
          .update({ razorpay_payment_id: razorpayPaymentId })
          .eq("id", po.id);
      }
      return jsonRes({ received: true, already_captured: true });
    }

    // Defense in depth: confirm the captured amount matches what we expected.
    const expectedAmountPaise = Math.round(Number(po.total_inr) * 100);
    if (typeof payment.amount === "number" && payment.amount !== expectedAmountPaise) {
      console.error(
        "[razorpay-webhook] amount mismatch — expected",
        expectedAmountPaise,
        "got",
        payment.amount,
        "for payment_order",
        po.id
      );
      // Mark for manual review rather than auto-enrolling on a wrong amount
      await admin
        .from("payment_orders")
        .update({ status: "needs_review" })
        .eq("id", po.id);
      return jsonRes({ error: "Amount mismatch" }, 400);
    }

    // Capture-time coupon redemption (deferred from order creation so
    // abandoned payments do not burn coupon usage). If the cap was hit
    // by a parallel checkout, park for review — the customer paid.
    if (po.coupon_id) {
      const { data: redeemed, error: redeemErr } = await admin.rpc(
        "redeem_coupon",
        { p_coupon_id: po.coupon_id }
      );
      if (redeemErr || redeemed === false) {
        console.error(
          "[razorpay-webhook] coupon redemption failed for",
          po.coupon_id,
          redeemErr
        );
        await admin
          .from("payment_orders")
          .update({ status: "needs_review" })
          .eq("id", po.id);
        return jsonRes({ error: "Coupon redemption failed" }, 409);
      }
    }

    // Mark captured
    await admin
      .from("payment_orders")
      .update({
        status: "captured",
        razorpay_payment_id: razorpayPaymentId,
        captured_at: new Date().toISOString(),
      })
      .eq("id", po.id);

    // Resolve user — for authenticated checkouts po.user_id is set, for
    // guest checkouts we have to find or create the user from guest_email.
    let userId: string | null = po.user_id;
    if (!userId) {
      const resolved = await resolveGuestUserId(admin, po);
      if (!resolved.userId) {
        console.error(
          "[razorpay-webhook] Could not resolve guest user for payment_order",
          po.id,
          resolved.error
        );
        await admin
          .from("payment_orders")
          .update({ status: "needs_review" })
          .eq("id", po.id);
        return jsonRes({ error: "Could not resolve user" }, 500);
      }
      userId = resolved.userId;
      await admin
        .from("payment_orders")
        .update({ user_id: userId })
        .eq("id", po.id);
    }

    // ── Staged payment: update cohort_applications ──
    if (po.payment_type && po.application_id) {
      const appUpdate: Record<string, unknown> = {};
      if (po.payment_type === "app_fee") {
        appUpdate.status = "app_fee_paid";
        appUpdate.app_fee_payment_id = po.id;
        appUpdate.app_fee_paid_at = new Date().toISOString();
        if (userId) appUpdate.user_id = userId;
      } else if (po.payment_type === "confirmation") {
        appUpdate.status = "confirmation_paid";
        appUpdate.confirmation_payment_id = po.id;
      } else if (po.payment_type === "balance") {
        appUpdate.status = "balance_paid";
        appUpdate.balance_payment_id = po.id;
      }
      if (Object.keys(appUpdate).length > 0) {
        const { error: appErr } = await admin
          .from("cohort_applications")
          .update(appUpdate)
          .eq("id", po.application_id);
        if (appErr) console.error("[razorpay-webhook] cohort_applications update failed:", appErr);
        else console.log("[razorpay-webhook] Application", po.application_id, "→", appUpdate.status);
      }
    }

    // Main enrolment (idempotent)
    // For staged payments, only enrol on balance or confirmation (not app_fee)
    const isStaged = !!po.payment_type;
    const shouldEnrol = !isStaged || po.payment_type === "balance" || po.payment_type === "confirmation";

    let enrolmentId: string | null = null;

    if (shouldEnrol) {
      const { data: existing } = await admin
        .from("enrolments")
        .select("id")
        .eq("user_id", userId)
        .eq("offering_id", po.offering_id)
        .eq("status", "active")
        .maybeSingle();

      enrolmentId = existing?.id ?? null;

      if (!existing) {
        const { data: enrolment, error: enrolErr } = await admin
          .from("enrolments")
          .insert({
            user_id: userId,
            offering_id: po.offering_id,
            payment_order_id: po.id,
            status: "active",
            source: "checkout",
            application_id: po.application_id || null,
          })
          .select("id")
          .single();

        if (enrolErr) {
          console.error("[razorpay-webhook] enrolment insert failed:", enrolErr);
          return jsonRes({ error: "Enrolment creation failed" }, 500);
        }
        enrolmentId = enrolment.id;
      }

      // Bump offerings (idempotent)
      if (po.bump_offering_ids && Array.isArray(po.bump_offering_ids)) {
        for (const bumpOffId of po.bump_offering_ids) {
          const { data: existingBump } = await admin
            .from("enrolments")
            .select("id")
            .eq("user_id", userId)
            .eq("offering_id", bumpOffId)
            .eq("status", "active")
            .maybeSingle();
          if (!existingBump) {
            await admin.from("enrolments").insert({
              user_id: userId,
              offering_id: bumpOffId,
              payment_order_id: po.id,
              status: "active",
              source: "checkout",
            });
          }
        }
      }

      // For balance payments, mark application as enrolled
      if (po.payment_type === "balance" && po.application_id) {
        await admin
          .from("cohort_applications")
          .update({ status: "enrolled" })
          .eq("id", po.application_id);
      }
    }

    // Audit log
    if (enrolmentId) {
      await admin.from("enrolment_audit_log").insert({
        enrolment_id: enrolmentId,
        action: "granted",
        actor_user_id: userId,
        metadata: {
          payment_order_id: po.id,
          razorpay_payment_id: razorpayPaymentId,
          source: "razorpay-webhook",
          total_inr: po.total_inr,
        },
      });
    }

    return jsonRes({ success: true, enrolment: enrolmentId ? "created" : "exists" });
  } catch (err) {
    console.error("[razorpay-webhook] error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
