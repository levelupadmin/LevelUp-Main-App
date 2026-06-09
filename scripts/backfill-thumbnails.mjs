// Generate + cache chapter thumbnails for NON-VdoCipher content.
//
//   image          → point thumbnail_url at the image itself (no upload)
//   video mp4/hls  → ffmpeg single frame (~10% in) → upload to 'thumbnails' bucket
//   video vimeo    → Vimeo oEmbed thumbnail URL (no upload)        [future content]
//   video youtube  → img.youtube.com poster ladder (no upload)     [future content]
//   pdf            → pdftoppm page 1 → upload to 'thumbnails' bucket
//
// VdoCipher is handled separately (chapters.vdocipher_thumbnail_url + edge fn).
// Idempotent: only rows where thumbnail_url IS NULL unless --force.
// Re-runnable / resumable. Secrets read from the iCloud vault; nothing echoed.
//
// Usage:
//   node scripts/backfill-thumbnails.mjs [--dry-run] [--force] [--limit N]
//                                        [--only=video|pdf|image] [--id=<chapterId>]
//
// Requires: ffmpeg + ffprobe (brew), pdftoppm (brew install poppler), Node 18+ fetch.

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, statSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const VAULT = "/Users/rahulsrinivas/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core";
const rd = (p) => readFileSync(p, "utf8");
const ev = (t, k) => (t.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim();
const sup = rd(VAULT + "/.env.supabase");
const PAT = ev(sup, "SUPABASE_PAT");
const REF = ev(sup, "SUPABASE_MAIN_APP_REF");
const SUPA_URL = ev(sup, "SUPABASE_MAIN_APP_URL") || `https://${REF}.supabase.co`;
if (!PAT || !REF) { console.error("Missing SUPABASE_PAT / REF"); process.exit(1); }

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (k, d) => {
  const eq = args.find((x) => x.startsWith(k + "="));
  if (eq) return eq.split("=").slice(1).join("=");
  const i = args.indexOf(k);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")) return args[i + 1];
  return d;
};
const DRY = has("--dry-run"), FORCE = has("--force");
const LIMIT = parseInt(val("--limit", "0"), 10) || 0;
const ONLY = val("--only", "");
const ONEID = val("--id", "");

const esc = (s) => String(s).replace(/'/g, "''");
const fetchT = (url, opts = {}, ms = 60000) => fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error("Mgmt " + r.status + ": " + t.slice(0, 300));
  try { return JSON.parse(t); } catch { return t; }
}
const setThumb = (id, url) => sql(`update chapters set thumbnail_url='${esc(url)}' where id='${esc(id)}'`);

let SERVICE_ROLE = null;
async function serviceRole() {
  if (SERVICE_ROLE) return SERVICE_ROLE;
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${PAT}` } });
  const j = await r.json();
  SERVICE_ROLE = (Array.isArray(j) ? j.find((k) => k.name === "service_role") : null)?.api_key;
  if (!SERVICE_ROLE) throw new Error("could not retrieve service_role key");
  return SERVICE_ROLE;
}
async function uploadJpg(path, bytes) {
  const key = await serviceRole();
  const r = await fetch(`${SUPA_URL}/storage/v1/object/thumbnails/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "image/jpeg", "x-upsert": "true" },
    body: bytes,
  });
  if (!r.ok) throw new Error("upload " + r.status + ": " + (await r.text()).slice(0, 200));
  return `${SUPA_URL}/storage/v1/object/public/thumbnails/${path}`;
}

// ---- provider thumbnail helpers (URL-based, no upload) ----
function vimeoId(src) { return (src.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/) || [])[1] || (/^\d+$/.test(src) ? src : null); }
async function vimeoThumb(src) {
  const id = vimeoId(src); if (!id) return null;
  const r = await fetchT(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${id}&width=1280`, { headers: { Referer: "https://app.leveluplearning.in" } });
  if (!r.ok) return null;
  const j = await r.json();
  return (j.thumbnail_url || "").replace(/_\d+x\d+/, "_1280") || j.thumbnail_url || null;
}
function youtubeId(src) { return (src.match(/(?:youtu\.be\/|v=|\/embed\/)([A-Za-z0-9_-]{11})/) || [])[1] || (/^[A-Za-z0-9_-]{11}$/.test(src) ? src : null); }
async function youtubeThumb(src) {
  const id = youtubeId(src); if (!id) return null;
  for (const q of ["maxresdefault", "sddefault", "hqdefault"]) {
    const u = `https://img.youtube.com/vi/${id}/${q}.jpg`;
    try { const r = await fetchT(u, { method: "GET" }, 20000); const len = Number(r.headers.get("content-length") || 0);
      if (r.ok && len > 2000) return u; } catch { /* try next */ }
  }
  return null;
}

// ---- native-tool frame extraction ----
const tmp = mkdtempSync(join(tmpdir(), "thumb-"));
function ffprobeDuration(url) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", url],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 25000 });
    const d = parseFloat(out.trim()); return isFinite(d) && d > 0 ? d : 0;
  } catch { return 0; }
}
function ffmpegFrame(url, out, ss) {
  execFileSync("ffmpeg", ["-y", "-ss", String(ss), "-i", url, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "4", out],
    { stdio: ["ignore", "ignore", "pipe"], timeout: 120000 });
}
const ok = (p) => existsSync(p) && statSync(p).size > 1000;

// ---- candidate query ----
const onlyClause = ONEID ? `id='${esc(ONEID)}'`
  : ONLY === "video" ? `content_type='video' and video_type<>'vdocipher'`
  : ONLY === "pdf" ? `content_type='pdf'`
  : ONLY === "image" ? `content_type='image'`
  : `(content_type in ('pdf','image') or (content_type='video' and video_type<>'vdocipher'))`;
const thumbClause = FORCE ? "" : " and thumbnail_url is null";
const srcClause = " and coalesce(nullif(media_url,''), nullif(embed_url,'')) is not null";
let q = `select id, content_type, media_provider,
  coalesce(nullif(media_url,''), nullif(embed_url,'')) as src, title
  from chapters where ${onlyClause}${thumbClause}${srcClause} order by content_type, id`;
if (LIMIT) q += ` limit ${LIMIT}`;

const rows = await sql(q);
console.log(`Candidates: ${rows.length}${DRY ? "  (DRY-RUN — no writes)" : ""}  [only=${ONLY || "all"} force=${FORCE}]`);

const stats = { image: 0, video: 0, pdf: 0, fail: 0 };
let done = 0;
for (const r of rows) {
  done++;
  const tag = `${done}/${rows.length} ${r.content_type} ${r.id}`;
  try {
    const src = r.src, ct = r.content_type;
    if (ct === "image") {
      if (!DRY) await setThumb(r.id, src);
      stats.image++;
    } else if (ct === "video") {
      const isVimeo = /vimeo\.com|player\.vimeo/i.test(src) || r.media_provider === "vimeo";
      const isYouTube = /youtu\.be|youtube\.com/i.test(src) || r.media_provider === "youtube";
      let url = null;
      if (isVimeo) url = await vimeoThumb(src);
      else if (isYouTube) url = await youtubeThumb(src);
      if (isVimeo || isYouTube) {
        if (!url) { stats.fail++; console.log(`  FAIL ${tag}: no provider thumbnail`); continue; }
        if (!DRY) await setThumb(r.id, url);
        stats.video++;
      } else {
        // self-hosted mp4 / hls (.m3u8) — extract a frame
        const out = join(tmp, `${r.id}.jpg`);
        const dur = ffprobeDuration(src);
        const ss = dur > 0 ? Math.max(2, Math.min(dur * 0.1, dur - 1)) : 8;
        try { ffmpegFrame(src, out, ss); } catch { /* retry near start */ }
        if (!ok(out)) { try { ffmpegFrame(src, out, 1); } catch { /* ignore */ } }
        if (!ok(out)) { stats.fail++; console.log(`  FAIL ${tag}: ffmpeg produced no frame`); continue; }
        if (!DRY) { const u = await uploadJpg(`chapters/${r.id}.jpg`, readFileSync(out)); await setThumb(r.id, u); }
        stats.video++;
      }
    } else if (ct === "pdf") {
      const pdfPath = join(tmp, `${r.id}.pdf`);
      const resp = await fetchT(src, {}, 90000);
      if (!resp.ok) { stats.fail++; console.log(`  FAIL ${tag}: pdf fetch ${resp.status}`); continue; }
      writeFileSync(pdfPath, Buffer.from(await resp.arrayBuffer()));
      const base = join(tmp, `${r.id}`);
      execFileSync("pdftoppm", ["-jpeg", "-f", "1", "-l", "1", "-singlefile", "-r", "150", "-scale-to", "1280", pdfPath, base],
        { stdio: ["ignore", "ignore", "pipe"], timeout: 60000 });
      const out = base + ".jpg";
      if (!ok(out)) { stats.fail++; console.log(`  FAIL ${tag}: pdftoppm produced no image`); continue; }
      if (!DRY) { const u = await uploadJpg(`chapters/${r.id}.jpg`, readFileSync(out)); await setThumb(r.id, u); }
      stats.pdf++;
    }
    if (done % 10 === 0) console.log(`  …${done}/${rows.length} (img ${stats.image}, vid ${stats.video}, pdf ${stats.pdf}, fail ${stats.fail})`);
  } catch (e) {
    stats.fail++; console.log(`  FAIL ${tag}: ${(e.message || e).toString().slice(0, 160)}`);
  }
}
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\nDONE${DRY ? " (dry-run)" : ""} — image=${stats.image} video=${stats.video} pdf=${stats.pdf} failed=${stats.fail} of ${rows.length}`);
