// get-video-upload-url — admin-only. Mints a one-time signed UPLOAD url into the
// PRIVATE `protected-video` bucket so an uploaded course video is download-
// protected the moment it lands (no public URL ever exists). Pair with a chapter
// set to media_provider='supabase-signed'; playback then goes through
// get-video-src. This is what makes protection the default for new uploads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const BUCKET = "protected-video";

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed =
    !!origin &&
    (origin.endsWith("leveluplearning.in") ||
      origin.startsWith("capacitor://") ||
      origin.startsWith("http://localhost") ||
      origin.startsWith("https://localhost"));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://app.leveluplearning.in",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: urow } = await admin.from("users").select("role").eq("id", user.id).single();
    if (urow?.role !== "admin" && urow?.role !== "owner") {
      return json({ error: "Forbidden — admins only" }, 403);
    }

    const { filename, course_id } = await req.json().catch(() => ({}));
    const safe = String(filename || "video.mp4")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(-80);
    const folder = String(course_id || "misc").replace(/[^a-zA-Z0-9._-]/g, "-");
    const key = `uploads/${folder}/${crypto.randomUUID()}-${safe}`;

    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(key);
    if (error || !data) return json({ error: error?.message || "Could not create upload URL" }, 500);

    // path is the object key the chapter should store in media_url.
    return json({ signedUrl: data.signedUrl, token: data.token, path: key });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
