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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonRes({ error: "Unauthorized" }, 401);

    // Create service role client
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify admin role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return jsonRes({ error: "Unauthorized" }, 401);

    const { data: profile } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return jsonRes({ error: "Forbidden" }, 403);

    const { refund_id } = await req.json();
    if (!refund_id) return jsonRes({ error: "refund_id required" }, 400);

    // Fetch refund + payment order
    const { data: refund } = await admin.from("refunds").select("*, payment_orders(*)").eq("id", refund_id).maybeSingle();
    if (!refund) return jsonRes({ error: "Refund not found" }, 404);
    if (refund.status !== "initiated") return jsonRes({ error: "Refund already processed" }, 400);

    // Update to processing
    await admin.from("refunds").update({ status: "processing" }).eq("id", refund_id);

    // Call Razorpay Refund API
    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
    const authBasic = "Basic " + encodeBase64(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const rzpRes = await fetch(
      `https://api.razorpay.com/v1/payments/${refund.razorpay_payment_id}/refunds`,
      {
        method: "POST",
        headers: { Authorization: authBasic, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(refund.amount_inr * 100), // Convert to paise
          notes: { reason: refund.reason, refund_id: refund.id },
        }),
      }
    );

    const rzpData = await rzpRes.json();

    if (!rzpRes.ok) {
      await admin.from("refunds").update({
        status: "failed",
        error_message: rzpData.error?.description || JSON.stringify(rzpData),
      }).eq("id", refund_id);
      return jsonRes({ error: "Razorpay refund failed", details: rzpData }, 400);
    }

    // Success - update refund
    await admin.from("refunds").update({
      status: "completed",
      razorpay_refund_id: rzpData.id,
      completed_at: new Date().toISOString(),
    }).eq("id", refund_id);

    // Update payment_order
    await admin.from("payment_orders").update({
      status: "refunded",
      refunded_at: new Date().toISOString(),
    }).eq("id", refund.payment_order_id);

    // On full refund, cancel enrolments
    if (refund.refund_type === "full") {
      const { data: enrols } = await admin.from("enrolments")
        .select("id")
        .eq("offering_id", refund.payment_orders.offering_id)
        .eq("user_id", refund.payment_orders.user_id)
        .eq("status", "active");

      if (enrols?.length) {
        await admin.from("enrolments")
          .update({ status: "cancelled" })
          .in("id", enrols.map((e: any) => e.id));
      }
    }

    // Send notification to student
    await admin.from("notifications").insert({
      user_id: refund.payment_orders.user_id,
      type: "refund_processed",
      title: "Refund Processed",
      body: `Your refund of \u20B9${refund.amount_inr} has been processed and will reflect in your account within 5-7 business days.`,
      link: null,
    });

    // Audit log
    await admin.from("admin_audit_logs").insert({
      admin_user_id: user.id,
      action: "refund_completed",
      entity_type: "refund",
      entity_id: refund_id,
      details: {
        payment_order_id: refund.payment_order_id,
        amount: refund.amount_inr,
        refund_type: refund.refund_type,
        razorpay_refund_id: rzpData.id,
      },
    });

    return jsonRes({ success: true, razorpay_refund_id: rzpData.id });
  } catch (err: any) {
    console.error("process-refund error:", err?.message || err);
    return jsonRes({ error: `Internal server error: ${err?.message}` }, 500);
  }
});
