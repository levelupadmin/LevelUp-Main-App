#!/usr/bin/env node
/**
 * Safe runner for announcement-fanout.sql.
 *
 * Defaults to the local Supabase database. A non-local URL requires an explicit
 * shadow project ref, and the production ref is refused through either input.
 * No credential-bearing URL is ever printed.
 */

import { accessSync, constants } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const PROD_REF = "ivkvluezuiojovpotlyb";
const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function die(message, code = 2) {
  console.error(`announcement-fanout: ${message}`);
  process.exit(code);
}

const ref = process.env.ROOM_QA_PROJECT_REF || process.env.SUPABASE_SHADOW_REF || "";
const configuredUrl = process.env.ROOM_QA_DB_URL || "";
const dbUrl = configuredUrl || LOCAL_DB;

let host = "";
try {
  host = new URL(dbUrl).hostname;
} catch {
  die("ROOM_QA_DB_URL is not a valid PostgreSQL URL.");
}

const isLocal = host === "127.0.0.1" || host === "localhost" || host === "::1";
if (ref === PROD_REF || dbUrl.includes(PROD_REF)) {
  die(`refusing the production project (${PROD_REF}); this harness is shadow-only.`);
}
if (!isLocal && !ref) {
  die("a non-local ROOM_QA_DB_URL requires ROOM_QA_PROJECT_REF (or SUPABASE_SHADOW_REF) so the production guard can verify the target.");
}

function executable(path) {
  if (!path) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const candidates = [
  process.env.ROOM_QA_PSQL,
  "/opt/homebrew/opt/libpq/bin/psql",
  "/usr/local/bin/psql",
  "/usr/bin/psql",
];
try {
  candidates.push(execFileSync("/usr/bin/which", ["psql"], { encoding: "utf8" }).trim());
} catch {
  // The fixed candidates above still cover the project machine.
}

const psql = candidates.find(executable);
if (!psql) {
  die("psql was not found. Set ROOM_QA_PSQL or install libpq (expected on this Mac at /opt/homebrew/opt/libpq/bin/psql).");
}

const child = spawnSync(
  psql,
  [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", "qa-harness/announcement-fanout.sql"],
  { stdio: "inherit" },
);

if (child.error) die(`could not start psql: ${child.error.message}`);
process.exit(child.status ?? 2);
