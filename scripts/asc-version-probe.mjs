#!/usr/bin/env node
/**
 * Read-only probe of the App Store version + review-submission state, reusing the
 * same ES256 JWT auth as asc-api.mjs. Prints the editable version, its review
 * state, the attached build, and any open review submission. No writes.
 *
 *   set -a && . ./.env.ios.local && set +a && node scripts/asc-version-probe.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const KEY_PATH = process.env.ASC_KEY_PATH;
const APP_ID = process.env.ASC_APP_ID || "6778137800";
if (!KEY_ID || !ISSUER_ID || !KEY_PATH) {
  console.error("Missing ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH");
  process.exit(2);
}

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = crypto.createPrivateKey(fs.readFileSync(KEY_PATH));
  const sig = crypto.sign("SHA256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}
async function api(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json" },
  });
  const t = await res.text();
  let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  return { status: res.status, j };
}

const vRes = await api(
  `/v1/apps/${APP_ID}/appStoreVersions?limit=5&include=build&fields[appStoreVersions]=versionString,appStoreState,platform,createdDate,build&fields[builds]=version,uploadedDate`
);
if (vRes.status !== 200) {
  console.error(`appStoreVersions HTTP ${vRes.status}: ${JSON.stringify(vRes.j).slice(0, 500)}`);
  process.exit(1);
}
const builds = Object.fromEntries((vRes.j.included || []).filter((x) => x.type === "builds").map((b) => [b.id, b.attributes?.version]));
console.log("=== App Store versions ===");
for (const v of vRes.j.data || []) {
  const a = v.attributes || {};
  const bId = v.relationships?.build?.data?.id;
  console.log(`v${a.versionString} [${a.platform}] state=${a.appStoreState} build=${bId ? builds[bId] || bId : "(none attached)"} created=${a.createdDate}`);
}

const rs = await api(`/v1/apps/${APP_ID}/reviewSubmissions?filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES&include=items&limit=5`);
console.log("\n=== Open review submissions ===");
if (rs.status !== 200) console.log(`(query HTTP ${rs.status}: ${JSON.stringify(rs.j).slice(0, 300)})`);
else if (!(rs.j.data || []).length) console.log("(none open)");
else for (const s of rs.j.data) console.log(`submission ${s.id} state=${s.attributes?.state} items=${(s.relationships?.items?.data || []).length}`);
