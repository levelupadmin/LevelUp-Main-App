import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get user from token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { event_id } = await req.json();
    if (!event_id) {
      return new Response(JSON.stringify({ error: "event_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Fetch event
    const { data: event, error: eventErr } = await admin.from("events").select("*").eq("id", event_id).single();
    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Reject if the event has been disabled or is no longer accepting registrations.
    if (event.is_active === false) {
      return new Response(JSON.stringify({ error: "This event is no longer available" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (event.status === "cancelled") {
      return new Response(JSON.stringify({ error: "This event has been cancelled" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (event.status === "completed") {
      return new Response(JSON.stringify({ error: "This event has already ended" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (event.status === "sold_out") {
      return new Response(JSON.stringify({ error: "Event is sold out" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check capacity
    if (event.max_capacity) {
      const { count } = await admin.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", event_id).eq("status", "registered");
      if ((count ?? 0) >= event.max_capacity) {
        return new Response(JSON.stringify({ error: "Event is sold out" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // If the user previously cancelled, reactivate that row instead of
    // inserting a fresh one (the partial unique index allows this).
    const { data: existingReg } = await admin
      .from("event_registrations")
      .select("id, status")
      .eq("event_id", event_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingReg && existingReg.status === "registered") {
      return new Response(JSON.stringify({ registered: true, already: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Determine if free
    let isFree = event.pricing_type === "free";

    if (event.pricing_type === "free_for_enrolled") {
      const { data: efcs } = await admin.from("event_free_courses").select("course_id").eq("event_id", event_id);
      if (efcs && efcs.length > 0) {
        const courseIds = efcs.map((e: any) => e.course_id);
        const { data: ocs } = await admin.from("offering_courses").select("offering_id").in("course_id", courseIds);
        if (ocs && ocs.length > 0) {
          const offeringIds = [...new Set(ocs.map((o: any) => o.offering_id))];
          const { data: enrolments } = await admin
            .from("enrolments")
            .select("id")
            .eq("user_id", user.id)
            .eq("status", "active")
            .in("offering_id", offeringIds)
            .limit(1);
          if (enrolments && enrolments.length > 0) {
            isFree = true;
          }
        }
      }
    }

    if (isFree || event.pricing_type === "free") {
      let regErr;
      if (existingReg) {
        // Reactivate the cancelled row
        const res = await admin
          .from("event_registrations")
          .update({ status: "registered", amount_paid: 0, registered_at: new Date().toISOString() })
          .eq("id", existingReg.id);
        regErr = res.error;
      } else {
        const res = await admin.from("event_registrations").insert({
          event_id,
          user_id: user.id,
          status: "registered",
          amount_paid: 0,
        });
        regErr = res.error;
      }
      if (regErr) {
        return new Response(JSON.stringify({ error: regErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ registered: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Paid — create Razorpay order
    const keyId = Deno.env.get("RAZORPAY_KEY_ID")!;
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;

    if (!event.price_inr || typeof event.price_inr !== "number" || event.price_inr <= 0) {
      return new Response(JSON.stringify({ error: "Event price is not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      },
      body: JSON.stringify({
        // event.price_inr is stored in paise (see migration
        // 20260408151100 / verify-event-payment comparison). Do NOT
        // multiply here.
        amount: event.price_inr,
        currency: "INR",
        notes: { event_id, user_id: user.id },
      }),
    });

    // Previously we called .json() unconditionally, so a Razorpay 4xx/5xx
    // (bad credentials, merchant suspended, etc.) would return
    // razorpay_order_id: undefined to the client and the browser would open
    // a broken Razorpay checkout. Fail loud instead.
    if (!rzpRes.ok) {
      const errText = await rzpRes.text().catch(() => "");
      console.error("[register-for-event] Razorpay order create failed:", rzpRes.status, errText);
      return new Response(JSON.stringify({ error: "Payment gateway unavailable. Please try again." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rzpOrder = await rzpRes.json();
    if (!rzpOrder?.id) {
      console.error("[register-for-event] Razorpay response missing id:", rzpOrder);
      return new Response(JSON.stringify({ error: "Payment gateway returned an invalid response" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      registered: false,
      razorpay_order_id: rzpOrder.id,
      amount: event.price_inr,
      key_id: keyId,
      event_id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
