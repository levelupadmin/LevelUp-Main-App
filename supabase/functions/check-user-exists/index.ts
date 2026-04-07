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

    if (!email && !phone) {
      return jsonRes({ error: "Email or phone required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let exists = false;
    let userId: string | null = null;

    if (email) {
      const { data } = await admin
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (data) {
        exists = true;
        userId = data.id;
      }
    }

    if (!exists && phone) {
      const { data } = await admin
        .from("users")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      if (data) {
        exists = true;
        userId = data.id;
      }
    }

    return jsonRes({ exists, user_id: userId });
  } catch (err) {
    console.error("check-user-exists error:", err);
    return jsonRes({ error: err.message }, 500);
  }
});
