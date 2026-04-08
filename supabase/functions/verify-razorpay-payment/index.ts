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

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return digits;
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
  return computed === signature;
}

async function verifyViaApi(
  paymentId: string,
  expectedOrderId: string,
  keyId: string,
  keySecret: string
): Promise<{ verified: boolean; status?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
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
    });
    if (
      (payment.status === "captured" || payment.status === "authorized") &&
      payment.order_id === expectedOrderId
    ) {
      return { verified: true, status: payment.status };
    }
    return {
      verified: false,
      error: `Payment status: ${payment.status}, order mismatch: ${payment.order_id !== expectedOrderId}`,
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

    /* ── Verify signature ── */
    const secret = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();
    if (!secret) {
      console.error("[verify] RAZORPAY_KEY_SECRET is not set!");
      return jsonRes({ error: "Payment verification misconfigured" }, 500);
    }
    console.log("[verify] HMAC check:", {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signatureLength: razorpay_signature?.length,
      secretLength: secret.length,
    });

    const valid = await verifyHmac(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      secret
    );

    console.log("[verify] HMAC result:", valid);
    if (!valid) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const data = `${razorpay_order_id}|${razorpay_payment_id}`;
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
      const computed = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      console.error(
        "[verify] HMAC MISMATCH — expected:",
        razorpay_signature?.substring(0, 12) + "...",
        "computed:",
        computed.substring(0, 12) + "..."
      );
      await admin
        .from("payment_orders")
        .update({ status: "failed" })
        .eq("id", payment_order_id);
      return jsonRes({ error: "Invalid payment signature. Key pair may be mismatched." }, 400);
    }

    console.log("[verify] HMAC passed, looking up payment order:", payment_order_id);

    /* ── Get payment order ── */
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
          let existingAuthUser: any = null;
          try {
            const { data: usersList } = await admin.auth.admin.listUsers();
            existingAuthUser = usersList?.users?.find(
              (u: any) => u.email?.toLowerCase() === poGuest.guest_email.toLowerCase()
            );
          } catch (listErr) {
            console.warn("[verify] Could not list auth users:", listErr);
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
                  const { data: fallbackList } = await admin.auth.admin.listUsers();
                  const fallbackUser = fallbackList?.users?.find(
                    (u: any) => u.email?.toLowerCase() === poGuest.guest_email.toLowerCase()
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
                    throw new Error("Could not find or create user account");
                  }
                } catch (fallbackErr) {
                  console.error("[verify] Fallback also failed:", fallbackErr);
                  throw createError;
                }
              } else {
                throw createError;
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
          await admin.auth.admin.generateLink({
            type: "magiclink",
            email: poGuest.guest_email,
            options: {
              redirectTo: `${Deno.env.get("SITE_URL") || "https://levelup-creator-os.lovable.app"}/home`,
            },
          });
          console.log("[verify] Magic link generated for:", poGuest.guest_email);
        } catch (linkErr) {
          console.error("[verify] Magic link error (non-fatal):", linkErr);
        }
      }
    }

    if (!userId) {
      return jsonRes({ error: "Unable to resolve user for enrolment" }, 500);
    }

    console.log("[verify] Creating enrolment for user:", userId, "offering:", po.offering_id);
    /* ── Create enrolment for main offering (with duplicate guard) ── */
    const { data: existingEnrolment } = await admin
      .from("enrolments")
      .select("id")
      .eq("user_id", userId)
      .eq("offering_id", po.offering_id)
      .maybeSingle();

    let enrolmentId: string;

    if (!existingEnrolment) {
      const { data: enrolment, error: enrolErr } = await admin
        .from("enrolments")
        .insert({
          user_id: userId,
          offering_id: po.offering_id,
          payment_order_id: po.id,
          status: "active",
          source: is_guest ? "purchase_guest" : "purchase",
        })
        .select("id")
        .single();

      if (enrolErr) {
        console.error("Enrolment error:", enrolErr);
        return jsonRes({ error: "Failed to create enrolment" }, 500);
      }
      enrolmentId = enrolment.id;
    } else {
      enrolmentId = existingEnrolment.id;
    }

    /* ── Enrol bump offerings ── */
    if (po.bump_offering_ids && po.bump_offering_ids.length > 0) {
      for (const bumpOffId of po.bump_offering_ids) {
        const { data: existingBump } = await admin
          .from("enrolments")
          .select("id")
          .eq("user_id", userId)
          .eq("offering_id", bumpOffId)
          .maybeSingle();

        if (!existingBump) {
          await admin.from("enrolments").insert({
            user_id: userId,
            offering_id: bumpOffId,
            payment_order_id: po.id,
            status: "active",
            source: is_guest ? "purchase_guest" : "purchase",
          });
        }
      }
    }

    /* ── Audit log ── */
    await admin.from("enrolment_audit_log").insert({
      enrolment_id: enrolmentId,
      action: "granted",
      actor_user_id: userId,
      metadata: {
        payment_order_id: po.id,
        razorpay_payment_id,
        total_inr: po.total_inr,
      },
    });

    /* ── Get offering title for client ── */
    const { data: off } = await admin
      .from("offerings")
      .select("title")
      .eq("id", po.offering_id)
      .single();

    return jsonRes({
      success: true,
      offering_title: off?.title ?? "your program",
      is_guest: is_guest || false,
      magic_link_sent: is_guest || false,
    });
  } catch (err: any) {
    console.error("[verify] UNHANDLED ERROR:", err?.message || err, err?.stack);
    return jsonRes({ error: `Internal server error: ${err?.message || "unknown"}` }, 500);
  }
});
