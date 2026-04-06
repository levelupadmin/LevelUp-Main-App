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
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      payment_order_id,
    } = await req.json();

    if (
      !razorpay_payment_id ||
      !razorpay_order_id ||
      !razorpay_signature ||
      !payment_order_id
    )
      return jsonRes({ error: "Missing required fields" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* ── Verify signature ── */
    const secret = Deno.env.get("RAZORPAY_KEY_SECRET")!;
    const valid = await verifyHmac(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      secret
    );

    if (!valid) {
      await admin
        .from("payment_orders")
        .update({ status: "failed" })
        .eq("id", payment_order_id);
      return jsonRes({ error: "Invalid payment signature" }, 400);
    }

    /* ── Get payment order ── */
    const { data: po, error: poErr } = await admin
      .from("payment_orders")
      .select("*")
      .eq("id", payment_order_id)
      .eq("user_id", userId)
      .single();

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

    /* ── Create enrolment for main offering ── */
    const { data: enrolment, error: enrolErr } = await admin
      .from("enrolments")
      .insert({
        user_id: userId,
        offering_id: po.offering_id,
        payment_order_id: po.id,
        status: "active",
        source: "checkout",
      })
      .select("id")
      .single();

    if (enrolErr) {
      console.error("Enrolment error:", enrolErr);
      return jsonRes({ error: "Failed to create enrolment" }, 500);
    }

    /* ── Enrol bump offerings ── */
    if (po.bump_offering_ids && po.bump_offering_ids.length > 0) {
      for (const bumpOffId of po.bump_offering_ids) {
        await admin.from("enrolments").insert({
          user_id: userId,
          offering_id: bumpOffId,
          payment_order_id: po.id,
          status: "active",
          source: "checkout",
        });
      }
    }

    /* ── Audit log ── */
    await admin.from("enrolment_audit_log").insert({
      enrolment_id: enrolment.id,
      action: "created",
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
    });
  } catch (err) {
    console.error("Error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
