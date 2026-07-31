// get-video-src — mint a short-lived signed URL for a video stored in the
// PRIVATE `protected-video` bucket, but ONLY for a caller who is enrolled in an
// offering that contains the chapter (or the chapter is a free preview, or the
// caller is an admin/owner). This is the free alternative to VdoCipher DRM: the
// file has no public URL, and the signed URL it returns expires, so it can't be
// shared or scraped. Access logic mirrors get-vdocipher-otp deliberately.
//
// verify_jwt is OFF at the platform layer (like get-vdocipher-otp) so anon
// callers can reach make_free previews; every non-free path is gated here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const BUCKET = "protected-video";
const TTL_SECONDS = 4 * 60 * 60; // 4h — long enough for one sitting, short enough that a leaked URL dies

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
    let user: { id: string } | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user: u } } = await sb.auth.getUser();
      if (u) user = u;
    }

    const { chapter_id } = await req.json();
    if (!chapter_id) return json({ error: "chapter_id is required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: chapter, error: chErr } = await admin
      .from("chapters")
      .select("id, media_url, media_provider, make_free, section_id")
      .eq("id", chapter_id)
      .single();
    if (chErr || !chapter) return json({ error: "Chapter not found" }, 404);
    if (chapter.media_provider !== "supabase-signed" || !chapter.media_url) {
      return json({ error: "This chapter is not a protected video" }, 400);
    }

    // Access gate — identical shape to get-vdocipher-otp.
    if (!chapter.make_free) {
      if (!user) return json({ error: "Sign in to watch this lesson." }, 401);

      const { data: section } = await admin
        .from("sections")
        .select("course_id")
        .eq("id", chapter.section_id)
        .single();
      if (!section) return json({ error: "Section not found" }, 404);

      const { data: enrolments } = await admin
        .from("enrolments")
        .select("offering_id")
        .eq("user_id", user.id)
        .eq("status", "active");

      let hasAccess = false;
      const offeringIds = (enrolments || [])
        .map((e) => e.offering_id)
        .filter((v): v is string => !!v);
      if (offeringIds.length > 0) {
        const { data: ocs } = await admin
          .from("offering_courses")
          .select("course_id")
          .in("offering_id", offeringIds)
          .eq("course_id", section.course_id);
        hasAccess = !!(ocs && ocs.length > 0);
      }

      if (!hasAccess) {
        const { data: userRow } = await admin
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();
        if (userRow?.role !== "admin" && userRow?.role !== "owner") {
          return json(
            { error: "You don't have access to this video. Please enrol in the course to watch." },
            403
          );
        }
      }
    }

    const { data: signed, error: sErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(chapter.media_url, TTL_SECONDS);
    if (sErr || !signed?.signedUrl) {
      return json({ error: "Could not sign video", detail: sErr?.message }, 500);
    }

    return json({ url: signed.signedUrl, expires_in: TTL_SECONDS });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
