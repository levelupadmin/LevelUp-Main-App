#!/usr/bin/env node
/**
 * Builds ops/luca/demo/seed.sql — the hidden, staff-only LUCA demo cohort.
 *
 *   node ops/luca/demo/build-seed.mjs
 *
 * Everything here is SAMPLE DATA from the LUCA mockup (dates, people, notes).
 * It loads into one program, slug `luca-demo`, with is_demo = true, so it is
 * invisible to learners and simulates every payment. Re-running the seed
 * deletes and recreates that one program only (ON DELETE CASCADE).
 *
 * Ids are deterministic (hashed from a key) so the scenario function can find
 * the sample assignments and sessions again.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SLUG = "luca-demo";
const IMG = (n) => `/luca/img/${n}.jpg`;
const at = (iso) => `${iso}+05:30`;

function uid(key) {
  const h = createHash("md5").update(`luca-demo:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => `${q(JSON.stringify(v))}::jsonb`;
const arr = (xs, type = "text") => `ARRAY[${xs.map(q).join(",")}]::${type}[]`;

const PROGRAM_ID = uid("program");

const MENTORS = [
  ["rahul", "Rahul Srinivas", "Founder, LevelUp. Storytelling", null],
  ["sai", "Sai Sethu", "Scripts and finding your niche", IMG("m-sai"), "@ontheground.with.sai"],
  ["prakriti", "Prakriti Madan", "Creator mentor", IMG("m-prakriti"), "@prakritimadan"],
  ["srijan", "Srijan", "Creator mentor", IMG("m-srijan")],
  ["ayushi", "Ayushi Agarwal", "Creator mentor", IMG("m-ayushi")],
  ["kevin", "Kevin Adams", "AI-driven content", null],
  ["edwin", "Edwin", "Technical mentor", IMG("m-edwin")],
  ["indira", "Indira Kumar", "Technical mentor", IMG("m-indira")],
  ["paul", "Paul", "Technical mentor", null],
  ["shreyas", "Shreyas", "Technical mentor", null],
];
const M = (k) => uid(`mentor:${k}`);

const WEEKS = [
  [0, "Psychology of Storytelling", 1, "s-mentor", null, false],
  [1, "Creator Market Fit + Positioning", 1, "s-side", "Commit post Fri, 6 Nov", false],
  [2, "Idea Generation + Content Calendar", 1, "s-desk", null, false],
  [3, "Long-form Scripting", 2, "g12", null, false],
  [4, "Short-form Scripts + the Script Engine", 2, "g05", null, false],
  [5, "Shot Division + Production", 2, "s-filming", "First scripted post Fri, 11 Dec", false],
  [6, "Advanced Production + On-Camera", 2, "g04", "Post #3 Fri, 18 Dec", false],
  [7, "Editing Pt 1: the ONE template", 3, "s-edit", "Post #4 Thu, 24 Dec", false],
  [8, "Editing Pt 2: speed + Sprint draft", 3, "g08", "Post #5 Thu, 31 Dec", false],
  [9, "Repurposing, Platforms + Lock and Load", 4, "g11", null, false],
  [10, "Sprint week 1: Community that Converts", 4, "g15", null, true],
  [11, "Sprint week 2: Analytics on Live Data", 4, "s-wide", null, true],
  [12, "Sprint week 3: Funnels + Monetisation", 4, "g14", null, true],
  [13, "Demo Day", 4, "s-hero", null, false],
];
const WEEK_START = {
  0: "2026-10-24", 1: "2026-10-31", 2: "2026-11-14", 3: "2026-11-21", 4: "2026-11-28", 5: "2026-12-05", 6: "2026-12-12",
  7: "2026-12-19", 8: "2026-12-26", 9: "2027-01-02", 10: "2027-01-09", 11: "2027-01-16", 12: "2027-01-23", 13: "2027-01-30",
};

const QZ_GEN = [
  ["What does the pre-watch protect?", ["Your hot seat this week", "Nothing, it's optional", "Your certificate"], 0],
  ["How do you hand in work?", ["Upload the file", "Paste a link", "Email it to a mentor"], 1],
  ["What can a mentor call your work?", ["Pass or fail", "A grade out of 10", "Ship, Fix or Hold"], 2],
  ["Who is in your Clan?", ["5 to 6 people from your cohort", "Everyone in the cohort", "Just you and a mentor"], 0],
  ["When is Demo Day?", ["Week 6", "The last Saturday", "There isn't one"], 1],
];
const QZ_5 = [
  ["What is shot division for?", ["Planning every shot before you film, so the shoot is fast", "Picking the music", "Cutting a long video into reels"], 0],
  ["On a phone, what matters first?", ["A new lens", "Light on your face", "4K at 60 fps"], 1],
  ["Where does your shot list live?", ["In your head", "In the WhatsApp group", "In your Doc, in 03 - Production"], 2],
  ["\"Raw to postable in 20 minutes\" means:", ["One template, one pass, then post", "Edit until it is perfect", "Skip the captions"], 0],
  ["What happens at Sunday's double session?", ["A recorded lecture", "You shoot and cut live with the technical mentors", "Nothing, it is optional"], 1],
];
const quiz = (rows) => rows.map(([qq, options, answer]) => ({ q: qq, options, answer }));

const S = (key, w, start, end, kind, title, mentors, extra = {}) => ({ key, w, start, end, kind, title, mentors, ...extra });
const SESSIONS = [
  S("s01", 0, "2026-10-24T18:00:00", "2026-10-24T20:30:00", "orientation", "Orientation", ["rahul", "sai"], { prep: ["Camera on, a quiet corner", "Your phone, charged", "Pre-watch done: Program OS"], rec: 148, img: "s-mentor" }),
  S("s02", 0, "2026-10-25T15:00:00", "2026-10-25T18:00:00", "class", "Psychology of Storytelling", ["rahul"], { rec: 171, img: "g00" }),
  S("s03", 1, "2026-10-31T18:00:00", "2026-10-31T20:00:00", "review", "Review: your creator story", ["sai", "prakriti"], { rec: 116, img: "g01" }),
  S("s04", 1, "2026-11-01T15:00:00", "2026-11-01T18:00:00", "class", "Creator Market Fit + Positioning", ["sai"], { rec: 176, img: "s-side" }),
  S("s05", 2, "2026-11-14T18:00:00", "2026-11-14T20:00:00", "review", "Review: positioning", ["sai", "ayushi"], { rec: 109, img: "g03" }),
  S("s06", 2, "2026-11-15T15:00:00", "2026-11-15T18:00:00", "class", "Idea Generation + Content Calendar", ["prakriti"], { rec: 168, img: "s-desk" }),
  S("s07", 3, "2026-11-21T18:00:00", "2026-11-21T20:00:00", "review", "Review: calendar locked", ["prakriti", "sai"], { rec: 121, img: "g06" }),
  S("s08", 3, "2026-11-22T15:00:00", "2026-11-22T18:00:00", "class", "Long-form Scripting", ["sai"], { rec: 174, img: "g12" }),
  S("s09", 4, "2026-11-28T18:00:00", "2026-11-28T20:00:00", "class", "Short-form Scriptwriting", ["sai"], { rec: 118, img: "g05" }),
  S("s10", 4, "2026-11-29T15:00:00", "2026-11-29T18:00:00", "class", "The Script Engine in Claude", ["kevin"], { rec: 162, img: "g13" }),
  S("s11", 5, "2026-12-05T18:00:00", "2026-12-05T20:00:00", "review", "Review: scripts + lock your 7", ["sai", "kevin"], { prep: ["Your 3 short-form scripts (submitted)", "Your 7 Sprint picks, in order", "One question you want answered live"], rec: 124, img: "g07" }),
  S("s12", 5, "2026-12-06T11:00:00", "2026-12-06T16:00:00", "double", "Shot Division + Production + raw-to-postable", ["edwin", "indira"], { rec: 284, img: "s-filming" }),
  S("s13", 6, "2026-12-12T18:00:00", "2026-12-12T20:00:00", "review", "Review: first scripted posts", ["sai", "edwin"], { rec: 117, img: "g09" }),
  S("s14", 6, "2026-12-13T11:00:00", "2026-12-13T16:00:00", "double", "Advanced Production + On-Camera", ["paul", "indira"], { rec: 291, img: "g04" }),
  S("s15", 7, "2026-12-19T18:00:00", "2026-12-19T20:00:00", "review", "Review: post #3", ["edwin", "ayushi"], { rec: 112, img: "g02" }),
  S("s16", 7, "2026-12-20T15:00:00", "2026-12-20T18:00:00", "class", "Editing Pt 1: the ONE template", ["shreyas"], { rec: 170, img: "s-edit" }),
  S("s17", 8, "2026-12-26T18:00:00", "2026-12-26T20:00:00", "review", "Review: post #4", ["shreyas", "sai"], { rec: 108, img: "g10" }),
  S("s18", 8, "2026-12-27T15:00:00", "2026-12-27T18:00:00", "class", "Editing Pt 2: speed + Sprint draft", ["shreyas", "indira"], { rec: 166, img: "g08" }),
  S("s19", 9, "2027-01-02T18:00:00", "2027-01-02T20:00:00", "class", "Repurposing + Writing for Formats", ["srijan"], { rec: 119, img: "g11" }),
  S("s20", 9, "2027-01-03T15:00:00", "2027-01-03T18:00:00", "class", "Platforms + Lock and Load", ["srijan", "sai"], { rec: 158, img: "g03" }),
  S("s21", 10, "2027-01-09T18:00:00", "2027-01-09T18:45:00", "standup", "Sprint standup", ["sai"], { rec: 44, img: "g01" }),
  S("s22", 10, "2027-01-10T15:00:00", "2027-01-10T16:30:00", "class", "Community that Converts", ["prakriti"], { rec: 89, img: "g15" }),
  S("s23", 11, "2027-01-16T18:00:00", "2027-01-16T18:45:00", "standup", "Sprint standup", ["sai"], { prep: ["Your numbers from Day 1 to 7", "Your best and worst post, and why"], rec: 45, img: "g06" }),
  S("s24", 11, "2027-01-17T15:00:00", "2027-01-17T16:30:00", "class", "Analytics on Live Data", ["ayushi"], { rec: 90, img: "s-wide" }),
  S("s25", 12, "2027-01-23T18:00:00", "2027-01-23T18:45:00", "standup", "Sprint standup", ["sai"], { rec: 45, img: "g07" }),
  S("s26", 12, "2027-01-24T15:00:00", "2027-01-24T16:30:00", "class", "Funnels + Monetisation", ["srijan"], { rec: 90, img: "g14" }),
  S("s27", 13, "2027-01-30T18:00:00", "2027-01-30T20:30:00", "demo", "Creator Demo Day", ["rahul", "sai", "prakriti", "srijan", "ayushi"], { prep: ["Your 90-second showcase", "Media kit link", "Your best Sprint post, queued"], rec: 150, img: "s-hero" }),
  S("s28", 13, "2027-01-31T15:00:00", "2027-01-31T17:00:00", "plan", "12-Month Plan + the OS", ["rahul"], { rec: 120, img: "s-desk" }),
];

const content = JSON.parse(readFileSync(join(here, "content.json"), "utf8"));
delete content._note;

function chaptersFor(s) {
  const base = content.default_chapters[s.kind] || content.default_chapters.class;
  const dur = (s.rec || 120) * 60;
  return base.map(([m, t]) => ({ at_sec: m * 60, title: t })).filter((c) => c.at_sec < dur);
}

const A = (key, w, title, due, parts, coins, extra = {}) => ({ key, w, title, due, parts, coins, ...extra });
const ASSIGNMENTS = [
  A("a0", 0, "Your creator story", "2026-10-30T23:59:00", [{ k: "voice", label: "Creator story voice note", where: "Drive · 01 - Voice & Story" }, { k: "doc", label: "Profile audit", where: "Google Doc · 02 - Scripts & Ideas" }], 300),
  A("a1", 1, "Positioning + your commit post", "2026-11-06T23:59:00", [{ k: "doc", label: "Positioning doc", where: "Google Doc · 02 - Scripts & Ideas" }, { k: "post", label: "Commit post", where: "Instagram or YouTube link" }], 400),
  A("a2", 2, "20 ideas + your 21-day calendar", "2026-11-20T23:59:00", [{ k: "doc", label: "Idea bank (20 ideas)", where: "Google Doc · 02 - Scripts & Ideas" }, { k: "sheet", label: "21-day calendar", where: "Google Sheet" }], 400),
  A("a3", 3, "Your long-form script", "2026-11-27T23:59:00", [{ k: "doc", label: "Long-form script", where: "Google Doc · 02 - Scripts & Ideas" }], 300, { group: true }),
  A("a4", 4, "3 short-form scripts + your 7 Sprint picks", "2026-12-04T23:59:00", [{ k: "doc", label: "3 short-form scripts", where: "Google Doc · 02 - Scripts & Ideas" }, { k: "doc", label: "Your 7 Sprint picks", where: "Google Doc · 02 - Scripts & Ideas" }], 450),
  A("a5", 5, "Shot division + first scripted post", "2026-12-11T23:59:00", [{ k: "doc", label: "Shot division for your 7", where: "Google Doc · 03 - Production" }, { k: "post", label: "First scripted post", where: "Instagram or YouTube link" }], 450),
  A("a6", 6, "On-camera takes + post #3", "2026-12-18T23:59:00", [{ k: "drive", label: "10-take drill", where: "Drive · 03 - Production" }, { k: "post", label: "Post #3", where: "Instagram or YouTube link" }], 400),
  A("a7", 7, "The ONE template + post #4", "2026-12-24T23:59:00", [{ k: "drive", label: "Your template project", where: "Drive · 04 - Edit" }, { k: "post", label: "Post #4", where: "Instagram or YouTube link" }], 400),
  A("a8", 8, "Sprint draft + post #5", "2026-12-31T23:59:00", [{ k: "sheet", label: "Sprint draft (all 21 days)", where: "Google Sheet" }, { k: "post", label: "Post #5", where: "Instagram or YouTube link" }], 400),
  A("a9", 9, "Sprint contract + rebuilt profile", "2027-01-03T23:59:00", [{ k: "sign", label: "Sign your Sprint contract", where: "In the app" }, { k: "profile", label: "Rebuilt profile", where: "Instagram or YouTube link" }], 500),
  A("a12", 12, "Media kit + showcase post", "2027-01-29T23:59:00", [{ k: "doc", label: "Media kit", where: "Google Doc or Canva link" }, { k: "post", label: "Showcase post", where: "Instagram or YouTube link" }], 500),
];

const CLANS = ["Hookline", "Jumpcut", "Payoff", "Cold Open", "B-Roll", "Overlay", "Retention"];
const CLANMATES = [
  ["aarav", "Aarav Shah", "AS", "Fitness for desk jobs"],
  ["meher", "Meher Kapoor", "MK", "Skincare that costs less"],
  ["kabir", "Kabir Rao", "KR", "B2B sales, plainly"],
  ["riya", "Riya Iyer", "RI", "Travel on a budget"],
  ["tanvi", "Tanvi Joshi", "TJ", "Breaking into UX"],
];
const OTHERS = ["Ishaan K", "Ananya R", "Vihaan P", "Saanvi M", "Arjun N", "Kiara D", "Reyansh T", "Myra S", "Advait G", "Anika B", "Vivaan C", "Aadhya L", "Krish V", "Pari J", "Rudra M", "Navya S", "Atharv K", "Ira P", "Shaurya R", "Avni T", "Dhruv B", "Sara Q", "Kian F", "Zara H", "Ayaan O", "Siya W", "Neel E", "Tara U", "Om Y", "Ruhi X", "Yash A", "Mira I", "Dev Z", "Inaya N"];
const NICHES = ["Cooking for one", "Running after 30", "Freelance design", "Startup hiring", "Indie music", "Book notes", "Home workouts", "Personal finance for couples", "Learning Japanese", "Gardening on a balcony", "Product management", "Interior design on a budget"];

const demo = {
  offset_secs: 0,
  stops: {
    browse: at("2026-10-01T21:10:00"), applied: at("2026-10-03T12:00:00"), decision: at("2026-10-07T10:00:00"),
    prestart: at("2026-10-19T11:00:00"), orientation: at("2026-10-24T18:12:00"), week1: at("2026-11-04T20:30:00"),
    week5: at("2026-12-05T10:00:00"), sprint: at("2027-01-17T21:05:00"), demo: at("2027-01-30T18:06:00"), alumni: at("2027-02-10T19:00:00"),
  },
  canon: { sprint_start: "2027-01-09", week_starts: WEEK_START },
  me: { niche: "Money for your first salary", handle: "@diya.firstsalary", track: "A", why: "I post, but with no plan" },
  interview_at: at("2026-10-06T19:00:00"),
  assignment_ids: Object.fromEntries(ASSIGNMENTS.map((a) => [a.key, uid(`assignment:${a.key}`)])),
  session_ids: Object.fromEntries(SESSIONS.map((s) => [s.key, uid(`session:${s.key}`)])),
  mentor_ids: Object.fromEntries(MENTORS.map(([k]) => [k, M(k)])),
  ghost_ids: Object.fromEntries([...CLANMATES.map(([k]) => [k, uid(`ghost:${k}`)]), ...OTHERS.map((n, i) => [`o${i}`, uid(`ghost:o${i}`)])]),
  reviews: {
    a0: { v: "ship", by: "sai", notes: ["The bank-statement line is your story. Open with it.", "Keep the voice. Do not polish it."] },
    a1: { v: "ship", by: "sai", notes: ["\"Money for your first salary\" is clear in one breath. Keep it.", "Commit post: good. Pin it."] },
    a2: { v: "ship", by: "prakriti", notes: ["Ideas 4, 9 and 17 are the strongest. Put them in week 1 of the calendar.", "Two posts a week are lists. Turn one into a story."] },
    a3: { v: "fix", by: "sai", notes: ["Your hook is at 0:40. Move \"I lost ₹42,000 in my first year\" to the first line.", "Three points is one too many for 8 minutes. Cut the tax section into its own video.", "End on one action, not a summary."], fix_due: at("2026-12-05T17:00:00") },
  },
  sprint_titles: ["First salary, first mistake", "The ₹500 rule", "What HR never tells you about CTC", "Rent vs EMI at 23", "Your first SIP, 60 seconds", "Cards I would not take", "The no-spend weekend", "Ask your dad these 3 questions", "Bonus month plan", "Gold vs index fund", "Salary day checklist", "The Diwali budget, after", "Emergency fund in 6 months", "Tax regime, in one post", "My worst money year", "Insurance you skip", "The 3-account system", "What ₹1 lakh taught me", "Side income, honestly", "A year from today", "Thank you, 21 days"],
};

let sql = `-- ============================================================================
-- LUCA demo cohort — GENERATED by ops/luca/demo/build-seed.mjs. Do not edit.
-- SAMPLE DATA ONLY (from the LUCA mockup). Staff-only (is_demo = true).
-- Re-running replaces program '${SLUG}' and nothing else.
-- ============================================================================
BEGIN;

DELETE FROM public.luca_programs WHERE slug = '${SLUG}';

INSERT INTO public.luca_programs (id, slug, offering_id, is_demo, enabled, name, short_name, cohort_label,
  starts_at, demo_day_at, ends_at, seats, hours_per_week, hero_url, timezone, whatsapp_url, drive_url, support_whatsapp,
  features, content, pricing, sprint, clan_config)
VALUES (${q(PROGRAM_ID)}, ${q(SLUG)}, NULL, true, false, 'The LevelUp Creator Academy', 'LUCA', 'Cohort 03',
  ${q(at("2026-10-24T18:00:00"))}, ${q(at("2027-01-30T18:00:00"))}, ${q(at("2027-02-01T00:00:00"))}, 40, 11, ${q(IMG("s-hero"))},
  'Asia/Kolkata', NULL, NULL, NULL,
  ${j({ application: true, clans: true, coins: true, leaderboard: true, sprint: true, demo_day: true, whatsapp: false })},
  ${j({ ...content, demo })},
  ${j({ price: 45000, deposit: 8000, app_fee: 400, emi: true })},
  ${j({ starts_on: "2027-01-09", days: 21, track_b_posts_per_week: 3 })},
  ${j({ names: CLANS, size: 6, reveal_at: at("2026-10-24T18:45:00") })});
`;

MENTORS.forEach(([k, name, angle, img, handle], i) => {
  sql += `INSERT INTO public.luca_mentors (id, program_id, name, angle, photo_url, handle, sort) VALUES (${q(M(k))}, ${q(PROGRAM_ID)}, ${q(name)}, ${q(angle)}, ${q(img)}, ${q(handle)}, ${i});\n`;
});

WEEKS.forEach(([n, module, phase, img, post, sprint]) => {
  const pw = n >= 10 ? {} : { title: n === 0 ? "Program OS + creator identity" : module, minutes: n === 0 ? 20 : 12 + ((n * 3) % 10), video_url: null };
  const qz = n >= 10 ? [] : quiz(n === 5 ? QZ_5 : QZ_GEN);
  sql += `INSERT INTO public.luca_weeks (id, program_id, n, module, phase, starts_on, image_url, post_note, is_sprint, is_demo_week, prewatch, quiz) VALUES (${q(uid(`week:${n}`))}, ${q(PROGRAM_ID)}, ${n}, ${q(module)}, ${phase}, ${q(WEEK_START[n])}, ${q(IMG(img))}, ${q(post)}, ${sprint}, ${n === 13}, ${j(pw)}, ${j(qz)});\n`;
});

SESSIONS.forEach((s) => {
  sql += `INSERT INTO public.luca_sessions (id, program_id, week_n, kind, title, starts_at, ends_at, mentor_ids, prep, image_url, zoom_url, recording_url, recording_minutes, chapters, files) VALUES (${q(uid(`session:${s.key}`))}, ${q(PROGRAM_ID)}, ${s.w}, ${q(s.kind)}, ${q(s.title)}, ${q(at(s.start))}, ${q(at(s.end))}, ${arr(s.mentors.map(M), "uuid")}, ${arr(s.prep || [])}, ${q(IMG(s.img))}, NULL, NULL, ${s.rec || "NULL"}, ${j(chaptersFor(s))}, ${j([{ badge: "PDF", title: "Mentor slides", sub: s.title, url: null }, { badge: "DOC", title: `Week ${s.w} brief`, sub: "What to make before Friday", url: null }])});\n`;
});

ASSIGNMENTS.forEach((a, i) => {
  sql += `INSERT INTO public.luca_assignments (id, program_id, week_n, title, due_at, parts, coins, is_group, sort) VALUES (${q(uid(`assignment:${a.key}`))}, ${q(PROGRAM_ID)}, ${a.w}, ${q(a.title)}, ${q(at(a.due))}, ${j(a.parts)}, NULL, ${!!a.group}, ${i});\n`;
});

CLANS.forEach((name, i) => {
  sql += `INSERT INTO public.luca_clans (id, program_id, name, sort) VALUES (${q(uid(`clan:${name}`))}, ${q(PROGRAM_ID)}, ${q(name)}, ${i});\n`;
});

CLANMATES.forEach(([k, name, ini, niche]) => {
  sql += `INSERT INTO public.luca_members (id, program_id, user_id, is_ghost, display_name, initials, niche, handle, track, clan_id, coins) VALUES (${q(uid(`ghost:${k}`))}, ${q(PROGRAM_ID)}, NULL, true, ${q(name)}, ${q(ini)}, ${q(niche)}, ${q(`@${k}.makes`)}, 'A', ${q(uid("clan:Hookline"))}, 200);\n`;
});
OTHERS.forEach((name, i) => {
  const ini = name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  const clan = CLANS[1 + (i % 6)];
  sql += `INSERT INTO public.luca_members (id, program_id, user_id, is_ghost, display_name, initials, niche, track, clan_id, coins) VALUES (${q(uid(`ghost:o${i}`))}, ${q(PROGRAM_ID)}, NULL, true, ${q(name)}, ${q(ini)}, ${q(NICHES[i % NICHES.length])}, ${i % 5 === 0 ? "'B'" : "'A'"}, ${q(uid(`clan:${clan}`))}, 200);\n`;
});

sql += `
INSERT INTO public.luca_announcements (program_id, title, body, pinned) VALUES
  (${q(PROGRAM_ID)}, 'This is the demo cohort', 'Everything here is sample data. Use the Demo panel on You to jump between days.', true);
INSERT INTO public.luca_resources (program_id, week_n, title, url, kind, sort) VALUES
  (${q(PROGRAM_ID)}, NULL, 'Cohort Drive (sample)', 'https://drive.google.com/', 'drive', 0),
  (${q(PROGRAM_ID)}, 0, 'Program OS (sample)', 'https://docs.google.com/', 'doc', 1);

COMMIT;
`;

writeFileSync(join(here, "seed.sql"), sql);
console.log(`wrote ${join(here, "seed.sql")} (${sql.length} bytes) — program ${PROGRAM_ID}`);
