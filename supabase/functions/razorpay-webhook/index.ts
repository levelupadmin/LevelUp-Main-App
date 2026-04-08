import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("x-razorpay-signature");
    const body = await req.text();

    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("RAZORPAY_WEBHOOK_SECRET not configured. This is separate from RAZORPAY_KEY_SECRET. Set it in Supabase Edge Function Secrets.");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!signature || !(await verifySignature(body, signature, webhookSecret))) {
      console.error("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(body);
    const eventType = event.event;

    if (eventType !== "payment.captured") {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment) {
      return new Response(JSON.stringify({ error: "No payment entity" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const razorpayOrderId = payment.order_id;
    const razorpayPaymentId = payment.id;
    const offeringId = payment.notes?.offering_id;
    const userId = payment.notes?.user_id;

    if (!razorpayOrderId || !offeringId || !userId) {
      console.error("Missing required notes on payment:", payment.notes);
      return new Response(
        JSON.stringify({ error: "Missing payment metadata" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Update payment order status
    const { error: updateError } = await adminClient
      .from("payment_orders")
      .update({
        status: "captured",
        razorpay_payment_id: razorpayPaymentId,
        captured_at: new Date().toISOString(),
      })
      .eq("razorpay_order_id", razorpayOrderId);

    if (updateError) {
      console.error("Failed to update payment_orders:", updateError);
    }

    // Check if already enrolled
    const { data: existing } = await adminClient
      .from("enrolments")
      .select("id")
      .eq("user_id", userId)
      .eq("offering_id", offeringId)
      .eq("status", "active")
      .maybeSingle();

    if (!existing) {
      const { error: enrollError } = await adminClient
        .from("enrolments")
        .insert({
          user_id: userId,
          offering_id: offeringId,
          status: "active",
          source: "checkout",
        });

      if (enrollError) {
        console.error("Failed to create enrolment:", enrollError);
        return new Response(
          JSON.stringify({ error: "Enrolment creation failed" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, enrolment: "created" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
