#!/usr/bin/env node
/**
 * qa-harness/cohort-room-access.spec.mjs — the R0 adversarial access suite.
 *
 * THIS FILE IS THE SIGN-OFF ARTIFACT. It is what proves one cohort's private
 * content cannot leak to another cohort's students. Nothing else in phase R0
 * proves that: the migrations describe the wall, this suite attacks it.
 *
 * Authority: design/cohorts/docs/05-ACCESS-SECURITY.md §7 (the case matrix),
 * MEMBER-1 / ROSTER-SCOPE-1 / CHANNEL-KEY-1 / NFR-CONFIG-2, and the R-4 brief in
 * design/briefs/cohort-r0.md.
 *
 *   ONE COMMAND:  npm run test:room-access        (exit 0 = the wall holds)
 *
 * HOW IT ATTACKS
 *   Every read and write below is a REAL HTTP request to PostgREST carrying a
 *   REAL user JWT minted by GoTrue — not a `SET ROLE` simulation. That matters:
 *   table GRANTs, RLS policies, SECURITY DEFINER asserts and the PostgREST
 *   surface itself are all in the path, so a hole in any one of them shows up.
 *   Every response body is retained verbatim in a per-actor corpus, and the
 *   canary greps run over that whole corpus at the end — a leak through any
 *   surface, including one this suite never thought to name, is still caught.
 *
 * WHAT IT NEEDS (shadow project only — the prod ref is refused outright)
 *   SUPABASE_PAT            Management-API PAT (SQL channel: fixtures + introspection)
 *   ROOM_QA_PROJECT_REF     the SHADOW project ref
 *   optional: ROOM_QA_ANON_KEY / ROOM_QA_SERVICE_KEY (else fetched via the PAT)
 *   optional: ROOM_QA_KEEP=1 to leave the fixture world in place for inspection
 *   optional: ROOM_QA_DIFF_BASE (default "main") for the Delta-6 copy grep
 *
 * READING THE OUTPUT
 *   Every line states WHAT IT PROVES, not that something passed. A green run is
 *   a paragraph of security claims you can hand to the council verbatim.
 *
 *   PASS / FAIL are the wall R0 owns. A third verdict, CARRIED, exists for a
 *   hole this suite MEASURES in a wall R0 does not own — a pre-existing policy
 *   on a table outside the room-content set. A carried gap keeps the exit code
 *   at 0 (R0's own wall is intact) but is reprinted in full above the verdict
 *   and is raised as a finding by the design-qa-gate lens, so "green" never
 *   quietly means "nothing left to fix". If the residue grows past its stated
 *   boundary it stops being carried and fails like any other leak; if it is
 *   closed, the run says so and tells you to retire the entry.
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

// ── The canaries. Planted by cohort-room-fixtures.sql, hunted for here. ──────
const CANARY = {
  A1: "LEAK_CANARY_A1",
  A2: "LEAK_CANARY_A2",
  B1: "LEAK_CANARY_B1",
  ZOOM_A1: "LEAK_CANARY_ZOOM_A1",
  ZOOMNEAR_A1: "LEAK_CANARY_ZOOMNEAR_A1",
  CONFIG_A: "LEAK_CANARY_CONFIG_A",
  CONFIG_A2: "LEAK_CANARY_CONFIG_A2",
  REC_A1: "LEAK_CANARY_REC_A1",
  CURRIC_A1: "LEAK_CANARY_CURRIC_A1",
  ASSIGN_A1: "LEAK_CANARY_ASSIGN_A1",
  FEEDBACK_A1: "LEAK_CANARY_FEEDBACK_A1",
  MENTORDOC_A1: "LEAK_CANARY_MENTORDOC_A1",
  PII_A1: "LEAK_CANARY_PII_A1",
  PII_A2: "LEAK_CANARY_PII_A2",
};
/** Everything private to offering A. No outsider may ever see any of it. */
const ALL_A_SECRETS = [
  CANARY.A1, CANARY.A2, CANARY.ZOOM_A1, CANARY.ZOOMNEAR_A1,
  CANARY.CONFIG_A, CANARY.CONFIG_A2,
  CANARY.REC_A1, CANARY.CURRIC_A1, CANARY.ASSIGN_A1, CANARY.FEEDBACK_A1,
  CANARY.MENTORDOC_A1, CANARY.PII_A1, CANARY.PII_A2,
];
/**
 * What a pre_member is redacted out of (MEMBER-1 §R11): the five named surfaces
 * — recordings, curriculum detail, assignments, feedback, mentor materials —
 * plus both join links. The lobby's whitelist is titles and dates; a link is
 * never on it at any distance from the session, which is why the zoom sentinels
 * belong in the same sweep rather than only in the envelope assertion.
 */
const PRE_MEMBER_FORBIDDEN = [
  CANARY.REC_A1, CANARY.CURRIC_A1, CANARY.ASSIGN_A1,
  CANARY.FEEDBACK_A1, CANARY.MENTORDOC_A1,
  CANARY.ZOOM_A1, CANARY.ZOOMNEAR_A1,
];

const ACTORS = {
  admin: "room-qa-admin@leveluptest.invalid",
  member_A1: "room-qa-member-a1@leveluptest.invalid",
  member_A2: "room-qa-member-a2@leveluptest.invalid",
  member_B: "room-qa-member-b@leveluptest.invalid",
  mentor_A: "room-qa-mentor-a@leveluptest.invalid",
  accepted_A: "room-qa-accepted-a@leveluptest.invalid",
  pre_member_A1: "room-qa-pre-member-a1@leveluptest.invalid",
  outsider: "room-qa-outsider@leveluptest.invalid",
};
const MODULE_KEYS = [
  "weeks", "sessions", "recordings", "assignments", "feedback", "commons",
  "resources", "demo_day", "roster", "announcements", "mentor_materials",
  "certificates",
];
const PROD_REF = "ivkvluezuiojovpotlyb";

// ── Reporting ───────────────────────────────────────────────────────────────
const C = process.stdout.isTTY
  ? { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" }
  : { g: "", r: "", y: "", d: "", b: "", x: "" };

let passed = 0;
const failures = [];

function section(title, why) {
  console.log(`\n${C.b}── ${title}${C.x}`);
  if (why) console.log(`${C.d}   ${why}${C.x}`);
}

/**
 * The only assertion primitive. `claim` is a sentence about the security
 * property being demonstrated — write what it PROVES, never "it passed".
 */
function prove(id, claim, ok, evidence) {
  if (ok) {
    passed++;
    console.log(`${C.g}PASS${C.x} ${id}  ${claim}`);
    if (evidence) console.log(`${C.d}       ↳ ${evidence}${C.x}`);
  } else {
    failures.push({ id, claim, evidence });
    console.log(`${C.r}FAIL${C.x} ${id}  ${claim}`);
    console.log(`${C.r}       ↳ ${evidence}${C.x}`);
  }
  return ok;
}

/**
 * A gap this suite MEASURES but R0 does not OWN — a pre-existing policy on a
 * table outside the room-content set that R0 deliberately does not widen (and
 * therefore does not narrow either).
 *
 * Three outcomes, and none of them is silence:
 *   open+unchanged → CARRIED. Printed in the verdict, exit stays 0, and the
 *                    design-qa-gate lens is instructed to raise every carried
 *                    gap as a finding, so it cannot be swallowed by a green run.
 *   widened        → FAIL. The residue grew past its documented boundary; that
 *                    is a leak like any other.
 *   closed         → PASS, plus an explicit "retire this entry" instruction, so
 *                    a fix does not leave a stale pin behind rotting.
 */
const carriedGaps = [];
function carryGap(id, { claim, closedClaim, open, widened, evidence, closing }) {
  if (widened) {
    failures.push({ id, claim, evidence });
    console.log(`${C.r}FAIL${C.x} ${id}  ${claim}`);
    console.log(`${C.r}       ↳ RESIDUE WIDENED: ${evidence}${C.x}`);
    return false;
  }
  if (!open) {
    passed++;
    console.log(`${C.g}PASS${C.x} ${id}  ${closedClaim}`);
    console.log(`${C.d}       ↳ the gap is CLOSED — ${evidence}. Retire this entry from the suite.${C.x}`);
    return true;
  }
  carriedGaps.push({ id, evidence, closing });
  console.log(`${C.y}CARRIED${C.x} ${id}  ${claim}`);
  console.log(`${C.d}       ↳ ${evidence}${C.x}`);
  console.log(`${C.d}       ↳ closing it: ${closing}${C.x}`);
  return true;
}

function die(msg, code = 2) {
  console.error(`\n${C.r}✖ ${msg}${C.x}`);
  process.exit(code);
}

// ── Case inventory (also printed by --list) ─────────────────────────────────
const INVENTORY = [
  ["PRE", "fixture world + membership preflight (derived vs manual vs none)"],
  ["Δ6", "R0 diff carries no certificate tiers and no tuition-credit phrasing"],
  ["R1/R2/R3", "member_B / outsider / anon read every offering-A surface"],
  ["R4", "non-members calling the room RPCs are raised at, not handed an empty set"],
  ["R7", "recording positions are own-row-only between members"],
  ["R8/R9/C3", "cross-batch isolation inside one offering (A1 vs A2), config override included"],
  ["R10", "accepted_A holds zero room read grant, and there is no preview RPC"],
  ["R11", "pre_member_A1 sees the whitelist only, redacted out of five surfaces"],
  ["MYROOMS", "the room-LIST RPC is self-scoped and carries the lobby redaction"],
  ["W1/W2/W5/W6/W7", "write attacks on announcements, demo entries and the feed"],
  ["W3/W4", "membership and config are server-derived, never client-claimed"],
  ["W3.5/W3.6", "the admin grant/revoke RPCs DO work from an admin JWT (W3.4's control)"],
  ["W6b", "pre_member community write is rejected"],
  ["W8", "forged channel_key is rejected by the write RPC"],
  ["W9", "client-set is_mentor_answer is overridden; raw feed INSERT is revoked"],
  ["L1/L2", "revoking an enrolment removes access; re-granting restores it"],
  ["GAP-1", "the measured residue revocation leaves outside R0's own surfaces"],
  ["C1", "roster ships the safe column set only — no phone, no email"],
  ["C2", "the T-60 zoom gate holds server-side, in the envelope AND in the link RPC"],
  ["NFR-CONFIG-2", "flipping every module flag ON changes no row count anywhere"],
  ["CANARY", "full-corpus grep for every planted sentinel"],
];

if (process.argv.includes("--list")) {
  console.log(`${C.b}cohort-room-access — case inventory (NOTHING IS PROVEN BY THIS FLAG)${C.x}`);
  for (const [id, what] of INVENTORY) console.log(`  ${id.padEnd(16)} ${what}`);
  console.log(`\n${C.r}INVENTORY ONLY — run without --list to actually attack the wall.${C.x}`);
  process.exit(3);
}

// ── Config + the prod guard ─────────────────────────────────────────────────
const PAT = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.ROOM_QA_PROJECT_REF || process.env.SUPABASE_SHADOW_REF;

if (!PAT) die("Missing SUPABASE_PAT (Management API token for the SQL channel).");
if (!REF) die("Missing ROOM_QA_PROJECT_REF — the SHADOW project ref to attack.");
if (REF === PROD_REF) {
  die(
    `ROOM_QA_PROJECT_REF is the PRODUCTION project (${PROD_REF}). This suite creates ` +
      "users, plants leak canaries and revokes enrolments. It runs on a SHADOW project only."
  );
}

const API = `https://api.supabase.com/v1/projects/${REF}`;
const BASE = `https://${REF}.supabase.co`;

// ── Transport 1: the SQL channel (project owner, bypasses RLS) ──────────────
async function sql(query) {
  const res = await fetch(`${API}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`SQL channel ${res.status}: ${detail.slice(0, 600)}`);
  }
  return Array.isArray(body) ? body : [];
}
const sqlOne = async (q) => (await sql(q))[0] ?? null;
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ── Transport 2: real user sessions against the real API surface ────────────
let ANON_KEY = process.env.ROOM_QA_ANON_KEY || "";
let SERVICE_KEY = process.env.ROOM_QA_SERVICE_KEY || "";

async function loadKeys() {
  if (ANON_KEY && SERVICE_KEY) return;
  for (const url of [`${API}/api-keys?reveal=true`, `${API}/api-keys`]) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${PAT}` } });
    if (!res.ok) continue;
    const keys = await res.json().catch(() => null);
    if (!Array.isArray(keys)) continue;
    for (const k of keys) {
      const value = k.api_key || k.apiKey || k.key;
      if (!value) continue;
      if (k.name === "anon" && !ANON_KEY) ANON_KEY = value;
      if (k.name === "service_role" && !SERVICE_KEY) SERVICE_KEY = value;
    }
    if (ANON_KEY && SERVICE_KEY) return;
  }
  die(
    "Could not resolve the anon / service_role keys for this project. Pass " +
      "ROOM_QA_ANON_KEY and ROOM_QA_SERVICE_KEY explicitly, or use a PAT with project-keys scope."
  );
}

/** actor → { id, token } */
const session = {};
/** actor → [{ label, text }] — every byte the server ever handed this actor. */
const corpus = new Map();

function record(actor, label, text) {
  if (!corpus.has(actor)) corpus.set(actor, []);
  corpus.get(actor).push({ label, text: text ?? "" });
}
const mark = (actor) => (corpus.get(actor) ?? []).length;
const since = (actor, from) => (corpus.get(actor) ?? []).slice(from);

function authHeaders(actor) {
  if (actor === "anon") return { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
  const s = session[actor];
  if (!s) throw new Error(`no session for actor ${actor}`);
  return { apikey: ANON_KEY, Authorization: `Bearer ${s.token}` };
}

/**
 * A probe the SERVER could not parse (bad column, missing embed, unknown table)
 * also comes back 4xx. Counting that as "denied" would turn a typo in this file
 * into a green security result, so malformed probes are called out instead.
 */
const PARSE_ERROR_CODES = /^PGRST(1\d\d|20\d)$/;
function isMalformed(status, json) {
  if (status !== 400 && status !== 404) return false;
  const code = json && json.code;
  return typeof code === "string" && PARSE_ERROR_CODES.test(code);
}

/** GET through PostgREST as `actor`. Body text always lands in the corpus. */
async function read(actor, path, label = path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: authHeaders(actor) });
  const text = await res.text();
  record(actor, `GET ${label}`, text);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch { /* PostgREST always speaks JSON; a non-JSON body is itself evidence */ }
  const malformed = isMalformed(res.status, json);
  return {
    status: res.status,
    ok: res.ok,
    json,
    text,
    malformed,
    rows: Array.isArray(json) ? json.length : null,
    /** "0 rows" and "denied" are both a pass for a read attack. A probe the
     *  server rejected as unparseable is neither — it proved nothing. */
    blocked: !malformed && (!res.ok || (Array.isArray(json) && json.length === 0)),
    describe: malformed
      ? `MALFORMED PROBE — HTTP ${res.status} ${json.code}: ${json.message || ""} (this probe tested nothing)`
      : res.ok
        ? `HTTP ${res.status}, ${Array.isArray(json) ? json.length : "?"} row(s)`
        : `HTTP ${res.status} ${(json && (json.message || json.code)) || text.slice(0, 120)}`,
  };
}

/** POST/PATCH/DELETE through PostgREST as `actor` (the write attacks). */
async function write(actor, path, method, body, label) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      ...authHeaders(actor),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  record(actor, `${method} ${label || path}`, text);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch { /* non-JSON error bodies are kept as raw text evidence */ }
  const malformed = isMalformed(res.status, json);
  return {
    status: res.status,
    ok: res.ok,
    json,
    text,
    malformed,
    /** Rejected by policy or grant — NOT rejected because we sent nonsense. */
    rejected: !res.ok && !malformed,
    /** A write that PostgREST accepted but RLS filtered to nothing. */
    changedNothing: res.ok && Array.isArray(json) && json.length === 0,
    describe: malformed
      ? `MALFORMED WRITE — HTTP ${res.status} ${json.code}: ${json.message || ""} (this attack was never delivered)`
      : `HTTP ${res.status} ${(json && (json.message || json.code)) || text.slice(0, 160)}`,
  };
}

/** Call a SECURITY DEFINER RPC as `actor`. */
async function rpc(actor, fn, args = {}, label) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...authHeaders(actor), "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  record(actor, `RPC ${label || fn}`, text);
  let json = null;
  let parsed = false;
  try {
    json = JSON.parse(text);
    parsed = true;
  } catch { /* ditto */ }
  // PGRST202 = "no function matches". For every case except R10 (where the
  // absence IS the proof) that means the call never reached the RPC, so it must
  // not be scored as a raise.
  const missing = res.status === 404 || (json && json.code === "PGRST202");
  const malformed = !missing && isMalformed(res.status, json);
  return {
    status: res.status,
    ok: res.ok,
    json,
    text,
    missing,
    /** The server rejected the CALL, not the caller — a bad argument name, a
     *  wrong overload. Scoring that as a refusal would green-light a typo. */
    malformed,
    /** The function ran and refused us — not "the function was not found",
     *  and not "PostgREST could not parse what this file sent". */
    raised: !res.ok && !missing && !malformed,
    /**
     * The function RAN, answered 200, and its answer was SQL NULL.
     *
     * This is the pass condition for every link-gate case (C2.5, C2.7.*, L1.3b,
     * R11.b3), which makes it the one place where "the server sent nothing
     * usable" and "the server deliberately withheld the link" must never be
     * allowed to look the same. `json === null` alone conflates them: a gateway
     * 502 HTML page, a proxy error or an empty body all fail JSON.parse, leave
     * `json` at its null initialiser, and would sail through as a withheld
     * link. So this demands the full shape — 2xx, a body that parsed, and a
     * body that is literally `null` — exactly the guard read() and write()
     * already carry (see the malformed-probe note above them).
     */
    returnedNull: res.ok && parsed && json === null && text.trim() === "null",
    message: (json && (json.message || json.hint || json.code)) || text.slice(0, 160),
    describe: missing
      ? `NO SUCH FUNCTION — HTTP ${res.status} ${(json && json.message) || ""} (the call never reached an RPC)`
      : malformed
        ? `MALFORMED CALL — HTTP ${res.status} ${json.code}: ${json.message || ""} (this probe tested nothing)`
        : `HTTP ${res.status} ${(json && (json.message || json.code)) || text.slice(0, 160)}`,
  };
}

// ── Canary greps over the retained corpus ───────────────────────────────────
function corpusHits(actor, needle, from = 0) {
  return since(actor, from)
    .filter((e) => e.text.includes(needle))
    .map((e) => e.label);
}

function proveCorpusClean(id, actor, needles, claim, from = 0) {
  const leaks = [];
  for (const n of needles) for (const label of corpusHits(actor, n, from)) leaks.push(`${n} via ${label}`);
  const responses = since(actor, from).length;
  return prove(
    id,
    claim,
    leaks.length === 0,
    leaks.length === 0
      ? `${responses} response bodies swept for ${needles.length} sentinel(s); zero hits`
      : `LEAKED: ${leaks.slice(0, 8).join("; ")}`
  );
}

// ── RPC signature resolution ────────────────────────────────────────────────
// R-3 owns the write RPCs' parameter names; this suite must not guess them and
// must not go green just because a typo'd argument made the call 404. We read
// the real signature from pg_proc and bind our semantic slots to it.
const SIG_MATCHERS = [
  ["channel", /channel/i],
  ["mentor", /mentor/i],
  ["week", /week/i],
  ["post", /(post|parent)/i],
  ["batch", /batch/i],
  ["offering", /offering/i],
  ["kind", /(kind|type)/i],
  ["media", /media/i],
  ["body", /(body|content|text|message)/i],
];

async function signature(fn) {
  const rows = await sql(
    `SELECT pg_get_function_arguments(p.oid) AS args
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ${lit(fn)}`
  );
  if (!rows.length) return null;
  const names = String(rows[0].args || "")
    .split(",")
    .map((a) => a.trim().split(/\s+/)[0])
    .filter(Boolean);
  return { raw: rows[0].args, names };
}

/**
 * Bind {offering, batch, body, …} onto a function's real parameter names.
 * Returns null (never throws) when a slot cannot be bound, so an unexpected
 * signature fails one named case instead of aborting the whole suite.
 */
function bind(sig, wanted) {
  if (!sig) return null;
  const out = {};
  const taken = new Set();
  for (const [slot, re] of SIG_MATCHERS) {
    if (!(slot in wanted)) continue;
    const name = sig.names.find((n) => !taken.has(n) && re.test(n));
    if (!name) return null;
    taken.add(name);
    out[name] = wanted[slot];
  }
  return out;
}

// ── Fixture lifecycle ───────────────────────────────────────────────────────
async function resetAuthUsers() {
  const emails = Object.values(ACTORS).map(lit).join(",");
  const existing = await sql(`SELECT id, email FROM auth.users WHERE email IN (${emails})`);
  for (const u of existing) {
    await fetch(`${BASE}/auth/v1/admin/users/${u.id}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
  }
  const password = `RoomQA-${randomUUID()}!aA1`;
  for (const [actor, email] of Object.entries(ACTORS)) {
    const res = await fetch(`${BASE}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: actor },
      }),
    });
    if (!res.ok) die(`Could not create fixture user ${actor}: HTTP ${res.status} ${await res.text()}`);
  }
  return password;
}

async function signIn(password) {
  for (const [actor, email] of Object.entries(ACTORS)) {
    const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) die(`Could not sign in fixture user ${actor}: HTTP ${res.status} ${await res.text()}`);
    const body = await res.json();
    session[actor] = { id: body.user.id, token: body.access_token };
  }
}

async function teardown() {
  await sql(`
    DELETE FROM public.live_sessions WHERE title LIKE 'ROOM QA %';
    DELETE FROM public.cohort_applications WHERE email LIKE 'room-qa-%';
    DELETE FROM public.enrolments WHERE offering_id IN (SELECT id FROM public.offerings WHERE slug LIKE 'room-qa-%');
    DELETE FROM public.offerings WHERE slug LIKE 'room-qa-%';
    DELETE FROM public.courses WHERE slug LIKE 'room-qa-%';
    DROP FUNCTION IF EXISTS public._room_qa_uid(text);
    SELECT 1;
  `).catch(() => {});
  const emails = Object.values(ACTORS).map(lit).join(",");
  const rows = await sql(`SELECT id FROM auth.users WHERE email IN (${emails})`).catch(() => []);
  for (const u of rows) {
    await fetch(`${BASE}/auth/v1/admin/users/${u.id}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    }).catch(() => {});
  }
}

// ════════════════════════════════════════════════════════════════════════════
// THE RUN
// ════════════════════════════════════════════════════════════════════════════
console.log(`${C.b}cohort room access — adversarial suite${C.x}`);
console.log(`${C.d}project ${REF} (shadow) · ${BASE}${C.x}`);

// ── Δ6 / Delta-6: a copy + schema grep over the R0 diff. Pure static, runs
//    first so it reports even if the shadow project is unreachable. ──────────
section(
  "Δ6 — STANDING-1 + FEE-1 copy discipline",
  "single Completion certificate, and the ₹400 is a non-refundable review fee — never tuition credit"
);
{
  const base = process.env.ROOM_QA_DIFF_BASE || "main";
  const SELF = "qa-harness/cohort-room-access.spec.mjs"; // the scanner cannot scan itself
  const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // Scope: what R0 SHIPS. design/ is the authority set — those documents have to
  // be able to state the rule ("no honours tiers", "never tuition credit")
  // without the scanner reading the rule as a violation of itself.
  const SHIPPED = /^(src|supabase|public|scripts|qa-harness|android|ios)\/|^index\.html$/;
  const sources = [];
  /** @type {{file: string, text: string}[]} */
  const added = [];

  const collectDiff = (label, args) => {
    let out;
    try {
      out = git(args);
    } catch {
      return; // base may not exist / no commits yet — the next source still counts
    }
    sources.push(label);
    let file = "";
    for (const line of out.split("\n")) {
      if (line.startsWith("+++ b/")) { file = line.slice(6); continue; }
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      if (line.startsWith("+") && file && file !== SELF) added.push({ file, text: line.slice(1) });
    }
  };
  // Committed phase work, then the working tree, then untracked new files — the
  // gate may run before anything is committed, and an unscanned file is an
  // unproven file.
  collectDiff(`git diff ${base}...HEAD`, ["diff", `${base}...HEAD`, "--", "."]);
  collectDiff("git diff HEAD", ["diff", "HEAD", "--", "."]);
  try {
    const untracked = git(["ls-files", "--others", "--exclude-standard"])
      .split("\n").map((f) => f.trim()).filter((f) => f && f !== SELF);
    if (untracked.length) {
      sources.push(`${untracked.length} untracked file(s)`);
      for (const f of untracked) {
        try {
          for (const text of readFileSync(resolve(REPO, f), "utf8").split("\n")) added.push({ file: f, text });
        } catch { /* binary or unreadable — nothing to grep */ }
      }
    }
  } catch { /* not a git checkout */ }

  const how = sources.join(" + ");
  const scanned = added.filter((l) => SHIPPED.test(l.file));

  // Patterns are assembled from fragments so this file never contains the
  // literal strings it forbids (it would otherwise flag its own diff).
  const TIER = `\\b(dis${"tinction"}|${"me"}rit)\\b`;
  const CREDIT =
    `(tuition ${"cred"}it|${"cred"}ited (towards?|against)|adjusted against the (fee|tuition)|` +
    `${"cred"}it towards? (the )?(tuition|balance|fee))`;
  // A line that NEGATES the retired concept ("no Dis…/Me… tiers", "never tuition
  // credit") is the rule being restated, not the rule being broken — but that
  // excuse is available ONLY to prose. In executable code a hit is a hit: a
  // CHECK constraint listing the tier values sits right after "NOT NULL", and
  // letting that count as a negation would blind the scanner to the single most
  // important thing it looks for.
  const NEGATED = /\b(no|not|never|zero|non|without|forbidden|banned|prohibit\w*|retired|removed|deleted|drops?|superseded|instead of)\b/i;
  const isProse = (file, text) => /\.(md|txt)$/i.test(file) || /^\s*(--|\/\/|\/\*|\*|#|>|\|)/.test(text);
  const violations = (source) =>
    scanned.filter(({ file, text }, i) => {
      // Prose comments wrap, so the negation ("No <tier> / <tier> appears…")
      // often sits on the previous line. Read it as context, not in isolation.
      const prev = i > 0 && scanned[i - 1].file === file ? scanned[i - 1].text : "";
      const excusable = isProse(file, text);
      const re = new RegExp(source, "gi");
      let m;
      while ((m = re.exec(text)) !== null) {
        if (!excusable) return true;
        const before = `${prev} ${text.slice(Math.max(0, m.index - 90), m.index)}`;
        if (!NEGATED.test(before)) return true;
      }
      return false;
    });

  const tierHits = violations(TIER);
  const creditHits = violations(CREDIT);
  const show = (hits) => hits.slice(0, 5).map((h) => `${h.file}: ${h.text.trim().slice(0, 90)}`).join(" | ");

  // A grep over nothing is not evidence of anything.
  prove("Δ6.1",
    "no certificate honours tier survives in what R0 ships — STANDING-1 gives every finisher ONE Completion certificate, so there is no column, CHECK or copy string by which one student's certificate can outrank another's",
    scanned.length > 0 && tierHits.length === 0,
    scanned.length === 0
      ? `nothing to scan (${how || "no diff source"}) — a vacuous grep proves nothing; set ROOM_QA_DIFF_BASE`
      : tierHits.length === 0
        ? `${scanned.length} shipped added lines scanned via ${how}; zero un-negated tier words`
        : `found: ${show(tierHits)}`);
  prove("Δ6.2",
    "the ₹400 is never described as tuition credit in what R0 ships — FEE-1 makes it a non-refundable review fee, and copy implying it is credited back is a refund liability the moment a student quotes it",
    scanned.length > 0 && creditHits.length === 0,
    scanned.length === 0
      ? `nothing to scan (${how || "no diff source"})`
      : creditHits.length === 0
        ? `${scanned.length} shipped added lines scanned; zero un-negated credit phrasings`
        : `found: ${show(creditHits)}`);
}

await loadKeys();

// ── Build the world ─────────────────────────────────────────────────────────
section("PRE — the fixture world", "two batches under offering A, one under B, canaries split per batch");
const password = await resetAuthUsers();
const fixtureSql = readFileSync(resolve(HERE, "cohort-room-fixtures.sql"), "utf8");
let world;
try {
  world = (await sql(fixtureSql))[0];
} catch (e) {
  // The batch is applied as ONE statement, so the server hands back exactly one
  // SQLSTATE. Name what each class actually means instead of guessing at the
  // migrations — a wrong diagnosis here sent the 2026-07-27 review chasing the
  // wrong file for a plain CHECK-constraint violation in this fixture.
  die(
    "Fixtures failed to apply — NOT ONE ASSERTION RAN, so this run proves nothing.\n" +
      `${e.message}\n\n` +
      "Reading the SQLSTATE:\n" +
      "  42P01 / 42883  a table or function is missing → the R0 migrations " +
      "(20260729100000/100100/100200) are not on this project. Apply them first.\n" +
      "  23514          a CHECK constraint rejected a fixture value → this file " +
      "disagrees with the schema (e.g. offerings.type only accepts " +
      "'onetime'|'subscription'). Fix the fixture, not the migrations.\n" +
      "  22P02          a literal was written into a typed column → almost always " +
      "a text id in a uuid column on cohort_applications.\n" +
      "  42501          the SQL channel lacks privilege → check SUPABASE_PAT."
  );
}
await signIn(password);

prove("PRE.1",
  "the fixture world exists: two offerings, three batches, three room configs, five sessions and — the piece whose absence silently voided every session probe before the 2026-07-27 review — an offering_courses row per offering, which is what live_sessions RLS actually resolves through",
  Number(world?.offerings) === 2 && Number(world?.batches) === 3 &&
    Number(world?.configs) === 3 && Number(world?.sessions) === 5 &&
    Number(world?.course_maps) === 2,
  `offerings=${world?.offerings} batches=${world?.batches} configs=${world?.configs} sessions=${world?.sessions} offering_courses=${world?.course_maps}`);

const ids = await sqlOne(`
  SELECT
    (SELECT id FROM public.offerings WHERE slug = 'room-qa-offering-a') AS offering_a,
    (SELECT id FROM public.offerings WHERE slug = 'room-qa-offering-b') AS offering_b,
    (SELECT id FROM public.cohort_batches WHERE name = 'ROOM QA Batch A1') AS batch_a1,
    (SELECT id FROM public.cohort_batches WHERE name = 'ROOM QA Batch A2') AS batch_a2,
    (SELECT id FROM public.cohort_batches WHERE name = 'ROOM QA Batch B1') AS batch_b1,
    (SELECT id FROM public.cohort_room_posts p JOIN public.cohort_batches b ON b.id = p.batch_id
      WHERE b.name = 'ROOM QA Batch A1' LIMIT 1) AS post_a1,
    (SELECT id FROM public.cohort_demo_entries d JOIN public.cohort_batches b ON b.id = d.batch_id
      WHERE b.name = 'ROOM QA Batch A1' LIMIT 1) AS demo_a1,
    (SELECT id FROM public.cohort_demo_entries d JOIN public.cohort_batches b ON b.id = d.batch_id
      WHERE b.name = 'ROOM QA Batch A2' LIMIT 1) AS demo_a2,
    (SELECT id FROM public.live_sessions WHERE title = 'ROOM QA A1 PAST session') AS session_past_a1,
    (SELECT id FROM public.live_sessions WHERE title = 'ROOM QA A1 FAR session') AS session_far_a1,
    (SELECT id FROM public.live_sessions WHERE title = 'ROOM QA A1 NEAR session') AS session_near_a1
`);

// Every room-content surface for offering A, as an outsider would probe it.
//
// live_sessions is deliberately NOT `select=*`: 20260408151600 carries a
// column-level REVOKE SELECT (zoom_link) FROM anon, authenticated, so a star
// projection comes back as a column-privilege error for EVERY actor and the
// probe stops being an RLS row-isolation result at all. The explicit list is
// the shape a real client uses; the column REVOKE itself is attacked separately
// and on purpose in C2.
const SURFACES_A = [
  ["cohort_announcements", `cohort_announcements?offering_id=eq.${ids.offering_a}&select=*`],
  ["cohort_resources", `cohort_resources?offering_id=eq.${ids.offering_a}&select=*`],
  ["cohort_room_posts", `cohort_room_posts?offering_id=eq.${ids.offering_a}&select=*`],
  ["cohort_room_post_replies", `cohort_room_post_replies?post_id=eq.${ids.post_a1}&select=*`],
  ["cohort_demo_entries", `cohort_demo_entries?offering_id=eq.${ids.offering_a}&select=*`],
  ["cohort_weeks", `cohort_weeks?cohort_batch_id=in.(${ids.batch_a1},${ids.batch_a2})&select=*`],
  ["live_sessions", `live_sessions?title=like.ROOM%20QA%20A*&select=id,title,scheduled_at,duration_minutes,status,recording_url,week_id,course_id`],
  ["cohort_room_configs", `cohort_room_configs?offering_id=eq.${ids.offering_a}&select=*`],
];

/**
 * The sentinel each surface MUST hand a legitimate batch-A1 member. A surface
 * with no sentinel here has no positive control, and a surface with no positive
 * control cannot support a "0 rows = the wall held" claim — it may simply be
 * empty or unreachable for reasons nothing to do with access. Every one of the
 * eight is covered.
 */
const POSITIVE_CONTROL = {
  cohort_announcements: CANARY.A1,
  cohort_resources: CANARY.A1,
  cohort_room_posts: CANARY.A1,
  cohort_room_post_replies: CANARY.A1,
  cohort_demo_entries: CANARY.A1,
  cohort_weeks: CANARY.CURRIC_A1,
  live_sessions: CANARY.REC_A1,
  cohort_room_configs: CANARY.CONFIG_A,
};

/**
 * Which wall governs each surface's REVOCATION semantics.
 *
 * R0 owns the six room-content tables plus cohort_room_configs: all of them
 * route through cohort_room_can_access() / the membership row the resolver
 * retracts. cohort_weeks does NOT — it is governed by the pre-existing
 * `cohort_weeks_student_read` (20260526180000:322), which R-2's own header says
 * neither R-1 nor R-2 widens, and which R0 therefore also does not narrow. That
 * asymmetry is measured as GAP-1 rather than asserted away in either direction.
 * live_sessions is likewise pre-existing, but its policies DO carry
 * `status = 'active'`, so revocation closes it and it stays in the owned set.
 */
const R0_OWNED_SURFACES = SURFACES_A.filter(([name]) => name !== "cohort_weeks");
const LEGACY_SURFACES = SURFACES_A.filter(([name]) => name === "cohort_weeks");

// ── Membership preflight. Prove the fixture built the world through the REAL
//    paths — otherwise every case below is theatre. ─────────────────────────
{
  const rows = await sql(`
    SELECT u.email, m.role, m.source, m.status, m.batch_id
      FROM public.cohort_room_members m
      JOIN public.users u ON u.id = m.user_id
     WHERE m.offering_id = ${lit(ids.offering_a)}`);
  const by = (email) => rows.filter((r) => (r.email || "").startsWith(email));

  const a1 = by("room-qa-member-a1")[0];
  prove("PRE.2",
    "member_A1's membership was DERIVED by the resolver from a real enrolment + batch roster row — membership is server-derived, never client-claimed (NFR-SEC-1)",
    a1?.role === "member" && a1?.source === "derived" && a1?.status === "active" && a1?.batch_id === ids.batch_a1,
    a1 ? `role=${a1.role} source=${a1.source} status=${a1.status} batch=${a1.batch_id === ids.batch_a1 ? "A1" : a1.batch_id}` : "no membership row was derived");

  const a2 = by("room-qa-member-a2")[0];
  prove("PRE.3",
    "member_A2 is a derived member of batch A2 of the SAME offering — the two-batch fixture that makes cross-batch isolation testable at all",
    a2?.role === "member" && a2?.batch_id === ids.batch_a2,
    a2 ? `role=${a2.role} batch=${a2.batch_id === ids.batch_a2 ? "A2" : a2.batch_id}` : "no membership row was derived");

  const mentor = by("room-qa-mentor-a")[0];
  prove("PRE.4",
    "mentor_A holds a MANUAL, offering-wide grant (batch_id NULL) that the resolver did not touch — staff access survives re-derivation",
    mentor?.role === "mentor" && mentor?.source === "manual" && mentor?.batch_id === null,
    mentor ? `role=${mentor.role} source=${mentor.source} batch=${mentor.batch_id}` : "no mentor row");

  const pre = by("room-qa-pre-member")[0];
  prove("PRE.5",
    "pre_member_A1 was created by the REAL confirmation_payment_id path (application stamped confirmation_paid), and landed as `pre_member` — NOT widened into `member`",
    pre?.role === "pre_member" && pre?.status === "active",
    pre ? `role=${pre.role} source=${pre.source} batch=${pre.batch_id ?? "NULL (offering-wide lobby)"}`
        : "no pre_member row appeared — R-1's cohort_applications trigger / resolver branch is missing");

  const accepted = by("room-qa-accepted-a");
  prove("PRE.6",
    "accepted_A has NO membership row of any kind — MEMBER-1: `accepted` is a marketing-class veil, not a tier of room access",
    accepted.length === 0,
    accepted.length === 0 ? "0 rows in cohort_room_members" : `unexpected: ${JSON.stringify(accepted)}`);

  const outsider = await sql(
    `SELECT count(*)::int AS n FROM public.cohort_room_members WHERE user_id = ${lit(session.outsider.id)}`);
  prove("PRE.7", "outsider is an authenticated user with zero rooms — the control actor for every read attack",
    outsider[0].n === 0, `${outsider[0].n} membership rows`);
}

// Positive control: the canaries are real, findable data — so a later "0 hits"
// result means the wall held, not that the fixture was empty.
section("PRE — positive controls", "if a member cannot see the canaries, every later 'no leak' result is vacuous");
{
  // PER-SURFACE, never aggregated. An aggregate ("all eight calls returned 200,
  // and the canary turned up at least five times somewhere") is satisfied by a
  // surface that RLS filtered to nothing: PostgREST answers 200 [] for that, and
  // the other surfaces' hits cover the shortfall. Every downstream "0 rows = the
  // wall held" claim on that surface would then be vacuous — which is precisely
  // the failure this section exists to make impossible.
  for (const [name, path] of SURFACES_A) {
    const needle = POSITIVE_CONTROL[name];
    const r = await read("member_A1", path, `${name}(A) as member_A1 [positive control]`);
    const armed = r.ok && r.rows > 0 && r.text.includes(needle);
    prove(`PRE.8.${name}`,
      `member_A1 reads their own ${name} and the row carries ${needle} — this surface is ARMED, so a later "0 rows" from anyone else is the wall holding and not an empty table`,
      armed,
      r.ok
        ? `${r.rows} row(s); sentinel ${needle} ${r.text.includes(needle) ? "present" : "ABSENT — this surface proves nothing downstream"}`
        : r.describe);
  }

  const envelope = await rpc("member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) as member_A1");
  prove("PRE.8.envelope",
    "the sanctioned read RPC also opens for member_A1 and returns a room envelope — the RPC path is armed alongside the table paths, so an R4/R10/L1 raise later is a refusal and not a broken function",
    envelope.ok && !!envelope.json?.config, envelope.describe);

  prove("PRE.9",
    "the offering-wide announcement (batch_id NULL) reaches a batch-A1 member — an all-batches notice is not accidentally batch-filtered out",
    corpusHits("member_A1", "ROOMQA_ALLBATCH_A").length > 0,
    `seen in: ${corpusHits("member_A1", "ROOMQA_ALLBATCH_A").join(", ") || "nowhere"}`);

  // member_B's own room must be armed too, or R1's "member_B sees nothing of A"
  // is indistinguishable from "member_B sees nothing, full stop".
  const bAnn = await read("member_B", `cohort_announcements?offering_id=eq.${ids.offering_b}&select=*`, "announcements(B) as member_B [positive control]");
  const bSessions = await read("member_B",
    `live_sessions?title=like.ROOM%20QA%20B*&select=id,title,scheduled_at,status,recording_url`,
    "sessions(B) as member_B [positive control]");
  prove("PRE.11",
    "member_B can read their OWN offering's noticeboard and their OWN course's sessions — member_B is a fully-provisioned member of a different cohort, which is what makes every zero they get from offering A a boundary result rather than an empty account",
    bAnn.ok && bAnn.rows > 0 && bAnn.text.includes(CANARY.B1) && bSessions.ok && bSessions.rows > 0,
    `announcements(B): ${bAnn.describe}, B1 sentinel ${bAnn.text.includes(CANARY.B1)}; sessions(B): ${bSessions.describe}`);
}

// ── R1 / R2 / R3 — the cross-offering read attacks ──────────────────────────
section("R1 / R2 / R3 — cross-offering reads", "member_B, outsider and anon probe every offering-A surface directly");
for (const [actor, id] of [["member_B", "R1"], ["outsider", "R2"], ["anon", "R3"]]) {
  const results = [];
  for (const [name, path] of SURFACES_A) {
    const r = await read(actor, path, `${name}(A) as ${actor}`);
    results.push([name, r]);
  }
  const leaked = results.filter(([, r]) => !r.blocked);
  prove(`${id}.1`,
    `${actor} reading all ${SURFACES_A.length} room-content surfaces of offering A is stopped at the storage engine — zero rows or denied on every one, so another cohort's noticeboard, library, feed, gallery, curriculum, sessions and room config are simply not there`,
    leaked.length === 0,
    leaked.length === 0
      ? results.map(([n, r]) => `${n}:${r.ok ? "0 rows" : r.status}`).join(" · ")
      : `LEAKED ${leaked.map(([n, r]) => `${n} → ${r.describe}`).join("; ")}`);
}

// The literal shape the brief names: a raw PostgREST filter on offering_id.
{
  const r = await read("outsider", `cohort_announcements?offering_id=eq.${ids.offering_a}&select=id,body`,
    "PostgREST ?offering_id=eq.A as outsider");
  prove("R2.2",
    "the raw PostgREST filter ?offering_id=eq.<A> — the exact request an attacker with the anon key and a login writes by hand — returns nothing to an outsider",
    r.blocked, r.describe);
}

// ── R4 — the RPCs raise, they do not return an empty set ────────────────────
section("R4 — room RPCs for non-members", "an empty set reads as 'no content yet'; a raise reads as 'not yours'");
for (const actor of ["member_B", "outsider"]) {
  for (const fn of ["get_cohort_room", "get_room_roster"]) {
    const r = await rpc(actor, fn, { p_offering: ids.offering_a }, `${fn}(A) as ${actor}`);
    prove(`R4.${actor}.${fn}`,
      `${fn}(A) RAISES for ${actor} instead of handing back an empty envelope a UI could render as "this room is empty" — access is asserted before any read happens`,
      r.raised, r.describe);
  }
}

// ── R7 — private recording positions ───────────────────────────────────────
section("R7 — per-user privacy inside a room", "room-mates are not entitled to each other's private state");
{
  const r = await read("member_A2", `cohort_recording_progress?live_session_id=eq.${ids.session_past_a1}&select=*`,
    "member_A1's recording position, as member_A2");
  prove("R7.1",
    "one member cannot read another member's recording position — 'where you paused' is own-row-only, not room-visible",
    r.blocked, r.describe);
}

// ── R8 / R9 / C3 — cross-batch isolation inside ONE offering ────────────────
section("R8 / R9 / C3 — cross-batch isolation", "batch A1 and batch A2 share an offering and must still not see each other");
{
  const before = mark("member_A2");
  const results = [];
  for (const [name, path] of [
    ["announcements", `cohort_announcements?batch_id=eq.${ids.batch_a1}&select=*`],
    ["resources", `cohort_resources?batch_id=eq.${ids.batch_a1}&select=*`],
    ["posts", `cohort_room_posts?batch_id=eq.${ids.batch_a1}&select=*`],
    ["demo", `cohort_demo_entries?batch_id=eq.${ids.batch_a1}&select=*`],
    ["weeks", `cohort_weeks?cohort_batch_id=eq.${ids.batch_a1}&select=*`],
  ]) {
    results.push([name, await read("member_A2", path, `batch-A1 ${name} as member_A2`)]);
  }
  const leaked = results.filter(([, r]) => !r.blocked);
  prove("R8.1",
    "member_A2 — a paying member of the same offering — gets zero rows from every batch-A1-scoped surface: batch precision is enforced in RLS, not merely in a client query filter",
    leaked.length === 0,
    leaked.length === 0 ? results.map(([n, r]) => `${n}:${r.ok ? "0 rows" : r.status}`).join(" · ")
      : `LEAKED ${leaked.map(([n, r]) => `${n} → ${r.describe}`).join("; ")}`);

  // The schedule is the one batch boundary RLS cannot draw: live_sessions is
  // course-scoped, never batch-scoped, so both batches of offering A can read
  // each other's session ROWS at the table by pre-existing design. R-3's
  // envelope predicate is the only thing that makes the schedule batch-precise,
  // which makes this the assertion that carries the claim — not a table probe.
  const envA2 = await rpc("member_A2", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) as member_A2");
  const a2Sessions = envA2.json?.sessions ?? [];
  const foreignSessions = a2Sessions.filter((s) => (s.title || "").includes("A1"));
  prove("R8.2",
    "member_A2's room envelope lists their own batch's session and not one of batch A1's — because live_sessions itself is course-scoped, the RPC's batch predicate is the ONLY thing standing between two batches of one offering and each other's schedule, so this is where that boundary has to be proven",
    envA2.ok && a2Sessions.length > 0 && foreignSessions.length === 0,
    envA2.ok
      ? `${a2Sessions.length} session(s): ${a2Sessions.map((s) => s.title).join(", ") || "none"}; batch-A1 sessions present: ${foreignSessions.length}`
      : envA2.describe);

  // The room CONFIG is the one intra-offering boundary room_configs_member_read
  // actually draws, and it is drawn in the opposite direction from everything
  // above: batch A1 owns no override, so the row that can leak is A2's. That
  // policy routes through cohort_room_can_access(offering_id, batch_id)
  // (20260729100000:1121-1126), whose batch arm is `m.batch_id = p_batch` — the
  // single predicate standing between a batch-A1 member and batch A2's skin.
  // Regress it to "p_batch IS NULL OR TRUE" and every other assertion in this
  // suite still passes, which is why the override carries its own sentinel and
  // why this probe exists at all.
  const a2ConfigOwn = await read("member_A2", `cohort_room_configs?batch_id=eq.${ids.batch_a2}&select=*`,
    "batch-A2 config override as member_A2 [positive control]");
  const a2ConfigForeign = await read("member_A1", `cohort_room_configs?batch_id=eq.${ids.batch_a2}&select=*`,
    "batch-A2 config override as member_A1");
  prove("R8.3",
    "batch A2's own room config override is readable by a batch-A2 member and returns zero rows to a batch-A1 member of the SAME offering — the override row is the only place cohort_room_can_access's batch arm is load-bearing inside one offering, so this is where a predicate that quietly stopped comparing batches would show up",
    a2ConfigOwn.ok && a2ConfigOwn.rows > 0 && a2ConfigOwn.text.includes(CANARY.CONFIG_A2) &&
      a2ConfigForeign.blocked && !a2ConfigForeign.text.includes(CANARY.CONFIG_A2),
    `as member_A2: ${a2ConfigOwn.describe}, ${CANARY.CONFIG_A2} ${a2ConfigOwn.text.includes(CANARY.CONFIG_A2) ? "present (armed)" : "ABSENT — this probe proves nothing"}; ` +
      `as member_A1: ${a2ConfigForeign.describe}, sentinel present=${a2ConfigForeign.text.includes(CANARY.CONFIG_A2)}`);

  proveCorpusClean("R9.1", "member_A2", [CANARY.A1, CANARY.CURRIC_A1, CANARY.ASSIGN_A1, CANARY.FEEDBACK_A1, CANARY.REC_A1, CANARY.ZOOM_A1, CANARY.ZOOMNEAR_A1],
    "no batch-A1 sentinel appears anywhere in what the server handed member_A2 — cross-batch isolation holds across every response, not just the ones we thought to assert on",
    before);
}

{
  const roster = await rpc("member_A1", "get_room_roster", { p_offering: ids.offering_a }, "get_room_roster(A) as member_A1");
  const rows = Array.isArray(roster.json) ? roster.json : [];
  const seen = new Set(rows.map((r) => r.user_id));

  prove("C3.1",
    "member_A1's roster is BATCH-scoped (ROSTER-SCOPE-1): it contains their own batch and the offering-wide mentor, and it does NOT contain member_A2 — a student cannot enumerate a sibling batch's students",
    roster.ok && seen.has(session.member_A1.id) && seen.has(session.mentor_A.id) && !seen.has(session.member_A2.id),
    roster.ok
      ? `${rows.length} row(s): self=${seen.has(session.member_A1.id)} mentor=${seen.has(session.mentor_A.id)} member_A2=${seen.has(session.member_A2.id)}`
      : roster.describe);

  const envelope = await rpc("member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) roster_count");
  const count = envelope.json?.roster_count;
  // roster_count is the COHORT-MATE count (members + alumni), so it is compared
  // against that subset of the roster, not against the staff-inclusive list.
  const cohortMates = rows.filter((r) => r.role === "member" || r.role === "alumni");
  prove("C3.2",
    "the envelope's roster_count equals the batch-scoped cohort-mate count and nothing more — the headline number on the room screen cannot quietly reveal how many students are in the sibling batch",
    envelope.ok && Number(count) === cohortMates.length,
    `roster_count=${count} vs batch-scoped cohort-mates in roster=${cohortMates.length} (roster also lists ${rows.length - cohortMates.length} offering-wide staff)`);

  // C1 — the exact safe column set.
  const EXPECTED = ["user_id", "full_name", "avatar_url", "occupation", "city", "role"];
  const cols = rows.length ? Object.keys(rows[0]).sort() : [];
  prove("C1.1",
    `get_room_roster returns exactly ${EXPECTED.join(", ")} — the column list is pinned, so a later "just add one more field" cannot quietly widen it`,
    rows.length > 0 && JSON.stringify(cols) === JSON.stringify([...EXPECTED].sort()),
    rows.length ? `columns: ${cols.join(", ")}` : "roster returned no rows to inspect");

  prove("C1.2",
    "mentor_A's phone and email never appear in the roster response even though their row IS returned — the PII canary planted in both columns is absent, so this is a projection guarantee and not an accident of who is in the room",
    rows.some((r) => r.full_name === "ROOM QA Mentor A") && !roster.text.includes(CANARY.PII_A1),
    `mentor row present=${rows.some((r) => r.full_name === "ROOM QA Mentor A")}, PII canary present=${roster.text.includes(CANARY.PII_A1)}`);

  proveCorpusClean("C3.3", "member_A1", [CANARY.A2, CANARY.PII_A2, CANARY.CONFIG_A2],
    "nothing member_A1 has ever been served contains a batch-A2 sentinel, member_A2's PII, or batch A2's own room-config override — the sibling batch's content, its people and its skin are all absent from every byte this member has received");
}

// ── R10 — accepted_A: zero room read grant, and no preview RPC to call ──────
section("R10 — accepted_A holds ZERO room read grant", "MEMBER-1: the confirm-seat veil is offering chrome, never room rows");
{
  const before = mark("accepted_A");
  const results = [];
  for (const [name, path] of SURFACES_A) results.push([name, await read("accepted_A", path, `${name}(A) as accepted_A`)]);
  const leaked = results.filter(([, r]) => !r.blocked);
  prove("R10.1",
    "an accepted-but-unpaid applicant reads every one of the eight room-content surfaces for the offering they were admitted to and gets zero rows or denied on all of them — acceptance grants no room read at all, so the veil cannot be sourced from real room data",
    leaked.length === 0,
    leaked.length === 0 ? results.map(([n, r]) => `${n}:${r.ok ? "0 rows" : r.status}`).join(" · ")
      : `LEAKED ${leaked.map(([n, r]) => `${n} → ${r.describe}`).join("; ")}`);

  for (const fn of ["get_cohort_room", "get_room_roster"]) {
    const r = await rpc("accepted_A", fn, { p_offering: ids.offering_a }, `${fn}(A) as accepted_A`);
    prove(`R10.2.${fn}`, `${fn} raises for accepted_A — being admitted is not membership`, r.raised, r.describe);
  }

  const inCatalog = await sql(
    `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_cohort_room_preview'`);
  prove("R10.3",
    "there is NO get_cohort_room_preview function in the database — MEMBER-1 deleted that path, so no redacted room projection exists for anyone to widen later",
    inCatalog[0].n === 0, `pg_proc matches: ${inCatalog[0].n}`);

  const live = await rpc("accepted_A", "get_cohort_room_preview", { p_offering: ids.offering_a }, "get_cohort_room_preview (must not exist)");
  prove("R10.4",
    "calling get_cohort_room_preview over the wire as accepted_A gets 'no such function' — there is genuinely no preview RPC to call, not merely one that is undocumented",
    live.missing, live.describe);

  proveCorpusClean("R10.5", "accepted_A", ALL_A_SECRETS,
    "not one sentinel from offering A appears in anything the server has served accepted_A", before);
}

// ── R11 — pre_member_A1: the whitelist, and only the whitelist ──────────────
section("R11 — pre_member redaction whitelist", "confirmation_paid buys the lobby: masthead, schedule, presence, announcements");
{
  const before = mark("pre_member_A1");

  // The masthead reaches the lobby through the sanctioned envelope. Whether the
  // config TABLE is also directly readable is R-2's call and the stricter answer
  // is the safer one, so this asserts the whitelist is DELIVERED, not the route.
  const config = await read("pre_member_A1", `cohort_room_configs?offering_id=eq.${ids.offering_a}&select=*`, "config table as pre_member");
  const ann = await read("pre_member_A1", SURFACES_A[0][1], "announcements as pre_member");
  const envelope = await rpc("pre_member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) as pre_member");

  prove("R11.a1",
    "pre_member_A1 CAN open the room envelope and receives the masthead/theme config — the lobby is a real, scoped grant, so every redaction result below is about redaction and not about a locked door",
    envelope.ok && !!envelope.json?.config,
    envelope.ok ? `access=${envelope.json?.access}, config=${envelope.json?.config ? "present" : "absent"}; direct config table read: ${config.describe}`
                : envelope.describe);
  prove("R11.a2",
    "pre_member_A1 CAN read announcements — the welcome channel is the one content table on the MEMBER-1 whitelist",
    ann.ok && Array.isArray(ann.json) && ann.json.length > 0, ann.describe);

  // THE LOBBY SCHEDULE RESOLVES EMPTY IN R0, AND THAT IS THE SECURE ANSWER.
  //
  // A lobby row carries NO batch — PRE.5 prints `batch=NULL (offering-wide
  // lobby)` because the resolver writes it that way (20260729100000:686) — and
  // `cohort_room_is_offering_wide()` is TRUE only for a NULL-batch mentor/host
  // or an admin (same file :460-471), so a pre_member is not offering-wide
  // either. R-3's lobby predicate is `(v_wide OR w.cohort_batch_id = v_batch)`
  // (20260729100200:456-459), which is therefore `false OR (uuid = NULL)` → NULL
  // → zero rows → COALESCE '[]'. R-3 documents this twice on purpose
  // (20260729100200:348-361 and :443-447) and refers the "should the lobby see a
  // schedule at all?" question to the council as a PRODUCT question.
  //
  // So this case asserts the shape R0 SHIPS, and says why that shape is right:
  // an occupant queued for no batch has no batch whose timetable is theirs to
  // read, and the withdrawn `all_batches` widening is precisely what handed a
  // batch-A1 lobby occupant batch A2's private schedule. Asserting a non-empty
  // lobby schedule here would fail this suite against R0's own migrations —
  // asserting a property the phase does not deliver, which is the one thing a
  // sign-off artifact may never do. It is also the shape the brief itself
  // specifies for every batch-less occupant: "member with no batch yet
  // (pre_start) → envelope returns config + empty sessions, no raise"
  // (design/briefs/cohort-r0.md:43). The redaction invariant is asserted as a
  // shape guard so it still bites the day product gives the lobby a batch: no
  // entry may EVER carry a zoom_link or recording_url key, and any entry that
  // does appear must carry a title and a date.
  const lobbySessions = envelope.json?.sessions ?? [];
  const lobbyLeak = lobbySessions.filter((s) => "zoom_link" in s || "recording_url" in s);
  const lobbyDated = lobbySessions.filter((s) => s.title && s.scheduled_at);
  prove("R11.a3",
    "the envelope built for a pre_member is stamped access=pre_member and its schedule resolves EMPTY — a lobby row is queued for no batch, so there is no batch schedule it is entitled to, and the only alternative R-3 considered (span every batch) is the widening that handed a batch-A1 lobby occupant batch A2's timetable; whatever product later decides, no entry the lobby branch can ever emit carries a zoom_link or recording_url key at all, so the redaction is a different payload SHAPE and not a member payload with fields blanked",
    envelope.ok && envelope.json?.access === "pre_member" &&
      Array.isArray(lobbySessions) && lobbySessions.length === 0 &&
      lobbyDated.length === lobbySessions.length && lobbyLeak.length === 0,
    `access=${envelope.json?.access}, sessions=${JSON.stringify(lobbySessions)} (${lobbySessions.length} entr(y/ies), ${lobbyLeak.length} carrying a link key). ` +
      "An empty array here is R-3's documented lobby scope, NOT a broken envelope: R11.a1/a2 prove the same call delivers the masthead and the announcements, so the door is open and only the batch-scoped half is absent.");

  // Each of these four probes has an armed positive control above (PRE.8 proved
  // a real member reads rows carrying REC/CURRIC/MENTORDOC sentinels from the
  // same paths), so a zero here is a denial and not an empty table. The
  // assignments probe is the exception by construction: cohort_week_submissions
  // is own-row-only for everyone, so its zero is proven by ownership, and the
  // FEEDBACK sentinel is swept for in R11.b1 instead.
  const recordings = await read("pre_member_A1", `live_sessions?title=like.ROOM%20QA%20A1*&select=id,title,scheduled_at,recording_url`, "recordings as pre_member");
  const curriculum = await read("pre_member_A1", `cohort_weeks?cohort_batch_id=eq.${ids.batch_a1}&select=*`, "curriculum detail as pre_member");
  const assignments = await read("pre_member_A1", `cohort_week_submissions?select=*`, "assignments as pre_member");
  const mentorDocs = await read("pre_member_A1", `cohort_resources?offering_id=eq.${ids.offering_a}&select=*`, "mentor materials as pre_member");
  const zoomRpc = await rpc("pre_member_A1", "get_live_session_zoom_link",
    { p_session_id: ids.session_near_a1 }, "get_live_session_zoom_link(NEAR) as pre_member");
  const denied = [
    ["recordings", recordings], ["curriculum", curriculum],
    ["assignments", assignments], ["mentor materials", mentorDocs],
  ];

  // The strongest form of the claim: not "these queries returned nothing" but
  // "no redacted body reached this actor by ANY path we exercised".
  proveCorpusClean("R11.b1", "pre_member_A1", PRE_MEMBER_FORBIDDEN,
    "no recording URL, curriculum body, assignment brief, mentor feedback, mentor-materials file or join link — for either the distant session or the imminent one — has reached pre_member_A1 through any surface: the five redacted bodies unlock at `enrolled` and a link never appears in the lobby at all, and none of that depends on the UI choosing not to render them",
    before);

  prove("R11.b2",
    "each redacted surface individually returns zero rows or a denial to pre_member_A1 — every one of them was proven readable to a real member first, so the redaction is enforced per-surface and not by one lucky filter or an empty table",
    denied.every(([, r]) => r.blocked),
    denied.map(([n, r]) => `${n}:${r.ok ? `${r.rows} row(s)` : r.status}`).join(" · "));

  prove("R11.b3",
    "the second server path to a join link — get_live_session_zoom_link, which gates on any active enrolment in an offering mapped to the course rather than on the room — hands a pre_member NULL even for the session that is 30 minutes away: the lobby cannot walk around the envelope's redaction by asking the older RPC directly",
    zoomRpc.raised || zoomRpc.returnedNull,
    `HTTP ${zoomRpc.status}, body ${JSON.stringify(zoomRpc.text.slice(0, 80))} (${zoomRpc.describe})`);
}

// ── MYROOMS — the OTHER client-callable room read RPC ──────────────────────
//
// get_my_cohort_rooms() (20260729100200:228, GRANT EXECUTE … TO authenticated
// at :328-329) is the room LIST: masthead + theme + schedule aggregates +
// an unseen-announcements counter, one row per membership. It takes no
// argument, which is exactly why it needs attacking — it is self-scoped by
// construction, and "self-scoped by construction" is a claim, not a proof,
// until the actors who must receive nothing are made to call it. It also
// carries its own pre_member redaction (next_due_at NULLed at :274-281) and
// its own config-override resolution (:300-312), neither of which any other
// case in this suite exercises.
section("MYROOMS — get_my_cohort_rooms is self-scoped", "the second client-callable room read: no argument to forge, so prove it scopes itself");
{
  const listOf = (r) => (Array.isArray(r.json) ? r.json : []);

  const mine = await rpc("member_A1", "get_my_cohort_rooms", {}, "get_my_cohort_rooms as member_A1");
  const mineRows = listOf(mine);
  const mineA = mineRows.find((r) => r.offering_id === ids.offering_a);
  const mineTheme = JSON.stringify(mineA?.theme ?? null);
  prove("MYROOMS.1",
    "member_A1's room list contains exactly the one room they hold — offering A, batch A1, role member — wearing offering A's own masthead and not batch A2's override: the list is built from the caller's membership rows and cannot be pointed at anybody else's, and it is ARMED (a real theme and a real announcement counter come back), so every zero below is a boundary result",
    mine.ok && mineRows.length === 1 && mineA?.batch_id === ids.batch_a1 && mineA?.role === "member" &&
      mineTheme.includes(CANARY.CONFIG_A) && !mineTheme.includes(CANARY.CONFIG_A2) &&
      Number(mineA?.unseen_announcements) > 0,
    mine.ok
      ? `${mineRows.length} room(s): ${mineRows.map((r) => `${r.offering_title}/${r.batch_name ?? "no batch"} as ${r.role}`).join(", ")}; ` +
        `masthead sentinel ${CANARY.CONFIG_A}=${mineTheme.includes(CANARY.CONFIG_A)} ${CANARY.CONFIG_A2}=${mineTheme.includes(CANARY.CONFIG_A2)}; ` +
        `unseen_announcements=${mineA?.unseen_announcements}`
      : mine.describe);

  const theirs = await rpc("member_A2", "get_my_cohort_rooms", {}, "get_my_cohort_rooms as member_A2");
  const theirsRows = listOf(theirs);
  const theirsA = theirsRows.find((r) => r.offering_id === ids.offering_a);
  const theirsTheme = JSON.stringify(theirsA?.theme ?? null);
  prove("MYROOMS.2",
    "member_A2's row for the SAME offering resolves batch A2's own config override instead of the offering default — the list's override lateral picks the caller's batch and only ever the caller's batch, so the two batches of one offering see two different rooms from the same RPC and neither is served the other's",
    theirs.ok && theirsRows.length === 1 && theirsA?.batch_id === ids.batch_a2 &&
      theirsTheme.includes(CANARY.CONFIG_A2),
    theirs.ok
      ? `${theirsRows.length} room(s); batch=${theirsA?.batch_name}; masthead sentinel ${CANARY.CONFIG_A2}=${theirsTheme.includes(CANARY.CONFIG_A2)}`
      : theirs.describe);

  for (const actor of ["accepted_A", "outsider"]) {
    const r = await rpc(actor, "get_my_cohort_rooms", {}, `get_my_cohort_rooms as ${actor}`);
    const rows = listOf(r);
    prove(`MYROOMS.3.${actor}`,
      `${actor} calling the room-list RPC receives an empty list — it reads cohort_room_members WHERE user_id = auth.uid() AND status = 'active', and ${actor} holds no such row, so a caller with no membership cannot learn that offering A has a room at all: no title, no masthead, no schedule, no announcement count`,
      r.ok && rows.length === 0 && !r.text.includes(CANARY.CONFIG_A),
      r.ok ? `${rows.length} row(s); offering-A masthead sentinel present=${r.text.includes(CANARY.CONFIG_A)}` : r.describe);
  }

  const lobby = await rpc("pre_member_A1", "get_my_cohort_rooms", {}, "get_my_cohort_rooms as pre_member_A1");
  const lobbyRows = listOf(lobby);
  const lobbyRow = lobbyRows[0];
  prove("MYROOMS.4",
    "the lobby occupant's row IS in the list — role pre_member, masthead present, offering-wide announcements counted — with next_due_at NULL and the batch-scoped aggregates (total_weeks, current_week, next_session_at) resolving to nothing: an assignment deadline is a member fact, and a lobby row that is queued for no batch has no batch whose curriculum clock is its own, so the redaction and the scope agree instead of one covering for the other",
    lobby.ok && lobbyRows.length === 1 && lobbyRow?.role === "pre_member" &&
      JSON.stringify(lobbyRow?.theme ?? null).includes(CANARY.CONFIG_A) &&
      lobbyRow?.batch_id === null && lobbyRow?.next_due_at === null &&
      Number(lobbyRow?.total_weeks) === 0 && lobbyRow?.current_week === null &&
      lobbyRow?.next_session_at === null && Number(lobbyRow?.unseen_announcements) > 0,
    lobby.ok
      ? `${lobbyRows.length} row(s); role=${lobbyRow?.role} masthead sentinel ${CANARY.CONFIG_A}=${JSON.stringify(lobbyRow?.theme ?? null).includes(CANARY.CONFIG_A)} ` +
        `batch=${lobbyRow?.batch_id ?? "NULL"} next_due_at=${JSON.stringify(lobbyRow?.next_due_at)} ` +
        `total_weeks=${lobbyRow?.total_weeks} current_week=${JSON.stringify(lobbyRow?.current_week)} next_session_at=${JSON.stringify(lobbyRow?.next_session_at)} ` +
        `unseen_announcements=${lobbyRow?.unseen_announcements}`
      : lobby.describe);

  const anonList = await rpc("anon", "get_my_cohort_rooms", {}, "get_my_cohort_rooms as anon");
  prove("MYROOMS.5",
    "an unauthenticated caller gets no room list at all — the EXECUTE grant stops at `authenticated` and the function raises 42501 on a NULL auth.uid() besides, so the room list is not a surface the anon key reaches; MYROOMS.1 proves the same RPC works for a logged-in member, which makes this a grant boundary rather than a dead function",
    !anonList.ok && !anonList.text.includes(CANARY.CONFIG_A),
    `${anonList.describe}; offering-A masthead sentinel present=${anonList.text.includes(CANARY.CONFIG_A)}`);
}

// ── W6b — the lobby is read-only ───────────────────────────────────────────
section("W6b — pre_member community write", "the lobby can listen; it cannot speak until it is enrolled");
{
  const direct = await write("pre_member_A1", "cohort_room_posts", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1,
    author_id: session.pre_member_A1.id, kind: "post",
    body: "pre_member should not be able to post", channel_key: "general",
  }, "raw post INSERT as pre_member");
  prove("W6b.1",
    "a pre_member's community post is rejected — read-only is enforced at the write path, so an unfinished payment cannot start conversations in a room it has not fully joined",
    direct.rejected, direct.describe);

  const sig = await signature("cohort_room_post_write");
  const args = bind(sig, {
    offering: ids.offering_a, batch: ids.batch_a1,
    channel: "general", body: "pre_member via the write RPC", kind: "post",
  });
  if (!args) {
    prove("W6b.2", "cohort_room_post_write exists so the sanctioned write path can be attacked", false,
      sig ? `could not bind arguments onto (${sig.raw})` : "no cohort_room_post_write function in public — R-3 has not landed");
  } else {
    const viaRpc = await rpc("pre_member_A1", "cohort_room_post_write", args, "cohort_room_post_write as pre_member");
    prove("W6b.2",
      "the same write refused through the SECURITY DEFINER write RPC — the sanctioned path does not become a back door around the lobby's read-only rule",
      viaRpc.raised, viaRpc.describe);
  }
}

// ── W1 / W2 / W5 / W6 / W7 — the classic write attacks ─────────────────────
section("W1 / W2 / W5 / W6 / W7 — write attacks", "authorship, role and container scope are all server-pinned");
{
  const w1 = await write("member_B", "cohort_announcements", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1,
    author_id: session.member_B.id, body: "member_B posting into room A",
  }, "announcement into A as member_B");
  prove("W1.1", "a member of another offering cannot post an announcement into room A — write scope is checked against membership, not against what the client claims",
    w1.rejected, w1.describe);

  const w2 = await write("member_A1", "cohort_announcements", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1,
    author_id: session.member_A1.id, body: "plain member posting an announcement",
  }, "announcement as plain member_A1");
  prove("W2.1", "a plain member of room A cannot post to the noticeboard — the mentor/host role is required, so the official channel cannot be impersonated by a student",
    w2.rejected, w2.describe);

  const w5 = await write("mentor_A", `cohort_demo_entries?id=eq.${ids.demo_a1}`, "PATCH",
    { title: "edited by someone who is not the owner" }, "edit member_A1's demo entry as mentor_A");
  prove("W5.1",
    "even a mentor with full read access to the room cannot edit a student's demo-day entry — ownership, not room access, governs the write",
    w5.rejected || w5.changedNothing, w5.describe);

  const w5b = await write("member_A1", `cohort_demo_entries?id=eq.${ids.demo_a2}`, "PATCH",
    { title: "cross-batch edit" }, "edit member_A2's demo entry as member_A1");
  prove("W5.2", "a batch-A1 member cannot edit a batch-A2 member's showcase entry — cross-batch writes fail the same way cross-batch reads do",
    w5b.rejected || w5b.changedNothing, w5b.describe);

  const w6 = await write("member_A1", "cohort_room_posts", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1,
    author_id: session.member_A2.id, kind: "post", body: "forged authorship", channel_key: "general",
  }, "post with a forged author_id");
  prove("W6.1", "a member cannot publish a post under another member's name — author_id is pinned to auth.uid(), so nothing in this room can be put in someone else's mouth",
    w6.rejected, w6.describe);

  const w7 = await write("member_B", "cohort_room_posts", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1,
    author_id: session.member_B.id, kind: "post", body: "member_B in room A", channel_key: "general",
  }, "feed post into room A as member_B");
  prove("W7.1", "an outsider to the offering cannot inject a post into room A's feed", w7.rejected, w7.describe);
}

// ── W3 / W4 — membership and config are not client-writable ────────────────
section("W3 / W4 — membership and config are server-derived", "inviolable rule #2: a client can never claim its way in");
{
  const w3i = await write("outsider", "cohort_room_members", "POST", {
    user_id: session.outsider.id, offering_id: ids.offering_a, role: "member", source: "derived", status: "active",
  }, "self-INSERT a membership row");
  prove("W3.1",
    "a client cannot INSERT itself into cohort_room_members — the single table every room policy reads is unreachable from the client role, so nobody can self-grant a cohort",
    w3i.rejected, w3i.describe);

  const w3u = await write("member_A1", `cohort_room_members?user_id=eq.${session.member_A1.id}`, "PATCH",
    { role: "mentor", offering_id: ids.offering_b }, "escalate own membership row");
  prove("W3.2",
    "a member cannot UPDATE their own membership row to promote themselves to mentor or move themselves into another offering",
    w3u.rejected || w3u.changedNothing, w3u.describe);

  const w3d = await write("member_A1", `cohort_room_members?user_id=eq.${session.member_A1.id}`, "DELETE", {}, "DELETE own membership row");
  prove("W3.3", "a member cannot DELETE membership rows — revocation history cannot be erased from the client",
    w3d.rejected || w3d.changedNothing, w3d.describe);

  // R-1 deliberately makes this RPC return NULL + a WARNING rather than raise
  // (the nothing-raises rule), so the assertion that matters is not "it errored"
  // but "it wrote no row" — a silent no-op that still granted access would be
  // the worst of both worlds.
  const grant = await rpc("member_A1", "admin_grant_room_member",
    { p_user: session.member_A1.id, p_offering: ids.offering_b, p_role: "mentor" }, "admin_grant_room_member as a student");
  const granted = await sqlOne(
    `SELECT count(*)::int AS n FROM public.cohort_room_members
      WHERE user_id = ${lit(session.member_A1.id)} AND offering_id = ${lit(ids.offering_b)}`);
  prove("W3.4",
    "a student calling the admin grant RPC gets NULL back and NO membership row is written — the one sanctioned way to mint a manual mentor grant is is_admin()-gated, and its refusal is a genuine no-op rather than a swallowed error that granted anyway",
    (grant.raised || grant.json === null) && granted.n === 0,
    `returned ${JSON.stringify(grant.json)}; rows written into offering B for this student: ${granted.n}`);

  // W3.4's evidence is "NULL back, nothing written" — which is byte-identical to
  // the RPC being broken, mis-signatured or REVOKEd. Only the admin half tells
  // those apart, so the SAME call is now made with an admin JWT and must write
  // the row W3.4 proved a student cannot. Without this, W3.4 goes green against
  // a completely non-functional grant path.
  const adminGrant = await rpc("admin", "admin_grant_room_member",
    { p_user: session.member_A1.id, p_offering: ids.offering_b, p_role: "mentor" },
    "admin_grant_room_member as admin");
  const adminRow = await sqlOne(
    `SELECT role, source, status FROM public.cohort_room_members
      WHERE user_id = ${lit(session.member_A1.id)} AND offering_id = ${lit(ids.offering_b)}`);
  prove("W3.5",
    "the identical call, made with an ADMIN JWT, DOES mint the manual mentor row — so W3.4's refusal is is_admin() gating on a working RPC, not a function that refuses everyone equally because it is broken, mis-signatured or REVOKEd",
    adminGrant.ok && typeof adminGrant.json === "string" &&
      adminRow?.role === "mentor" && adminRow?.source === "manual" && adminRow?.status === "active",
    adminGrant.ok
      ? `RPC returned membership id ${adminGrant.json}; row is role=${adminRow?.role} source=${adminRow?.source} status=${adminRow?.status}`
      : adminGrant.describe);

  const adminRevoke = await rpc("admin", "admin_revoke_room_member",
    { p_user: session.member_A1.id, p_offering: ids.offering_b }, "admin_revoke_room_member as admin");
  const revokedRow = await sqlOne(
    `SELECT status FROM public.cohort_room_members
      WHERE user_id = ${lit(session.member_A1.id)} AND offering_id = ${lit(ids.offering_b)}`);
  prove("W3.6",
    "and the admin can withdraw it again — a manual grant is the one membership the truth tables cannot retract on their own, so an appointment made by mistake has a sanctioned off switch instead of needing raw SQL; the withdrawal is a SOFT revoke (status flips to 'revoked', the row survives), which is what keeps the grant-and-withdrawal auditable and is why every downstream read filters on status = 'active' rather than on the row's existence",
    adminRevoke.ok && Number(adminRevoke.json) === 1 && revokedRow?.status === "revoked",
    `RPC returned ${JSON.stringify(adminRevoke.json)} row(s) updated; the row still exists with status=${revokedRow?.status}. ` +
      "Note for a ROOM_QA_KEEP=1 run: this leaves a revoked manual mentor row for member_A1 in offering B that the fixture never created — the suite's own residue, not the fixture's. A normal run's teardown drops offering B and it cascades away.");

  const w4i = await write("member_A1", "cohort_room_configs", "POST", {
    offering_id: ids.offering_b, slug: "room-qa-forged", phase: "live",
    theme: { accent_h: 0, accent_s: 0, accent_l: 0 }, modules: {},
  }, "INSERT a room config");
  prove("W4.1", "a client cannot create a room config — rooms are opened by ops, not by whoever can POST",
    w4i.rejected, w4i.describe);

  const w4u = await write("member_A1", `cohort_room_configs?offering_id=eq.${ids.offering_a}`, "PATCH",
    { phase: "alumni", modules: { commons: true } }, "UPDATE the room config");
  prove("W4.2",
    "a member cannot UPDATE the room config — phase and modules drive lifecycle and UX, and a student flipping them is not a supported state",
    w4u.rejected || w4u.changedNothing, w4u.describe);
}

// ── W8 / W9 — the write RPC's two server-side stamps ────────────────────────
section("W8 / W9 — channel + mentor-answer forgery", "the two controls that cannot be expressed as a table policy");
{
  const postSig = await signature("cohort_room_post_write");
  const replySig = await signature("cohort_room_reply_write");

  const forgedArgs = bind(postSig, {
    offering: ids.offering_a, batch: ids.batch_a1,
    channel: "forged_channel_ROOMQA", body: "forged channel attempt", kind: "post",
  });
  if (!forgedArgs) {
    prove("W8.1", "cohort_room_post_write exists so channel forgery can be attempted", false,
      postSig ? `could not bind arguments onto (${postSig.raw})` : "function not found in public — R-3 has not landed");
    prove("W8.2", "a legitimate channel_key still writes — the control that proves W8.1 is validation and not a broken call", false,
      "skipped: the write RPC could not be called");
  } else {
    const forged = await rpc("member_A1", "cohort_room_post_write", forgedArgs,
      "cohort_room_post_write with a forged channel_key");
    prove("W8.1",
      "a channel_key outside the room's resolved standing + niche set is rejected — because channel_key is free text by design (so niche channels stay a config edit), this server-side validation is the only thing between a niche channel and an arbitrary one",
      forged.raised, forged.describe);

    const okPost = await rpc("member_A1", "cohort_room_post_write",
      bind(postSig, {
        offering: ids.offering_a, batch: ids.batch_a1,
        channel: "general", body: "legitimate post ROOMQA_W8_CONTROL", kind: "post",
      }), "cohort_room_post_write with a valid channel_key");
    prove("W8.2",
      "the same call with a standing channel_key succeeds — so W8.1 above is a rejection by validation, not a call that never landed",
      okPost.ok, okPost.describe);
  }

  const rawPost = await write("member_A1", "cohort_room_posts", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1, author_id: session.member_A1.id,
    kind: "post", body: "raw INSERT bypassing the write RPC", channel_key: "general",
  }, "raw INSERT on cohort_room_posts");
  prove("W9.1",
    "a raw client INSERT on cohort_room_posts is refused — the INSERT grant is revoked, so the channel and mentor-answer validations cannot be skipped by talking to the table directly",
    rawPost.rejected, rawPost.describe);

  const rawReply = await write("member_A1", "cohort_room_post_replies", "POST",
    { post_id: ids.post_a1, author_id: session.member_A1.id, body: "raw reply INSERT", is_mentor_answer: true },
    "raw INSERT on cohort_room_post_replies");
  prove("W9.2",
    "a raw client INSERT on cohort_room_post_replies is refused, including one that tries to set is_mentor_answer directly",
    rawReply.rejected, rawReply.describe);

  const forgedAnswerArgs = bind(replySig, {
    post: ids.post_a1, body: "student pretending to be staff ROOMQA_W9", mentor: true,
  });
  if (!forgedAnswerArgs) {
    prove("W9.3", "cohort_room_reply_write exists so mentor-answer forgery can be attempted", false,
      replySig ? `could not bind arguments onto (${replySig.raw})` : "function not found in public — R-3 has not landed");
    prove("W9.4", "a real mentor's reply is stamped TRUE — the control that proves the stamp is derived, not defaulted", false,
      "skipped: the reply write RPC could not be called");
  } else {
    const forgedAnswer = await rpc("member_A1", "cohort_room_reply_write", forgedAnswerArgs,
      "cohort_room_reply_write with is_mentor_answer=true as a student");
    const row = await sqlOne(
      `SELECT is_mentor_answer FROM public.cohort_room_post_replies
        WHERE body LIKE '%staff ROOMQA_W9' ORDER BY created_at DESC LIMIT 1`);
    prove("W9.3",
      "a student passing is_mentor_answer=true produces a row stamped FALSE — the flag is stamped from the caller's resolved membership role, so a student answer can never wear the authority of a mentor answer",
      forgedAnswer.raised || row?.is_mentor_answer === false,
      forgedAnswer.raised ? `call rejected outright: ${forgedAnswer.describe}` : `stored is_mentor_answer=${row?.is_mentor_answer}`);

    const mentorAnswer = await rpc("mentor_A", "cohort_room_reply_write",
      bind(replySig, { post: ids.post_a1, body: "the real mentor answer ROOMQA_W9_MENTOR", mentor: false }),
      "cohort_room_reply_write as mentor_A");
    const mentorRow = await sqlOne(
      `SELECT is_mentor_answer FROM public.cohort_room_post_replies
        WHERE body LIKE '%ROOMQA_W9_MENTOR%' ORDER BY created_at DESC LIMIT 1`);
    prove("W9.4",
      "a real mentor's reply is stamped TRUE even though the client sent false — the stamp is derived server-side in both directions, so it reflects the room's roster and nothing else",
      mentorAnswer.ok && mentorRow?.is_mentor_answer === true,
      mentorAnswer.ok ? `stored is_mentor_answer=${mentorRow?.is_mentor_answer}` : mentorAnswer.describe);
  }
}

// ── C2 — the T-60 zoom gate ────────────────────────────────────────────────
section("C2 — the zoom-link gate is server-side", "a link the client never received cannot be rendered early");
{
  const before = mark("member_A1");
  const envelope = await rpc("member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) zoom gate");
  const sessions = envelope.json?.sessions ?? [];
  const far = sessions.find((s) => (s.title || "").includes("FAR"));
  const near = sessions.find((s) => (s.title || "").includes("NEAR"));

  prove("C2.1",
    "the session three hours out comes back with zoom_link NULL — the join link is withheld by the server until T-60, so it cannot be scraped from a response and shared ahead of time",
    !!far && (far.zoom_link === null || far.zoom_link === undefined),
    far ? `FAR session zoom_link=${JSON.stringify(far.zoom_link)}` : "FAR session missing from the envelope");

  prove("C2.2",
    "the session thirty minutes out DOES carry its zoom_link — the gate opens on time, so this is a timing control and not a permanently broken field",
    !!near && typeof near.zoom_link === "string" && near.zoom_link.length > 0,
    near ? `NEAR session zoom_link=${near.zoom_link ? "present" : "null"}` : "NEAR session missing from the envelope");

  // Two halves, because "the canary was absent" alone is satisfied by a member
  // who cannot read the table at all. member_A1 provably CAN (PRE.8), so:
  //   (a) the projection a real client uses returns the session and no link;
  //   (b) explicitly ASKING for the column is refused by the column-level
  //       REVOKE, which is what makes (a) a guarantee rather than a habit.
  const directSafe = await read("member_A1",
    `live_sessions?title=eq.ROOM%20QA%20A1%20FAR%20session&select=id,title,scheduled_at,status,recording_url`,
    "FAR session read directly from the table");
  prove("C2.3a",
    "reading live_sessions directly returns the FAR session row to this member and still no join link — the T-60 gate is not merely an RPC nicety that a direct table read walks around",
    directSafe.ok && directSafe.rows > 0 && !directSafe.text.includes(CANARY.ZOOM_A1), directSafe.describe);

  const directZoom = await read("member_A1",
    `live_sessions?title=eq.ROOM%20QA%20A1%20FAR%20session&select=id,zoom_link`,
    "FAR session asking for zoom_link explicitly");
  prove("C2.3b",
    "naming zoom_link in the projection is refused outright by the column-level REVOKE — the link is not a field the client is trusted to omit, it is a column `authenticated` cannot select at any time, for any session",
    !directZoom.ok && !directZoom.text.includes(CANARY.ZOOM_A1), directZoom.describe);

  // The OTHER server path to a join link. It predates the room work and gates on
  // any active enrolment in an offering mapped to the course — not on the room,
  // and not on the batch — so it has to be attacked on its own terms.
  const linkFar = await rpc("member_A1", "get_live_session_zoom_link",
    { p_session_id: ids.session_far_a1 }, "get_live_session_zoom_link(FAR) as member_A1");
  prove("C2.5",
    "get_live_session_zoom_link returns NULL for the session three hours out — the older link RPC enforces the same window as the envelope, so a member cannot collect the link early by calling the path the room screen does not use",
    linkFar.returnedNull && !linkFar.text.includes(CANARY.ZOOM_A1),
    `HTTP ${linkFar.status}, body ${JSON.stringify(linkFar.text.slice(0, 80))}`);

  const linkNear = await rpc("member_A1", "get_live_session_zoom_link",
    { p_session_id: ids.session_near_a1 }, "get_live_session_zoom_link(NEAR) as member_A1");
  prove("C2.6",
    "the same RPC DOES return the link for the session thirty minutes away — so C2.5 is a timing refusal and not a permanently broken function, and an entitled student is not locked out of their own class",
    typeof linkNear.json === "string" && linkNear.json.includes(CANARY.ZOOMNEAR_A1),
    `returned ${typeof linkNear.json === "string" ? "a link" : JSON.stringify(linkNear.json)}`);

  for (const actor of ["member_B", "outsider"]) {
    const r = await rpc(actor, "get_live_session_zoom_link",
      { p_session_id: ids.session_near_a1 }, `get_live_session_zoom_link(NEAR) as ${actor}`);
    prove(`C2.7.${actor}`,
      `${actor} calling get_live_session_zoom_link on offering A's imminent session gets NULL — the link RPC is entitlement-gated as well as time-gated, so knowing a session id is worth nothing without an enrolment behind it`,
      r.returnedNull && !r.text.includes(CANARY.ZOOMNEAR_A1),
      `HTTP ${r.status}, body ${JSON.stringify(r.text.slice(0, 80))}`);
  }

  proveCorpusClean("C2.4", "member_A1", [CANARY.ZOOM_A1],
    "the withheld zoom link appears nowhere in anything served to member_A1 during this run", before);
}

// ── NFR-CONFIG-2 — a feature flag can never be a privilege escalation ──────
section("NFR-CONFIG-2 — flags are UX, never authorization", "inviolable rule #3: RLS is membership-gated regardless of any modules value");
{
  const baseline = {};
  for (const actor of ["outsider", "accepted_A"]) {
    baseline[actor] = [];
    for (const [name, path] of SURFACES_A) {
      const r = await read(actor, path, `${name}(A) as ${actor} [flags OFF]`);
      baseline[actor].push([name, r.ok ? r.rows : `denied ${r.status}`]);
    }
  }

  const allOn = JSON.stringify(Object.fromEntries(MODULE_KEYS.map((k) => [k, true])));
  await sql(
    `UPDATE public.cohort_room_configs SET modules = ${lit(allOn)}::jsonb
      WHERE offering_id = ${lit(ids.offering_a)}`);

  const after = {};
  const mkOutsider = mark("outsider");
  const mkAccepted = mark("accepted_A");
  for (const actor of ["outsider", "accepted_A"]) {
    after[actor] = [];
    for (const [name, path] of SURFACES_A) {
      const r = await read(actor, path, `${name}(A) as ${actor} [flags ON]`);
      after[actor].push([name, r.ok ? r.rows : `denied ${r.status}`]);
    }
  }

  for (const actor of ["outsider", "accepted_A"]) {
    const same = JSON.stringify(baseline[actor]) === JSON.stringify(after[actor]);
    prove(`NFR-CONFIG-2.${actor}`,
      `turning every one of the ${MODULE_KEYS.length} module flags ON for room A changes ${actor}'s row counts on all eight surfaces by exactly nothing — a config edit is UX only and can never become a privilege escalation, which is what makes "just enable the module" a safe operation for ops`,
      same,
      same ? `identical: ${after[actor].map(([n, v]) => `${n}:${v}`).join(" · ")}`
           : `OFF ${JSON.stringify(baseline[actor])} vs ON ${JSON.stringify(after[actor])}`);
  }
  proveCorpusClean("NFR-CONFIG-2.canary-outsider", "outsider", ALL_A_SECRETS,
    "with every module flag ON, an outsider still receives no offering-A sentinel", mkOutsider);
  proveCorpusClean("NFR-CONFIG-2.canary-accepted", "accepted_A", ALL_A_SECRETS,
    "with every module flag ON, accepted_A still receives no offering-A sentinel", mkAccepted);

  // Put the flags back exactly as the fixture seeded them (all-false on the
  // offering default, empty on the batch override) so a ROOM_QA_KEEP run leaves
  // an inspectable world rather than a half-mutated one.
  await sql(`
    UPDATE public.cohort_room_configs
       SET modules = ${lit(JSON.stringify(Object.fromEntries(MODULE_KEYS.map((k) => [k, false]))))}::jsonb
     WHERE offering_id = ${lit(ids.offering_a)} AND batch_id IS NULL;
    UPDATE public.cohort_room_configs
       SET modules = '{}'::jsonb
     WHERE offering_id = ${lit(ids.offering_a)} AND batch_id IS NOT NULL;
    SELECT 1;`);
}

// ── L1 / L2 — revocation and re-grant ──────────────────────────────────────
section("L1 / L2 — lifecycle", "the exact regression the resolver exists to prevent: a refunded student keeps reading");
{
  await sql(
    `UPDATE public.enrolments SET status = 'revoked', revoked_at = now()
      WHERE offering_id = ${lit(ids.offering_a)}
        AND user_id = ${lit(session.member_A1.id)}`);

  const membership = await sqlOne(
    `SELECT status FROM public.cohort_room_members
      WHERE user_id = ${lit(session.member_A1.id)} AND offering_id = ${lit(ids.offering_a)}`);
  prove("L1.1",
    "flipping the enrolment off 'active' retracts the derived membership through the AFTER-trigger path — no nightly job, no manual cleanup, no window where a refunded student is still a member",
    membership?.status === "revoked", `membership status is now ${membership?.status}`);

  const after = mark("member_A1");
  const results = [];
  for (const [name, path] of R0_OWNED_SURFACES) results.push([name, await read("member_A1", path, `${name}(A) as revoked member_A1`)]);
  const stillReadable = results.filter(([, r]) => !r.blocked);
  prove("L1.2",
    `the revoked member's still-valid session token now reads zero rows from all ${R0_OWNED_SURFACES.length} surfaces whose read path R0 owns — including live_sessions, whose own policies do carry status = 'active' — so access dies with the enrolment, not with the JWT, and a refund takes effect immediately rather than at the next login`,
    stillReadable.length === 0,
    stillReadable.length === 0 ? results.map(([n, r]) => `${n}:${r.ok ? "0 rows" : r.status}`).join(" · ")
      : `STILL READABLE ${stillReadable.map(([n, r]) => `${n} → ${r.describe}`).join("; ")}`);

  const envelope = await rpc("member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) as revoked member_A1");
  prove("L1.3", "the room RPC raises for the revoked member exactly as it does for a stranger",
    envelope.raised, envelope.describe);

  const revokedLink = await rpc("member_A1", "get_live_session_zoom_link",
    { p_session_id: ids.session_near_a1 }, "get_live_session_zoom_link(NEAR) as revoked member_A1");
  prove("L1.3b",
    "the revoked member cannot pull the imminent session's join link out of the older link RPC either — a refunded student loses the class they can no longer attend, on every path that hands out a link",
    revokedLink.returnedNull && !revokedLink.text.includes(CANARY.ZOOMNEAR_A1),
    `HTTP ${revokedLink.status}, body ${JSON.stringify(revokedLink.text.slice(0, 80))}`);

  const revokedList = await rpc("member_A1", "get_my_cohort_rooms", {}, "get_my_cohort_rooms as revoked member_A1");
  const revokedRooms = Array.isArray(revokedList.json) ? revokedList.json : [];
  prove("L1.3c",
    "the revoked member's room LIST empties too — get_my_cohort_rooms filters on status = 'active', so the room stops appearing on the shelf at the same instant it stops being readable; a refunded student is not left with a tile whose masthead and announcement count still describe a room they can no longer open",
    revokedList.ok && revokedRooms.length === 0 && !revokedList.text.includes(CANARY.CONFIG_A),
    revokedList.ok
      ? `${revokedRooms.length} room(s); offering-A masthead sentinel present=${revokedList.text.includes(CANARY.CONFIG_A)} (MYROOMS.1 returned 1 room for this same actor before revocation)`
      : revokedList.describe);

  proveCorpusClean("L1.4", "member_A1", ALL_A_SECRETS,
    "across every response the former member received from the surfaces R0 owns, not one offering-A sentinel appears", after);

  // ── GAP-1. Measured, not assumed, and deliberately not swept into L1.4's
  //    window above: cohort_weeks sits OUTSIDE R0's owned set and the residue it
  //    leaves has to be reported as itself rather than blended into a green
  //    lifecycle result or hidden behind a narrower assertion.
  const [legacyName, legacyPath] = LEGACY_SURFACES[0];
  const weeks = await read("member_A1", legacyPath, `${legacyName}(A) as revoked member_A1 [legacy wall]`);
  const weeksText = weeks.text || "";
  const expectedResidue = [CANARY.A1, CANARY.CURRIC_A1, CANARY.ASSIGN_A1];
  // Widening = anything beyond week metadata reaching the ex-member here: another
  // batch's material, a join link, a recording, mentor feedback, mentor docs.
  const beyondBoundary = ALL_A_SECRETS
    .filter((n) => !expectedResidue.includes(n))
    .filter((n) => weeksText.includes(n));
  carryGap("GAP-1", {
    claim:
      "R0's revocation wall stops at cohort_weeks: a revoked member still reads their old batch's week rows, and the residue is exactly week metadata — curriculum body and assignment brief — and nothing beyond it",
    closedClaim:
      "revocation now closes cohort_weeks too — the curriculum body and assignment brief of a batch a refunded student has left are no longer readable by them, so the last surface outside R0's own wall has caught up with it",
    open: weeks.ok && weeks.rows > 0,
    widened: beyondBoundary.length > 0,
    evidence: beyondBoundary.length > 0
      ? `cohort_weeks now also carries ${beyondBoundary.join(", ")} to a revoked member`
      : weeks.ok && weeks.rows > 0
        ? `${weeks.rows} week row(s) still readable, carrying ${expectedResidue.filter((n) => weeksText.includes(n)).join(", ") || "no sentinel"}. ` +
          "cohort_weeks_student_read (20260526180000:322) tests only that a cohort_batch_members row joins to an enrolments row — it never checks e.status — and revocation flips the enrolment without touching the batch roster, so the policy still answers TRUE. R-2's header states plainly that neither R-1 nor R-2 widens cohort_weeks; the same ruling is why R0 does not narrow it either."
        : "cohort_weeks returned nothing to the revoked member",
    closing:
      "add `AND e.status = 'active'` to cohort_weeks_student_read, or have the revocation path retract the cohort_batch_members row. Both are edits to a pre-existing policy outside R0's file set, so they belong to a scoped follow-up with its own council pass, not to this phase.",
  });

  await sql(
    `UPDATE public.enrolments SET status = 'active', revoked_at = NULL
      WHERE offering_id = ${lit(ids.offering_a)}
        AND user_id = ${lit(session.member_A1.id)}`);

  const regrant = await read("member_A1", SURFACES_A[0][1], "announcements(A) after re-grant");
  const regrantEnvelope = await rpc("member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) after re-grant");
  prove("L2.1",
    "re-activating the enrolment restores the room on the very next read — the membership table self-heals from the truth tables, so a mistaken revocation is repaired by fixing the enrolment and nothing else",
    regrant.ok && regrant.rows > 0 && regrantEnvelope.ok,
    `announcements: ${regrant.describe}; envelope: HTTP ${regrantEnvelope.status}`);
}

// ── The full-corpus sweep ──────────────────────────────────────────────────
section("CANARY — the full-corpus sweep", "every byte the server handed each actor, re-read for every sentinel");
{
  for (const actor of ["member_B", "outsider", "anon", "accepted_A"]) {
    proveCorpusClean(`CANARY.${actor}`, actor, ALL_A_SECRETS,
      `across every response ${actor} received in this entire run, not one offering-A sentinel appears — the isolation claim covers surfaces this suite never explicitly asserted on`);
  }
  proveCorpusClean("CANARY.member_A2", "member_A2", [CANARY.A1, CANARY.PII_A1],
    "member_A2 never received a batch-A1 sentinel or mentor PII across the whole run");
  // C3.3 swept member_A1 up to the roster case; this closes the window over the
  // rest of the run — the room-list RPC, the write attacks and the lifecycle
  // reads all land after it.
  proveCorpusClean("CANARY.member_A1", "member_A1", [CANARY.A2, CANARY.PII_A2, CANARY.CONFIG_A2],
    "across the ENTIRE run — every table read, every RPC envelope, every room-list call and every rejected write — member_A1 never received one byte of batch A2's content, people or room skin");
  proveCorpusClean("CANARY.pre_member", "pre_member_A1", PRE_MEMBER_FORBIDDEN,
    "pre_member_A1 never received a redacted body across the whole run");

  const totals = [...corpus.entries()].map(([a, e]) => `${a}:${e.length}`).join(" · ");
  console.log(`${C.d}       corpus swept: ${totals}${C.x}`);
}

// ── Teardown + verdict ─────────────────────────────────────────────────────
if (process.env.ROOM_QA_KEEP === "1") {
  console.log(`\n${C.d}ROOM_QA_KEEP=1 — fixture world left in place on ${REF}.${C.x}`);
} else {
  await teardown();
}

console.log("");
if (carriedGaps.length) {
  // Printed before the verdict, every run, green or not. A carried gap is a
  // measured hole in a wall R0 does not own — it is not a pass, and the
  // design-qa-gate room-access-leak lens is instructed to raise each one as a
  // finding so it reaches the chair rather than dying in this log.
  console.log(`${C.y}${C.b}⚠ ${carriedGaps.length} KNOWN GAP(S) CARRIED — measured, outside R0's own surfaces, NOT fixed${C.x}`);
  for (const g of carriedGaps) {
    console.log(`${C.y}   ${g.id}  ${g.evidence}${C.x}`);
    console.log(`${C.y}       closing it: ${g.closing}${C.x}`);
  }
  console.log("");
}

if (failures.length === 0) {
  console.log(`${C.g}${C.b}✅ ROOM ACCESS WALL HOLDS — ${passed} security properties proven on ${REF}.${C.x}`);
  if (carriedGaps.length) {
    console.log(`${C.y}   …with ${carriedGaps.length} carried gap(s) above. The wall R0 built holds; the gaps are in walls it does not own.${C.x}`);
  }
  process.exit(0);
}
console.log(`${C.r}${C.b}❌ ${failures.length} of ${passed + failures.length} properties FAILED — this is a leak, not a flake.${C.x}`);
for (const f of failures) console.log(`${C.r}   ${f.id}  ${f.claim}\n      ↳ ${f.evidence}${C.x}`);
process.exit(1);
