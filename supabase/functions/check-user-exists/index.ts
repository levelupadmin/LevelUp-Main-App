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

    if (!email) {
      return jsonRes({ error: "Email is required" }, 400);
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

    // Look up user by phone (if provided)
    let phoneUser: { id: string } | null = null;
    if (phone) {
      const { data } = await admin
        .from("users")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      phoneUser = data;
    }

    // Scenario logic
    if (emailUser) {
      // Email exists
      if (!phone) {
        // No phone submitted yet — treat as match
        return jsonRes({ scenario: "A", message: "verified" });
      }
      // Phone was submitted — check if it matches
      if (emailUser.phone === phone) {
        // Phone matches the same user
        return jsonRes({ scenario: "A", message: "verified" });
      }
      if (!emailUser.phone && !phoneUser) {
        // User has no phone on file, and phone doesn't belong to anyone else — safe
        return jsonRes({ scenario: "A", message: "verified" });
      }
      // Phone belongs to a different user OR doesn't match user's phone on file
      return jsonRes({ scenario: "C", message: "mismatch" });
    }

    // Email does NOT exist
    if (phoneUser) {
      // Phone belongs to an existing user but email doesn't match — mismatch
      return jsonRes({ scenario: "C", message: "mismatch" });
    }

    // Neither email nor phone exist
    return jsonRes({ scenario: "B", message: "new_user" });
  } catch (err) {
    console.error("check-user-exists error:", err);
    return jsonRes({ error: err.message }, 500);
  }
});
