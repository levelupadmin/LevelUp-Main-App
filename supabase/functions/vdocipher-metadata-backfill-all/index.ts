// vdocipher-metadata-backfill-all
// ----------------------------------------------------------------------------
// One-shot admin-triggered backfill of chapters.duration_seconds and
// chapters.vdocipher_thumbnail_url for every chapter that has a
// vdocipher_video_id but is missing metadata.
//
// The lazy on-admin-open backfill in AdminCourseCurriculum.tsx already
// covers chapters incrementally as admins use the editor, but this lets
// us populate everything at once.
//
// Invoke from any admin/owner session:
//
//   const { data, error } = await supabase.functions.invoke(
//     "vdocipher-metadata-backfill-all",
//   );
//
// Returns { processed, updated, failed, results: [{chapter_id, status}] }.
//
// Auth: requires admin or owner role. Worker fetches in series (not
// parallel) so we don't hammer VdoCipher's API with 150+ concurrent
// requests.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeaders } from "../_shared/cors.ts";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ChapterRow {
  id: string;
  vdocipher_video_id: string;
  duration_seconds: number | null;
  vdocipher_thumbnail_url: string | null;
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Admin gate.
    const { data: userRow } = await admin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!userRow || (userRow.role !== "admin" && userRow.role !== "owner")) {
      return jsonRes({ error: "Forbidden" }, 403);
    }

    const vdoApiKey = Deno.env.get("VDOCIPHER_API_KEY");
    if (!vdoApiKey) {
      return jsonRes({ error: "VDOCIPHER_API_KEY not configured" }, 500);
    }

    // Find chapters that need metadata. We treat a missing
    // vdocipher_thumbnail_url as the canonical "needs backfill"
    // signal - if the thumbnail is missing the duration is almost
    // certainly missing too (or was guessed manually).
    const { data: chapters, error: chErr } = await admin
      .from("chapters")
      .select("id, vdocipher_video_id, duration_seconds, vdocipher_thumbnail_url")
      .eq("video_type", "vdocipher")
      .not("vdocipher_video_id", "is", null)
      .neq("vdocipher_video_id", "")
      .is("vdocipher_thumbnail_url", null);

    if (chErr) return jsonRes({ error: `Query failed: ${chErr.message}` }, 500);

    const todo = (chapters ?? []) as ChapterRow[];
    const results: { chapter_id: string; status: string }[] = [];
    let updated = 0;
    let failed = 0;

    for (const ch of todo) {
      try {
        // VdoCipher /api/videos/{id} returns { length, posters: [{url, width, height}], ... }
        const res = await fetch(
          `https://dev.vdocipher.com/api/videos/${encodeURIComponent(ch.vdocipher_video_id)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Apisecret ${vdoApiKey}`,
              Accept: "application/json",
            },
          },
        );

        if (!res.ok) {
          results.push({ chapter_id: ch.id, status: `vdo_${res.status}` });
          failed++;
          continue;
        }

        const data = await res.json();
        const lengthSeconds =
          typeof data?.length === "number" ? Math.round(data.length) : null;

        type Poster = { url?: string; width?: number; height?: number };
        let posters: Poster[] = [];
        if (Array.isArray(data?.posters)) posters = data.posters as Poster[];
        else if (data?.posters && typeof data.posters === "object") {
          posters = [data.posters as Poster];
        }
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

        const patch: Record<string, unknown> = {};
        if (
          typeof lengthSeconds === "number" &&
          (!ch.duration_seconds || ch.duration_seconds === 0)
        ) {
          patch.duration_seconds = lengthSeconds;
        }
        if (bestPoster) {
          patch.vdocipher_thumbnail_url = bestPoster;
        }

        if (Object.keys(patch).length === 0) {
          results.push({ chapter_id: ch.id, status: "no_change" });
          continue;
        }

        const { error: upErr } = await admin
          .from("chapters")
          .update(patch)
          .eq("id", ch.id);

        if (upErr) {
          results.push({ chapter_id: ch.id, status: `db_${upErr.code ?? "err"}` });
          failed++;
          continue;
        }

        results.push({ chapter_id: ch.id, status: "ok" });
        updated++;
      } catch (e) {
        results.push({ chapter_id: ch.id, status: `exc_${(e as Error).message?.slice(0, 40) ?? "err"}` });
        failed++;
      }

      // Polite to VdoCipher: 150ms between requests gives them ~6.6 req/s,
      // far below any reasonable rate cap and well within their stated SLAs.
      await new Promise((r) => setTimeout(r, 150));
    }

    return jsonRes({ processed: todo.length, updated, failed, results });
  } catch (err) {
    console.error("vdocipher-metadata-backfill-all error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
