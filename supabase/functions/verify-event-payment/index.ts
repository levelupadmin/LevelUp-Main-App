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

async function verifySignature(
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
  const message = `${orderId}|${paymentId}`;
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "No auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const razorpaySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return jsonRes({ error: "Invalid token" }, 401);

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, event_id } =
      await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !event_id)
      return jsonRes({ error: "Missing required fields" }, 400);

    const isValid = await verifySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpaySecret
    );

    if (!isValid) return jsonRes({ error: "Invalid payment signature" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: event } = await admin
      .from("events")
      .select("price_inr, title")
      .eq("id", event_id)
      .single();

    // Check duplicate
    const { data: existing } = await admin
      .from("event_registrations")
      .select("id")
      .eq("event_id", event_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) return jsonRes({ registered: true, message: "Already registered" });

    const { error: regErr } = await admin.from("event_registrations").insert({
      event_id,
      user_id: user.id,
      status: "registered",
      payment_id: razorpay_payment_id,
      amount_paid: event?.price_inr ?? 0,
    });

    if (regErr) return jsonRes({ error: regErr.message }, 500);

    return jsonRes({ registered: true, event_title: event?.title });
  } catch (err) {
    console.error("Error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
