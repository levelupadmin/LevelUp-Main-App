// Per-user MCP server (Streamable-HTTP, stateless JSON-RPC). One URL per user:
//   https://levelup-studio-worker.vercel.app/api/mcp/<key>
// The creator pastes it into their own ChatGPT/Claude. The key resolves to one
// user_id; EVERY tenant query is forced through scoped() which throws if the
// user_id is missing (fail-closed) — a tool can never return another user's data.
// Read-only at MVP (no add/update). Cohort learnings are scoped to the offerings
// the user is/was enrolled in (lifetime), published-or-scheduled only.
import crypto from "node:crypto";
import { sb } from "../../lib/supa.mjs";

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const SERVER_INFO = { name: "levelup-studio", version: "1.0.0" };
const PROTO = "2025-06-18";
const BUCKETS = ["learn", "adapt", "saved"];
const SEL = "id,shortcode,platform,url,bucket,tags,highlights,status,creator_username,creator_name,title,caption,transcript,note,duration,posted_at,created_at";

const text = (t) => ({ content: [{ type: "text", text: t }] });
const snip = (s, n = 220) => (s ? (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s) : "");
const enc = encodeURIComponent;

const TOOLS = [
  { name: "search_reels", description: "Full-text search across the user's saved reels (transcript + caption + title + creator). Use this first to find a reel.", inputSchema: { type: "object", properties: { query: { type: "string" }, bucket: { type: "string", enum: BUCKETS }, creator: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
  { name: "list_reels", description: "Browse the user's saved reels, newest first; optional bucket/creator filter.", inputSchema: { type: "object", properties: { bucket: { type: "string", enum: BUCKETS }, creator: { type: "string" }, limit: { type: "number" } } } },
  { name: "get_reel", description: "Full transcript + metadata for one reel, by shortcode or id.", inputSchema: { type: "object", properties: { shortcode: { type: "string" }, id: { type: "string" } } } },
  { name: "list_creators", description: "List the creators in the user's library with how many reels are saved from each.", inputSchema: { type: "object", properties: {} } },
  { name: "search_cohort_learnings", description: "Search the LevelUp cohort learnings (session summaries/transcripts) the user has lifetime access to.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
  { name: "get_learning", description: "Full body of one cohort learning, by id.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
];

// ── fail-closed scoping ─────────────────────────────────────────────────────
function scopedReels(userId, params) {
  if (!userId) throw new Error("refusing unscoped query");
  return sb(`cb_reels?user_id=eq.${userId}&${params}`);
}

async function userOfferingIds(userId) {
  if (!userId) throw new Error("refusing unscoped query");
  const rows = await sb(`enrolments?user_id=eq.${userId}&status=not.in.(revoked,cancelled)&select=offering_id`);
  return [...new Set((rows || []).map((r) => r.offering_id))];
}

function fmtRow(x) {
  const hl = (x.highlights || []).length ? " ✦" + x.highlights.join(",") : "";
  return `• ${x.title || x.shortcode} — @${x.creator_username || "?"} [${x.bucket}${(x.tags || []).length ? " · " + x.tags.join(",") : ""}${hl}] ${x.status !== "done" ? "(" + x.status + ")" : ""}\n  ${x.url}\n  ${snip(x.transcript || x.caption)}`;
}

async function callTool(userId, name, a = {}) {
  if (name === "search_reels") {
    const p = [`select=${SEL}`, `order=created_at.desc`, `limit=${Math.min(a.limit || 10, 50)}`, `fts=wfts(english).${enc(a.query)}`];
    if (BUCKETS.includes(a.bucket)) p.push(`bucket=eq.${a.bucket}`);
    if (a.creator) p.push(`creator_username=eq.${enc(a.creator)}`);
    const rows = await scopedReels(userId, p.join("&"));
    return text(rows.length ? `${rows.length} match(es):\n\n` + rows.map(fmtRow).join("\n\n") : `No reels matched "${a.query}".`);
  }
  if (name === "list_reels") {
    const p = [`select=${SEL}`, `order=created_at.desc`, `limit=${Math.min(a.limit || 25, 100)}`];
    if (BUCKETS.includes(a.bucket)) p.push(`bucket=eq.${a.bucket}`);
    if (a.creator) p.push(`creator_username=eq.${enc(a.creator)}`);
    const rows = await scopedReels(userId, p.join("&"));
    return text(rows.length ? `${rows.length} reel(s):\n\n` + rows.map(fmtRow).join("\n\n") : "No reels yet.");
  }
  if (name === "get_reel") {
    const filt = a.id ? `id=eq.${enc(a.id)}` : `shortcode=eq.${enc(a.shortcode || "")}`;
    const rows = await scopedReels(userId, `${filt}&select=${SEL}&limit=1`);
    if (!rows.length) return text("No reel found in your library.");
    const x = rows[0];
    return text(`# ${x.title || x.shortcode}\nCreator: @${x.creator_username} (${x.creator_name || ""})\nBucket: ${x.bucket} | Tags: ${(x.tags || []).join(", ") || "none"} | Highlights: ${(x.highlights || []).join(", ") || "none"}\nLink: ${x.url}\n\n${x.note ? "## Your note\n" + x.note + "\n\n" : ""}## Caption\n${x.caption || "(none)"}\n\n## Transcript\n${x.transcript || "(not transcribed yet)"}`);
  }
  if (name === "list_creators") {
    const rows = await scopedReels(userId, "select=creator_username,creator_name&limit=300");
    const counts = {};
    for (const r of rows) { const k = r.creator_username || "unknown"; counts[k] = counts[k] || { n: 0, name: r.creator_name }; counts[k].n++; }
    const list = Object.entries(counts).sort((a2, b2) => b2[1].n - a2[1].n).map(([u, v]) => `@${u}${v.name ? " (" + v.name + ")" : ""} — ${v.n}`);
    return text(list.length ? list.join("\n") : "No creators yet.");
  }
  if (name === "search_cohort_learnings") {
    const offerings = await userOfferingIds(userId);
    if (!offerings.length) return text("You have no cohort learnings yet.");
    const now = new Date().toISOString();
    const p = [`select=id,offering_id,kind,session_label,title,body_md`, `offering_id=in.(${offerings.join(",")})`, `or=(published.eq.true,publish_at.lte.${now})`, `fts=wfts(english).${enc(a.query)}`, `limit=${Math.min(a.limit || 8, 25)}`];
    const rows = await sb(`cohort_learnings?${p.join("&")}`);
    return text(rows.length ? rows.map((x) => `• [${x.kind}] ${x.title}${x.session_label ? " (" + x.session_label + ")" : ""} — id ${x.id}\n  ${snip(x.body_md)}`).join("\n\n") : `No cohort learnings matched "${a.query}".`);
  }
  if (name === "get_learning") {
    const offerings = await userOfferingIds(userId);
    if (!offerings.length) return text("No access.");
    const now = new Date().toISOString();
    const rows = await sb(`cohort_learnings?id=eq.${enc(a.id)}&offering_id=in.(${offerings.join(",")})&or=(published.eq.true,publish_at.lte.${now})&select=title,kind,session_label,body_md&limit=1`);
    if (!rows.length) return text("Learning not found, or you don't have access.");
    const x = rows[0];
    return text(`# ${x.title}${x.session_label ? " — " + x.session_label : ""}\n\n${x.body_md}`);
  }
  return text(`Unknown tool: ${name}`);
}

async function handleRpc(userId, msg) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const err = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  try {
    switch (method) {
      case "initialize": return ok({ protocolVersion: params?.protocolVersion || PROTO, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO });
      case "ping": return ok({});
      case "tools/list": return ok({ tools: TOOLS });
      case "resources/list": return ok({ resources: [] });
      case "prompts/list": return ok({ prompts: [] });
      case "tools/call": return ok(await callTool(userId, params?.name, params?.arguments || {}));
      default:
        if (typeof method === "string" && method.startsWith("notifications/")) return null;
        return err(-32601, `Method not found: ${method}`);
    }
  } catch (e) {
    return err(-32603, String(e?.message || e));
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, mcp-session-id, mcp-protocol-version");
  if (req.method === "OPTIONS") return res.status(204).end();

  const key = req.query.key;
  const rows = key ? await sb(`cb_keys?hashed_key=eq.${sha256(key)}&revoked_at=is.null&select=id,user_id&limit=1`) : [];
  if (!rows.length) return res.status(401).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } });
  const userId = rows[0].user_id;
  sb(`cb_keys?id=eq.${rows[0].id}`, { method: "PATCH", body: { last_used_at: new Date().toISOString() } }).catch(() => {});

  if (req.method === "GET") return res.status(405).json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Use POST (Streamable HTTP)." } });
  if (req.method !== "POST") return res.status(405).end();

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { body = null; }
  if (!body) return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });

  const batch = Array.isArray(body);
  const out = [];
  for (const m of (batch ? body : [body])) { const r = await handleRpc(userId, m); if (r) out.push(r); }
  if (!out.length) return res.status(202).end();
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json(batch ? out : out[0]);
}
