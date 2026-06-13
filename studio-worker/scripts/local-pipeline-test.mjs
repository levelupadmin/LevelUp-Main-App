// Local end-to-end proof: a real public Instagram reel → Apify → ffmpeg → Cloudflare
// Whisper → a transcript written into ONE student's cb_reels row, against the real
// LevelUp Supabase. Run: node --env-file=.env.local scripts/local-pipeline-test.mjs
import { sb } from "../lib/supa.mjs";
import { processId } from "../lib/worker.mjs";

const SHORT = process.argv[2] || "DZFrqkdv6Bd"; // a reel from the reference library
const url = `https://www.instagram.com/reel/${SHORT}/`;

const students = await sb("users?role=eq.student&select=id&order=created_at.asc&limit=1");
if (!students.length) { console.error("no student user found"); process.exit(1); }
const userId = students[0].id;

// clean any prior run, then seed a pending row exactly as /api/capture would
await sb(`cb_reels?user_id=eq.${userId}&shortcode=eq.${SHORT}`, { method: "DELETE" });
const ins = await sb("cb_reels", {
  method: "POST",
  body: { user_id: userId, shortcode: SHORT, platform: "instagram", url, status: "pending", source: "paste" },
  prefer: "return=representation",
});
const id = ins[0].id;
console.log(`seeded pending reel ${id} for student ${userId.slice(0, 8)}…`);

const t0 = Date.now();
const result = await processId(id);
console.log(`processId → ${JSON.stringify(result)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

const done = (await sb(`cb_reels?id=eq.${id}&select=status,creator_username,creator_name,title,transcript,thumbnail_url,error`))[0];
console.log("status:        ", done.status);
console.log("creator:       ", done.creator_username, "|", done.creator_name);
console.log("title:         ", done.title);
console.log("transcript:    ", (done.transcript || "").length, "chars");
console.log("preview:       ", JSON.stringify((done.transcript || "").slice(0, 160)));
const thumb = done.thumbnail_url || "";
console.log("thumb is pointer (not our storage):", thumb ? !thumb.includes("supabase") : "null");
if (done.error) console.log("error:", done.error);

await sb(`cb_reels?id=eq.${id}`, { method: "DELETE" });
console.log("cleaned up");
process.exit(done.status === "done" && (done.transcript || "").length > 0 ? 0 : 1);
