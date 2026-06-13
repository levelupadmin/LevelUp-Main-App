// Prove the DEPLOYED worker end-to-end: seed a pending reel, trigger the live
// Vercel cron, confirm it transcribed it. Run:
//   node --env-file=.env.local scripts/deployed-cron-test.mjs
const BASE = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, CRON = process.env.CRON_SECRET;
const DEPLOY = process.env.DEPLOY_URL || "https://levelup-studio-worker.vercel.app";
const SHORT = process.argv[2] || "DZFrqkdv6Bd";
const url = `https://www.instagram.com/reel/${SHORT}/`;

const sb = async (p, o = {}) => {
  const r = await fetch(`${BASE}/rest/v1/${p}`, {
    method: o.method || "GET",
    headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", ...(o.prefer ? { Prefer: o.prefer } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  const t = await r.text();
  return t ? JSON.parse(t) : null;
};

const student = (await sb("users?role=eq.student&select=id&order=created_at.asc&limit=1"))[0].id;
await sb(`cb_reels?user_id=eq.${student}&shortcode=eq.${SHORT}`, { method: "DELETE" });
const ins = await sb("cb_reels", {
  method: "POST",
  body: { user_id: student, shortcode: SHORT, platform: "instagram", url, status: "pending", source: "paste" },
  prefer: "return=representation",
});
const id = ins[0].id;
console.log(`seeded pending reel ${id} for student ${student.slice(0, 8)}…`);

const t0 = Date.now();
const cr = await fetch(`${DEPLOY}/api/cron`, { headers: { Authorization: "Bearer " + CRON } });
const crBody = await cr.text();
console.log(`deployed /api/cron → ${cr.status} ${crBody.slice(0, 200)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

const row = (await sb(`cb_reels?id=eq.${id}&select=status,creator_name,title,transcript,error`))[0];
console.log("status:    ", row.status);
console.log("creator:   ", row.creator_name);
console.log("title:     ", row.title);
console.log("transcript:", (row.transcript || "").length, "chars");
if (row.error) console.log("error:", row.error);

await sb(`cb_reels?id=eq.${id}`, { method: "DELETE" });
console.log("cleaned up");
process.exit(row.status === "done" && (row.transcript || "").length > 0 ? 0 : 1);
