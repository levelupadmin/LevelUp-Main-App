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
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID")!;

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
      .select("price_inr, title, is_active, status")
      .eq("id", event_id)
      .single();

    if (!event) return jsonRes({ error: "Event not found" }, 404);
    if (event.is_active === false || event.status === "cancelled") {
      return jsonRes({ error: "This event is no longer accepting payments" }, 400);
    }

    // CRITICAL: cross-check with Razorpay that the captured payment was
    // actually for THIS event and for the right amount. Without this an
    // attacker could pay for any cheap event (or any other order on this
    // merchant account) and have the client tell us "I paid for the
    // expensive one." We verify three things from Razorpay's side:
    //   1. The payment is captured / authorized
    //   2. The payment's order_id matches the order_id the client gave us
    //   3. The notes.event_id on the order matches the event_id the client
    //      claims to have paid for
    //   4. The captured amount matches the event's price exactly
    const rpRes = await fetch(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      {
        headers: { Authorization: "Basic " + btoa(`${razorpayKeyId}:${razorpaySecret}`) },
      }
    );
    if (!rpRes.ok) {
      console.error("[verify-event-payment] Razorpay API failed:", rpRes.status);
      return jsonRes({ error: "Could not verify payment with Razorpay" }, 502);
    }
    const payment = await rpRes.json();

    if (payment.status !== "captured" && payment.status !== "authorized") {
      return jsonRes({ error: `Payment is not in a captured state (${payment.status})` }, 400);
    }
    if (payment.order_id !== razorpay_order_id) {
      console.error(
        "[verify-event-payment] order_id mismatch:",
        "expected", razorpay_order_id,
        "got", payment.order_id
      );
      return jsonRes({ error: "Payment does not match the supplied order" }, 400);
    }

    const expectedAmount = Number(event.price_inr ?? 0);
    if (typeof payment.amount !== "number" || payment.amount !== expectedAmount) {
      console.error(
        "[verify-event-payment] amount mismatch: expected", expectedAmount,
        "got", payment.amount
      );
      return jsonRes({ error: "Payment amount does not match event price" }, 400);
    }

    // notes are echoed back from the order; the create call sets
    // notes: { event_id, user_id } in register-for-event.
    const noteEventId = payment.notes?.event_id;
    if (!noteEventId || noteEventId !== event_id) {
      console.error(
        "[verify-event-payment] notes.event_id mismatch:",
        "expected", event_id, "got", noteEventId
      );
      return jsonRes({ error: "Payment was not made for this event" }, 400);
    }
    const noteUserId = payment.notes?.user_id;
    if (noteUserId && noteUserId !== user.id) {
      console.error(
        "[verify-event-payment] notes.user_id mismatch:",
        "expected", user.id, "got", noteUserId
      );
      return jsonRes({ error: "Payment was not made by this user" }, 400);
    }

    // Reactivate cancelled / re-use existing registered row instead of
    // tripping the partial unique index.
    const { data: existing } = await admin
      .from("event_registrations")
      .select("id, status")
      .eq("event_id", event_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing && existing.status === "registered") {
      return jsonRes({ registered: true, message: "Already registered", event_title: event.title });
    }

    let writeErr;
    if (existing) {
      const res = await admin
        .from("event_registrations")
        .update({
          status: "registered",
          payment_id: razorpay_payment_id,
          amount_paid: expectedAmount,
          registered_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      writeErr = res.error;
    } else {
      const res = await admin.from("event_registrations").insert({
        event_id,
        user_id: user.id,
        status: "registered",
        payment_id: razorpay_payment_id,
        amount_paid: expectedAmount,
      });
      writeErr = res.error;
    }

    if (writeErr) return jsonRes({ error: writeErr.message }, 500);

    return jsonRes({ registered: true, event_title: event.title });
  } catch (err) {
    console.error("Error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
