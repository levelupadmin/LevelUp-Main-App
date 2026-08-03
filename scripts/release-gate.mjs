#!/usr/bin/env node
/* global AbortSignal, console, fetch, process, URL */

/**
 * One fail-fast release gate for the integrated cohort release candidate.
 *
 * The default path is entirely local. Set RELEASE_GATE_REMOTE=1 to append the
 * permitted production reads:
 * `supabase db push --linked --dry-run --include-all` and, after cutover,
 * `supabase migration list --linked`, after verifying that the checkout is
 * linked to the exact production ref. Nothing in this script applies a
 * production migration or deploys anything.
 *
 * Database QA uses a throwaway Supabase workdir and stack. Its empty local
 * database is reset before any repo migration is visible, production-like
 * default grants are armed, the full repo migration tree is applied exactly
 * once, and the grants are completed afterward. That ordering is what makes the
 * room RLS attack non-vacuous without replaying migrations over populated
 * Storage/Auth state.
 */

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DISPOSABLE_PREFIX = join(tmpdir(), "levelup-release-gate-");
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
let disposableWorkdir = null;
let functionServer = null;
let functionServerLogPath = null;

class GateFailure extends Error {}

function usage() {
  console.log(`Usage: npm run release:gate

Runs the complete release gate. Database checks stop the repo's disposable
local Supabase stack, delete its local volumes, and use a fresh temporary stack.

Optional read-only production migration check:
  RELEASE_GATE_REMOTE=1 npm run release:gate

The remote lane requires this checkout to already be linked to ${PROD_REF}. It
runs \`supabase db push --linked --dry-run --include-all\`; when that correctly
returns zero after cutover, it also reads \`supabase migration list --linked\`
to prove all 24 release versions are already applied.`);
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

function functionServerLogExcerpt() {
  let raw = "";
  if (functionServerLogPath && existsSync(functionServerLogPath)) {
    raw += readFileSync(functionServerLogPath, "utf8");
  }
  if (disposableWorkdir) {
    const container = `supabase_edge_runtime_${basename(disposableWorkdir)}`;
    const dockerLogs = capture("docker", ["logs", "--tail", "200", container]);
    if (!dockerLogs.error && dockerLogs.status === 0) {
      raw += `\n${dockerLogs.stdout || ""}\n${dockerLogs.stderr || ""}`;
    }
  }
  if (!raw.trim()) return "";
  raw = raw.slice(-16_000);
  return redactAssignments(raw)
    .replace(/\b[a-f0-9]{48,}\b/gi, "<redacted-hex>")
    .replace(/\beyJ[A-Za-z0-9_-]{16,}(?:\.[A-Za-z0-9_-]{16,}){1,2}\b/g, "<redacted-jwt>")
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

function localSupabaseEnvironment(workdir) {
  const label = "resolve the bare disposable Supabase environment";
  const start = begin(label);
  const status = capture(
    SUPABASE[0],
    supabaseArgs(["status", "--workdir", workdir, "-o", "env"]),
  );

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

function runCapturedSupabase(label, args) {
  const start = begin(label);
  const result = capture(SUPABASE[0], supabaseArgs(args));
  if (result.error) {
    throw new GateFailure(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = redactAssignments(result.stderr) || "Supabase CLI returned no diagnostic.";
    throw new GateFailure(`${label} failed (exit ${result.status ?? "unknown"}): ${detail}`);
  }
  complete(label, start);
}

function prepareIdentityFunctions(workdir) {
  const source = join(ROOT, "supabase", "functions");
  const destination = join(workdir, "supabase", "functions");
  mkdirSync(destination, { recursive: true });
  for (const name of [
    "_shared",
    "claim-application",
    "tally-application-webhook",
    "verify-email-otp",
  ]) {
    cpSync(join(source, name), join(destination, name), { recursive: true });
  }

  const tallySecret = randomBytes(32).toString("hex");
  const otpPepper = randomBytes(32).toString("hex");
  const envFile = join(workdir, "identity-functions.env");
  writeFileSync(
    envFile,
    `TALLY_SIGNING_SECRET=${tallySecret}\nEMAIL_OTP_PEPPER=${otpPepper}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return { envFile, otpPepper, tallySecret };
}

function createBareLocalStack() {
  run(
    "stop and discard the repo's current local Supabase stack",
    SUPABASE[0],
    supabaseArgs(["stop", "--workdir", ROOT, "--no-backup"]),
  );

  const workdir = mkdtempSync(DISPOSABLE_PREFIX);
  disposableWorkdir = workdir;
  run(
    "initialize a bare temporary Supabase workdir",
    SUPABASE[0],
    supabaseArgs(["init", "--workdir", workdir, "--yes"]),
  );
  const identity = prepareIdentityFunctions(workdir);

  runCapturedSupabase("start the bare temporary Supabase stack", [
    "start",
    "--workdir",
    workdir,
    "-o",
    "env",
  ]);
  run(
    "full bare local Supabase reset (no repo migrations present)",
    SUPABASE[0],
    supabaseArgs(["db", "reset", "--workdir", workdir, "--local", "--no-seed"]),
  );

  return { ...identity, ...localSupabaseEnvironment(workdir), workdir };
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

async function startIdentityFunctionServer(local) {
  const label = "serve the three identity functions on the disposable stack";
  const start = begin(label);
  let launchError = null;
  functionServerLogPath = join(local.workdir, "identity-functions.log");
  const logFd = openSync(functionServerLogPath, "w", 0o600);
  try {
    functionServer = spawn(
      SUPABASE[0],
      supabaseArgs([
        "functions",
        "serve",
        "verify-email-otp",
        "--workdir",
        local.workdir,
        "--no-verify-jwt",
        "--env-file",
        local.envFile,
      ]),
      {
        cwd: ROOT,
        detached: true,
        env: process.env,
        stdio: ["ignore", logFd, logFd],
      },
    );
  } finally {
    closeSync(logFd);
  }
  functionServer.on("error", (error) => {
    launchError = error;
  });

  const deadline = Date.now() + 120_000;
  const readyMarker = "Serving functions on ";
  const expectedRoutes = ["claim-application", "tally-application-webhook", "verify-email-otp"];
  const assertRunning = () => {
    if (launchError) {
      throw new GateFailure(`${label} could not start: ${launchError.message}`);
    }
    if (functionServer.exitCode !== null || functionServer.signalCode !== null) {
      const result = functionServer.signalCode
        ? `signal ${functionServer.signalCode}`
        : `exit ${functionServer.exitCode}`;
      throw new GateFailure(
        `${label} exited before it became ready (${result}); logs were suppressed.`,
      );
    }
  };

  while (Date.now() < deadline) {
    assertRunning();
    const log = readFileSync(functionServerLogPath, "utf8");
    if (log.includes(readyMarker) && expectedRoutes.every((route) => log.includes(`/functions/v1/${route}`))) {
      break;
    }
    await delay(100);
  }
  const announcedLog = readFileSync(functionServerLogPath, "utf8");
  if (
    !announcedLog.includes(readyMarker) ||
    !expectedRoutes.every((route) => announcedLog.includes(`/functions/v1/${route}`))
  ) {
    throw new GateFailure(`${label} did not announce all three routes within 120 seconds.`);
  }

  const probes = [
    {
      body: {},
      error: "missing_application_id",
      name: "claim-application",
      status: 400,
    },
    {
      body: {},
      error: "Invalid signature",
      name: "tally-application-webhook",
      status: 401,
    },
    {
      body: {},
      error: "invalid_email",
      name: "verify-email-otp",
      status: 400,
    },
  ];
  const headers = {
    apikey: local.ANON_KEY,
    Authorization: `Bearer ${local.ANON_KEY}`,
    "Content-Type": "application/json",
  };

  for (const probe of probes) {
    let lastProbe = "no response";
    let ready = false;
    while (Date.now() < deadline) {
      assertRunning();
      try {
        const logOffset = readFileSync(functionServerLogPath, "utf8").length;
        const response = await fetch(`${local.API_URL}/functions/v1/${probe.name}`, {
          body: JSON.stringify(probe.body),
          headers,
          method: "POST",
          signal: AbortSignal.timeout(5_000),
        });
        const bodyText = await response.text();
        let body = null;
        try {
          body = JSON.parse(bodyText);
        } catch {
          // A gateway or compiler response is not a handler-level readiness proof.
        }
        lastProbe = `HTTP ${response.status}: ${bodyText.slice(0, 300)}`;

        const requestMarker = `serving the request with supabase/functions/${probe.name}`;
        const markerDeadline = Math.min(deadline, Date.now() + 5_000);
        let handledByThisLaunch = false;
        while (Date.now() < markerDeadline) {
          assertRunning();
          const appendedLog = readFileSync(functionServerLogPath, "utf8").slice(logOffset);
          if (appendedLog.includes(requestMarker)) {
            handledByThisLaunch = true;
            break;
          }
          await delay(50);
        }

        if (
          handledByThisLaunch &&
          response.status === probe.status &&
          body?.error === probe.error
        ) {
          ready = true;
          break;
        }
      } catch (error) {
        lastProbe = error instanceof Error ? error.message : String(error);
      }
      await delay(500);
    }
    if (!ready) {
      throw new GateFailure(`${label} did not warm ${probe.name} within 120 seconds; last probe was ${lastProbe}.`);
    }
    assertRunning();
  }

  assertRunning();
  complete(label, start);
}

function stopIdentityFunctionServer() {
  if (!functionServer) return;
  if (functionServer.exitCode === null && functionServer.pid) {
    try {
      process.kill(-functionServer.pid, "SIGTERM");
    } catch {
      functionServer.kill("SIGTERM");
    }
  }
  functionServer = null;
}

function safeDisposableWorkdir(workdir) {
  return Boolean(workdir) && resolve(workdir).startsWith(resolve(DISPOSABLE_PREFIX));
}

function removeDisposableWorkdir(workdir) {
  if (!safeDisposableWorkdir(workdir)) {
    throw new GateFailure(`refusing to remove unexpected temporary path ${JSON.stringify(workdir)}.`);
  }
  rmSync(workdir, { force: true, recursive: true });
}

function disposeBareLocalStack() {
  stopIdentityFunctionServer();
  if (!disposableWorkdir) return;
  const workdir = disposableWorkdir;
  run(
    "stop and discard the temporary Supabase stack",
    SUPABASE[0],
    supabaseArgs(["stop", "--workdir", workdir, "--no-backup"]),
  );
  removeDisposableWorkdir(workdir);
  disposableWorkdir = null;
}

function cleanupBareLocalStackAfterFailure() {
  stopIdentityFunctionServer();
  if (!disposableWorkdir || !safeDisposableWorkdir(disposableWorkdir)) return;
  const workdir = disposableWorkdir;
  capture(
    SUPABASE[0],
    supabaseArgs(["stop", "--workdir", workdir, "--no-backup"]),
  );
  try {
    removeDisposableWorkdir(workdir);
  } catch {
    // Keep the original gate failure as the actionable error.
  }
  disposableWorkdir = null;
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

  return parent.stdout.trim();
}

function migrationVersions(output) {
  const versions = [];
  const plainOutput = String(output || "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  const filename = /(?:^|[\s/•])((?:20)\d{12})_[A-Za-z0-9._-]+\.sql(?=$|\s)/g;
  for (const match of plainOutput.matchAll(filename)) {
    versions.push(match[1]);
  }
  return versions;
}

function migrationHistory(output) {
  const plainOutput = String(output || "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  for (const line of plainOutput.split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.includes('"migrations"')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed?.migrations)) return parsed.migrations;
    } catch {
      // Keep looking: CLI status lines may contain braces without being JSON.
    }
  }
  throw new GateFailure("linked production migration history did not contain a migrations payload.");
}

function verifyAppliedProductionMigrations(env, label) {
  const result = capture(
    SUPABASE[0],
    supabaseArgs(["migration", "list", "--linked"]),
    { env: { ...env, NO_COLOR: "1" } },
  );
  if (result.error) {
    throw new GateFailure(`${label} history check could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const exit = result.signal ? `signal ${result.signal}` : `exit ${result.status ?? "unknown"}`;
    throw new GateFailure(`${label} history check failed (${exit}); raw CLI output was suppressed.`);
  }

  const rows = migrationHistory(`${result.stdout || ""}\n${result.stderr || ""}`);
  const expected = EXPECTED_PRODUCTION_MIGRATIONS;
  const expectedSet = new Set(expected);
  const releaseRows = rows.filter((row) => expectedSet.has(String(row?.remote || "")));
  const applied = releaseRows.map((row) => String(row.remote));
  const duplicates = applied.filter((version, index) => applied.indexOf(version) !== index);
  const localMismatches = releaseRows
    .filter((row) => String(row?.local || "") !== String(row?.remote || ""))
    .map((row) => `${row?.local || "missing"}->${row?.remote || "missing"}`);

  if (
    JSON.stringify(applied) !== JSON.stringify(expected) ||
    duplicates.length > 0 ||
    localMismatches.length > 0
  ) {
    const missing = expected.filter((version) => !applied.includes(version));
    throw new GateFailure(
      `${label} returned zero pending migrations but production history did not prove the ordered release plan; missing=[${missing.join(", ")}] duplicates=[${duplicates.join(", ")}] localMismatches=[${localMismatches.join(", ")}].`,
    );
  }

  console.log(`Post-cutover production history versions (${applied.length}):`);
  for (const version of applied) console.log(`  ${version}`);
}

function productionMigrationDryRun(env) {
  const label = `linked production migration dry-run (${PROD_REF}; read-only)`;
  const start = begin(label);
  const result = capture(
    SUPABASE[0],
    supabaseArgs(["db", "push", "--linked", "--dry-run", "--include-all", "--yes"]),
    { env: { ...env, NO_COLOR: "1" } },
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

  const expected = EXPECTED_PRODUCTION_MIGRATIONS;
  if (versions.length === 0) {
    verifyAppliedProductionMigrations(env, label);
  } else if (JSON.stringify(versions) !== JSON.stringify(expected)) {
    const missing = expected.filter((version) => !versions.includes(version));
    const extra = versions.filter((version) => !expected.includes(version));
    const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index);
    throw new GateFailure(
      `${label} did not match the ordered 24-version release plan; missing=[${missing.join(", ")}] extra=[${extra.join(", ")}] duplicates=[${duplicates.join(", ")}].`,
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
  run("application TypeScript check", "npx", [
    "tsc",
    "--noEmit",
    "-p",
    "tsconfig.app.json",
    "--incremental",
    "false",
  ]);
  run("Supabase edge-function exact-baseline typecheck", "npm", ["run", "typecheck:functions"]);
  run("identity intake static controls", "node", ["qa-harness/identity-intake-controls.spec.mjs"]);
  run(
    `phase-scoped identity static contract in integrated-release mode — not live sign-off (base ${identityBase.slice(0, 12)})`,
    "node",
    ["qa-harness/identity-spine.spec.mjs", "--static-only"],
    {
      env: {
        ...process.env,
        IDENTITY_SPINE_BASE_REF: identityBase,
        IDENTITY_SPINE_INTEGRATED_RELEASE: "yes",
      },
    },
  );
  run("production Vite build", "npm", ["run", "build"]);

  const psql = resolvePsql();
  console.log(`Using psql at ${psql}`);
  const local = createBareLocalStack();
  psqlFile(
    "arm production-like grants before any repo migration exists",
    psql,
    local.DB_URL,
    "qa-harness/shadow-grants.sql",
    [["ROOM_QA_SHADOW", "1"]],
  );
  run(
    "apply the full repo migration tree exactly once",
    SUPABASE[0],
    supabaseArgs(["db", "push", "--db-url", local.DB_URL, "--include-all", "--yes"]),
  );
  psqlFile(
    "complete production-like grants after repo migrations",
    psql,
    local.DB_URL,
    "qa-harness/shadow-grants.sql",
    [["ROOM_QA_SHADOW", "1"]],
  );
  run(
    "temporary Supabase schema lint",
    SUPABASE[0],
    supabaseArgs([
      "db",
      "lint",
      "--db-url",
      local.DB_URL,
      "--level",
      "warning",
      "--fail-on",
      "error",
    ]),
  );

  const localQaEnv = {
    ...process.env,
    ROOM_QA_ANON_KEY: local.ANON_KEY,
    ROOM_QA_BASE_URL: local.API_URL,
    ROOM_QA_DB_URL: local.DB_URL,
    ROOM_QA_DIFF_BASE: "origin/main",
    ROOM_QA_KEEP: "0",
    ROOM_QA_LOCAL: "1",
    ROOM_QA_PROJECT_REF: "local",
    ROOM_QA_PSQL: psql,
    ROOM_QA_SERVICE_KEY: local.SERVICE_ROLE_KEY,
  };

  psqlFile("release runtime-control SQL", psql, local.DB_URL, "qa-harness/runtime-controls.sql");
  psqlFile(
    "Calendly application-binding SQL suite",
    psql,
    local.DB_URL,
    "qa-harness/calendly-application-binding.sql",
  );
  run("announcement fan-out SQL suite", "npm", ["run", "test:announcement-fanout"], { env: localQaEnv });
  run("room feed/resources SQL suite", "npm", ["run", "test:room-feed-resources"], { env: localQaEnv });
  run("room third-act SQL suite", "npm", ["run", "test:room-third-act"], { env: localQaEnv });
  run("room legacy-access SQL suite", "npm", ["run", "test:room-legacy-access"], { env: localQaEnv });
  run("local adversarial room-access harness", "npm", ["run", "test:room-access"], {
    env: localQaEnv,
  });

  await startIdentityFunctionServer(local);
  run(
    "identity-spine integrated-release disposable-stack live acceptance suite",
    "node",
    ["qa-harness/identity-spine.spec.mjs", "--require-live"],
    {
      env: {
        ...process.env,
        IDENTITY_SPINE_BASE_REF: identityBase,
        IDENTITY_SPINE_INTEGRATED_RELEASE: "yes",
        IDENTITY_SPINE_SHADOW_CONFIRM: "yes",
        PATH: `${dirname(psql)}${delimiter}${process.env.PATH || ""}`,
        SHADOW_ANON_KEY: local.ANON_KEY,
        SHADOW_DB_URL: local.DB_URL,
        SHADOW_EMAIL_OTP_PEPPER: local.otpPepper,
        SHADOW_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
        SHADOW_SUPABASE_URL: local.API_URL,
        SHADOW_TALLY_SIGNING_SECRET: local.tallySecret,
      },
    },
  );

  disposeBareLocalStack();

  if (REMOTE === "1") {
    const remoteEnv = {
      ...process.env,
      SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT,
    };
    productionMigrationDryRun(remoteEnv);
  }

  console.log(
    `\nRELEASE GATE PASSED in ${elapsed(startedAt)} (${stepNumber} steps; identity phase-static + disposable-stack live; remote dry-run ${REMOTE === "1" ? "included" : "not requested"}).`,
  );
} catch (error) {
  const functionLogs = functionServerLogExcerpt();
  cleanupBareLocalStackAfterFailure();
  const message = error instanceof Error ? error.message : String(error);
  if (functionLogs) {
    console.error(`\nIdentity function server log tail (secrets redacted):\n${functionLogs}`);
  }
  console.error(`\nRELEASE GATE FAILED after ${stepNumber} step(s): ${message}`);
  process.exitCode = 1;
}
