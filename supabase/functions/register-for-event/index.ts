import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.1/cors";

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

    // Check capacity
    if (event.max_capacity) {
      const { count } = await admin.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", event_id).eq("status", "registered");
      if ((count ?? 0) >= event.max_capacity) {
        return new Response(JSON.stringify({ error: "Event is sold out" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Determine if free
    let isFree = event.pricing_type === "free";

    if (event.pricing_type === "free_for_enrolled") {
      // Check if user has active enrolment in any linked course
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
      // Register directly
      const { error: regErr } = await admin.from("event_registrations").insert({
        event_id,
        user_id: user.id,
        status: "registered",
        amount_paid: 0,
      });
      if (regErr) {
        return new Response(JSON.stringify({ error: regErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ registered: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Paid - create Razorpay order (simplified - reuse existing pattern)
    const keyId = Deno.env.get("RAZORPAY_KEY_ID")!;
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      },
      body: JSON.stringify({
        amount: event.price_inr,
        currency: "INR",
        notes: { event_id, user_id: user.id },
      }),
    });
    const rzpOrder = await rzpRes.json();

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
