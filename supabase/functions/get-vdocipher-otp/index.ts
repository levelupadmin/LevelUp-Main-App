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

    const { chapter_id } = await req.json();
    if (!chapter_id) return jsonRes({ error: "chapter_id is required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load chapter
    const { data: chapter, error: chErr } = await admin
      .from("chapters")
      .select("id, video_type, vdocipher_video_id, vdocipher_watermark_text, make_free, section_id")
      .eq("id", chapter_id)
      .single();

    if (chErr || !chapter) return jsonRes({ error: "Chapter not found" }, 404);
    if (chapter.video_type !== "vdocipher" || !chapter.vdocipher_video_id)
      return jsonRes({ error: "This chapter does not use VdoCipher video" }, 400);

    // Get course from section
    const { data: section } = await admin
      .from("sections")
      .select("course_id")
      .eq("id", chapter.section_id)
      .single();

    if (!section) return jsonRes({ error: "Section not found" }, 404);

    // Access check — skip for free chapters
    if (!chapter.make_free) {
      // Check enrolment via offering_courses + enrolments
      const { data: accessRows } = await admin
        .from("enrolments")
        .select("id, offering_id")
        .eq("user_id", user.id)
        .eq("status", "active");

      let hasAccess = false;
      if (accessRows && accessRows.length > 0) {
        const offeringIds = accessRows
          .filter((e) => !e.offering_id ? false : true)
          .map((e) => e.offering_id);
        
        if (offeringIds.length > 0) {
          const { data: ocs } = await admin
            .from("offering_courses")
            .select("course_id")
            .in("offering_id", offeringIds)
            .eq("course_id", section.course_id);
          hasAccess = !!(ocs && ocs.length > 0);
        }
      }

      // Also allow admins
      if (!hasAccess) {
        const { data: userRow } = await admin
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();
        if (userRow?.role !== "admin") {
          return jsonRes({ error: "You don't have access to this video. Please enrol in the course to watch." }, 403);
        }
      }
    }

    // Rate limiting: max 60 OTPs per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("vdocipher_video_views")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("otp_issued_at", oneHourAgo);

    if ((count ?? 0) >= 60) {
      return jsonRes({ error: "Too many requests. Please wait a moment and refresh." }, 429);
    }

    // Call VdoCipher OTP API
    const vdoApiKey = Deno.env.get("VDOCIPHER_API_KEY");
    if (!vdoApiKey) {
      console.error("VDOCIPHER_API_KEY not configured");
      return jsonRes({ error: "Video service not configured" }, 500);
    }

    // Use member number or user ID for watermark — never expose email
    let watermarkFallback = "viewer";
    const { data: userRow } = await admin
      .from("users")
      .select("member_number, full_name")
      .eq("id", user.id)
      .single();
    if (userRow?.member_number) {
      watermarkFallback = `#${userRow.member_number}`;
    } else if (userRow?.full_name) {
      watermarkFallback = userRow.full_name;
    }
    const watermarkText = chapter.vdocipher_watermark_text || watermarkFallback;

    const vdoRes = await fetch(
      `https://dev.vdocipher.com/api/videos/${chapter.vdocipher_video_id}/otp`,
      {
        method: "POST",
        headers: {
          Authorization: `Apisecret ${vdoApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ttl: 300,
          annotate: JSON.stringify([
            {
              type: "rtext",
              text: watermarkText,
              alpha: "0.60",
              color: "0xFFFFFF",
              size: "15",
              interval: "5000",
            },
          ]),
        }),
      }
    );

    if (!vdoRes.ok) {
      const errText = await vdoRes.text();
      console.error("VdoCipher OTP error:", vdoRes.status, errText);
      return jsonRes({ error: "Failed to generate video token" }, 502);
    }

    const vdoData = await vdoRes.json();

    // Validate VdoCipher response has required fields
    if (!vdoData?.otp || !vdoData?.playbackInfo) {
      console.error("VdoCipher returned invalid response:", JSON.stringify(vdoData).slice(0, 500));
      return jsonRes({ error: "Failed to generate video token" }, 502);
    }

    // Log the view
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent") || null;

    await admin.from("vdocipher_video_views").insert({
      user_id: user.id,
      chapter_id: chapter.id,
      vdocipher_video_id: chapter.vdocipher_video_id,
      ip_address: ip,
      user_agent: ua,
    });

    return jsonRes({ otp: vdoData.otp, playbackInfo: vdoData.playbackInfo });
  } catch (err) {
    console.error("get-vdocipher-otp error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
