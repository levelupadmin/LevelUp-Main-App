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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return jsonRes({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return jsonRes({ error: "Unauthorized" }, 401);

    // Verify admin server-side
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: userRow } = await admin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (userRow?.role !== "admin") {
      return jsonRes({ error: "Forbidden" }, 403);
    }

    const { title } = await req.json();
    if (!title || typeof title !== "string") {
      return jsonRes({ error: "title is required" }, 400);
    }

    const vdoApiKey = Deno.env.get("VDOCIPHER_API_KEY");
    if (!vdoApiKey) {
      console.error("VDOCIPHER_API_KEY not configured");
      return jsonRes({ error: "Video service not configured" }, 500);
    }

    const vdoRes = await fetch(
      `https://dev.vdocipher.com/api/videos?title=${encodeURIComponent(title)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Apisecret ${vdoApiKey}`,
        },
      }
    );

    if (!vdoRes.ok) {
      const errText = await vdoRes.text();
      console.error("VdoCipher create video error:", vdoRes.status, errText);
      return jsonRes({ error: "Failed to create video on VdoCipher" }, 502);
    }

    const vdoData = await vdoRes.json();
    return jsonRes({ clientPayload: vdoData.clientPayload, videoId: vdoData.videoId });
  } catch (err) {
    console.error("vdocipher-upload-credential error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
