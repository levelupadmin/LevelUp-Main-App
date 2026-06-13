// Resolve the captor's user_id WITHOUT a shared secret (the reference's single
// CAPTURE_SECRET was a dealbreaker — extract once, impersonate anyone). Two paths:
//   1) iOS Shortcut  → a per-user capture token (x-capture-token), sha256-matched
//      against cb_capture_tokens.
//   2) in-app paste  → the logged-in Supabase access token (Authorization: Bearer),
//      verified against LevelUp's own auth server (no JWT secret needed here).
import crypto from "node:crypto";
import { sb } from "./supa.mjs";

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

export async function resolveUser(req, body) {
  // 1) per-user capture token (Shortcut)
  const token = req.headers["x-capture-token"] || body.capture_token;
  if (token) {
    const rows = await sb(
      `cb_capture_tokens?token_hash=eq.${sha256(token)}&revoked_at=is.null&select=user_id&limit=1`
    );
    if (rows.length) {
      // best-effort last-used stamp
      sb(`cb_capture_tokens?token_hash=eq.${sha256(token)}`, {
        method: "PATCH",
        body: { last_used_at: new Date().toISOString() },
      }).catch(() => {});
      return rows[0].user_id;
    }
  }
  // 2) Supabase user JWT (in-app)
  const authz = req.headers["authorization"] || "";
  const jwt = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (jwt) {
    try {
      const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${jwt}`, apikey: process.env.SUPABASE_ANON_KEY },
      });
      if (r.ok) {
        const u = await r.json();
        if (u?.id) return u.id;
      }
    } catch { /* fall through */ }
  }
  return null;
}

// Studio is unlocked only for active live-cohort members. Enforced here (server),
// since the worker writes with the service role and bypasses the RLS insert gate.
export async function isStudioEnabled(userId) {
  const r = await sb(`rpc/is_studio_enabled`, { method: "POST", body: { p_user_id: userId } });
  return r === true;
}
