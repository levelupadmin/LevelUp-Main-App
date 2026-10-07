/**
 * luca-link-check — "can your mentor open this?" for a pasted LUCA link.
 *
 * POST { url } → { status: "ok" | "private" | "unknown" }
 *
 * Two checks, both from a logged-out vantage point (which is exactly the
 * mentor's view of a link that is not shared):
 *   · Google Docs / Sheets / Slides / Drive: request the URL without following
 *     redirects. A file that is not shared bounces to accounts.google.com
 *     (private); a shared one answers 200 (ok).
 *   · YouTube: oEmbed answers 200 for public and unlisted videos and 401/403
 *     for private ones.
 * Anything else is "unknown", and the app lets it through: the check is a
 * helper for the learner, never a gate.
 *
 * SSRF: only https URLs on the hosts below are ever fetched, redirects are
 * never followed, bodies are never read for Google, and each fetch has a short
 * timeout. The caller must be signed in (verify_jwt = true, the default).
 */

import { corsHeadersFor } from "../_shared/cors.ts";

const GOOGLE_HOSTS = new Set(["docs.google.com", "drive.google.com"]);
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);
const TIMEOUT_MS = 6000;

export type Status = "ok" | "private" | "unknown";

/** The 11-character id of a YouTube link, or null. */
export function youTubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (u.pathname === "/watch") id = u.searchParams.get("v");
  else {
    const [, first, second] = u.pathname.split("/");
    if (["shorts", "live", "embed", "v"].includes(first)) id = second ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** Which check applies to a raw URL, or null when we don't check it. */
export function classify(raw: string): { kind: "google"; url: URL } | { kind: "yt"; id: string } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  if (GOOGLE_HOSTS.has(u.hostname)) return { kind: "google", url: u };
  if (YT_HOSTS.has(u.hostname)) { const id = youTubeId(u); return id ? { kind: "yt", id } : null; }
  return null;
}

/** Map a Google response (redirects NOT followed) to a status. */
export function googleStatus(status: number, location: string | null): Status {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) {
    if (!location) return "unknown";
    try {
      const to = new URL(location, "https://docs.google.com");
      if (to.hostname === "accounts.google.com") return "private";
    } catch { return "unknown"; }
    return "unknown";
  }
  if (status === 401 || status === 403) return "private";
  return "unknown";
}

/** Map a YouTube oEmbed status to a status. */
export function ytStatus(status: number): Status {
  if (status === 200) return "ok";
  if (status === 401 || status === 403) return "private";
  return "unknown";
}

async function timed(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
}

export async function check(raw: string): Promise<Status> {
  const c = classify(raw);
  if (!c) return "unknown";
  try {
    if (c.kind === "google") {
      const r = await timed(c.url.toString(), { method: "GET", redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (LevelUp link check)" } });
      await r.body?.cancel();
      return googleStatus(r.status, r.headers.get("location"));
    }
    const watch = `https://www.youtube.com/watch?v=${c.id}`;
    const r = await timed(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { method: "GET", redirect: "manual" });
    await r.body?.cancel();
    return ytStatus(r.status);
  } catch {
    return "unknown";
  }
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    const cors = corsHeadersFor(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (req.method !== "POST") return json({ error: "method" }, 405);
    let url = "";
    try { url = String(((await req.json()) as { url?: unknown })?.url ?? ""); } catch { return json({ status: "unknown" }); }
    if (!url || url.length > 2048) return json({ status: "unknown" });
    return json({ status: await check(url) });
  });
}
