// Content Brain — core processing pipeline (framework-agnostic).
// Flow: Apify Instagram scrape -> download video -> ffmpeg audio -> Cloudflare
// Workers AI Whisper -> structured result. The caller persists to Supabase.
//
// Every external dependency is injected via `cfg` so this runs identically in a
// plain Node script (testing) and inside a Next.js route handler (production).
//
// cfg = {
//   apifyToken, cfAccountId, cfWorkersToken,
//   ffmpegPath (default "ffmpeg"), tmpDir (default "/tmp"),
//   igActor (default "apify~instagram-scraper")
// }

import { spawn } from "node:child_process";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { YoutubeTranscript } from "youtube-transcript";

export function shortcodeFromUrl(url) {
  const m = String(url).match(/\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[2] : null;
}

export function youtubeIdFromUrl(url) {
  const u = String(url);
  const m =
    u.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    u.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    u.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function platformFromUrl(url) {
  return /youtube\.com|youtu\.be/i.test(String(url)) ? "youtube" : "instagram";
}

// Unified identifier: { platform, id } where id is the IG shortcode or YT video id.
export function idFromUrl(url) {
  const platform = platformFromUrl(url);
  const id = platform === "youtube" ? youtubeIdFromUrl(url) : shortcodeFromUrl(url);
  return { platform, id };
}

// 1) Apify: reliable Instagram fetch (proxied) -> structured metadata + videoUrl
export async function fetchReelMeta(url, cfg) {
  const actor = cfg.igActor || "apify~instagram-scraper";
  const endpoint = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${cfg.apifyToken}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      directUrls: [url],
      resultsType: "posts",
      resultsLimit: 1,
      addParentData: false,
    }),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const items = await res.json();
  if (!items?.length) throw new Error("Apify returned no items (reel private/removed?)");
  const it = items[0];
  if (!it.videoUrl) throw new Error("No videoUrl in Apify result (not a video reel?)");
  return {
    shortcode: it.shortCode || shortcodeFromUrl(url),
    url: `https://www.instagram.com/reel/${it.shortCode || shortcodeFromUrl(url)}/`,
    creator_username: it.ownerUsername || null,
    creator_name: it.ownerFullName || it.ownerUsername || null,
    caption: it.caption || null,
    hashtags: Array.isArray(it.hashtags) ? it.hashtags : null,
    thumbnail_url: it.displayUrl || null,
    video_url: it.videoUrl,
    duration: it.videoDuration ?? null,
    view_count: it.videoViewCount ?? it.videoPlayCount ?? null,
    like_count: it.likesCount ?? null,
    posted_at: it.timestamp || null,
  };
}

// 2) download the video to a temp file
async function downloadTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`video download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return dest;
}

// 3) ffmpeg -> 16kHz mono mp3 (whisper-optimal, small payload)
function toAudio(srcPath, outPath, ffmpegPath) {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-i", srcPath, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "48k", outPath];
    const p = spawn(ffmpegPath || "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => (code === 0 ? resolve(outPath) : reject(new Error("ffmpeg failed: " + err.slice(-300)))));
    p.on("error", reject);
  });
}

// 4) Cloudflare Workers AI Whisper (open-source whisper-large-v3-turbo)
export async function transcribeAudio(audioBuffer, cfg) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${cfg.cfAccountId}/ai/run/@cf/openai/whisper-large-v3-turbo`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.cfWorkersToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ audio: audioBuffer.toString("base64") }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(`Workers AI ${res.status}: ${JSON.stringify(data.errors || data).slice(0, 200)}`);
  }
  return { text: (data.result?.text || "").trim(), wordCount: data.result?.word_count ?? null };
}

// orchestration: url -> { ...meta, transcript } (no DB writes here)
export async function processReel(url, cfg) {
  const tmp = cfg.tmpDir || "/tmp";
  const meta = await fetchReelMeta(url, cfg);
  const sc = meta.shortcode || "reel";
  const vid = path.join(tmp, `${sc}.mp4`);
  const aud = path.join(tmp, `${sc}.mp3`);
  try {
    await downloadTo(meta.video_url, vid);
    await toAudio(vid, aud, cfg.ffmpegPath);
    const audioBuffer = await readFile(aud);
    const { text, wordCount } = await transcribeAudio(audioBuffer, cfg);
    return { ...meta, transcript: text, transcript_lang: "auto", word_count: wordCount };
  } finally {
    for (const f of [vid, aud]) await unlink(f).catch(() => {});
  }
}

// YouTube: oEmbed for metadata + caption track for transcript (no Whisper needed).
export async function fetchYouTube(url) {
  const id = youtubeIdFromUrl(url);
  if (!id) throw new Error("Could not parse a YouTube video id from that URL.");

  let meta = {};
  try {
    const o = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (o.ok) meta = await o.json();
  } catch { /* metadata is best-effort */ }

  let segments;
  try {
    segments = await YoutubeTranscript.fetchTranscript(id);
  } catch (e) {
    throw new Error(`No transcript available for this video (${String(e?.message || e).slice(0, 80)}).`);
  }
  const transcript = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  if (!transcript) throw new Error("Transcript was empty.");

  const handle = (meta.author_url || "").match(/@([A-Za-z0-9_.-]+)/);
  return {
    platform: "youtube",
    shortcode: id,
    url: `https://www.youtube.com/watch?v=${id}`,
    creator_username: handle ? handle[1] : (meta.author_name || "youtube").replace(/\s+/g, "").slice(0, 40),
    creator_name: meta.author_name || null,
    title: meta.title || null,
    caption: null,
    hashtags: null,
    thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    video_url: `https://www.youtube.com/watch?v=${id}`,
    duration: null,
    view_count: null,
    like_count: null,
    posted_at: null,
    transcript,
    transcript_lang: "auto",
    word_count: transcript.split(/\s+/).length,
  };
}

// Dispatcher: Instagram reel (Apify + Whisper) or YouTube video (captions).
export async function processItem(url, cfg) {
  return platformFromUrl(url) === "youtube" ? fetchYouTube(url) : processReel(url, cfg);
}
