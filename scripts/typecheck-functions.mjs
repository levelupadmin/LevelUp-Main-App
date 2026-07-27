// Type gate for the Supabase edge functions (CLAUDE.md Tier-1 checklist, step 0).
//
// `deno check` every supabase/functions/*/index.ts — ONE FUNCTION AT A TIME, so a
// single failure cannot mask the rest — and compare the result against the explicit
// KNOWN_FAILING baseline below.
//
// The gate is honest in BOTH directions:
//   * a function that fails and is NOT baselined  → NEW FAILURE  → exit 1
//   * a function that passes but IS baselined     → STALE BASELINE → exit 1
// so the baseline cannot silently rot. It is always printed, whatever the outcome.
//
// Usage:
//   node scripts/typecheck-functions.mjs          (npm run typecheck:functions)
//   DENO_BIN=/path/to/deno node scripts/typecheck-functions.mjs
//
// Requires: a `deno` on PATH; falls back to `npx -y deno@latest`. Node 18+.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FUNCTIONS_DIR = join(ROOT, "supabase", "functions");
const CONCURRENCY = 4;

// Pre-existing failures, unrelated to any current work. All four are LIVE and
// WORKING in production — do NOT "fix" them by editing the live functions; retire
// an entry only when the underlying cause is genuinely resolved.
const KNOWN_FAILING = {
  "auth-email-hook": "npm: specifiers unresolved in this node_modules — environment, not code",
  "generate-invoice-pdf": "npm: specifiers unresolved in this node_modules — environment, not code",
  "guest-create-order": "pre-existing TS2339 (property access on an untyped row)",
  "verify-msg91-otp": "pre-existing TS2345 (argument type mismatch)",
};

/** `deno` from PATH when present, else the pinned-latest npx shim used by CI. */
function resolveDeno() {
  if (process.env.DENO_BIN) return { cmd: process.env.DENO_BIN, pre: [] };
  const probe = spawnSync("deno", ["--version"], { stdio: "ignore" });
  if (probe.status === 0) return { cmd: "deno", pre: [] };
  return { cmd: "npx", pre: ["-y", "deno@latest"] };
}

const DENO = resolveDeno();

function listFunctions() {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .filter((name) => existsSync(join(FUNCTIONS_DIR, name, "index.ts")))
    .sort();
}

function check(name) {
  const entry = join("supabase", "functions", name, "index.ts");
  return new Promise((done) => {
    const child = spawn(DENO.cmd, [...DENO.pre, "check", entry], {
      cwd: ROOT,
      env: { ...process.env, DENO_NO_UPDATE_CHECK: "1", NO_COLOR: "1" },
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));
    child.on("error", (err) => done({ name, ok: false, out: String(err.message ?? err) }));
    child.on("close", (code) => done({ name, ok: code === 0, out: out.trim() }));
  });
}

async function runAll(names) {
  const results = new Map();
  let next = 0;
  const worker = async () => {
    while (next < names.length) {
      const name = names[next++];
      const r = await check(name);
      results.set(name, r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, names.length) }, worker));
  return names.map((n) => results.get(n));
}

const names = listFunctions();
if (names.length === 0) {
  console.error(`No supabase/functions/*/index.ts found under ${FUNCTIONS_DIR}`);
  process.exit(1);
}

console.log(`typecheck:functions — deno check, one function at a time (${names.length} total)\n`);

const results = await runAll(names);

const newFailures = [];
const staleBaseline = [];
for (const r of results) {
  const baselined = Object.prototype.hasOwnProperty.call(KNOWN_FAILING, r.name);
  let tag = "";
  if (!r.ok && baselined) tag = "  [known-failing]";
  if (!r.ok && !baselined) {
    tag = "  <-- NEW FAILURE";
    newFailures.push(r);
  }
  if (r.ok && baselined) {
    tag = "  <-- now passes, remove from KNOWN_FAILING";
    staleBaseline.push(r);
  }
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${tag}`);
}

// The baseline is ALWAYS printed — a gate you cannot see is a gate you forget.
console.log(`\nKNOWN_FAILING baseline (${Object.keys(KNOWN_FAILING).length} pre-existing, all live in prod):`);
for (const [name, reason] of Object.entries(KNOWN_FAILING)) {
  console.log(`  - ${name}: ${reason}`);
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} pass · ${newFailures.length} new failure(s) · ${staleBaseline.length} stale baseline entr(y/ies)`);

for (const r of newFailures) {
  console.log(`\n--- NEW FAILURE: ${r.name} ---\n${r.out}`);
}
for (const r of staleBaseline) {
  console.log(`\n--- STALE BASELINE: ${r.name} now type-checks clean. Delete its KNOWN_FAILING entry. ---`);
}

if (newFailures.length > 0 || staleBaseline.length > 0) {
  console.log("\ntypecheck:functions FAILED");
  process.exit(1);
}
console.log("\ntypecheck:functions OK");
