#!/usr/bin/env node
/**
 * Lock a build onto the editable App Store version and submit it for review,
 * via the App Store Connect API (same ES256 JWT auth as asc-api.mjs). Idempotent:
 * skips the attach if the build is already selected, and refuses to create a
 * second submission if one is already open.
 *
 *   set -a && . ./.env.ios.local && set +a && node scripts/asc-submit.mjs <buildVersion>
 *   e.g. node scripts/asc-submit.mjs 13
 *
 * Outward-facing: this submits the app to Apple review (releaseType decides
 * whether approval auto-releases). Only run when the human has said "publish".
 */
import crypto from "node:crypto";
import fs from "node:fs";

const KEY_ID = process.env.ASC_KEY_ID, ISS = process.env.ASC_ISSUER_ID, KP = process.env.ASC_KEY_PATH;
const APP = process.env.ASC_APP_ID || "6778137800";
const WANT = process.argv[2] || "13";
if (!KEY_ID || !ISS || !KP) { console.error("Missing ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH"); process.exit(2); }

const b64 = (x) => Buffer.from(x).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = () => {
  const n = Math.floor(Date.now() / 1000);
  const i = b64(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" })) + "." + b64(JSON.stringify({ iss: ISS, iat: n, exp: n + 1200, aud: "appstoreconnect-v1" }));
  const sig = crypto.sign("SHA256", Buffer.from(i), { key: crypto.createPrivateKey(fs.readFileSync(KP)), dsaEncoding: "ieee-p1363" });
  return i + "." + b64(sig);
};
async function api(path, method = "GET", body) {
  const res = await fetch("https://api.appstoreconnect.apple.com" + path, {
    method,
    headers: { Authorization: "Bearer " + jwt(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  return { status: res.status, j };
}
const fail = (m, r) => { console.error("✗ " + m); if (r) console.error(`  HTTP ${r.status}: ${JSON.stringify(r.j).slice(0, 800)}`); process.exit(1); };

// 1) editable version
const vr = await api(`/v1/apps/${APP}/appStoreVersions?limit=1&include=build&fields[appStoreVersions]=versionString,appStoreState,releaseType,build&fields[builds]=version`);
if (vr.status !== 200) fail("could not read appStoreVersions", vr);
const ver = (vr.j.data || [])[0];
if (!ver) fail("no app store version found");
const verId = ver.id;
const state = ver.attributes.appStoreState;
const curBuildId = ver.relationships?.build?.data?.id;
const curBuildVer = (vr.j.included || []).find((x) => x.type === "builds" && x.id === curBuildId)?.attributes?.version;
console.log(`Version v${ver.attributes.versionString} state=${state} releaseType=${ver.attributes.releaseType} currentBuild=${curBuildVer || "(none)"}`);
const EDITABLE = ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"];
if (!EDITABLE.includes(state)) fail(`version state ${state} is not editable — cannot change build / submit safely`);

// 2) target build id
const br = await api(`/v1/builds?filter[app]=${APP}&filter[version]=${WANT}&fields[builds]=version,processingState&limit=1`);
const bd = (br.j.data || [])[0];
if (!bd) fail(`build ${WANT} not found`);
if (bd.attributes.processingState !== "VALID") fail(`build ${WANT} is ${bd.attributes.processingState}, not VALID`);
console.log(`Target build ${WANT} = ${bd.id} (${bd.attributes.processingState})`);

// 3) attach build if needed
if (curBuildVer === WANT) {
  console.log(`✓ build ${WANT} already attached`);
} else {
  const pr = await api(`/v1/appStoreVersions/${verId}/relationships/build`, "PATCH", { data: { type: "builds", id: bd.id } });
  if (pr.status >= 300) fail(`attach build ${WANT} failed`, pr);
  console.log(`✓ attached build ${WANT} to v${ver.attributes.versionString}`);
}

// 4) find an existing submission: bail if truly in review; reuse a READY_FOR_REVIEW draft.
const open = await api(`/v1/apps/${APP}/reviewSubmissions?filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES&limit=10`);
const inReview = (open.j.data || []).find((s) => ["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(s.attributes?.state));
if (inReview) { console.log(`! already in review (state=${inReview.attributes.state}, id ${inReview.id}). Nothing to do.`); process.exit(0); }
let subId;
const draft = (open.j.data || []).find((s) => s.attributes?.state === "READY_FOR_REVIEW");
if (draft) {
  subId = draft.id;
  console.log(`reusing existing draft submission ${subId}`);
} else {
  const cs = await api(`/v1/reviewSubmissions`, "POST", {
    data: { type: "reviewSubmissions", attributes: { platform: "IOS" }, relationships: { app: { data: { type: "apps", id: APP } } } },
  });
  if (cs.status >= 300) fail("create reviewSubmission failed", cs);
  subId = cs.j.data.id;
  console.log(`✓ created review submission ${subId}`);
}

// 5) ensure the version is an item on the submission (idempotent)
const its = await api(`/v1/reviewSubmissions/${subId}/items?include=appStoreVersion&limit=20`);
const already = (its.j.data || []).some((it) => it.relationships?.appStoreVersion?.data?.id === verId);
if (already) {
  console.log(`✓ version already attached as a submission item`);
} else {
  const ci = await api(`/v1/reviewSubmissionItems`, "POST", {
    data: { type: "reviewSubmissionItems", relationships: { reviewSubmission: { data: { type: "reviewSubmissions", id: subId } }, appStoreVersion: { data: { type: "appStoreVersions", id: verId } } } },
  });
  if (ci.status >= 300) fail("add reviewSubmissionItem failed — version metadata likely incomplete (e.g. missing iPhone screenshots)", ci);
  console.log(`✓ added v${ver.attributes.versionString} (build ${WANT}) as a submission item`);
}

// 6) submit
const sub = await api(`/v1/reviewSubmissions/${subId}`, "PATCH", { data: { type: "reviewSubmissions", id: subId, attributes: { submitted: true } } });
if (sub.status >= 300) fail("submit failed (metadata/state may be incomplete)", sub);
console.log(`✓ SUBMITTED for review — submission ${subId} state=${sub.j.data?.attributes?.state}`);
console.log(`\nReleaseType=${ver.attributes.releaseType} → ${ver.attributes.releaseType === "AFTER_APPROVAL" ? "auto-releases to the App Store once Apple approves." : "you control release timing."}`);
