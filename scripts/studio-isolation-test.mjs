#!/usr/bin/env node
/**
 * Studio P0 isolation gate — proves cb_reels RLS isolates tenants.
 * The council's hard rule: this must pass before ANY Studio UI / MCP ships.
 *
 * Runs against the live schema via the Supabase Management API SQL endpoint,
 * dropping to the `authenticated` role with a simulated JWT `sub` so RLS applies
 * exactly as it does for a real user. Seeds two students' reels, asserts each
 * sees ONLY their own, a stranger sees none, the owner/admin sees all (intended
 * override), then cleans up. Exit 0 = pass, 1 = fail.
 *
 *   set -a && . "<vault>/.env.supabase" && set +a
 *   SUPABASE_PAT=$SUPABASE_PAT node scripts/studio-isolation-test.mjs
 */
const PAT = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_MAIN_APP_REF || "ivkvluezuiojovpotlyb";
if (!PAT) { console.error("Missing SUPABASE_PAT"); process.exit(2); }
const SQ = String.fromCharCode(39);

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: "Bearer " + PAT, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const j = await r.json().catch(() => null);
  return { status: r.status, rows: j };
}
const last = (r) => (Array.isArray(r.rows) ? r.rows[r.rows.length - 1] : r.rows);

// Run a SELECT as a given user_id under RLS (authenticated role + jwt claims).
async function asUser(uid, selectExpr) {
  const sql =
    `begin; set local role authenticated; ` +
    `select set_config(${SQ}request.jwt.claims${SQ}, ${SQ}{"sub":"${uid}","role":"authenticated"}${SQ}, true); ` +
    `${selectExpr}; commit`;
  return last(await q(sql));
}

let failures = 0;
const check = (cond, label, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!cond) failures++;
};

const students = await q("select id from users where role = 'student' order by created_at limit 2");
if (!Array.isArray(students.rows) || students.rows.length < 2) {
  console.error("Need >=2 student users to run the test:", JSON.stringify(students.rows).slice(0, 200));
  process.exit(2);
}
const owner = await q("select id from users where role in ('owner','admin','superadmin') order by created_at limit 1");
const S1 = students.rows[0].id, S2 = students.rows[1].id;
const OWNER = Array.isArray(owner.rows) && owner.rows[0] ? owner.rows[0].id : null;
const STRANGER = "00000000-0000-0000-0000-000000000000";

await q(
  `insert into cb_reels(user_id,platform,shortcode,url,status) values ` +
  `(${SQ}${S1}${SQ},${SQ}instagram${SQ},${SQ}ZZISO_S1${SQ},${SQ}https://x/1${SQ},${SQ}done${SQ}),` +
  `(${SQ}${S2}${SQ},${SQ}instagram${SQ},${SQ}ZZISO_S2${SQ},${SQ}https://x/2${SQ},${SQ}done${SQ}) on conflict do nothing`
);
const scoped = `select coalesce(string_agg(shortcode, ${SQ},${SQ} order by shortcode), ${SQ}none${SQ}) as sees, ` +
  `count(*)::int as n from cb_reels where shortcode in (${SQ}ZZISO_S1${SQ},${SQ}ZZISO_S2${SQ})`;

try {
  const r1 = await asUser(S1, scoped);
  check(r1.sees === "ZZISO_S1", "student 1 sees only own reel", `(sees=${r1.sees})`);
  const r2 = await asUser(S2, scoped);
  check(r2.sees === "ZZISO_S2", "student 2 sees only own reel", `(sees=${r2.sees})`);
  const rx = await asUser(STRANGER, scoped);
  check(rx.n === 0, "stranger sees nothing", `(n=${rx.n})`);
  if (OWNER) {
    const ro = await asUser(OWNER, scoped);
    check(ro.n === 2, "owner/admin override sees all", `(n=${ro.n})`);
  }
} finally {
  await q(`delete from cb_reels where shortcode in (${SQ}ZZISO_S1${SQ},${SQ}ZZISO_S2${SQ})`);
}

console.log(failures === 0 ? "\n✅ Studio isolation gate GREEN" : `\n❌ ${failures} isolation failure(s)`);
process.exit(failures === 0 ? 0 : 1);
