// /api/keys — the in-app "Connect your AI" flow. Authenticated (Supabase JWT).
//   POST   → issue a new per-user MCP key (plaintext returned ONCE) + the full URL
//   GET    → list the user's active keys (hints only, never the plaintext)
//   DELETE ?id=… → revoke a key
import crypto from "node:crypto";
import { sb } from "../lib/supa.mjs";
import { resolveUser, isStudioEnabled } from "../lib/auth.mjs";

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const userId = await resolveUser(req, req.body || {});
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  if (req.method === "POST") {
    if (!(await isStudioEnabled(userId))) return res.status(403).json({ error: "studio_locked" });
    const plain = "cb_live_" + crypto.randomBytes(24).toString("hex");
    await sb("cb_keys", {
      method: "POST",
      body: { user_id: userId, hashed_key: sha256(plain), key_hint: plain.slice(-4), scope: "read" },
    });
    const base = process.env.STUDIO_PUBLIC_URL || `https://${req.headers.host}`;
    return res.status(200).json({ url: `${base}/api/mcp/${plain}`, key: plain });
  }

  if (req.method === "GET") {
    const rows = await sb(
      `cb_keys?user_id=eq.${userId}&revoked_at=is.null&select=id,key_hint,scope,created_at,last_used_at&order=created_at.desc`
    );
    return res.status(200).json({ keys: rows });
  }

  if (req.method === "DELETE") {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "id required" });
    await sb(`cb_keys?id=eq.${id}&user_id=eq.${userId}`, {
      method: "PATCH",
      body: { revoked_at: new Date().toISOString() },
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "method not allowed" });
}
