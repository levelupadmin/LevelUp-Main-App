#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEBHOOK = readFileSync(
  join(ROOT, "supabase/functions/tally-application-webhook/index.ts"),
  "utf8",
);
const POLLER = readFileSync(
  join(ROOT, "supabase/functions/tally-application-poll/index.ts"),
  "utf8",
);

const checks = [];
function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

check(
  "webhook selects identity_spine_enabled and all three deterministic ordering keys",
  WEBHOOK.includes("identity_spine_enabled") &&
    /\.order\("intake_opens_at"[\s\S]{0,120}\.order\("created_at"[\s\S]{0,120}\.order\("id"/.test(
      WEBHOOK,
    ),
);
check(
  "webhook routes with signed response creation time rather than delivery time",
  /const signedResponseCreatedAt = signedResponseTimestamp\(payload\)/.test(WEBHOOK) &&
    /const value = \(data as \{ createdAt\?: unknown \}\)\.createdAt/.test(WEBHOOK) &&
    !/signedResponseTimestamp[\s\S]{0,500}\(payload as \{ createdAt/.test(WEBHOOK),
);
check(
  "webhook requires offering opt-in plus the hardening probe",
  /webhookProvisioningConfigured\([\s\S]{0,100}offering\.identity_spine_enabled/.test(WEBHOOK) &&
    /offeringOptedIn\s*&&\s*await webhookIntakeGateInstalled\(supabase\)/.test(WEBHOOK),
);
check(
  "webhook disabled path passes the normalized-email legacy user to the no-create resolver",
  /\.eq\("email", email\)[\s\S]{0,100}\.is\("deleted_at", null\)/.test(WEBHOOK) &&
    /resolveWebhookIdentity\([\s\S]{0,120}existingUser\?\.id \?\? null/.test(WEBHOOK),
);
check(
  "poller requires global switch plus offering opt-in plus the hardening probe",
  /pollerProvisioningConfigured\([\s\S]{0,100}PROVISION_APPLICANTS,[\s\S]{0,100}offering\.identity_spine_enabled/.test(POLLER) &&
    /provisioningConfigured\s*&&\s*\(await intakeGateInstalled\(admin\)\)/.test(POLLER),
);
check(
  "poller disabled path restores normalized-email legacy linking",
  /lookupLegacyUserIds\(admin, fresh\.map\(\(row\) => row\.email\)\)/.test(POLLER) &&
    /resolvePolledIdentity\([\s\S]{0,160}legacyUserIds\.get\(normalizePolledApplicantEmail\(row\.email\)\)/.test(POLLER),
);

for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}`);
}

if (checks.some((item) => !item.ok)) {
  console.error("identity intake wiring checks failed");
  process.exit(1);
}

const deno = spawnSync(
  process.env.DENO_BIN || "deno",
  ["test", "--allow-env", "qa-harness/identity-intake-controls.test.ts"],
  {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, DENO_NO_UPDATE_CHECK: "1", NO_COLOR: "1" },
  },
);
process.stdout.write(deno.stdout || "");
process.stderr.write(deno.stderr || "");
if (deno.status !== 0) process.exit(deno.status ?? 1);

console.log("identity intake controls OK");
