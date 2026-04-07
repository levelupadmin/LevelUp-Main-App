import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, phone } = await req.json();

    if (!email || !phone) {
      return jsonRes({ error: "Both email and phone are required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up user by email
    const { data: emailUser } = await admin
      .from("users")
      .select("id, phone")
      .eq("email", email)
      .maybeSingle();

    // Look up user by phone
    const { data: phoneUser } = await admin
      .from("users")
      .select("id, email")
      .eq("phone", phone)
      .maybeSingle();

    // Scenario A: email exists AND (user has no phone on file OR phone matches)
    if (emailUser) {
      if (!emailUser.phone || emailUser.phone === phone) {
        return jsonRes({ scenario: "A", user_id: emailUser.id });
      }
      // Email exists but phone doesn't match → mismatch
      return jsonRes({ scenario: "C", user_id: null });
    }

    // Email doesn't exist
    if (phoneUser) {
      // Phone belongs to someone else
      return jsonRes({ scenario: "C", user_id: null });
    }

    // Neither exists → new user
    return jsonRes({ scenario: "B", user_id: null });
  } catch (err) {
    console.error("check-user-exists error:", err);
    return jsonRes({ error: err.message }, 500);
  }
});
