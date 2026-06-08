#!/usr/bin/env node
/**
 * Minimal App Store Connect API client — pure Node stdlib (ES256 JWT + fetch),
 * no deps. iOS counterpart to scripts/play-publish.mjs.
 *
 * Auth via env:
 *   ASC_KEY_ID      e.g. 73S9MAX725
 *   ASC_ISSUER_ID   e.g. 945f1837-a6db-4daf-943f-035c9bcbf6c0
 *   ASC_KEY_PATH    path to the AuthKey_*.p8 (kept in the iCloud LevelUp Core vault)
 *
 * Usage:
 *   node scripts/asc-api.mjs list-apps
 *   node scripts/asc-api.mjs find-app <bundleId>
 *   node scripts/asc-api.mjs list-devices
 *   node scripts/asc-api.mjs register-device "<name>" <udid>
 */
import crypto from "node:crypto";
import fs from "node:fs";

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const KEY_PATH = process.env.ASC_KEY_PATH;
if (!KEY_ID || !ISSUER_ID || !KEY_PATH) {
  console.error("Missing ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH env vars");
  process.exit(2);
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

function makeJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = crypto.createPrivateKey(fs.readFileSync(KEY_PATH));
  const sig = crypto.sign("SHA256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}

async function api(path, opts = {}) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${makeJWT()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json };
}

const die = (msg, res) => {
  console.error(msg);
  if (res) console.error(`HTTP ${res.status}: ${JSON.stringify(res.json, null, 2)}`);
  process.exit(1);
};

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "list-apps") {
  const res = await api("/v1/apps?limit=200");
  if (res.status !== 200) die("list-apps failed", res);
  const apps = res.json.data || [];
  console.log(`Apps (${apps.length}):`);
  for (const a of apps) console.log(`  ${a.attributes.bundleId}  —  ${a.attributes.name}  (id ${a.id})`);
} else if (cmd === "find-app") {
  const bundleId = args[0];
  if (!bundleId) die("usage: find-app <bundleId>");
  const res = await api(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
  if (res.status !== 200) die("find-app failed", res);
  const apps = res.json.data || [];
  if (!apps.length) { console.log(`NOT_FOUND: no App Store Connect record for ${bundleId}`); process.exit(3); }
  for (const a of apps) console.log(`FOUND: ${a.attributes.bundleId} — ${a.attributes.name} (id ${a.id})`);
} else if (cmd === "list-devices") {
  const res = await api("/v1/devices?limit=200");
  if (res.status !== 200) die("list-devices failed", res);
  const ds = res.json.data || [];
  console.log(`Devices (${ds.length}):`);
  for (const d of ds) console.log(`  ${d.attributes.name}  ${d.attributes.udid}  ${d.attributes.deviceClass}  ${d.attributes.status}`);
} else if (cmd === "register-device") {
  const [name, udid] = args;
  if (!name || !udid) die('usage: register-device "<name>" <udid>');
  const res = await api("/v1/devices", {
    method: "POST",
    body: JSON.stringify({ data: { type: "devices", attributes: { name, platform: "IOS", udid } } }),
  });
  if (res.status === 201) {
    console.log(`Registered device "${name}" (${udid})`);
  } else if (res.status === 409 || JSON.stringify(res.json).includes("already exist")) {
    console.log(`Device already registered (${udid}) — OK`);
  } else {
    die("register-device failed", res);
  }
} else if (cmd === "users") {
  const res = await api("/v1/users?limit=200");
  if (res.status !== 200) die("users failed", res);
  const us = res.json.data || [];
  console.log(`Users (${us.length}):`);
  for (const u of us) {
    const a = u.attributes;
    console.log(`  ${a.username}  —  ${a.firstName || ""} ${a.lastName || ""}  roles=[${(a.roles || []).join(", ")}]`);
  }
} else if (cmd === "builds") {
  const appId = args[0];
  if (!appId) die("usage: builds <appId>");
  const res = await api(`/v1/builds?filter[app]=${appId}&limit=10&sort=-uploadedDate`);
  if (res.status !== 200) die("builds failed", res);
  const bs = res.json.data || [];
  console.log(`Builds (${bs.length}):`);
  for (const b of bs) {
    const a = b.attributes;
    console.log(`  v${a.version}  state=${a.processingState}  uploaded=${a.uploadedDate}  expired=${a.expired}`);
  }
} else {
  console.error("Unknown command. Use: list-apps | find-app <bundleId> | list-devices | register-device \"<name>\" <udid> | builds <appId>");
  process.exit(2);
}
