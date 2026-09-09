import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeaders } from "../_shared/cors.ts";
import { hmacSha256Hex, timingSafeEqual } from "../_shared/crypto.ts";

function encodeBase64(str: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

import { resolveOrCreateBuyer } from "../_shared/buyerIdentity.ts";

async function verifyHmac(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): Promise<boolean> {
  return timingSafeEqual(await hmacSha256Hex(`${orderId}|${paymentId}`, secret), signature);
}

async function verifyViaApi(
  paymentId: string,
  expectedOrderId: string,
  expectedAmountPaise: number | null,
  keyId: string,
  keySecret: string
): Promise<{ verified: boolean; status?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: "Basic " + encodeBase64(`${keyId}:${keySecret}`),
      },
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[verify] Razorpay API check failed:", res.status, errText);
      return { verified: false, error: `Razorpay API ${res.status}` };
    }
    const payment = await res.json();
    console.log("[verify] Razorpay API payment:", {
      id: payment.id,
      status: payment.status,
      order_id: payment.order_id,
      amount: payment.amount,
      expected_amount: expectedAmountPaise,
    });

    const statusOk =
      payment.status === "captured" || payment.status === "authorized";
    const orderOk = payment.order_id === expectedOrderId;
    // Amount must exactly match the payment_orders.total_inr in paise.
    // This prevents an attacker from verifying a cheap payment against an
    // expensive order even if they obtained a signature for a matching
    // order_id. If expectedAmountPaise is null (caller had no order yet),
    // we skip this check; the caller must perform it later.
    const amountOk =
      expectedAmountPaise === null ||
      (typeof payment.amount === "number" && payment.amount === expectedAmountPaise);

    if (statusOk && orderOk && amountOk) {
      return { verified: true, status: payment.status };
    }

    return {
      verified: false,
      error: `status=${payment.status} orderOk=${orderOk} amountOk=${amountOk} (got=${payment.amount} expected=${expectedAmountPaise})`,
    };
  } catch (err: any) {
    console.error("[verify] Razorpay API error:", err.message);
    return { verified: false, error: err.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    /* ── Parse input first ── */
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      payment_order_id,
      is_guest,
    } = await req.json();

    console.log("[verify] Request received:", {
      has_payment_id: !!razorpay_payment_id,
      has_order_id: !!razorpay_order_id,
      has_signature: !!razorpay_signature,
      has_po_id: !!payment_order_id,
      is_guest
    });

    if (
      !razorpay_payment_id ||
      !razorpay_order_id ||
      !razorpay_signature ||
      !payment_order_id
    )
      return jsonRes({ error: "Missing required fields" }, 400);

    /* ── Auth: authenticated flow or guest flow ── */
    let userId: string | null = null;

    const authHeader = req.headers.get("Authorization");
    if (!is_guest) {
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
      userId = claimsData.claims.sub as string;
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* ── Verify signature (HMAC first, API fallback) ── */
    const secret = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();
    const keyId = Deno.env.get("RAZORPAY_KEY_ID")?.trim();
    if (!secret || !keyId) {
      console.error("[verify] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set!");
      return jsonRes({ error: "Payment system misconfigured. Contact admin." }, 500);
    }

    console.log("[verify] Looking up payment order first:", payment_order_id);

    /* ── Get payment order BEFORE signature verification so we know the
       expected amount and can defend against an attacker reusing a
       signature for a cheaper order. ── */
    let poQuery = admin
      .from("payment_orders")
      .select("*")
      .eq("id", payment_order_id);

    // For authenticated users, scope to their user_id
    if (userId) {
      poQuery = poQuery.eq("user_id", userId);
    }

    const { data: po, error: poErr } = await poQuery.single();

    if (poErr || !po) return jsonRes({ error: "Payment order not found" }, 404);
    if (po.status === "captured")
      return jsonRes({ success: true, already_captured: true });

    // Defense in depth: the order_id presented by the client must match the
    // razorpay_order_id we stored when we created the order. This prevents
    // an attacker from pairing an unrelated (cheaper) razorpay order with
    // our payment_order row.
    if (po.razorpay_order_id && po.razorpay_order_id !== razorpay_order_id) {
      console.error(
        "[verify] razorpay_order_id mismatch:",
        "expected", po.razorpay_order_id,
        "got", razorpay_order_id
      );
      await admin
        .from("payment_orders")
        .update({ status: "failed" })
        .eq("id", payment_order_id);
      return jsonRes({ error: "Payment verification failed. Please contact support." }, 400);
    }

    const expectedAmountPaise = Math.round(Number(po.total_inr) * 100);
    console.log(
      "[verify] Starting verification for order:", razorpay_order_id,
      "payment:", razorpay_payment_id,
      "expected amount (paise):", expectedAmountPaise
    );

    let paymentVerified = false;

    // Try HMAC first
    const hmacValid = await verifyHmac(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      secret
    );

    if (hmacValid) {
      console.log("[verify] HMAC verification passed; cross-checking amount via Razorpay API");
      // Even when HMAC passes, fetch the payment from Razorpay to confirm
      // the captured amount matches the expected total. Without this an
      // attacker who re-uses an HMAC pair from a cheaper order on the
      // same merchant account could verify a low-value payment against a
      // high-value payment_order.
      const apiCheck = await verifyViaApi(
        razorpay_payment_id,
        razorpay_order_id,
        expectedAmountPaise,
        keyId,
        secret
      );
      if (apiCheck.verified) {
        paymentVerified = true;
      } else {
        console.error("[verify] HMAC ok but API amount check failed:", apiCheck.error);
      }
    } else {
      console.warn("[verify] HMAC verification failed, trying Razorpay API fallback...");

      const apiResult = await verifyViaApi(
        razorpay_payment_id,
        razorpay_order_id,
        expectedAmountPaise,
        keyId,
        secret
      );

      if (apiResult.verified) {
        console.log("[verify] Razorpay API verification passed (status:", apiResult.status, ")");
        paymentVerified = true;
      } else {
        console.error("[verify] Both HMAC and API verification failed:", apiResult.error);
      }
    }

    if (!paymentVerified) {
      await admin
        .from("payment_orders")
        .update({ status: "failed" })
        .eq("id", payment_order_id);
      return jsonRes({ error: "Payment verification failed. Please contact support." }, 400);
    }

    console.log("[verify] Payment verified");

    /* ── Guest: resolve the buyer by PHONE via find_login_identity ──
       BEFORE the order is marked captured, so a resolution failure can never
       downgrade a captured order, and nothing is issued to the caller: no
       session is minted from payment proof (an unverified phone is not an
       identity — the buyer proves it with one OTP on /login). Never GoTrue's
       /admin/users?email= list (it ignores the filter and returns the newest
       signups; that credited every guest purchase to a stranger until
       2026-09-09). Shared with razorpay-webhook so both paths land on the
       same account. ── */
    if (!userId) {
      if (po.user_id) {
        userId = po.user_id as string;
      } else {
        const buyer = await resolveOrCreateBuyer(
          admin,
          { name: po.guest_name, email: po.guest_email, phone: po.guest_phone },
          { tag: "verify", paid: true },
        );
        if (!buyer.ok) {
          console.error("[verify] buyer resolution failed for", payment_order_id, buyer.error);
          await admin
            .from("payment_orders")
            .update({ status: "needs_review", razorpay_payment_id, razorpay_signature })
            .eq("id", payment_order_id);
          return jsonRes(
            {
              success: false,
              needs_review: true,
              error:
                "Payment received, but we could not set up your account automatically. Our team will email you within a few hours.",
            },
            202,
          );
        }
        userId = buyer.userId;
        await admin.from("payment_orders").update({ user_id: userId }).eq("id", payment_order_id);
      }
    }

    /* ── Capture-time coupon redemption ──
       Redemption is intentionally deferred from order-creation to here so
       that abandoned / failed payments do not burn coupon usage. We use
       the atomic redeem_coupon() RPC which enforces the cap inside a
       single UPDATE; if it returns false the coupon was exhausted by a
       parallel checkout and we park the order for ops review (the
       customer's money is already with Razorpay). */
    if (po.coupon_id) {
      const { data: redeemed, error: redeemErr } = await admin.rpc(
        "redeem_coupon",
        { p_coupon_id: po.coupon_id }
      );
      if (redeemErr || redeemed === false) {
        console.error(
          "[verify] coupon redemption failed at capture for", po.coupon_id, redeemErr
        );
        await admin
          .from("payment_orders")
          .update({ status: "needs_review", razorpay_payment_id, razorpay_signature })
          .eq("id", payment_order_id);
        return jsonRes(
          {
            success: false,
            needs_review: true,
            error:
              "Payment received but a promo conflict needs manual review. Our team will email you within a few hours.",
          },
          202
        );
      }
    }

    /* ── Update payment order ── */
    await admin
      .from("payment_orders")
      .update({
        status: "captured",
        razorpay_payment_id,
        razorpay_signature,
        captured_at: new Date().toISOString(),
      })
      .eq("id", payment_order_id);

    if (!userId) {
      return jsonRes({ error: "Unable to resolve user for enrolment" }, 500);
    }

    /* ── Staged payment: update cohort_applications ── */
    if (po.payment_type && po.application_id) {
      const appUpdate: Record<string, unknown> = {};

      if (po.payment_type === "app_fee") {
        appUpdate.status = "app_fee_paid";
        appUpdate.app_fee_payment_id = po.id;
        appUpdate.app_fee_paid_at = new Date().toISOString();
        // Link application to user if not already linked
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
        if (appErr) {
          console.error("[verify] Failed to update cohort_applications:", appErr);
        } else {
          console.log("[verify] Updated application", po.application_id, "→", appUpdate.status);
        }
      }

      // Update enrolment tracking on the application
      if (po.payment_type === "balance" || po.payment_type === "confirmation") {
        // Track cumulative paid amount on enrolment (if exists)
        const { data: existingEnrol } = await admin
          .from("enrolments")
          .select("id, total_paid_inr")
          .eq("user_id", userId)
          .eq("offering_id", po.offering_id)
          .maybeSingle();

        if (existingEnrol) {
          const newTotal = Number(existingEnrol.total_paid_inr || 0) + Number(po.total_inr);
          await admin
            .from("enrolments")
            .update({
              total_paid_inr: newTotal,
              application_id: po.application_id,
            })
            .eq("id", existingEnrol.id);
        }
      }
    }

    console.log("[verify] Creating enrolment for user:", userId, "offering:", po.offering_id);

    /* ── Create enrolment for main offering (with duplicate guard) ──
         For staged payments: enrol only after balance is paid (or after
         confirmation when there is genuinely no balance stage). For
         non-staged, enrol immediately. The old check enrolled on EVERY
         confirmation payment, granting the full course before the balance
         was ever paid. ── */
    const isStaged = !!po.payment_type;
    let confirmationCoversAll = false;
    if (isStaged && po.payment_type === "confirmation" && po.offering_id) {
      const { data: stagedOffering } = await admin
        .from("offerings")
        .select("price_inr, app_fee_inr, confirmation_amount_inr")
        .eq("id", po.offering_id)
        .single();
      if (stagedOffering) {
        const balanceOwed =
          Number(stagedOffering.price_inr ?? 0) -
          Number(stagedOffering.app_fee_inr ?? 0) -
          Number(stagedOffering.confirmation_amount_inr ?? 0);
        confirmationCoversAll = balanceOwed <= 0;
      }
    }
    const shouldEnrol =
      !isStaged ||
      po.payment_type === "balance" ||
      (po.payment_type === "confirmation" && confirmationCoversAll);

    let enrolmentId: string | null = null;

    if (shouldEnrol) {
      // Idempotency: rely on the partial unique index
      // `enrolments_unique_active` to serialise the webhook vs. this
      // redirect path. Insert first; on 23505 (unique_violation) re-SELECT.
      const { data: enrolment, error: enrolErr } = await admin
        .from("enrolments")
        .insert({
          user_id: userId,
          offering_id: po.offering_id,
          payment_order_id: po.id,
          status: "active",
          source: "checkout",
          application_id: po.application_id || null,
          total_paid_inr: Number(po.total_inr),
        })
        .select("id")
        .single();

      if (enrolment) {
        enrolmentId = enrolment.id;
      } else if (enrolErr && (enrolErr as any).code === "23505") {
        const { data: existingEnrolment } = await admin
          .from("enrolments")
          .select("id")
          .eq("user_id", userId)
          .eq("offering_id", po.offering_id)
          .eq("status", "active")
          .maybeSingle();
        enrolmentId = existingEnrolment?.id ?? null;
        if (!enrolmentId) {
          console.error("[verify] enrolment unique violation but row not found on re-select");
          return jsonRes({ error: "Failed to create enrolment" }, 500);
        }
      } else {
        console.error("Enrolment error:", enrolErr);
        return jsonRes({ error: "Failed to create enrolment" }, 500);
      }

      /* ── Enrol bump offerings (only for non-staged or final payment) ──
         Same partial-unique-index trick as the main enrolment above. */
      if (po.bump_offering_ids && po.bump_offering_ids.length > 0) {
        for (const bumpOffId of po.bump_offering_ids) {
          const { error: bumpErr } = await admin.from("enrolments").insert({
            user_id: userId,
            offering_id: bumpOffId,
            payment_order_id: po.id,
            status: "active",
            source: "checkout",
          });
          if (bumpErr && (bumpErr as any).code !== "23505") {
            console.error("[verify] bump enrolment insert failed:", bumpErr);
          }
        }
      }

      // For staged balance payments, also update application to enrolled
      if (po.payment_type === "balance" && po.application_id) {
        await admin
          .from("cohort_applications")
          .update({ status: "enrolled" })
          .eq("id", po.application_id);
        console.log("[verify] Application", po.application_id, "→ enrolled");
      }
    }

    /* ── Audit log ── */
    if (enrolmentId) {
      await admin.from("enrolment_audit_log").insert({
        enrolment_id: enrolmentId,
        action: "granted",
        actor_user_id: userId,
        metadata: {
          payment_order_id: po.id,
          razorpay_payment_id,
          total_inr: po.total_inr,
          payment_type: po.payment_type || "full",
        },
      });
    }

    /* ── Get offering title for client ── */
    const { data: off } = await admin
      .from("offerings")
      .select("title")
      .eq("id", po.offering_id)
      .single();

    // Fetch guest email for response if needed
    let responseGuestEmail: string | null = null;
    if (is_guest) {
      const { data: poForEmail } = await admin
        .from("payment_orders")
        .select("guest_email")
        .eq("id", payment_order_id)
        .single();
      responseGuestEmail = poForEmail?.guest_email || null;
    }

    // ── Generate PDF invoice + queue receipt email ───────────────────
    // Fire-and-forget; the client doesn't need to wait for the receipt
    // pipeline before showing the ThankYou page. If either step fails,
    // log and continue; the user can still re-download via the
    // dashboard, and we can retry the email queue from admin.
    void (async () => {
      try {
        const supaUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // 1. Generate the PDF (uploads to invoices/<user_id>/<order_id>.pdf)
        const pdfRes = await fetch(`${supaUrl}/functions/v1/generate-invoice-pdf`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRole}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ payment_order_id }),
        });
        const pdfJson: any = await pdfRes.json().catch(() => ({}));
        if (!pdfRes.ok || !pdfJson?.path) {
          console.warn("[verify] invoice PDF generation failed:", pdfJson);
          return;
        }

        // 2. Mint a 90-day signed URL for the PDF and pass to the email
        const signed = await admin.storage
          .from("invoices")
          .createSignedUrl(pdfJson.path, 60 * 60 * 24 * 90);
        const invoiceUrl = signed.data?.signedUrl
          ?? `${Deno.env.get("SITE_URL") || "https://app.leveluplearning.in"}/profile`;

        // 3. Resolve buyer name + email for the template
        const { data: poFull } = await admin
          .from("payment_orders")
          .select("guest_name, guest_email, total_inr, razorpay_payment_id, captured_at, user_id, offerings(title)")
          .eq("id", payment_order_id)
          .single();
        let toEmail = poFull?.guest_email || null;
        let studentName = poFull?.guest_name || "there";
        if (poFull?.user_id) {
          const { data: u } = await admin
            .from("users")
            .select("full_name, email")
            .eq("id", poFull.user_id)
            .maybeSingle();
          if (u) {
            // A guest order's receipt goes to the address typed at checkout;
            // the profile email is used only when the order carried none.
            toEmail = toEmail || u.email;
            studentName = studentName === "there" ? (u.full_name || studentName) : studentName;
          }
        }
        if (!toEmail) {
          console.warn("[verify] no email on file for receipt; skipping");
          return;
        }

        const dateStr = new Intl.DateTimeFormat("en-IN", {
          day: "2-digit", month: "short", year: "numeric",
          timeZone: "Asia/Kolkata",
        }).format(new Date(poFull?.captured_at || Date.now()));

        // 4. Queue via queue-transactional-email (uses the payment_receipt
        //    template we just upgraded in DB)
        await fetch(`${supaUrl}/functions/v1/queue-transactional-email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRole}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_key: "payment_receipt",
            to_email: toEmail,
            variables: {
              student_name: studentName,
              offering_name: (poFull?.offerings as any)?.title || "your masterclass",
              amount: Number(poFull?.total_inr || 0).toLocaleString("en-IN"),
              payment_id: poFull?.razorpay_payment_id || "",
              date: dateStr,
              app_url: Deno.env.get("SITE_URL") || "https://app.leveluplearning.in",
              invoice_url: invoiceUrl,
            },
          }),
        });
      } catch (e) {
        console.warn("[verify] receipt pipeline failed:", e);
      }
    })();

    return jsonRes({
      success: true,
      offering_title: off?.title ?? "your program",
      is_guest: is_guest || false,
      guest_email: responseGuestEmail,
      // Guests prove the phone they paid with via one OTP on /login.
      login_hint: is_guest ? "phone" : null,
    });
  } catch (err: any) {
    console.error("[verify] UNHANDLED ERROR:", err?.message || err, err?.stack);
    return jsonRes({ error: `Internal server error: ${err?.message || "unknown"}` }, 500);
  }
});
