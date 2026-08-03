#!/usr/bin/env node
/* global console, process, URL */

/**
 * One fail-fast release gate for the integrated cohort release candidate.
 *
 * The default path is entirely local. Set RELEASE_GATE_REMOTE=1 to append the
 * one permitted production operation:
 * `supabase db push --linked --dry-run --include-all`, after verifying that the
 * checkout is linked to the exact production ref. Nothing in this script
 * applies a production migration or deploys anything.
 *
 * The local room-access harness needs production-like default grants to exist
 * before migrations create the room tables. A normal `supabase db reset` cannot
 * provide that ordering, so the gate first validates a full reset/lint, then
 * rebuilds the disposable local schema in the documented order: empty schema
 * -> shadow grants -> migration push -> shadow grants -> SQL suites -> attack.
 */

import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_REF = "ivkvluezuiojovpotlyb";
const IDENTITY_MARKER_SUBJECT = "fix(identity): gate intake provisioning per offering";
const EXPECTED_PRODUCTION_MIGRATIONS = [
  "20260727120000",
  "20260727130000",
  "20260728100000",
  "20260728110000",
  "20260728120000",
  "20260728130000",
  "20260729100000",
  "20260729100100",
  "20260729100200",
  "20260730100000",
  "20260730100100",
  "20260730100200",
  "20260730110000",
  "20260801120000",
  "20260803120000",
  "20260803130000",
  "20260803140000",
  "20260803150000",
  "20260803160000",
  "20260803170000",
  "20260803173000",
  "20260803190000",
  "20260803200000",
  "20260803201000",
];
const SUPABASE = ["npx", ["-y", "supabase@latest"]];
const REMOTE = process.env.RELEASE_GATE_REMOTE || "0";
const startedAt = Date.now();
let stepNumber = 0;

class GateFailure extends Error {}

function usage() {
  console.log(`Usage: npm run release:gate

Runs the complete local release gate. The command starts the local Supabase
stack when necessary and rebuilds its database, so local data is disposable.

Optional read-only production migration check:
  RELEASE_GATE_REMOTE=1 npm run release:gate

The remote lane requires this checkout to already be linked to ${PROD_REF} and
runs only \`supabase db push --linked --dry-run --include-all\`.`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}
if (process.argv.length > 2) {
  throw new GateFailure(`Unknown argument(s): ${process.argv.slice(2).join(" ")}`);
}
if (REMOTE !== "0" && REMOTE !== "1") {
  throw new GateFailure("RELEASE_GATE_REMOTE must be exactly 0 or 1.");
}

function elapsed(start) {
  const seconds = (Date.now() - start) / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

function begin(label) {
  stepNumber += 1;
  console.log(`\n[release gate ${stepNumber}] ${label}`);
  return Date.now();
}

function complete(label, start) {
  console.log(`PASS  ${label} (${elapsed(start)})`);
}

function run(label, command, args, options = {}) {
  const start = begin(label);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: options.env || process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw new GateFailure(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const exit = result.signal ? `signal ${result.signal}` : `exit ${result.status ?? "unknown"}`;
    throw new GateFailure(`${label} failed (${exit}).`);
  }

  complete(label, start);
}

function redactAssignments(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !/^[A-Z_][A-Z0-9_]*=/.test(line.trim()))
    .join("\n")
    .trim();
}

function capture(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    env: options.env || process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function supabaseArgs(args) {
  return [...SUPABASE[1], ...args];
}

function decodeEnvValue(raw, name) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new GateFailure(`supabase status returned invalid quoted syntax for ${name}.`);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("'\\''", "'");
  }
  return value;
}

function parseSupabaseEnv(output) {
  const parsed = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, name, raw] = match;
    const value = decodeEnvValue(raw, name);
    if (Object.hasOwn(parsed, name) && parsed[name] !== value) {
      throw new GateFailure(`supabase status returned conflicting values for ${name}.`);
    }
    parsed[name] = value;
  }

  for (const name of ["ANON_KEY", "API_URL", "DB_URL", "SERVICE_ROLE_KEY"]) {
    if (!parsed[name]) {
      throw new GateFailure(`supabase status -o env did not return ${name}.`);
    }
  }
  return parsed;
}

function localUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new GateFailure(`${label} from supabase status is not a valid URL.`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(host)) {
    throw new GateFailure(`${label} must be loopback; refusing host ${JSON.stringify(host)}.`);
  }
}

function localSupabaseEnvironment() {
  const label = "resolve the disposable local Supabase environment";
  const start = begin(label);
  let status = capture(SUPABASE[0], supabaseArgs(["status", "-o", "env"]));

  if (status.status !== 0) {
    console.log("Local Supabase is not running; starting it without printing development keys.");
    const launch = capture(SUPABASE[0], supabaseArgs(["start", "-o", "env"]));
    if (launch.error) {
      throw new GateFailure(`local Supabase could not start: ${launch.error.message}`);
    }
    if (launch.status !== 0) {
      const detail = redactAssignments(launch.stderr) || "Supabase CLI returned no diagnostic.";
      throw new GateFailure(`local Supabase could not start (exit ${launch.status ?? "unknown"}): ${detail}`);
    }
    status = capture(SUPABASE[0], supabaseArgs(["status", "-o", "env"]));
  }

  if (status.error) {
    throw new GateFailure(`supabase status could not start: ${status.error.message}`);
  }
  if (status.status !== 0) {
    const detail = redactAssignments(status.stderr) || "Supabase CLI returned no diagnostic.";
    throw new GateFailure(`supabase status failed (exit ${status.status ?? "unknown"}): ${detail}`);
  }

  const env = parseSupabaseEnv(status.stdout);
  localUrl(env.API_URL, "API_URL");
  localUrl(env.DB_URL, "DB_URL");
  complete(label, start);
  return env;
}

function executable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableCandidate(value) {
  if (!value) return null;
  if (isAbsolute(value) || value.includes("/")) {
    const candidate = isAbsolute(value) ? value : resolve(ROOT, value);
    return executable(candidate) ? candidate : null;
  }
  for (const dir of (process.env.PATH || "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, value);
    if (executable(candidate)) return candidate;
  }
  return null;
}

function resolvePsql() {
  const requested =
    process.env.RELEASE_GATE_PSQL || process.env.ROOM_QA_PSQL || process.env.PSQL_BIN;
  if (requested) {
    const found = executableCandidate(requested);
    if (!found) {
      throw new GateFailure(`Configured psql is not executable: ${JSON.stringify(requested)}.`);
    }
    return found;
  }

  const candidates = [
    "psql",
    "/opt/homebrew/opt/libpq/bin/psql",
    "/usr/local/opt/libpq/bin/psql",
    "/Applications/Postgres.app/Contents/Versions/latest/bin/psql",
    "/usr/local/bin/psql",
    "/usr/bin/psql",
  ];
  for (const candidate of candidates) {
    const found = executableCandidate(candidate);
    if (found) return found;
  }
  throw new GateFailure(
    "psql was not found. Install libpq or set RELEASE_GATE_PSQL to its executable path.",
  );
}

function psqlFile(label, psql, dbUrl, file, variables = []) {
  const args = [
    "-X",
    "--no-psqlrc",
    "-v",
    "ON_ERROR_STOP=1",
    ...variables.flatMap(([name, value]) => ["-v", `${name}=${value}`]),
    "-d",
    dbUrl,
    "-f",
    file,
  ];
  run(label, psql, args);
}

function verifyProductionLink() {
  const refPath = join(ROOT, "supabase", ".temp", "project-ref");
  if (!existsSync(refPath)) {
    throw new GateFailure(
      `RELEASE_GATE_REMOTE=1 requires an existing Supabase link to ${PROD_REF}; ${refPath} is missing.`,
    );
  }
  const linkedRef = readFileSync(refPath, "utf8").trim();
  if (linkedRef !== PROD_REF) {
    throw new GateFailure(
      `RELEASE_GATE_REMOTE=1 refuses linked project ${JSON.stringify(linkedRef)}; expected ${PROD_REF}.`,
    );
  }
  if (!process.env.SUPABASE_ACCESS_TOKEN && !process.env.SUPABASE_PAT) {
    throw new GateFailure(
      "RELEASE_GATE_REMOTE=1 needs SUPABASE_ACCESS_TOKEN (or SUPABASE_PAT as its fallback).",
    );
  }
}

function identityStaticBase() {
  const history = capture("git", ["log", "--first-parent", "--format=%H%x09%s", "HEAD"]);
  if (history.error) {
    throw new GateFailure(`identity marker lookup could not start: ${history.error.message}`);
  }
  if (history.status !== 0) {
    throw new GateFailure("identity marker lookup failed.");
  }

  let markerCommit = "";
  for (const line of history.stdout.split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    if (line.slice(tab + 1) === IDENTITY_MARKER_SUBJECT) {
      markerCommit = line.slice(0, tab);
      break;
    }
  }
  if (!markerCommit) {
    throw new GateFailure(
      `first-parent history does not contain the identity release marker ${JSON.stringify(IDENTITY_MARKER_SUBJECT)}.`,
    );
  }

  const parent = capture("git", [
    "rev-parse",
    "--verify",
    "--quiet",
    `${markerCommit}^1^{commit}`,
  ]);
  if (parent.error || parent.status !== 0 || !parent.stdout.trim()) {
    throw new GateFailure(`identity release marker ${markerCommit} has no resolvable first parent.`);
  }

  return process.env.IDENTITY_SPINE_BASE_REF?.trim() || parent.stdout.trim();
}

function migrationVersions(output) {
  return [...new Set(String(output || "").match(/\b20\d{12}\b/g) || [])].sort();
}

function productionMigrationDryRun(env) {
  const label = `linked production migration dry-run (${PROD_REF}; read-only)`;
  const start = begin(label);
  const result = capture(
    SUPABASE[0],
    supabaseArgs(["db", "push", "--linked", "--dry-run", "--include-all", "--yes"]),
    { env },
  );
  const versions = migrationVersions(`${result.stdout || ""}\n${result.stderr || ""}`);

  console.log(`Dry-run migration versions (${versions.length}):`);
  for (const version of versions) console.log(`  ${version}`);

  if (result.error) {
    throw new GateFailure(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const exit = result.signal ? `signal ${result.signal}` : `exit ${result.status ?? "unknown"}`;
    throw new GateFailure(`${label} failed (${exit}); raw CLI output was suppressed.`);
  }

  const expected = [...EXPECTED_PRODUCTION_MIGRATIONS].sort();
  const missing = expected.filter((version) => !versions.includes(version));
  const extra = versions.filter((version) => !expected.includes(version));
  if (missing.length || extra.length) {
    throw new GateFailure(
      `${label} did not match the 24-version release plan; missing=[${missing.join(", ")}] extra=[${extra.join(", ")}].`,
    );
  }

  complete(label, start);
}

try {
  if (REMOTE === "1") verifyProductionLink();
  const identityBase = identityStaticBase();

  run("committed release whitespace check", "git", ["diff", "--check", "origin/main...HEAD"]);
  run("git unstaged whitespace check", "git", ["diff", "--check"]);
  run("git staged whitespace check", "git", ["diff", "--cached", "--check"]);
  run("targeted release-script lint", "npx", ["eslint", "scripts/release-gate.mjs"]);
  run("Vitest suite", "npm", ["test"]);
  run("integrated TypeScript check", "npx", ["tsc", "--noEmit"]);
  run("Supabase edge-function exact-baseline typecheck", "npm", ["run", "typecheck:functions"]);
  run("identity intake static controls", "node", ["qa-harness/identity-intake-controls.spec.mjs"]);
  run(
    `identity-spine static suite (base ${identityBase.slice(0, 12)})`,
    "node",
    ["qa-harness/identity-spine.spec.mjs", "--static-only"],
    { env: { ...process.env, IDENTITY_SPINE_BASE_REF: identityBase } },
  );
  run("production Vite build", "npm", ["run", "build"]);

  const local = localSupabaseEnvironment();
  const psql = resolvePsql();
  console.log(`Using psql at ${psql}`);
  const localQaEnv = {
    ...process.env,
    ROOM_QA_ANON_KEY: local.ANON_KEY,
    ROOM_QA_BASE_URL: local.API_URL,
    ROOM_QA_DB_URL: local.DB_URL,
    ROOM_QA_DIFF_BASE: process.env.ROOM_QA_DIFF_BASE || "origin/main",
    ROOM_QA_KEEP: "0",
    ROOM_QA_LOCAL: "1",
    ROOM_QA_PROJECT_REF: "local",
    ROOM_QA_PSQL: psql,
    ROOM_QA_SERVICE_KEY: local.SERVICE_ROLE_KEY,
  };

  run("full local Supabase migration reset", SUPABASE[0], supabaseArgs(["db", "reset", "--local"]));
  run(
    "local Supabase schema lint",
    SUPABASE[0],
    supabaseArgs(["db", "lint", "--local", "--level", "warning", "--fail-on", "error"]),
  );
  run(
    "empty local schema for grant-parity room attack",
    psql,
    [
      "-X",
      "--no-psqlrc",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      local.DB_URL,
      "-c",
      "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
      "-c",
      "DELETE FROM supabase_migrations.schema_migrations;",
    ],
  );
  psqlFile(
    "arm local production-like grants before migrations",
    psql,
    local.DB_URL,
    "qa-harness/shadow-grants.sql",
    [["ROOM_QA_SHADOW", "1"]],
  );
  run(
    "reapply every migration onto the grant-armed local schema",
    SUPABASE[0],
    supabaseArgs(["db", "push", "--db-url", local.DB_URL, "--yes"]),
  );
  psqlFile(
    "complete local production-like grants after migrations",
    psql,
    local.DB_URL,
    "qa-harness/shadow-grants.sql",
    [["ROOM_QA_SHADOW", "1"]],
  );
  psqlFile("release runtime-control SQL", psql, local.DB_URL, "qa-harness/runtime-controls.sql");
  run("announcement fan-out SQL suite", "npm", ["run", "test:announcement-fanout"], { env: localQaEnv });
  run("room feed/resources SQL suite", "npm", ["run", "test:room-feed-resources"], { env: localQaEnv });
  run("room third-act SQL suite", "npm", ["run", "test:room-third-act"], { env: localQaEnv });
  run("room legacy-access SQL suite", "npm", ["run", "test:room-legacy-access"], { env: localQaEnv });
  run("local adversarial room-access harness", "npm", ["run", "test:room-access"], {
    env: localQaEnv,
  });

  if (REMOTE === "1") {
    const remoteEnv = {
      ...process.env,
      SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT,
    };
    productionMigrationDryRun(remoteEnv);
  }

  console.log(
    `\nRELEASE GATE PASSED in ${elapsed(startedAt)} (${stepNumber} steps; remote dry-run ${REMOTE === "1" ? "included" : "not requested"}).`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nRELEASE GATE FAILED after ${stepNumber} step(s): ${message}`);
  process.exit(1);
}
