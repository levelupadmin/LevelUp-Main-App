// Worker: claim pending cb_reels and run them through the pipeline.
// Multi-tenant: user_id already lives on the row (set at capture) and is never
// touched here, so it's preserved. Legal posture: we persist ONLY pointer +
// oEmbed metadata + transcript — NO video_url, NO re-hosted thumbnail. The
// pipeline downloads the IG MP4 to /tmp, extracts audio, transcribes, and
// DELETES both temp files in its own `finally` (see pipeline.mjs) — nothing
// durable is ever stored. This is the App-Review / copyright defense.
import { sb } from "./supa.mjs";
import { processItem } from "./pipeline.mjs";
import { underDailyCeiling } from "./meter.mjs";
import ffmpegPath from "ffmpeg-static";

function cfg() {
  return {
    apifyToken: process.env.APIFY_TOKEN,
    cfAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cfWorkersToken: process.env.CLOUDFLARE_API_TOKEN_WORKERS,
    ffmpegPath: ffmpegPath || "ffmpeg",
    tmpDir: "/tmp",
  };
}

function autoTitle(meta) {
  const firstLine = (meta.caption || "").split("\n").map((s) => s.trim()).find(Boolean) || "";
  const snippet = firstLine.replace(/\s+/g, " ").slice(0, 52);
  const who = meta.creator_name || meta.creator_username || "Reel";
  return snippet ? `${who} — ${snippet}` : who;
}

// Atomically move pending -> processing so concurrent drainers don't double-run.
async function claim(id) {
  const rows = await sb(`cb_reels?id=eq.${id}&status=eq.pending`, {
    method: "PATCH",
    body: { status: "processing" },
    prefer: "return=representation",
  });
  return rows.length ? rows[0] : null;
}

export async function processId(id) {
  const row = await claim(id);
  if (!row) return { id, skipped: true };
  try {
    const r = await processItem(row.url, cfg());
    await sb(`cb_reels?id=eq.${id}`, {
      method: "PATCH",
      body: {
        status: "done",
        error: null,
        platform: r.platform || row.platform || "instagram",
        creator_username: r.creator_username,
        creator_name: r.creator_name,
        title: row.title || r.title || autoTitle(r),
        caption: r.caption,
        hashtags: r.hashtags,
        thumbnail_url: r.thumbnail_url || null, // provider CDN pointer only — never re-hosted
        duration: r.duration,
        view_count: r.view_count,
        like_count: r.like_count,
        posted_at: r.posted_at,
        transcript: r.transcript,
        transcript_lang: r.transcript_lang,
        processed_at: new Date().toISOString(),
      },
    });
    return { id, ok: true, words: r.word_count };
  } catch (e) {
    await sb(`cb_reels?id=eq.${id}`, {
      method: "PATCH",
      body: { status: "failed", error: String(e?.message || e).slice(0, 500) },
    });
    return { id, ok: false, error: String(e?.message || e) };
  }
}

export async function drainPending(limit = 5) {
  if (!(await underDailyCeiling())) return [{ skipped: "daily_ceiling" }];
  const pending = await sb(`cb_reels?status=eq.pending&select=id&order=created_at.asc&limit=${limit}`);
  const results = [];
  for (const p of pending) results.push(await processId(p.id));
  return results;
}
