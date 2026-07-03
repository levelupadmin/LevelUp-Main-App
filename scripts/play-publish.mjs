#!/usr/bin/env node
// play-publish.mjs — upload a signed AAB to Google Play via the Android
// Publisher API. Pure Node stdlib (crypto + fetch); no npm deps, no fastlane,
// no Docker. Reusable for every future release.
//
// Auth: a Google Cloud service-account JSON key (the "fastlane-supply" SA),
// which must be linked in Play Console → Users & permissions with at least
// "Release to production" on this app. The key never leaves disk and is
// never printed.
//
// Usage:
//   PLAY_SERVICE_ACCOUNT_JSON="/path/to/sa.json" \
//   node scripts/play-publish.mjs <aab> [package] [track] [--probe]
//
//   --probe   create + immediately discard an edit to verify auth + app
//             access. Publishes NOTHING. Always run this first on a new key.
//
//   --rollout <fraction>   (0 < fraction < 1) set the track release to
//             status "inProgress" with userFraction <fraction> instead of
//             status "completed" (full rollout). Applies to both the normal
//             AAB-upload path and --promote. Omit (or use fraction=1) for
//             the default 100% completed rollout.
//
//   --promote <versionCode>   skip the AAB upload entirely and set the
//             target track (--track) to an already-uploaded versionCode.
//             No <aab> file argument is required in this mode. Release notes
//             from PLAY_RELEASE_NOTES are applied if set.
//
// Env / args:
//   PLAY_SERVICE_ACCOUNT_JSON  path to the SA key (or pass --sa <path>)
//   PLAY_RELEASE_NOTES         en-US release notes (optional)
//   package  default com.tagmango.leveluplearning
//   track    default production   (use 'internal' to test the pipeline safely)

import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i !== -1 ? argv[i + 1] : undefined;
};
const probe = has("--probe");
const showStatus = has("--status");
// --notes-only --version <code>: update an existing release's notes on the track
// WITHOUT uploading a new bundle (e.g. to fix release-note formatting).
const notesOnly = has("--notes-only");
// --promote <versionCode>: skip AAB upload; assign an already-uploaded versionCode.
const promoteVersion = val("--promote");
// --rollout <fraction>: staged rollout (0 < fraction < 1) → status "inProgress".
// Absent or fraction >= 1 → status "completed" (full rollout, default behavior).
const rolloutRaw = val("--rollout");
const rolloutFraction = rolloutRaw !== undefined ? parseFloat(rolloutRaw) : undefined;
if (rolloutFraction !== undefined && (isNaN(rolloutFraction) || rolloutFraction <= 0 || rolloutFraction >= 1)) {
  console.error("--rollout must be a number between 0 (exclusive) and 1 (exclusive), e.g. --rollout 0.1");
  process.exit(2);
}
const saPath = val("--sa") || process.env.PLAY_SERVICE_ACCOUNT_JSON;
const pkg = val("--package") || "com.tagmango.leveluplearning";
const track = val("--track") || "production";
// The only positional is the AAB path; skip any value consumed by a flag.
const flagValueIdxs = new Set(
  ["--sa", "--package", "--track", "--version", "--promote", "--rollout"].map((f) => argv.indexOf(f)).filter((i) => i >= 0).map((i) => i + 1),
);
const aabPath = argv.find((a, i) => !a.startsWith("--") && !flagValueIdxs.has(i));

if (!saPath || (!aabPath && !probe && !showStatus && !notesOnly && !promoteVersion)) {
  console.error(
    "Usage: PLAY_SERVICE_ACCOUNT_JSON=<sa.json> node scripts/play-publish.mjs <aab> [--package P] [--track T] [--rollout <fraction>] [--probe|--status|--notes-only --version <code>|--promote <versionCode>]",
  );
  process.exit(2);
}

const sa = JSON.parse(readFileSync(saPath, "utf8"));
if (sa.type !== "service_account" || !sa.private_key || !sa.client_email) {
  console.error("Key at --sa is not a valid Google service-account JSON.");
  process.exit(2);
}

const b64url = (b) => Buffer.from(b).toString("base64url");

// Build a tracks.update release object, honouring --rollout if set.
// versionCode must be a string.  releaseNotes is the raw PLAY_RELEASE_NOTES env value.
function buildRelease(versionCode, notes) {
  const release = {
    versionCodes: [String(versionCode)],
    status: rolloutFraction !== undefined ? "inProgress" : "completed",
  };
  if (rolloutFraction !== undefined) release.userFraction = rolloutFraction;
  if (notes) release.releaseNotes = [{ language: "en-US", text: notes }];
  return release;
}
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3";

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const input = `${header}.${claim}`;
  const sig = crypto.createSign("RSA-SHA256").update(input).sign(sa.private_key);
  const jwt = `${input}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error("token exchange failed: " + JSON.stringify(j));
  return j.access_token;
}

async function api(token, method, path, body, isUpload = false) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (isUpload) {
    headers["Content-Type"] = "application/octet-stream";
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch((isUpload ? UPLOAD : API) + path, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const e = new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
    e.status = res.status;
    throw e;
  }
  return json;
}

(async () => {
  const token = await getToken();
  console.log(`Authenticated as ${sa.client_email} (project ${sa.project_id})`);

  const edit = await api(token, "POST", `/applications/${pkg}/edits`);
  console.log(`Edit created: ${edit.id}`);

  // Access check — list tracks (proves the SA is linked to THIS app).
  const tracks = await api(token, "GET", `/applications/${pkg}/edits/${edit.id}/tracks`);
  console.log(`Tracks visible: ${(tracks.tracks || []).map((t) => t.track).join(", ") || "(none)"}`);

  if (showStatus) {
    const t = await api(token, "GET", `/applications/${pkg}/edits/${edit.id}/tracks/${track}`);
    console.log(`'${track}' releases: ${JSON.stringify(t.releases)}`);
    await api(token, "DELETE", `/applications/${pkg}/edits/${edit.id}`);
    console.log("Read-only status check; edit discarded.");
    return;
  }

  if (probe) {
    await api(token, "DELETE", `/applications/${pkg}/edits/${edit.id}`);
    console.log("PROBE OK — auth + app access confirmed. Edit discarded; NOTHING published.");
    return;
  }

  if (notesOnly) {
    const version = val("--version");
    if (!version) { console.error("--notes-only requires --version <code>"); process.exit(2); }
    const notes = (process.env.PLAY_RELEASE_NOTES || "").replace(/\\n/g, "\n");
    const release = { status: "completed", versionCodes: [String(version)] };
    if (notes) release.releaseNotes = [{ language: "en-US", text: notes }];
    const tr = await api(token, "PUT", `/applications/${pkg}/edits/${edit.id}/tracks/${track}`, { track, releases: [release] });
    await api(token, "POST", `/applications/${pkg}/edits/${edit.id}:validate`);
    await api(token, "POST", `/applications/${pkg}/edits/${edit.id}:commit`);
    console.log(`Notes-only: '${track}' release notes updated for versionCode ${version} → ${JSON.stringify(tr.releases)}`);
    return;
  }

  if (promoteVersion) {
    const notes = (process.env.PLAY_RELEASE_NOTES || "").replace(/\\n/g, "\n");
    const release = buildRelease(promoteVersion, notes);
    const trackRes = await api(
      token, "PUT",
      `/applications/${pkg}/edits/${edit.id}/tracks/${track}`,
      { track, releases: [release] },
    );
    console.log(`Track '${track}' set → ${JSON.stringify(trackRes.releases)}`);
    await api(token, "POST", `/applications/${pkg}/edits/${edit.id}:validate`);
    console.log("Edit validated.");
    await api(token, "POST", `/applications/${pkg}/edits/${edit.id}:commit`);
    const rolloutDesc = rolloutFraction !== undefined ? `at ${rolloutFraction * 100}% rollout` : "at 100% (completed)";
    console.log(`COMMITTED — versionCode ${promoteVersion} promoted to '${track}' track ${rolloutDesc}.`);
    return;
  }

  // Upload the bundle.
  const aab = readFileSync(aabPath);
  console.log(`Uploading ${(aab.length / 1048576).toFixed(1)} MB bundle…`);
  const bundle = await api(
    token, "POST",
    `/applications/${pkg}/edits/${edit.id}/bundles?uploadType=media`,
    aab, true,
  );
  console.log(`Uploaded versionCode ${bundle.versionCode} (sha1 ${bundle.sha1})`);

  // Assign to track (respects --rollout if set).
  const notes = (process.env.PLAY_RELEASE_NOTES || "").replace(/\\n/g, "\n");
  const release = buildRelease(bundle.versionCode, notes);
  const trackRes = await api(
    token, "PUT",
    `/applications/${pkg}/edits/${edit.id}/tracks/${track}`,
    { track, releases: [release] },
  );
  console.log(`Track '${track}' set → ${JSON.stringify(trackRes.releases)}`);

  await api(token, "POST", `/applications/${pkg}/edits/${edit.id}:validate`);
  console.log("Edit validated.");

  await api(token, "POST", `/applications/${pkg}/edits/${edit.id}:commit`);
  const rolloutDesc = rolloutFraction !== undefined ? `at ${rolloutFraction * 100}% rollout` : "at 100% (completed)";
  console.log(`COMMITTED — versionCode ${bundle.versionCode} is now on the '${track}' track ${rolloutDesc}.`);
})().catch((e) => {
  console.error("ERROR: " + (e.message || e));
  process.exit(1);
});
