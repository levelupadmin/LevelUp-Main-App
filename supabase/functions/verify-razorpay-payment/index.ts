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

function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null; // Invalid phone length
}

/**
 * O(1) lookup of an auth.users row by email via the GoTrue admin REST API.
 *
 * The supabase-js client's admin.auth.admin.listUsers() does not accept a
 * filter parameter in v2 and always returns a full page (default 50) from
 * the top of auth.users. On a large user base this drops the target user
 * off the page and returns null, causing guest checkouts to fail-over to
 * needs_review even when the user exists. The REST endpoint accepts
 * ?email=<email> and returns exactly one record (or empty).
 */
async function findAuthUserByEmail(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string
): Promise<{ id: string; email?: string } | null> {
  try {
    const url = `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    });
    if (!res.ok) {
      console.warn("[findAuthUserByEmail] HTTP", res.status);
      return null;
    }
    const body = await res.json();
    // The endpoint returns either { users: [...] } or a single user object
    // depending on GoTrue version; handle both.
    if (Array.isArray(body?.users) && body.users.length > 0) {
      return body.users[0];
    }
    if (body?.id && body?.email?.toLowerCase() === email.toLowerCase()) {
      return body;
    }
    return null;
  } catch (err) {
    console.warn("[findAuthUserByEmail] fetch failed:", err);
    return null;
  }
}

// Constant-time hex string comparison. HMAC-SHA256 hex is fixed-length (64
// chars) so the length check leaks nothing useful in normal operation.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyHmac(
  orderId: string,
  paymentId: string,
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
  const data = `${orderId}|${paymentId}`;
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(computed, signature);
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
    // we skip this check — the caller must perform it later.
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
    let magicLinkToken: string | null = null;

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

    /* ── Capture-time coupon redemption ──
       Redemption is intentionally deferred from order-creation to here so
       that abandoned / failed payments do not burn coupon usage. We use
       the atomic redeem_coupon() RPC which enforces the cap inside a
       single UPDATE — if it returns false the coupon was exhausted by a
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
          .update({ status: "needs_review" })
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

    /* ── Guest account creation / lookup ── */
    if (is_guest || !userId) {
      const { data: poGuest } = await admin
        .from("payment_orders")
        .select("guest_email, guest_name, guest_phone, offering_id")
        .eq("id", payment_order_id)
        .single();

      if (poGuest?.guest_email) {
        const normalizedPhone = poGuest.guest_phone ? normalizePhone(poGuest.guest_phone) : null;

        // Step 1: Check public.users table for existing user by email
        const { data: existingUser } = await admin
          .from("users")
          .select("id, phone")
          .eq("email", poGuest.guest_email)
          .maybeSingle();

        let matchedUserId: string | null = null;

        if (existingUser) {
          // Existing user found in public.users — use them
          console.log("[verify] Found existing user in public.users:", existingUser.id);
          matchedUserId = existingUser.id;
        }

        if (matchedUserId) {
          userId = matchedUserId;
          await admin
            .from("payment_orders")
            .update({ user_id: userId })
            .eq("id", payment_order_id);
        } else {
          // Previously this called admin.auth.admin.listUsers() with no
          // pagination — an unbounded scan of the entire auth.users
          // table on every guest checkout. On a large user base this
          // can time out or return a truncated page (missing the user
          // we care about) and drop the order to needs_review.
          //
          // Use the GoTrue admin REST endpoint directly with the
          // ?email=<email> filter for an O(1) lookup.
          let existingAuthUser: any = null;
          try {
            existingAuthUser = await findAuthUserByEmail(
              Deno.env.get("SUPABASE_URL")!,
              Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
              poGuest.guest_email
            );
          } catch (listErr) {
            console.warn("[verify] Could not look up auth user:", listErr);
          }

          if (existingAuthUser) {
            console.log("[verify] Found existing auth user:", existingAuthUser.id);
            userId = existingAuthUser.id;

            await admin.from("users").upsert(
              {
                id: userId,
                email: poGuest.guest_email,
                full_name: poGuest.guest_name,
                phone: normalizedPhone,
              },
              { onConflict: "id" }
            );

            await admin
              .from("payment_orders")
              .update({ user_id: userId })
              .eq("id", payment_order_id);
          } else {
            console.log("[verify] Creating new auth user for:", poGuest.guest_email);
            const { data: newUser, error: createError } =
              await admin.auth.admin.createUser({
                email: poGuest.guest_email,
                email_confirm: true,
                user_metadata: {
                  full_name: poGuest.guest_name,
                  phone: normalizedPhone,
                },
              });

            if (createError) {
              console.error("[verify] createUser failed:", createError.message);

              if (createError.message?.includes("already") || createError.message?.includes("exists")) {
                console.log("[verify] Attempting fallback: fetching existing auth user");
                try {
                  const fallbackUser = await findAuthUserByEmail(
                    Deno.env.get("SUPABASE_URL")!,
                    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
                    poGuest.guest_email
                  );

                  if (fallbackUser) {
                    userId = fallbackUser.id;
                    console.log("[verify] Fallback succeeded, user:", userId);

                    await admin.from("users").upsert(
                      {
                        id: userId,
                        email: poGuest.guest_email,
                        full_name: poGuest.guest_name,
                        phone: normalizedPhone,
                      },
                      { onConflict: "id" }
                    );

                    await admin
                      .from("payment_orders")
                      .update({ user_id: userId })
                      .eq("id", payment_order_id);
                  } else {
                    // Don't throw — the customer's payment was captured
                    // and we cannot afford to lose them. Park the order
                    // for ops review and tell the client to contact
                    // support, instead of erroring out.
                    console.error(
                      "[verify] Fallback list found no user; parking order for review:",
                      payment_order_id
                    );
                    await admin
                      .from("payment_orders")
                      .update({ status: "needs_review" })
                      .eq("id", payment_order_id);
                    return jsonRes(
                      {
                        success: false,
                        needs_review: true,
                        error:
                          "Payment received but we couldn't create your account automatically. Our team will email you within a few hours.",
                      },
                      202
                    );
                  }
                } catch (fallbackErr) {
                  console.error("[verify] Fallback also failed:", fallbackErr);
                  await admin
                    .from("payment_orders")
                    .update({ status: "needs_review" })
                    .eq("id", payment_order_id);
                  return jsonRes(
                    {
                      success: false,
                      needs_review: true,
                      error:
                        "Payment received but we couldn't create your account automatically. Our team will email you within a few hours.",
                    },
                    202
                  );
                }
              } else {
                // Any other createUser error: don't drop the customer's
                // money on the floor. Park for manual recovery.
                console.error(
                  "[verify] Non-duplicate createUser failure; parking order:",
                  payment_order_id,
                  createError.message
                );
                await admin
                  .from("payment_orders")
                  .update({ status: "needs_review" })
                  .eq("id", payment_order_id);
                return jsonRes(
                  {
                    success: false,
                    needs_review: true,
                    error:
                      "Payment received but we couldn't create your account automatically. Our team will email you within a few hours.",
                  },
                  202
                );
              }
            } else {
              userId = newUser.user.id;
              console.log("[verify] New user created:", userId);

              await admin
                .from("payment_orders")
                .update({ user_id: userId })
                .eq("id", payment_order_id);

              if (normalizedPhone) {
                await admin
                  .from("users")
                  .update({ phone: normalizedPhone })
                  .eq("id", userId);
              }
            }
          }
        }

        try {
          const linkResult = await admin.auth.admin.generateLink({
            type: "magiclink",
            email: poGuest.guest_email,
            options: {
              redirectTo: `${Deno.env.get("SITE_URL") || "https://levelup-creator-os.lovable.app"}/home`,
            },
          });
          if (linkResult.data?.properties?.hashed_token) {
            magicLinkToken = linkResult.data.properties.hashed_token;
            console.log("[verify] Magic link token captured for:", poGuest.guest_email);
          } else {
            console.log("[verify] Magic link generated (no token in response) for:", poGuest.guest_email);
          }
        } catch (linkErr) {
          console.error("[verify] Magic link error (non-fatal):", linkErr);
        }
      }
    }

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
         confirmation if there is no balance stage). For non-staged,
         enrol immediately. ── */
    const isStaged = !!po.payment_type;
    const shouldEnrol = !isStaged || po.payment_type === "balance" || po.payment_type === "confirmation";

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

    return jsonRes({
      success: true,
      offering_title: off?.title ?? "your program",
      is_guest: is_guest || false,
      magic_link_sent: is_guest || false,
      magic_link_token: magicLinkToken || null,
      guest_email: responseGuestEmail,
    });
  } catch (err: any) {
    console.error("[verify] UNHANDLED ERROR:", err?.message || err, err?.stack);
    return jsonRes({ error: `Internal server error: ${err?.message || "unknown"}` }, 500);
  }
});
