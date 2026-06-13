// POST /api/capture — the in-app "＋ Paste link" / clipboard banner and the iOS
// Shortcut both hit this. It only ever inserts a pending cb_reels row (no media
// touches this request); the cron worker transcribes it within ~a minute.
//
// Auth: per-user (NO shared secret). Either a logged-in Supabase access token
// (Authorization: Bearer) or a per-user x-capture-token. The captor must be an
// active live-cohort member (is_studio_enabled). Dedup is PER-USER.
import { sb } from "../lib/supa.mjs";
import { idFromUrl } from "../lib/pipeline.mjs";
import { resolveUser, isStudioEnabled } from "../lib/auth.mjs";

export default async function handler(req, res) {
  // CORS — the iOS Capacitor origin is capacitor://app.leveluplearning.in; reflect
  // the caller's origin (the request is authenticated, so this is safe).
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, x-capture-token");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};

  const userId = await resolveUser(req, body);
  if (!userId) return res.status(401).json({ error: "unauthorized" });
  if (!(await isStudioEnabled(userId))) return res.status(403).json({ error: "studio_locked" });

  const { platform, id } = idFromUrl(body.url);
  if (!id) return res.status(400).json({ error: "could not find an Instagram reel or YouTube video id in that URL" });
  const canonical = platform === "youtube"
    ? `https://www.youtube.com/watch?v=${id}`
    : `https://www.instagram.com/reel/${id}/`;
  const bucket = ["learn", "adapt", "saved"].includes(body.bucket) ? body.bucket : "saved";

  try {
    const existing = await sb(
      `cb_reels?user_id=eq.${userId}&platform=eq.${platform}&shortcode=eq.${id}&select=id,status&limit=1`
    );
    if (existing.length) {
      return res.status(200).json({ id: existing[0].id, status: existing[0].status, dedup: true });
    }
    const ins = await sb("cb_reels", {
      method: "POST",
      body: {
        user_id: userId,
        shortcode: id,
        platform,
        url: canonical,
        bucket,
        tags: Array.isArray(body.tags) ? body.tags : [],
        note: body.note || null,
        status: "pending",
        source: ["paste", "clipboard", "shortcut", "android_share", "mcp"].includes(body.source) ? body.source : "paste",
      },
      prefer: "return=representation",
    });
    return res.status(200).json({ id: ins[0].id, status: "pending", dedup: false });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
