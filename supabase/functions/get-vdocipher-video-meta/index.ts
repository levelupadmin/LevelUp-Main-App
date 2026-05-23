// get-vdocipher-video-meta
// ----------------------------------------------------------------------------
// Admin-only metadata fetch for a VdoCipher video. Returns:
//   { duration_seconds: number, thumbnail_url: string | null }
//
// Used by the admin curriculum editor to auto-populate chapters.duration_seconds
// and chapters.vdocipher_thumbnail_url whenever a vdocipher_video_id is set
// on a chapter. Saves content folks from manually copying the duration out
// of VdoCipher and lets the Up Next rail show a real poster instead of a
// numbered tile.
//
// Auth: requires an authenticated Supabase session AND public.users.role
// to be 'admin' or 'owner'. Non-admins get 403.
//
// We never expose the VdoCipher Apisecret to the client; this function is
// the only path to that key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeaders } from "../_shared/cors.ts";

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

    // Admin gate. We use service-role here because public.users RLS only
    // exposes the caller's own row to non-admins, which is fine, but we
    // want to be explicit about the read.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: userRow } = await admin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!userRow || (userRow.role !== "admin" && userRow.role !== "owner")) {
      return jsonRes({ error: "Forbidden" }, 403);
    }

    const { video_id } = await req.json();
    if (!video_id || typeof video_id !== "string") {
      return jsonRes({ error: "video_id is required" }, 400);
    }

    const vdoApiKey = Deno.env.get("VDOCIPHER_API_KEY");
    if (!vdoApiKey) {
      console.error("VDOCIPHER_API_KEY not configured");
      return jsonRes({ error: "Video service not configured" }, 500);
    }

    // VdoCipher's videos endpoint returns { id, title, length (seconds),
    // status, posters: [{ url, width, height }, ...], ... }. We pick the
    // highest-resolution poster as our thumbnail.
    const vdoRes = await fetch(
      `https://dev.vdocipher.com/api/videos/${encodeURIComponent(video_id)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Apisecret ${vdoApiKey}`,
          Accept: "application/json",
        },
      }
    );

    if (!vdoRes.ok) {
      const errText = await vdoRes.text();
      console.error("VdoCipher meta error:", vdoRes.status, errText);
      if (vdoRes.status === 404) {
        return jsonRes({ error: "Video not found in VdoCipher" }, 404);
      }
      return jsonRes({ error: "Failed to fetch video metadata" }, 502);
    }

    const vdoData = await vdoRes.json();

    const lengthSeconds =
      typeof vdoData?.length === "number"
        ? Math.round(vdoData.length)
        : null;

    // posters is sometimes an array of { url, width, height } objects,
    // sometimes a single object, sometimes absent. Normalise.
    type Poster = { url?: string; width?: number; height?: number };
    let posters: Poster[] = [];
    if (Array.isArray(vdoData?.posters)) {
      posters = vdoData.posters as Poster[];
    } else if (vdoData?.posters && typeof vdoData.posters === "object") {
      posters = [vdoData.posters as Poster];
    }

    // Pick the highest-resolution poster with a non-empty url.
    let bestPoster: string | null = null;
    let bestArea = 0;
    for (const p of posters) {
      if (!p?.url || typeof p.url !== "string") continue;
      const area = (p.width ?? 0) * (p.height ?? 0);
      if (!bestPoster || area > bestArea) {
        bestPoster = p.url;
        bestArea = area;
      }
    }

    return jsonRes({
      duration_seconds: lengthSeconds,
      thumbnail_url: bestPoster,
    });
  } catch (err) {
    console.error("get-vdocipher-video-meta error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
