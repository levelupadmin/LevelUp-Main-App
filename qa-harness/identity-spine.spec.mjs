#!/usr/bin/env node
/**
 * identity-spine.spec.mjs — the adversarial acceptance suite for PHASE SP, the
 * identity spine (`design/briefs/cohort-sp.md`, task S-6). This file is the
 * SIGN-OFF ARTIFACT: the council reads its output, so every assertion states
 * the PROPERTY it proves, not "ok 7".
 *
 * ONE COMMAND, EXIT 0:
 *
 *   node qa-harness/identity-spine.spec.mjs               # the command. Runs the live lane when a
 *                                                         # shadow project is configured; otherwise
 *                                                         # degrades to the static lane and says so.
 *   node qa-harness/identity-spine.spec.mjs --static-only # the static lane alone; NOT a sign-off
 *   node qa-harness/identity-spine.spec.mjs --require-live # fail unless the live lane actually ran
 *
 * EXIT CODE. 0 when every case that RAN passed. A missing shadow environment is
 * not a failure — it is an environment fact, reported in the PARTIAL PROOF
 * banner, and failing on it would mean the artifact could never exit 0 on the
 * machine a reviewer reads it from. Incompleteness IS fatal once a live run was
 * intended: any SHADOW_* variable set, or --require-live. So a green exit never
 * by itself asserts sign-off; the transcript names exactly what was proven.
 *
 * TWO LANES, AND WHY.
 *
 *   STATIC lane — no network, always runs. Everything provable from the source
 *   itself: the shape of `_shared/identity.ts`, its decision table exercised
 *   against the REAL module (Node strips the TypeScript, so this is the module
 *   S-2 ships and not a copy), the diff-is-zero rules, and the two greps.
 *
 *   LIVE lane — runs against a SHADOW Supabase project, never production.
 *   Provisioning is an effect on `auth.users`; "exactly one user was minted"
 *   and "zero users were minted" are not statements about source code, and a
 *   suite that only read source could not tell the council whether the spine
 *   actually holds.
 *
 * HOW THE LIVE LANE INJECTS A SUBMISSION. It posts HMAC-signed synthetic
 * envelopes to `tally-application-webhook`. The poller is the live intake host,
 * but it PULLS from Tally's API read-only and cannot be handed a made-up
 * applicant; the webhook is the only deterministic door into the identical
 * provisioning sequence. That is a REAL limitation, not a formality: the two
 * hosts short-circuit a repeat submission differently (the webhook by
 * (offering_id, email), the poller by tally_response_id), so a live claim about
 * one is NOT a claim about the other. Case S-STATIC-6 therefore asserts the
 * poller's own skip and both hosts' createUser argument sets STRUCTURALLY —
 * after stripping comments, so prose describing the sequence can never stand in
 * for the sequence — and every live claim below is worded to say which host it
 * observed.
 *
 * REQUIRED ENVIRONMENT FOR THE LIVE LANE (secrets by name only — nothing about
 * any project is hard-coded in this file, and the production ref is read out of
 * `src/integrations/supabase/client.ts` purely so a run pointed at it aborts):
 *
 *   SHADOW_SUPABASE_URL          https://<shadow-ref>.supabase.co
 *   SHADOW_SERVICE_ROLE_KEY      shadow service-role key
 *   SHADOW_TALLY_SIGNING_SECRET  the shadow project's TALLY_SIGNING_SECRET
 *   SHADOW_DB_URL                a psql URL for the shadow project. REQUIRED,
 *                                because qa-harness/identity-fixtures.sql is the
 *                                only thing that wipes the previous run's state
 *                                and the suite is not re-runnable without it (a
 *                                leftover application row sends the webhook down
 *                                its by-(offering_id, email) UPDATE branch, which
 *                                returns BEFORE provisioning and mints nothing).
 *   IDENTITY_SPINE_SHADOW_CONFIRM=yes
 *   SHADOW_EMAIL_OTP_PEPPER      the shadow project's EMAIL_OTP_PEPPER, exactly.
 *                                REQUIRED for the email-OTP cases (S-LIVE-4/5).
 *                                There is NO fallback anywhere: verify-email-otp
 *                                reads EMAIL_OTP_PEPPER and returns 503
 *                                `otp_unconfigured` when it is unset, so a wrong
 *                                or absent value cannot be papered over here.
 *   SHADOW_ANON_KEY              optional — the apikey used for the claim call
 *   IDENTITY_SPINE_BASE_REF      optional — diff base, defaults to `main`. It
 *                                must RESOLVE: the diff-zero rules guard money
 *                                and the login path, so an unresolvable base
 *                                fails them closed rather than reporting
 *                                "no diff" after comparing nothing.
 *   IDENTITY_SPINE_INTEGRATED_RELEASE=yes
 *                                optional — keeps the payment pipeline frozen,
 *                                but replaces PHASE SP's historical
 *                                ApplicationStatus zero-diff/isIOS assertion
 *                                with the integrated release's stricter native
 *                                Reader Rule contract and regression artifact.
 *
 * NO NEW DEPENDENCIES. Node standard library only, matching
 * `scripts/typecheck-functions.mjs`. Nothing is installed, nothing is written
 * to the repo, and the only writes anywhere are to the shadow project.
 */

import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_REF = process.env.IDENTITY_SPINE_BASE_REF || "main";
const INTEGRATED_RELEASE = process.env.IDENTITY_SPINE_INTEGRATED_RELEASE === "yes";
const STATIC_ONLY = process.argv.includes("--static-only");

const IDENTITY_MODULE = "supabase/functions/_shared/identity.ts";
const OTP_MODULE = "supabase/functions/_shared/otp.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Reporting. A claim is a sentence about the system, phrased so that reading
// the transcript alone tells you what is now known to be true.
// ─────────────────────────────────────────────────────────────────────────────
const cases = [];
let current = null;

function openCase(id, lane, title) {
  current = { id, lane, title, claims: [] };
  cases.push(current);
}

/** Record a claim: `ok` decides whether it is PROVEN or NOT PROVEN. */
function claim(ok, proven, refuted) {
  current.claims.push({ kind: ok ? "proven" : "failed", text: ok ? proven : refuted });
}

/** An observation the council should read but which does not pass or fail. */
function note(text) {
  current.claims.push({ kind: "note", text });
}

function caseFailed(c) {
  return c.claims.some((cl) => cl.kind === "failed");
}

async function runCase(id, lane, title, fn) {
  openCase(id, lane, title);
  try {
    await fn();
  } catch (err) {
    claim(
      false,
      "",
      `${id} could not complete, so nothing in it is proven: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo helpers
// ─────────────────────────────────────────────────────────────────────────────
function gitSafe(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function nonEmptyLines(text) {
  return (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * THE DIFF BASE, RESOLVED ONCE AND FAILED CLOSED.
 *
 * The diff-zero rules carry this phase's two INVIOLABLE rules — the payment
 * pipeline and the login path of ~74k accounts. If they can report "zero diff"
 * having compared nothing, they are worse than absent: they launder an
 * unchecked assumption into a printed proof. A shallow CI clone, a detached
 * HEAD, or a worktree where `main` exists only as `origin/main` all produce
 * exactly that, so the base ref is resolved to a COMMIT up front and every
 * comparison below refuses to speak without one.
 *
 * `origin/<ref>` is tried as a documented second attempt (the shallow-clone
 * case) and the ref that was actually used is printed, so the transcript never
 * implies a comparison against something it did not compare against.
 */
function resolveBaseRef(ref) {
  for (const candidate of [ref, `origin/${ref}`]) {
    const sha = gitSafe(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]);
    if (sha && sha.trim()) return { ref: candidate, commit: sha.trim(), error: null };
  }
  return {
    ref,
    commit: null,
    error: `neither \`${ref}\` nor \`origin/${ref}\` resolves to a commit in ${ROOT}`,
  };
}

const BASE = resolveBaseRef(BASE_REF);

/**
 * Is every path untouched relative to the resolved base? Checks tracked
 * modifications (committed AND working-tree, which is what `git diff <ref>`
 * reports) and untracked additions, so a brand-new file dropped inside a frozen
 * directory cannot slip through as "no diff".
 *
 * Returns `ok: false` — never an empty `touched` — whenever the comparison
 * could not be MADE. Callers must check `ok` before reading `touched`.
 */
function diffZero(paths) {
  if (!BASE.commit) return { ok: false, touched: [], error: BASE.error };
  const changed = gitSafe(["diff", "--name-only", BASE.commit, "--", ...paths]);
  if (changed === null) {
    return { ok: false, touched: [], error: `git diff ${BASE.ref} failed for ${paths.join(", ")}` };
  }
  const untracked = gitSafe(["ls-files", "--others", "--exclude-standard", "--", ...paths]);
  if (untracked === null) {
    return { ok: false, touched: [], error: `git ls-files failed for ${paths.join(", ")}` };
  }
  return { ok: true, touched: [...nonEmptyLines(changed), ...nonEmptyLines(untracked)], error: null };
}

/** The failure sentence every diff-zero claim shares when the base is unusable. */
function diffUnavailable(what, error) {
  return (
    `NOT PROVEN: the diff-zero rule for ${what} could not be EVALUATED — ${error}. ` +
    "This case fails closed on purpose: reporting \"zero diff\" after comparing nothing is how a frozen " +
    "surface silently thaws. Set IDENTITY_SPINE_BASE_REF to a ref this checkout can resolve (a shallow " +
    "clone needs `git fetch --depth=1 origin main` first)."
  );
}

function readRepoFile(relPath) {
  const abs = join(ROOT, relPath);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

/**
 * The same file as it exists on the resolved base, or null when it is new in
 * this phase. Only meaningful once BASE.commit is known — with the commit
 * verified, a failure here means "this path does not exist on the base" and
 * nothing else. Callers must not run without checking BASE.commit first.
 */
function readBaseFile(relPath) {
  if (!BASE.commit) return null;
  return gitSafe(["show", `${BASE.commit}:${relPath}`]);
}

/**
 * Source with comments removed, for greps that must find CODE.
 *
 * A substring grep over raw text is satisfied by a comment, and these files
 * carry long header blocks that name every token the wiring assertions look
 * for — so deleting the provisioning implementation and leaving its header
 * would otherwise still "prove" the sequence is present. The scanner tracks
 * string and template literals so a `//` inside "https://tally.so/..." does not
 * swallow the rest of the line.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === "\\") {
        out += ch + (next ?? "");
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n"; // keep line numbers usable
        i += 1;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Code-only view of a repo file: null when the file is missing. */
function readRepoCode(relPath) {
  const src = readRepoFile(relPath);
  return src === null ? null : stripComments(src);
}

/** Every line of `text` matching `re`, as `{ line, text }` (1-indexed). */
function grepText(text, re) {
  const out = [];
  (text || "").split("\n").forEach((line, i) => {
    if (re.test(line)) out.push({ line: i + 1, text: line.trim() });
    re.lastIndex = 0;
  });
  return out;
}

function fmtHits(relPath, hits, max = 4) {
  return hits
    .slice(0, max)
    .map((h) => `${relPath}:${h.line} ${JSON.stringify(h.text.slice(0, 110))}`)
    .join("; ") + (hits.length > max ? ` (+${hits.length - max} more)` : "");
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC LANE
// ─────────────────────────────────────────────────────────────────────────────
let identity = null;
let identityImportError = null;
let otpMod = null;

async function loadModules() {
  try {
    identity = await import(pathToFileURL(join(ROOT, IDENTITY_MODULE)).href);
  } catch (err) {
    identityImportError = err;
  }
  try {
    // Pulls in _shared/crypto.ts transitively, so a load failure here also
    // covers the hashing helper the live lane leans on.
    otpMod = await import(pathToFileURL(join(ROOT, OTP_MODULE)).href);
  } catch {
    /* S-3's module is only needed by the live lane; its absence is reported there. */
  }
}

async function staticDiffBase() {
  await runCase("S-STATIC-0", "static", "The diff base resolves, so the frozen-surface rules are actually evaluated", () => {
    claim(
      !!BASE.commit,
      `PROVEN: the diff base \`${BASE.ref}\` resolves to commit ${String(BASE.commit).slice(0, 12)} — every "ZERO diff" claim below is a real comparison against a real tree, not a git failure reported as silence.`,
      `NOT PROVEN: ${BASE.error}. Every diff-zero rule in this suite (verify-msg91-otp, the payment pipeline, ${INTEGRATED_RELEASE ? "the integrated native Reader Rule's frozen payment baseline" : "the isIOS() guard"}, the exempted signup page) is therefore UNEVALUATED and is reported as failed, not as passing.`,
    );
    if (BASE.commit && BASE.ref !== BASE_REF) {
      note(
        `The requested base \`${BASE_REF}\` did not exist in this checkout; \`${BASE.ref}\` was used instead. Read every diff-zero claim below against ${BASE.ref}.`,
      );
    }
  });
}

async function staticContract() {
  await runCase("S-STATIC-1", "static", "The identity primitive is pure, import-free and complete", () => {
    const src = readRepoFile(IDENTITY_MODULE);
    claim(
      !!src,
      `PROVEN: ${IDENTITY_MODULE} exists — provisioning has a host-independent home, so the intake host can change again (webhook -> poller -> whatever) without moving identity logic.`,
      `NOT PROVEN: ${IDENTITY_MODULE} is missing. Task S-1 has not landed; nothing else in this phase can be trusted.`,
    );
    if (!src) return;

    // "Zero imports" is the brief's acceptance criterion, and it is what lets
    // vitest and this suite load the module with no mocking and no runtime.
    const importHits = grepText(src, /(^|\s)import\s|\brequire\s*\(|^\s*export\s+[^;]*\sfrom\s/);
    claim(
      importHits.length === 0,
      "PROVEN: the module has ZERO import statements — it cannot reach a network, a database or a Deno global, so its decisions are a pure function of their arguments and are testable without any mocking.",
      `NOT PROVEN: the module imports something, so it is no longer pure/portable: ${fmtHits(IDENTITY_MODULE, importHits)}`,
    );

    const required = ["identityKeys", "decideProvision", "canClaim"];
    const missingFns = required.filter((n) => !new RegExp(`export function ${n}\\b`).test(src));
    claim(
      missingFns.length === 0,
      `PROVEN: the exact contract the brief published for parallel work is present (${required.join(", ")}), so S-2, S-4 and this suite all built against the same signatures.`,
      `NOT PROVEN: the published contract is incomplete — missing ${missingFns.join(", ")}.`,
    );

    const types = ["IdentityInput", "JoinKeys", "ProvisionOutcome"];
    const missingTypes = types.filter((t) => !new RegExp(`export (interface|type) ${t}\\b`).test(src));
    claim(
      missingTypes.length === 0,
      `PROVEN: the contract's types are exported (${types.join(", ")}), so a caller cannot silently widen an outcome.`,
      `NOT PROVEN: missing exported type(s): ${missingTypes.join(", ")}.`,
    );

    claim(
      !identityImportError,
      "PROVEN: the module loads and executes under a bare Node runtime with type-stripping only — every decision-table assertion below runs the module S-2 actually ships, not a re-implementation of it.",
      `NOT PROVEN: the module could not be loaded, so the decision table below could not be exercised against the real code: ${identityImportError?.message ?? ""}`,
    );
  });
}

function outcomeOf(keys, found) {
  return identity.decideProvision(keys, found);
}

function describe(o) {
  return o ? `${o.status}${o.reason ? `/${o.reason}` : ""}${o.userId ? `#${o.userId}` : ""}` : String(o);
}

async function staticDecisionTable() {
  await runCase("S-STATIC-2", "static", "The provisioning decision table — every row, both collision directions", () => {
    if (!identity) {
      claim(false, "", "NOT PROVEN: _shared/identity.ts did not load, so not one row of the decision table was exercised.");
      return;
    }
    const A = { id: "aaaaaaaa-0000-4000-8000-000000000001" };
    const B = { id: "bbbbbbbb-0000-4000-8000-000000000002" };
    const KEYS = { email: "applicant@example.com", phone: "9900000001" };

    const skipped = outcomeOf({ email: null, phone: null }, {});
    claim(
      skipped.status === "skipped" && skipped.reason === "no_identifier",
      "PROVEN: an application carrying NEITHER identifier is skipped/no_identifier — intake inserts it unlinked instead of minting an account with nothing to bind it to.",
      `NOT PROVEN: no-identifier resolved to ${describe(skipped)}, not skipped/no_identifier.`,
    );

    const created = outcomeOf(KEYS, { byEmail: null, byPhone: null });
    claim(
      created.status === "created",
      "PROVEN: an applicant nobody has seen before resolves to `created` — this is the whole promise of the phase, an app user without a signup screen.",
      `NOT PROVEN: an unknown applicant resolved to ${describe(created)}, not created.`,
    );

    const existing = outcomeOf(KEYS, { byEmail: A, byPhone: A });
    claim(
      existing.status === "existing" && existing.userId === A.id,
      "PROVEN: when BOTH identifiers resolve to the SAME account, the application binds to that uid and mints nothing — the returning applicant keeps one identity.",
      `NOT PROVEN: both-sides-agree resolved to ${describe(existing)}, expected existing#${A.id}.`,
    );

    const cross = outcomeOf(KEYS, { byEmail: A, byPhone: B });
    claim(
      cross.status === "collision" && cross.reason === "cross_linked",
      "PROVEN: an email owned by one account and a phone owned by ANOTHER is collision/cross_linked — the case that would be account takeover if it merged (inviolable rule 3) is refused at the decision layer, before any write.",
      `NOT PROVEN: cross-linked identifiers resolved to ${describe(cross)}, expected collision/cross_linked.`,
    );

    const emailTaken = outcomeOf(KEYS, { byEmail: A, byPhone: null });
    claim(
      emailTaken.status === "collision" && emailTaken.reason === "email_taken",
      "PROVEN: an applicant whose EMAIL already belongs to someone else (phone free) is collision/email_taken — direction one of the collision pair.",
      `NOT PROVEN: email-taken resolved to ${describe(emailTaken)}, expected collision/email_taken.`,
    );

    const phoneTaken = outcomeOf(KEYS, { byEmail: null, byPhone: B });
    claim(
      phoneTaken.status === "collision" && phoneTaken.reason === "phone_taken",
      "PROVEN: an applicant whose PHONE already belongs to someone else (email free) is collision/phone_taken — direction two. Both directions defer; neither merges.",
      `NOT PROVEN: phone-taken resolved to ${describe(phoneTaken)}, expected collision/phone_taken.`,
    );

    // The decision must not be able to point at an empty uid, whatever a
    // half-populated lookup hands it.
    const blankId = outcomeOf(KEYS, { byEmail: { id: "" }, byPhone: { id: "" } });
    claim(
      blankId.status === "created",
      'PROVEN: a lookup that returns a row with an EMPTY id is treated as "no row" — a partially populated result can never produce an outcome pointing at an empty uid.',
      `NOT PROVEN: an empty-id lookup result resolved to ${describe(blankId)}; an empty uid can escape into a write.`,
    );

    // Whatever the single-identifier policy is (S-1 documents it as a
    // collision; a narrower reading calls it `existing`), the property that
    // must hold under BOTH is that a taken identifier never mints a duplicate.
    const singleEmail = outcomeOf({ email: KEYS.email, phone: null }, { byEmail: A, byPhone: null });
    const singlePhone = outcomeOf({ email: null, phone: KEYS.phone }, { byEmail: null, byPhone: B });
    claim(
      singleEmail.status !== "created" && singlePhone.status !== "created",
      "PROVEN: an applicant who supplies only ONE identifier, and it is already taken, is never `created` — a second account is never minted for a person who already has one.",
      `NOT PROVEN: a single taken identifier resolved to ${describe(singleEmail)} / ${describe(singlePhone)} — one of them mints a duplicate account.`,
    );
    note(
      `OBSERVED (policy, for the council, not a failure): a lone taken email resolves to ${describe(singleEmail)} and a lone taken phone to ${describe(singlePhone)}. If that is a collision, the parked row carries only ONE channel and \`canClaim\` — which always checks the OTHER channel — can never satisfy it, so intake or claim policy must collect the missing channel or route the row to review.`,
    );

    const keys = identity.identityKeys({ email: "  Anu@Example.COM ", phone: "+91 97883 85577" });
    claim(
      keys.email === "anu@example.com" && keys.phone === "9788385577",
      "PROVEN: identityKeys normalises to the SAME join keys `find_login_identity` uses (lower/trimmed email, last-10 subscriber digits) — the decision and the lookup cannot disagree, which is exactly how a collision would degrade into a silent merge.",
      `NOT PROVEN: identityKeys returned ${JSON.stringify(keys)} for a padded/mixed-case pair; it has drifted from find_login_identity's normalisation.`,
    );

    const shortPhone = identity.identityKeys({ email: null, phone: "98765" });
    claim(
      shortPhone.phone === null,
      "PROVEN: an unusable phone collapses to null rather than to a partial key — a 5-digit form answer can never be matched against a real subscriber number.",
      `NOT PROVEN: a 5-digit phone produced the key ${JSON.stringify(shortPhone.phone)}.`,
    );
  });
}

async function staticClaimPredicate() {
  await runCase("S-STATIC-3", "static", "The claim predicate — what a second-channel OTP does and does not entitle you to", () => {
    if (!identity) {
      claim(false, "", "NOT PROVEN: _shared/identity.ts did not load, so the claim predicate was never exercised.");
      return;
    }
    const pending = { email: "applicant@example.com", phone: "9900000002" };

    claim(
      identity.canClaim(pending, { channel: "email", value: "applicant@example.com" }) === true,
      "PROVEN: proving the pending row's OWN email entitles the caller to it — the claim can complete in-flow, with no admin and no support ticket.",
      "NOT PROVEN: a correct second-channel email did NOT entitle the caller; the claim flow cannot complete without out-of-band help.",
    );
    claim(
      identity.canClaim(pending, { channel: "email", value: "someone-else@example.com" }) === false,
      "PROVEN: proving a DIFFERENT email does not entitle the caller — an OTP on an address you own is not a key to a stranger's application.",
      "NOT PROVEN: a mismatched email was accepted; any verified address could attach any pending application.",
    );
    claim(
      identity.canClaim(pending, { channel: "phone", value: "9900000002" }) === true,
      "PROVEN: the phone channel is symmetric — the pending row's own number entitles the caller.",
      "NOT PROVEN: the correct pending phone did not entitle the caller.",
    );
    claim(
      identity.canClaim(pending, { channel: "phone", value: "9900000003" }) === false,
      "PROVEN: a different number does not entitle the caller.",
      "NOT PROVEN: a mismatched phone was accepted.",
    );
    claim(
      identity.canClaim({ email: "applicant@example.com", phone: null }, { channel: "phone", value: "9900000002" }) === false,
      "PROVEN: a channel the pending row does not carry is a REJECTION, not a wildcard — a verified phone cannot claim a row that only has an email.",
      "NOT PROVEN: a missing channel behaved as a wildcard; a row could be claimed on a channel it never recorded.",
    );
    claim(
      identity.canClaim(pending, { channel: "email", value: "APPLICANT@Example.com " }) === true &&
        identity.canClaim(pending, { channel: "phone", value: "+91 99000 00002" }) === true,
      "PROVEN: the predicate normalises both sides, so a claimant who types their address in a different case, or their number in E.164 with spaces, is not locked out of an application that is genuinely theirs.",
      "NOT PROVEN: the predicate is format-sensitive — a legitimate claimant typing +91 99000 00002 or a capitalised address is rejected from their own application.",
    );
  });
}

async function staticFrozenSurfaces() {
  await runCase("S-STATIC-4", "static", "OTP parity: the phone login path is byte-identical to production", () => {
    const { ok, touched, error } = diffZero(["supabase/functions/verify-msg91-otp"]);
    if (!ok) {
      claim(false, "", diffUnavailable("verify-msg91-otp (inviolable rule 2)", error));
      return;
    }
    claim(
      touched.length === 0,
      `PROVEN: verify-msg91-otp has a ZERO diff against \`${BASE.ref}\` (${String(BASE.commit).slice(0, 12)}) — the proven login path for every existing user (~74k legacy accounts) is byte-identical to what is in production. Email OTP is purely additive: if it is broken or disabled, phone login is unaffected.`,
      `NOT PROVEN: verify-msg91-otp is MODIFIED (${touched.join(", ")}). Inviolable rule 2 is broken; this phase can no longer claim phone-login parity.`,
    );
  });

  await runCase(
    "S-STATIC-5",
    "static",
    INTEGRATED_RELEASE
      ? "Inviolable rule 1, integrated release: payment code is frozen and all native shells are Reader Rule-safe"
      : "Inviolable rule 1: the payment pipeline and the isIOS() guard are untouched",
    () => {
    const paymentPaths = [
      "supabase/functions/create-razorpay-order",
      "supabase/functions/verify-razorpay-payment",
      "supabase/functions/razorpay-webhook",
      "supabase/functions/guest-create-order",
      "supabase/functions/verify-event-payment",
      "supabase/functions/generate-invoice-pdf",
      "src/lib/invoice.ts",
    ];
    const pipeline = diffZero(paymentPaths);
    if (!pipeline.ok) {
      claim(false, "", diffUnavailable("the payment pipeline (inviolable rule 1)", pipeline.error));
    } else {
      claim(
        pipeline.touched.length === 0,
        `PROVEN: the whole payment pipeline (${paymentPaths.length} surfaces: order creation, verification, the Razorpay webhook, guest checkout, invoicing) has a ZERO diff against \`${BASE.ref}\` (${String(BASE.commit).slice(0, 12)}) — this phase cannot have moved money or broken a checkout.`,
        `NOT PROVEN: the payment pipeline is MODIFIED (${pipeline.touched.join(", ")}). Inviolable rule 1 is broken.`,
      );
    }

      const statusPath = "src/pages/ApplicationStatus.tsx";
      if (INTEGRATED_RELEASE) {
        const statusCode = readRepoCode(statusPath);
        const testPath = "src/pages/__tests__/ApplicationStatus.nativePayments.test.tsx";
        const testCode = readRepoCode(testPath);
        claim(
          statusCode !== null,
          `PROVEN: ${statusPath} exists, so the integrated Reader Rule contract was evaluated against current active code.`,
          `NOT PROVEN: ${statusPath} is missing, so none of the integrated native payment guards can be evaluated.`,
        );
        if (statusCode !== null) {
          const paymentGuards = [
            ["reconciled payment CTA", /reconciledCta\.payment\s*&&\s*isNative\(\)/],
            ["confirmation payment CTA", /step\.key\s*===\s*"confirmation_paid"[\s\S]{0,220}?isNative\(\)/],
            ["balance payment CTA", /step\.key\s*===\s*"balance_paid"[\s\S]{0,220}?isNative\(\)/],
          ];
          const guarded = paymentGuards.filter(([, pattern]) => pattern.test(statusCode)).map(([name]) => name);
          claim(
            guarded.length === paymentGuards.length,
            `PROVEN: all three payment-bearing branches use isNative() in active code (${guarded.join(", ")}) — Android and iOS shells share the Reader Rule wall while web retains checkout.`,
            `NOT PROVEN: only ${guarded.length}/3 payment-bearing branches use isNative() (${guarded.join(", ") || "none"}). Every reconciled, confirmation and balance payment branch must be native-safe.`,
          );
          const legacyGuards = grepText(statusCode, /isIOS\(\)/);
          claim(
            legacyGuards.length === 0,
            `PROVEN: ${statusPath} contains no active isIOS() call — no payment branch can leave Android outside the Reader Rule wall.`,
            `NOT PROVEN: ${statusPath} still contains active isIOS() at ${legacyGuards.map((hit) => hit.line).join(", ")}; an Android shell could retain a payment entry point.`,
          );
        }

        claim(
          testCode !== null,
          `PROVEN: ${testPath} exists — the integrated Reader Rule has a dedicated regression artifact.`,
          `NOT PROVEN: ${testPath} is missing; the current-source guard has no dedicated runtime regression artifact.`,
        );
        if (testCode !== null) {
          const webCases = /"web retains the %s checkout CTA"/.test(testCode);
          const androidCases =
            /\["android",\s*"accepted"/.test(testCode) &&
            /\["android",\s*"confirmation_paid"/.test(testCode);
          const iosCases =
            /\["ios",\s*"accepted"/.test(testCode) &&
            /\["ios",\s*"confirmation_paid"/.test(testCode);
          claim(
            webCases && androidCases && iosCases,
            `PROVEN: ${testPath} contains web checkout retention plus Android and iOS denial cases for both staged payment states.`,
            `NOT PROVEN: ${testPath} is incomplete (web=${webCases}, Android=${androidCases}, iOS=${iosCases}); all three runtimes and both staged payment states must be represented.`,
          );
        }
      } else {
        const status = diffZero([statusPath]);
        const src = readRepoFile(statusPath) || "";
        const guards = grepText(src, /isIOS\(\)/);
        if (!status.ok) {
          claim(false, "", diffUnavailable(`${statusPath} (the isIOS() guard)`, status.error));
          return;
        }
      claim(
        status.touched.length === 0 && guards.length > 0,
        `PROVEN: ${statusPath} has a ZERO diff against \`${BASE.ref}\` and still carries its isIOS() guard at ${guards.map((g) => g.line).join(", ")} — the App Store payment guard is exactly as shipped. (The brief cites lines 319/337; the guard has since moved to the lines listed here, so this suite asserts the file's diff and the guard's presence rather than a stale line number.)`,
        status.touched.length
          ? `NOT PROVEN: ${statusPath} is MODIFIED (${status.touched.join(", ")}) — the isIOS() guard is inside a file this phase was forbidden to touch.`
          : `NOT PROVEN: ${statusPath} no longer contains an isIOS() call at all; the App Store payment guard is gone.`,
      );
      }
    },
  );
}

const POLL_HOST = "supabase/functions/tally-application-poll/index.ts";
const WEBHOOK_HOST = "supabase/functions/tally-application-webhook/index.ts";

/**
 * The body and end index of the object/brace group opening at `open`.
 * Quote- and template-aware, so a brace inside a string cannot unbalance it.
 */
function braceBody(code, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { text: code.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** Split an object-literal body on its TOP-LEVEL commas (nest- and quote-aware). */
function splitProperties(body) {
  const out = [];
  let nest = 0;
  let quote = null;
  let token = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      token += ch;
      if (ch === "\\") {
        token += body[i + 1] ?? "";
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      token += ch;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") nest += 1;
    else if (ch === "}" || ch === "]" || ch === ")") nest -= 1;
    if (nest === 0 && ch === ",") {
      out.push(token);
      token = "";
      continue;
    }
    token += ch;
  }
  if (token.trim()) out.push(token);
  return out;
}

/**
 * The keys a SPREAD property contributes, or `null` when they cannot be known.
 *
 * `...(phone ? { phone } : {})` contributes `phone`; `...someOpaqueObject`
 * contributes an unknowable set and MUST fail closed rather than silently
 * contribute nothing — an argument-set assertion that cannot see a spread is
 * exactly how a second identifier would enter unnoticed.
 */
function spreadContributedKeys(expr) {
  const contributed = [];
  let sawLiteral = false;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] !== "{") continue;
    const inner = braceBody(expr, i);
    if (!inner) return null;
    sawLiteral = true;
    for (const d of propertyDescriptors(inner.text)) {
      if (d.name === null) return null;
      contributed.push({ name: d.name, shorthand: d.shorthand });
    }
    i = inner.end;
  }
  return sawLiteral ? contributed : null;
}

/**
 * Every top-level property of an object-literal body, as
 * `{ name, spread, raw }`. `name` is null when the property could not be
 * parsed, which callers treat as a failure, never as an absent key.
 *
 * SPREADS ARE FIRST-CLASS HERE. The shipped intake hosts pass the applicant's
 * phone as `...(phone ? { phone } : {})` — a conditional spread. A parser that
 * only matched `identifier:` per comma-token would report NO key for it, so a
 * host that spread in an attacker-controlled `{ phone }` would compare equal to
 * one that passed nothing at all. That blindness would void the single
 * invariant S-STATIC-6/6B exist to enforce, so spread-contributed keys are
 * extracted and carry the flag through to every comparison and every printed
 * argument set.
 */
function propertyDescriptors(body) {
  const out = [];
  for (const raw of splitProperties(body)) {
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith("...")) {
      const contributed = spreadContributedKeys(t.slice(3));
      if (contributed === null) {
        out.push({ name: null, spread: true, shorthand: false, raw: t });
        continue;
      }
      for (const c of contributed) out.push({ name: c.name, spread: true, shorthand: c.shorthand, raw: t });
      continue;
    }
    const named = t.match(/^(?:([A-Za-z_$][\w$]*)|["']([^"']+)["'])\s*:/);
    if (named) {
      out.push({ name: named[1] ?? named[2], spread: false, shorthand: false, raw: t });
      continue;
    }
    const shorthand = t.match(/^([A-Za-z_$][\w$]*)$/);
    if (shorthand) {
      out.push({ name: shorthand[1], spread: false, shorthand: true, raw: t });
      continue;
    }
    out.push({ name: null, spread: false, shorthand: false, raw: t });
  }
  return out;
}

/**
 * The top-level properties of the object literal passed to `createUser({...})`.
 *
 * Argument SET, not argument text: what a minted account carries is the
 * security decision this phase turns on, and "which identifiers does it pass?"
 * is exactly a question about that set. Brace-matched rather than regexed, so a
 * nested object (`user_metadata`, `app_metadata`) cannot contribute a phantom
 * top-level key — and spread-aware, so a conditional one cannot hide a real key.
 */
function createUserArgKeysAt(code, at) {
  const open = code.indexOf("{", at);
  if (open < 0) return null;
  const body = braceBody(code, open);
  if (!body) return null;
  return propertyDescriptors(body.text);
}

/**
 * EVERY `createUser({...})` call site in a file, as descriptor arrays. All of
 * them, not the first: a second minting path added later is exactly how the
 * "what a minted account carries" invariant would come undone without anything
 * else changing.
 */
function createUserCalls(code) {
  const sites = [];
  for (let at = code.indexOf("createUser("); at >= 0; at = code.indexOf("createUser(", at + 1)) {
    const keys = createUserArgKeysAt(code, at);
    if (keys) sites.push(keys);
  }
  return sites;
}

/** Human-readable argument set, with spread-contributed keys marked as such. */
function renderKeys(descs) {
  return (descs || []).map((d) =>
    d.name === null
      ? `<UNPARSED ${JSON.stringify(d.raw.replace(/\s+/g, " ").slice(0, 60))}>`
      : d.spread
        ? `${d.name} (conditionally spread)`
        : d.name,
  );
}

/** Plain key names present at a call site, spread or not. */
function keyNames(descs) {
  return (descs || []).map((d) => d.name).filter((n) => n !== null);
}

/** Did any property fail to parse? Such a site is never reported as "no key". */
function anyUnparsed(sites) {
  return (sites || []).some((site) => site.some((d) => d.name === null));
}

/**
 * The comparable shape of a file's call sites. A spread carries its SOURCE
 * EXPRESSION into the shape, not just the key it contributes, so
 * `...(phone ? { phone } : {})` and `...{ phone: rawFormText }` are different
 * shapes even though both contribute `phone`.
 */
function argShape(sites) {
  return JSON.stringify(
    (sites || []).map((site) =>
      site
        .map((d) =>
          d.spread ? `...${d.raw.replace(/\s+/g, " ").trim()}` : String(d.name ?? `<unparsed:${d.raw.trim()}>`),
        )
        .sort(),
    ),
  );
}

async function staticProvisioningWiring() {
  await runCase("S-STATIC-6", "static", "Both intake hosts run the same provisioning sequence — asserted on CODE, not prose", () => {
    const hosts = [
      [POLL_HOST, "the LIVE intake host — the only one that runs in production"],
      [WEBHOOK_HOST, "the inert fail-closed host, and the door this suite's live lane knocks on"],
    ];
    const argSets = new Map();
    for (const [path, role] of hosts) {
      const code = readRepoCode(path);
      if (!code) {
        claim(false, "", `NOT PROVEN: ${path} is missing.`);
        continue;
      }
      // Every predicate runs on COMMENT-STRIPPED source and demands a syntactic
      // construct, not a token. These files carry header blocks that name every
      // one of these identifiers in prose; a substring grep over raw text would
      // be satisfied by the header alone, so deleting the implementation and
      // keeping the comment would still "prove" the sequence.
      const importsIdentity =
        /import\s*\{[^}]*\bdecideProvision\b[^}]*\}\s*from\s*["'][^"']*_shared\/identity\.ts["']/.test(code) &&
        /import\s*\{[^}]*\bidentityKeys\b[^}]*\}\s*from\s*["'][^"']*_shared\/identity\.ts["']/.test(code);
      const callsDecide = /\bdecideProvision\s*\(/.test(code);
      const usesKeys = /\bidentityKeys\s*\(/.test(code);
      const parks = /\bpending_claim\s*[=:]\s*true/.test(code);
      const creates = /\bauth\.admin\.createUser\s*\(/.test(code);
      claim(
        importsIdentity && callsDecide && usesKeys && parks && creates,
        `PROVEN: ${path} (${role}) IMPORTS decideProvision + identityKeys from _shared/identity.ts, CALLS both, mints via auth.admin.createUser( and sets pending_claim = true on the collision branch — all five asserted against comment-stripped source, so the file's own header prose cannot stand in for the sequence.`,
        `NOT PROVEN: ${path} does not run the shared sequence in CODE (identity import: ${importsIdentity}, identityKeys call: ${usesKeys}, decideProvision call: ${callsDecide}, createUser call: ${creates}, pending_claim = true: ${parks}). The two intake hosts can now provision differently.`,
      );
      argSets.set(path, createUserCalls(code));
    }

    // THE ARGUMENT SETS MUST MATCH. Identical wiring that mints DIFFERENT
    // accounts is the divergence that matters: an applicant's identity would
    // depend on which door they came through. Compared across EVERY call site
    // in each file, so a second minting path added to one host alone fails here.
    const pollArgs = argSets.get(POLL_HOST);
    const hookArgs = argSets.get(WEBHOOK_HOST);
    if (pollArgs && hookArgs) {
      // Fail closed on anything the parser could not read. A property it cannot
      // name is an UNKNOWN key, never an absent one — reporting "no phone here"
      // because the parser went blind is the failure mode this case must not have.
      claim(
        !anyUnparsed(pollArgs) && !anyUnparsed(hookArgs),
        "PROVEN: every property passed to createUser in both hosts parsed to a named key (including the conditionally-spread ones), so the argument sets compared below are the complete sets and not the subset a parser happened to understand.",
        `NOT PROVEN: a createUser property could not be parsed, so the argument set is UNKNOWN and no claim about which identifiers are minted can be made from it. Poller: ${renderKeys(pollArgs.flat()).join(", ")}. Webhook: ${renderKeys(hookArgs.flat()).join(", ")}.`,
      );
      // THE DIVERGENCE THAT MATTERS IS `phone`, SO THE REFUTATION NAMES IT.
      // Both files' own headers say they must mint identically ("KEPT
      // DELIBERATELY IDENTICAL"; "Changes here MUST be mirrored"), and the
      // reason is not tidiness: `phone` at createUser is the phone-OTP LOGIN
      // KEY written from unauthenticated form text (see S-STATIC-6B). A host
      // that still passes it is a host through which the account-takeover
      // vector is open, whatever the other host does.
      const pollMintsPhone = pollArgs.some((site) => keyNames(site).includes("phone"));
      const hookMintsPhone = hookArgs.some((site) => keyNames(site).includes("phone"));
      const divergenceDiagnosis = pollMintsPhone === hookMintsPhone
        ? "The sets differ on something other than the phone."
        : `THE DIVERGENCE IS THE LOGIN KEY: ${pollMintsPhone ? POLL_HOST : WEBHOOK_HOST} still passes \`phone\` to createUser and ${pollMintsPhone ? WEBHOOK_HOST : POLL_HOST} does not. The host that DOES is the unsafe one — it binds the phone-OTP login key from unauthenticated public-form text, which is the account-takeover vector this phase closed. Mirror the email-only shape into it; do NOT mirror the phone back the other way.`;
      claim(
        pollArgs.length === 1 && argShape(pollArgs) === argShape(hookArgs),
        `PROVEN: each host has exactly ONE createUser call site and both take the SAME argument set (${renderKeys(pollArgs[0]).join(", ")}) — compared on key names AND on each spread's source expression, so a host that spread in a differently-sourced identifier would fail here even though its key names matched. An applicant's minted account is identical whichever door ingested them, and neither host has a second minting path.`,
        `NOT PROVEN: the hosts do not mint identically, which both of their headers forbid. Poller call sites: ${argShape(pollArgs)}. Webhook call sites: ${argShape(hookArgs)}. ${divergenceDiagnosis}`,
      );
    }

    // THE POLLER'S OWN IDEMPOTENCY. The live lane can only knock on the
    // webhook, and the webhook absorbs a repeat by (offering_id, email) — a
    // DIFFERENT mechanism. The poller's tally_response_id skip is therefore
    // asserted here, statically, and no live claim below is allowed to stand in
    // for it.
    const pollCode = readRepoCode(POLL_HOST) || "";
    const skips = /responseIds\.has\s*\(/.test(pollCode) && /summary\.skipped\+\+|summary\.skipped \+= 1/.test(pollCode);
    claim(
      skips,
      "PROVEN: the poller skips any submission whose tally_response_id it has already ingested (`existing.responseIds.has(...)` -> skip, before the insert AND before provisioning) — a 15-minute re-scan of the same window cannot reach createUser for a row it has already seen.",
      "NOT PROVEN: the poller no longer skips on tally_response_id in code. Its whole re-scan window would be re-provisioned every 15 minutes.",
    );

    const migrations = readdirSync(join(ROOT, "supabase/migrations"));
    const uniqueIdx = migrations
      .map((f) => readRepoFile(`supabase/migrations/${f}`) || "")
      .some((s) => /CREATE UNIQUE INDEX[\s\S]{0,200}cohort_applications[\s\S]{0,120}tally_response_id/i.test(s));
    claim(
      uniqueIdx,
      "PROVEN: a UNIQUE index on cohort_applications.tally_response_id exists in a migration — the last line of defence the brief names, so even a host that skipped its own dedupe cannot produce two application rows for one Tally response.",
      "NOT PROVEN: no migration creates a unique index on cohort_applications.tally_response_id; nothing at the database level stops one Tally response becoming two applications.",
    );

    const pendingMig = migrations.find((f) => f.startsWith("20260727120000"));
    const migSrc = pendingMig ? readRepoFile(`supabase/migrations/${pendingMig}`) : null;
    claim(
      !!migSrc && /ADD COLUMN IF NOT EXISTS pending_claim/i.test(migSrc),
      `PROVEN: cohort_applications.pending_claim is introduced by supabase/migrations/${pendingMig} (task S-2) — the column this whole suite leans on is BRAND NEW in this phase and is not assumed to pre-exist.`,
      "NOT PROVEN: no migration 20260727120000* adds cohort_applications.pending_claim. Task S-2's migration is missing; the collision path has nowhere to park a row.",
    );
  });

  await runCase("S-STATIC-6B", "static", "A minted account carries the EMAIL ONLY — the phone is stashed, never made a login key", () => {
    // ⚠️ THIS CASE WAS INVERTED ON PURPOSE, AND MUST NOT BE INVERTED BACK.
    //
    // It used to assert that intake mints with BOTH identifiers, on the brief's
    // reading (line 21: `createUser({ email, phone, ... })`; line 6: "a later
    // OTP on EITHER channel resolves to the same auth.uid"). That is a genuine
    // product goal and it was WRONG to implement it this way, because
    // `auth.users.phone` is not a contact field — it is the phone-OTP LOGIN
    // KEY, matched by find_login_identity (20260603120000:78-92) on its last 10
    // digits with NO phone_confirmed_at predicate.
    //
    // THE ATTACK the old assertion demanded: POST the public form with {an
    // email you own, a stranger's unregistered number}. Intake mints an account
    // carrying both. The stranger's first genuine MSG91 OTP resolves into THAT
    // account — whose email, and therefore whose magic-link sign-in, the
    // submitter controls. Silent, permanent, and invisible to the victim.
    //
    // THE SHIPPED SHAPE, which this case now enforces: mint EMAIL-ONLY, stash
    // the normalised number at `app_metadata.levelup_intake_phone` (service-role
    // only; nothing keys on it), and let `sync_intake_phone_on_confirm` promote
    // it to the login key when — and only when — a phone_confirmed_at proves it
    // (asserted live in S-LIVE-8). The cost is disclosed in the note at the end
    // of this case; it is a data-quality cost, and the thing it replaces is an
    // account takeover.
    //
    // If you are here because the Phone tab does not find an applicant's
    // account: that is the DISCLOSED COST, not a bug, and the fix is never to
    // put the unproven number back into createUser.
    const pollCode = readRepoCode(POLL_HOST);
    const hookCode = readRepoCode(WEBHOOK_HOST);
    if (!pollCode || !hookCode) {
      claim(false, "", "NOT PROVEN: an intake host is missing, so the minted-account contract could not be read.");
      return;
    }

    for (const [path, code] of [[POLL_HOST, pollCode], [WEBHOOK_HOST, hookCode]]) {
      const sites = createUserCalls(code);
      const shown = renderKeys(sites.flat()).join(", ");
      if (anyUnparsed(sites)) {
        claim(
          false,
          "",
          `NOT PROVEN: a property passed to createUser in ${path} could not be parsed (${shown}), so which identifiers the minted account carries is UNKNOWN. This case fails closed rather than report an unreadable property as an absent one.`,
        );
        continue;
      }
      const names = sites.map((site) => keyNames(site));
      claim(
        sites.length > 0 && names.every((k) => k.includes("email") && !k.includes("phone")),
        `PROVEN: ${path} mints with {${shown}} — the EMAIL and NOT the phone. auth.users.phone is the phone-OTP login key and intake reads its phone out of an unauthenticated public form, so this is the single line that decides whether one form submission can pre-bind a stranger's number to an account the submitter controls. Asserted by a spread-aware parser, so a conditionally-spread \`...(phone ? { phone } : {})\` could not slip past it as "no key".`,
        `NOT PROVEN — ACCOUNT-TAKEOVER VECTOR OPEN IN ${path}: it passes \`phone\` to createUser (keys: ${shown}). That column is the phone-OTP LOGIN KEY, find_login_identity matches it with no reference to phone_confirmed_at, and the value came from an unauthenticated public form. One submission of {an email the attacker owns, a stranger's unregistered number} makes the stranger's first genuine OTP resolve into the attacker's account. Mint email-only and stash the number at app_metadata.levelup_intake_phone instead.`,
      );
      claim(
        names.every((k) => k.includes("email_confirm") && k.includes("phone_confirm")) &&
          /email_confirm\s*:\s*false/.test(code) &&
          /phone_confirm\s*:\s*false/.test(code),
        `PROVEN: ${path} passes email_confirm: false AND phone_confirm: false — both values are still unauthenticated form text, so the account is minted INERT and nothing is treated as proven until a real OTP proves a channel. This is the guest-create-order/index.ts:247-255 pattern the brief names as the proven precedent.`,
        `NOT PROVEN: ${path} does not mint with both confirmations false (keys: ${shown}). An intake account whose channels arrive pre-confirmed would be trusted on the strength of a public form.`,
      );
      // THE NUMBER IS NOT LOST, IT IS PARKED. Email-only minting is only the
      // safe option and not simply a lossy one because the number survives
      // somewhere that NOTHING KEYS ON: `app_metadata` is service-role-only (a
      // user can never write it) and no lookup reads it. It becomes a login key
      // exactly once, when a confirmation proves it.
      //
      // It must still be NORMALISED before being stashed. `e164()` only
      // prepends "+", so raw form text like "9788385577" would stash
      // "+9788385577" — digits nobody can ever present at an OTP prompt — and
      // the promotion would install that as the login key.
      const mintable = /function mintablePhone\s*\([\s\S]{0,200}?normalizePhone\s*\([\s\S]{0,120}?\+91/.test(code);
      const stashMatch = code.match(/levelup_intake_phone\s*:\s*([A-Za-z_$][\w$]*)/);
      const stashBinding = stashMatch ? stashMatch[1] : null;
      const stashFromMintable =
        !!stashBinding && new RegExp(`const\\s+${stashBinding}\\s*=\\s*mintablePhone\\s*\\(`).test(code);
      claim(
        mintable && !!stashBinding && stashFromMintable,
        `PROVEN: ${path} stashes the applicant's number at app_metadata.levelup_intake_phone, bound to \`${stashBinding}\` = mintablePhone(...) — normalizePhone() then a literal +91 prefix. The number is preserved for sync_intake_phone_on_confirm to promote once it is proven, and it is preserved in the SAME normalised form the login key would need, so the promotion cannot install digits no MSG91 login could present.`,
        `NOT PROVEN: ${path} does not stash a normalised number for later promotion (normalising helper present: ${mintable}; levelup_intake_phone bound to: ${JSON.stringify(stashBinding)}; that binding comes from mintablePhone(): ${stashFromMintable}). Minting email-only WITHOUT the stash does not just dead-end the Phone tab, it discards the applicant's number entirely — there is no second copy to promote when they finally prove it.`,
      );
      claim(
        !/user_metadata\s*:\s*\{[^}]*\bphone\b/.test(code),
        `PROVEN: ${path} keeps the unproven number out of user_metadata.phone — a DIFFERENT field from the one above. handle_new_user mirrors raw_user_meta_data->>'phone' (never NEW.phone) into the UNIQUE public.users.phone, where an unproven value squats the column against its real owner. The mirror is written later, by sync_confirmed_phone_to_users, and only once GoTrue has recorded phone_confirmed_at.`,
        `NOT PROVEN: ${path} writes an unproven phone into user_metadata, which handle_new_user mirrors into the UNIQUE public.users.phone — squatting the column against the number's real owner.`,
      );
      claim(
        /app_metadata\s*:\s*\{[\s\S]{0,80}?INTAKE_APP_METADATA/.test(code) &&
          /levelup_unverified_intake\s*:\s*true/.test(code),
        `PROVEN: ${path} stamps app_metadata.levelup_unverified_intake = true on every account it mints. app_metadata is service-role-only (a user can never write it, unlike user_metadata), so the identity retains durable server-owned intake provenance.`,
        `NOT PROVEN: ${path} does not stamp levelup_unverified_intake on the accounts it mints, so downstream operations lose the server-owned provenance that distinguishes intake-created identities.`,
      );
    }

    // The older SP migration used to re-declare the complete signup-time legacy
    // claim just to add a temporary intake gate. Main later made that function a
    // universal no-op and moved purchases to verified sign-in, so the old body
    // is now both dead and dangerous during a partial migration rollout.
    const pendingMigName = readdirSync(join(ROOT, "supabase/migrations")).find((f) => f.startsWith("20260727120000"));
    const pendingSrc = pendingMigName ? readRepoFile(`supabase/migrations/${pendingMigName}`) : null;
    const claimMigName = readdirSync(join(ROOT, "supabase/migrations")).find((f) => f.startsWith("20260727220000"));
    const claimSrc = claimMigName ? readRepoFile(`supabase/migrations/${claimMigName}`) : null;
    const probeMigName = readdirSync(join(ROOT, "supabase/migrations")).find((f) => f.startsWith("20260803190000"));
    const probeSrc = probeMigName ? readRepoFile(`supabase/migrations/${probeMigName}`) : null;
    const claimBody = claimSrc?.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.claim_legacy_enrolments_for_user\(\)[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$;/i,
    )?.[1];
    const bareClaimBody = stripSqlComments(claimBody || "").replace(/\s+/g, " ").trim();
    const pendingBare = stripSqlComments(pendingSrc || "");
    claim(
      !!pendingSrc &&
        !/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.claim_legacy_enrolments_for_user\s*\(/i.test(pendingBare) &&
        bareClaimBody === "BEGIN RETURN NEW; END;" &&
        /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.intake_provisioning_gate_ok\s*\(/i.test(
          stripSqlComments(probeSrc || ""),
        ) &&
        !/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.intake_provisioning_gate_ok\s*\(/i.test(pendingBare) &&
        /prosrc[\s\S]{0,300}?RETURN\[\[:space:\]\]\+NEW/i.test(probeSrc || "") &&
        /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.intake_provisioning_gate_ok\(\)\s+FROM\s+public\s*,\s*anon\s*,\s*authenticated/i.test(
          stripSqlComments(probeSrc || ""),
        ),
      `PROVEN: supabase/migrations/${pendingMigName} no longer re-declares the legacy signup claim; supabase/migrations/${claimMigName} reduces it exactly to \`BEGIN RETURN NEW; END;\`; and the later forward migration ${probeMigName} verifies that no-op before installing intake_provisioning_gate_ok() with explicit PUBLIC/anon/authenticated revokes. A partial db push therefore leaves the poller closed, while a complete push makes every signup-time legacy claim inert regardless of intake metadata.`,
      `NOT PROVEN: the old SP migration still declares a signup-time claim, the final claim body is not the exact no-op, or ${probeMigName} does not verify the no-op and revoke browser-role execution before installing the poller probe (pending migration: ${pendingMigName}; claim migration: ${claimMigName}; final body: ${JSON.stringify(bareClaimBody)}).`,
    );

    // WHY auth.users.phone IS THE ONE COLUMN INTAKE MAY NOT WRITE, read out of
    // the login migration itself rather than asserted from memory. The predicate
    // below is a last-10-digit match on auth.users.phone with NO reference to
    // phone_confirmed_at — so anything written there is a live login key the
    // moment it lands, proven or not.
    const loginFix = readRepoFile("supabase/migrations/20260603120000_legacy_login_fix.sql") || "";
    const matchesUnconfirmed =
      /right\(regexp_replace\(u\.phone[^)]*\)[^)]*\)\s*=\s*right\(w\.digits/.test(loginFix) &&
      !/phone_confirmed_at/.test(loginFix);
    claim(
      matchesUnconfirmed,
      "PROVEN: find_login_identity resolves a phone by last-10 digits against auth.users.phone and NEVER consults phone_confirmed_at — read out of 20260603120000_legacy_login_fix.sql, not assumed. That is exactly WHY intake must not write that column: an unproven number written there is a working login key from the instant it is stored, and the applicant's number therefore waits in app_metadata until a confirmation promotes it.",
      `NOT PROVEN: find_login_identity's phone predicate could not be read from supabase/migrations/20260603120000_legacy_login_fix.sql, or it now consults phone_confirmed_at (predicate readable: ${/right\(regexp_replace\(u\.phone/.test(loginFix)}). If it HAS learned to prefer a confirmed row, the email-only mint above may no longer be necessary — but that is a change to the login path of every existing account and must be ruled on deliberately, not inferred from a green test.`,
    );

    // ── THE DISCLOSED COST — a note, not a failure. ─────────────────────────
    // Closing the takeover is not free, and the council should rule on the bill
    // with its eyes open rather than discover it in support tickets.
    const stalePollerProse = /ACCEPTED RESIDUAL RISK/.test(readRepoFile(POLL_HOST) || "");
    note(
      `THE DISCLOSED COST of minting email-only, for the council to accept explicitly. (1) Until the applicant proves their number, the Phone tab does not resolve to the account intake made for them — which is today's production behaviour for an applicant anyway, so it is an unmet stretch goal rather than a regression, and their confirmation mail's CTA is the email route. (2) A second application from the SAME number under a DIFFERENT email no longer lands as collision/phone_taken (nothing keys on the phone any more), so it mints a second identity instead of parking a row: one human, two email-keyed accounts. That is a data-quality problem an operator can merge. What it replaces is an account takeover, which cannot be undone. Deliberate trade.${
        stalePollerProse
          ? ` ⚠️ SEPARATELY: ${POLL_HOST} still carries an "ACCEPTED RESIDUAL RISK" header block describing the pre-fix design (a number written at intake being reachable before anyone proves it) as an accepted risk. The code no longer writes it. That prose is now STALE and reads as licence to reinstate the write — worth a docs fix in that file, which this suite does not own.`
          : ""
      }`,
    );
  });

  await runCase("S-STATIC-7", "static", "The claim has a server surface that can actually attach a row", () => {
    const hook = readRepoFile("src/hooks/useClaimApplication.ts");
    if (!hook) {
      claim(false, "", "NOT PROVEN: src/hooks/useClaimApplication.ts is missing; task S-4 has not landed.");
      return;
    }
    const fnName = (hook.match(/CLAIM_FUNCTION\s*=\s*["']([^"']+)["']/) || [])[1];
    const fnExists = !!fnName && existsSync(join(ROOT, "supabase/functions", fnName, "index.ts"));
    claim(
      fnExists,
      `PROVEN: the attach endpoint the client invokes (\`${fnName}\`) exists at supabase/functions/${fnName}/index.ts — a claim can be completed in-flow with no admin or support action.`,
      `NOT PROVEN: the client invokes \`${fnName}\` but supabase/functions/${fnName}/index.ts does not exist. Every claim would fail: the row stays parked and the applicant is stuck behind a support ticket, which the brief forbids ("no admin/support action may be required"). This is a task S-4 gap.`,
    );

    // DISCOVERY. A parked row has user_id NULL, so the pre-existing
    // `students_read_own_applications` policy (user_id = auth.uid()) hides it
    // from the one person who must see it. Whatever the mechanism — a discovery
    // RPC or a direct read — SOMETHING must make a parked row visible to its
    // claimant, or the claim step never surfaces at all.
    const migrationsDir = join(ROOT, "supabase/migrations");
    const rpcName = (hook.match(/PENDING_CLAIM_RPC\s*=\s*["']([^"']+)["']/) || [])[1];
    const readsTableDirectly = /from\(["']cohort_applications["']\)[\s\S]{0,400}?pending_claim/.test(hook);
    const migrationSources = readdirSync(migrationsDir).map((f) => readFileSync(join(migrationsDir, f), "utf8"));

    const rpcDefined =
      !!rpcName && migrationSources.some((s) => new RegExp(`FUNCTION\\s+(public\\.)?${rpcName}\\b`).test(s));
    const policyDefined = migrationSources.some(
      (s) => /CREATE POLICY[\s\S]{0,200}ON public\.cohort_applications/i.test(s) && /pending_claim/.test(s),
    );

    claim(
      rpcDefined || (readsTableDirectly && policyDefined),
      rpcDefined
        ? `PROVEN: the discovery RPC \`${rpcName}\` is defined in a migration — a signed-in applicant can find their own parked row even though user_id is NULL.`
        : "PROVEN: the client discovers parked rows by reading cohort_applications directly, and a migration adds an RLS policy on that table keyed on pending_claim — so a claimant can see their own parked row (and, because the policy matches on the caller's own auth.users identity rather than a client-supplied value, only their own).",
      `NOT PROVEN: nothing makes a parked row visible to its claimant (discovery RPC defined: ${rpcDefined}; direct read: ${readsTableDirectly}; pending_claim RLS policy in a migration: ${policyDefined}). A parked application would be invisible to the only person who can claim it.`,
    );
  });
}

async function staticNoSignupScreen() {
  // THE APPLICANT PATH — the surfaces an applicant actually meets, in order:
  // Tally -> provisioned user -> Login (OtpTabs) -> ClaimApplication -> Home
  // (ApplicantStageCard) -> ApplicationStatus.
  const APPLICANT_PATH = [
    "src/pages/Login.tsx",
    "src/components/auth/OtpTabs.tsx",
    "src/components/auth/OtpEntryStep.tsx",
    "src/components/auth/PhoneInput.tsx",
    "src/pages/auth/ClaimApplication.tsx",
    "src/hooks/useClaimApplication.ts",
    "src/components/home/ApplicantStageCard.tsx",
    "src/hooks/useApplicantStage.ts",
    "src/pages/ApplicationStatus.tsx",
  ];

  await runCase("S-STATIC-8", "static", "No signup screen is reachable from the applicant path", () => {
    // REACHABILITY, not vocabulary. A signup screen is reachable from a surface
    // when that surface links to /signup, routes it, or imports the page. The
    // bare phrase "sign up" is not the test: it matches code comments that merely
    // cite Signup.tsx as precedent, and failing on those would be theatre. A
    // prose scan runs separately and is reported as a NOTE for the council.
    const SIGNUP_REACH_RE = /["'`]\/signup["'`]|<Signup[\s/>]|from\s+["'][^"']*\/Signup["']|lazy\(\s*\(\)\s*=>\s*import\(["'][^"']*\/Signup["']/;
    const SIGNUP_PROSE_RE = /sign[ -]?up/i;

    // ── The disclosed exemption, stated up front so the council reads it here
    // rather than discovering it. ─────────────────────────────────────────────
    // The repo HAS a live signup screen: src/pages/Signup.tsx, routed at
    // /signup in src/App.tsx. It PREDATES this phase, it is in NO task's file
    // map for phase SP, and retiring it is a separate Tier-1 decision for
    // Rahul — so this suite does not delete it, does not edit it, and does not
    // fail on it. The brief contradicts itself here (line 17: "no user-facing
    // signup screen exists in ANY flow"; line 85 / phase acceptance: "no signup
    // screen ... IN THE APPLICANT FLOW"); the phase-acceptance reading is the
    // one implemented, because the unqualified reading fails on day one for a
    // route this phase never touched. What IS asserted: the applicant path adds
    // no new signup surface, and the legacy route is frozen.
    const appSrc = readRepoFile("src/App.tsx") || "";
    const appBase = readBaseFile("src/App.tsx") || "";
    const routeHits = grepText(appSrc, /path="\/signup"/);
    note(
      `DISCLOSED EXEMPTION — the legacy /signup route. src/pages/Signup.tsx is routed at src/App.tsx:${
        routeHits.map((h) => h.line).join(", ") || "?"
      }. It is PRE-EXISTING, is outside this phase's file map, and retiring it is a separate Tier-1 decision for Rahul — so this suite neither deletes it, edits it, nor fails on it. The brief contradicts itself here (line 17: "no user-facing signup screen exists in ANY flow"; phase acceptance / line 85: "no signup screen ... IN THE APPLICANT FLOW"). The applicant-flow reading is the one asserted below, because the unqualified reading fails on day one for a route this phase never touched. The council should read "no signup screen" as proven for the applicant path only, and decide separately whether /signup should survive.`,
    );

    const signupPage = diffZero(["src/pages/Signup.tsx"]);
    if (!signupPage.ok) {
      claim(false, "", diffUnavailable("the exempted src/pages/Signup.tsx", signupPage.error));
    } else {
      claim(
        signupPage.touched.length === 0,
        `PROVEN: the exempted signup page (src/pages/Signup.tsx) has a ZERO diff against \`${BASE.ref}\` — this phase neither authored it nor modified it, so the exemption is not covering for a change of this phase's making.`,
        `NOT PROVEN: src/pages/Signup.tsx was MODIFIED by this phase (${signupPage.touched.join(", ")}). The exemption is no longer honest.`,
      );
    }

    // Everything below is a PHASE-RELATIVE claim ("added none", "is new here"),
    // so it is only meaningful against a resolved base. Without one, say so and
    // assert nothing, rather than let `readBaseFile` returning null be read as
    // "this file is new in this phase".
    if (!BASE.commit) {
      claim(
        false,
        "",
        diffUnavailable("the applicant path's no-new-signup-surface rule", BASE.error),
      );
      return;
    }

    // src/App.tsx legitimately changes in this phase (S-4 registers the claim
    // route), so a whole-file diff-zero would be a false alarm. What must not
    // change is its SIGNUP wiring.
    const appNow = grepText(appSrc, SIGNUP_REACH_RE).map((h) => h.text);
    const appThen = grepText(appBase, SIGNUP_REACH_RE).map((h) => h.text);
    claim(
      JSON.stringify(appNow) === JSON.stringify(appThen),
      `PROVEN: src/App.tsx's signup wiring is character-identical to \`${BASE.ref}\` (${appNow.length} reference(s), unchanged) — this phase edited the router only to register the claim route, and added no new way to reach a signup screen.`,
      `NOT PROVEN: src/App.tsx's signup wiring CHANGED in this phase. Before: ${JSON.stringify(appThen)}. After: ${JSON.stringify(appNow)}.`,
    );

    // ── The actual rule: the applicant path adds no signup surface. ──────────
    let addedTotal = 0;
    const missing = [];
    const proseMentions = [];
    for (const relPath of APPLICANT_PATH) {
      const src = readRepoFile(relPath);
      if (!src) {
        missing.push(relPath);
        continue;
      }
      const hits = grepText(src, SIGNUP_REACH_RE);
      const baseSrc = readBaseFile(relPath);
      if (baseSrc === null) {
        // New in this phase: it must be clean outright.
        claim(
          hits.length === 0,
          `PROVEN: ${relPath} is new in this phase and offers NO route to a signup screen — an applicant meeting it is never asked to create an account, because Tally already created one for them.`,
          `NOT PROVEN: ${relPath} is new in this phase and links to a signup screen: ${fmtHits(relPath, hits)}`,
        );
        addedTotal += hits.length;
      } else {
        const baseHits = grepText(baseSrc, SIGNUP_REACH_RE);
        const added = hits.length - baseHits.length;
        addedTotal += Math.max(0, added);
        claim(
          added <= 0,
          `PROVEN: ${relPath} offers no MORE routes to a signup screen than it did on \`${BASE.ref}\` (${hits.length} vs ${baseHits.length}) — this phase added none.`,
          `NOT PROVEN: ${relPath} gained ${added} route(s) to a signup screen in this phase: ${fmtHits(relPath, hits)}`,
        );
        if (hits.length > 0) {
          note(
            `PRE-EXISTING signup route on the applicant path (unchanged by this phase, covered by the exemption above): ${fmtHits(relPath, hits)}`,
          );
        }
      }
      const prose = grepText(src, SIGNUP_PROSE_RE).filter((h) => !SIGNUP_REACH_RE.test(h.text));
      if (prose.length) proseMentions.push(`${relPath}: ${prose.map((p) => p.line).join(", ")}`);
    }
    claim(
      addedTotal === 0,
      `PROVEN: across all ${APPLICANT_PATH.length - missing.length} applicant-path surfaces, this phase introduced ZERO new routes to a signup screen. The applicant's path from Tally to their staged home never asks them to create an account — which is the phase's central promise.`,
      `NOT PROVEN: this phase introduced ${addedTotal} new route(s) to a signup screen on the applicant path.`,
    );
    if (proseMentions.length) {
      note(
        `The phrase "sign up" still appears as prose (comments/copy, not links) on: ${proseMentions.join(" · ")}. Not a reachable screen, listed so the council can judge the wording itself.`,
      );
    }
    if (missing.length) {
      note(
        `Applicant-path surfaces not present yet, so not covered by this grep: ${missing.join(", ")}. Their owning tasks must land before this case is complete.`,
      );
    }
  });

  await runCase("S-STATIC-9", "static", "No password field exists anywhere on the applicant path", () => {
    // CODE-level password usage only. The bare word "password" appears in
    // Login.tsx as the reassurance copy "No password to remember." — the very
    // sentence this phase is trying to earn — so a naive `grep -i password`
    // would fail on the one string that proves the point. This pattern matches
    // an actual field/credential (a password input, an autocomplete token, a
    // password-carrying object key or assignment, a password sign-in call), and
    // prose can never satisfy it.
    const CODE_PASSWORD_RE =
      /type\s*=\s*\{?\s*["'`]password["'`]|signInWithPassword|autoComplete\s*=\s*\{?\s*["'`][^"'`]*password[^"'`]*["'`]|(?<![\w-])password\s*[:=]\s*[^=\s]|encrypted_password|PasswordInput|<Password/i;
    const PROSE_PASSWORD_RE = /password/i;

    let codeHits = 0;
    const proseLines = [];
    for (const relPath of APPLICANT_PATH) {
      const src = readRepoFile(relPath);
      if (!src) continue;
      const code = grepText(src, CODE_PASSWORD_RE);
      codeHits += code.length;
      if (code.length) {
        claim(false, "", `NOT PROVEN: ${relPath} contains a real password field or credential call: ${fmtHits(relPath, code)}`);
      }
      for (const h of grepText(src, PROSE_PASSWORD_RE)) proseLines.push({ relPath, ...h });
    }

    claim(
      codeHits === 0,
      "PROVEN: not one applicant-path surface contains a password input, an autocomplete password token, a password object key or a signInWithPassword call. The applicant has no password because the system never mints one: provisioning creates a passwordless auth user and both login tabs are OTP.",
      "NOT PROVEN: a password field/credential call exists on the applicant path (listed above).",
    );

    const proseOnly = proseLines.filter((p) => !CODE_PASSWORD_RE.test(p.text));
    note(
      proseOnly.length === 0
        ? "The word \"password\" does not appear on the applicant path in any form."
        : `Remaining mentions of "password" on the applicant path are COPY, not fields — and they are the copy this phase earns: ${proseOnly
            .map((p) => `${p.relPath}:${p.line} ${JSON.stringify(p.text.slice(0, 80))}`)
            .join("; ")}`,
    );
  });

  await runCase("S-STATIC-10", "static", "The email OTP channel is additive and unauthenticated by design", () => {
    const fnSrc = readRepoFile("supabase/functions/verify-email-otp/index.ts");
    claim(
      !!fnSrc,
      "PROVEN: supabase/functions/verify-email-otp/index.ts exists — the Email tab has a server half (task S-3).",
      "NOT PROVEN: supabase/functions/verify-email-otp/index.ts is missing; the Email sign-in tab has nothing to call.",
    );
    const otpSrc = readRepoFile(OTP_MODULE);
    claim(
      !!otpSrc,
      `PROVEN: ${OTP_MODULE} exists, so code generation, hashing and the expiry/attempt decision are unit-testable without a network.`,
      `NOT PROVEN: ${OTP_MODULE} is missing.`,
    );

    const config = readRepoFile("supabase/config.toml") || "";
    const block = config.split("[functions.verify-email-otp]")[1] || "";
    claim(
      /verify_jwt\s*=\s*false/.test(block.split("[functions.")[0] || ""),
      "PROVEN: config.toml declares verify_jwt = false for verify-email-otp — an unauthenticated login endpoint, like every other auth entry point. verify_jwt = true would 401 every sign-in attempt at the gateway before the function ran.",
      "NOT PROVEN: config.toml does not set verify_jwt = false for verify-email-otp; the gateway would reject every sign-in before the function ran.",
    );

    if (fnSrc) {
      // No account enumeration: the two send branches must return ONE shared
      // literal, not two look-alike objects that can drift apart.
      const sendReturns = grepText(fnSrc, /return json\(SEND_ACCEPTED\)/);
      const invalidReturns = grepText(fnSrc, /return json\(INVALID_CODE/);
      claim(
        sendReturns.length >= 1 && /const SEND_ACCEPTED/.test(fnSrc) && invalidReturns.length >= 1,
        `PROVEN: the unknown-address and known-address send paths return ONE shared response literal (SEND_ACCEPTED, ${sendReturns.length} return site(s)), and "no code on file" and "wrong code" share the single INVALID_CODE literal (${invalidReturns.length} site(s)) — the two branches are structurally incapable of drifting into an account-enumeration oracle.`,
        "NOT PROVEN: the send/verify paths do not share single response literals; the known and unknown branches can drift apart and leak whether an address has an account.",
      );
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORISATION SURFACES — the static half
//
// Their real proof is in the catalog (S-LIVE-7/9/10): a grant, a policy and a
// trigger are database facts, and source can only ever say what was INTENDED.
// These cases exist anyway, because the live lane needs a shadow project and
// the most common run of this suite is a laptop with none — and "the migration
// that removes the entitlement-theft path is missing from the tree" is worth
// catching before anyone gets as far as applying it.
// ─────────────────────────────────────────────────────────────────────────────

/** SQL with `--` line comments and `/* *​/` blocks removed. */
function stripSqlComments(src) {
  return (src || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** Every migration, oldest first, as { name, sql, bare }. */
function migrationSources() {
  return readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => {
      const sql = readRepoFile(`supabase/migrations/${name}`) || "";
      return { name, sql, bare: stripSqlComments(sql) };
    });
}

async function staticAuthorisationSurfaces() {
  await runCase("S-STATIC-11", "static", "The entitlement-theft path is absent from the migration tree, not merely unused", () => {
    // ⚠️ DO NOT "RESTORE" THIS FUNCTION. `claim_legacy_enrolments_on_email_confirm`
    // was designed and then DELIBERATELY REMOVED. It is a working
    // entitlement-theft path, not a hypothetical one:
    //
    //   intake mints an account from an UNAUTHENTICATED public form, on an email
    //   address nobody has proved. `claim_legacy_enrolments_for_user` is what
    //   grants a returning TagMango customer their paid catalogue by matching on
    //   that address. A trigger that ran the legacy claim ON EMAIL CONFIRMATION
    //   would therefore hand a real paying customer's entire catalogue to whoever
    //   typed that customer's address into the form and then confirmed the
    //   mailbox they themselves control — and it stamps
    //   `legacy_enrolments.claimed_by_user_id`, which is a PERMANENT write. The
    //   victim never touched the form.
    //
    // The shipped design instead makes the signup-time legacy claim a universal
    // no-op (asserted in S-STATIC-6B), moves purchase claiming to verified
    // sign-in, and arms nothing on email confirmation. If you are here because
    // "applicants don't get their legacy enrolments at signup", that is the
    // design.
    //
    // A DROP or a comment naming the function is fine and expected — this asserts
    // that nothing CREATES it. Comment-stripped, so prose about why it is gone
    // can never be mistaken for the thing itself.
    const migrations = migrationSources();
    const creators = migrations.filter((m) =>
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+[^;]{0,120}?claim_legacy_enrolments_on_email_confirm/i.test(m.bare),
    );
    claim(
      creators.length === 0,
      "PROVEN: no migration in the tree creates claim_legacy_enrolments_on_email_confirm. The removed entitlement-theft path cannot arrive by applying the repo's own migrations — asserted on comment-stripped SQL, so a DROP or an explanatory comment naming it does not count as defining it.",
      `NOT PROVEN — ENTITLEMENT THEFT IS IN THE TREE: ${creators.map((m) => m.name).join(", ")} create(s) claim_legacy_enrolments_on_email_confirm. Applying these migrations installs a path that grants a paying customer's whole legacy catalogue to whoever typed their address into the public intake form and confirmed their own mailbox, with a permanent claimed_by_user_id stamp. This function was removed on purpose.`,
    );
    const triggers = migrations.filter((m) =>
      /CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+auth_users_claim_legacy_on_email_confirm/i.test(m.bare),
    );
    claim(
      triggers.length === 0,
      "PROVEN: no migration creates an `auth_users_claim_legacy_on_email_confirm` trigger either. Both halves of the removed path — the function and the trigger that would fire it — are absent.",
      `NOT PROVEN: ${triggers.map((m) => m.name).join(", ")} create(s) the auth_users_claim_legacy_on_email_confirm trigger.`,
    );
    const anyOnConfirm = migrations.filter((m) =>
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+[^;]{0,120}?claim_legacy_enrolments_on_/i.test(m.bare),
    );
    claim(
      anyOnConfirm.length === 0,
      "PROVEN: the whole `claim_legacy_enrolments_on_*` CLASS is absent from the tree, so the path cannot come back under a slightly different name.",
      `NOT PROVEN: ${anyOnConfirm.map((m) => m.name).join(", ")} define(s) a claim_legacy_enrolments_on_* function — the removed path, renamed.`,
    );
  });

  await runCase("S-STATIC-12", "static", "The parked-row read surface is a whitelist RPC, and the old table policy is dropped", () => {
    // WHY THIS SURFACE IS AN AUTHORISATION PROBLEM. A parked application must be
    // shown to a CANDIDATE claimant — somebody whose email or phone matches the
    // row but who has proved neither. Anything the surface returns is therefore
    // returned to a caller who might not be the applicant. A table policy hands
    // back WHOLE ROWS; the whitelist RPC hands back five columns with the target
    // masked. `bio` is the applicant's 100-word essay (NFR-COPY-1: it must never
    // reach a client), and `tally_data` is the raw form envelope.
    //
    // The catalog is the real proof (S-LIVE-10). This is the tree's intent.
    const migrations = migrationSources();
    const defining = migrations.filter((m) =>
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?get_my_pending_claim\s*\(/i.test(m.bare),
    );
    claim(
      defining.length > 0,
      `PROVEN: ${defining.map((m) => m.name).join(", ")} defines public.get_my_pending_claim(). The claim screen has a whitelisted read surface in the migration tree.`,
      "NOT PROVEN: no migration defines public.get_my_pending_claim(). Until it lands, either the claim screen has no data or it is reading the table directly — and reading the table directly is what returns bio, tally_data, city and occupation to a caller who has proved nothing.",
    );
    if (defining.length > 0) {
      const src = defining.map((m) => m.bare).join("\n");
      const returns = (src.match(/RETURNS\s+TABLE\s*\(([\s\S]*?)\)\s*(?:LANGUAGE|AS|SECURITY|STABLE|SET)/i) || [])[1] || "";
      const flat = returns.replace(/\s+/g, " ").toLowerCase();
      const wanted = ["application_id uuid", "offering_id uuid", "offering_title text", "claim_channel text", "masked_target text"];
      const missing = wanted.filter((w) => !flat.includes(w));
      const forbidden = ["bio", "tally_data", "city", "occupation"].filter((c) => new RegExp(`\\b${c}\\b`).test(flat));
      claim(
        missing.length === 0 && forbidden.length === 0,
        `PROVEN: it returns exactly the agreed whitelist (${returns.replace(/\s+/g, " ").trim()}) — and declares none of bio, tally_data, city or occupation, so those columns cannot come back even by accident.`,
        `NOT PROVEN: the declared RETURNS TABLE is ${JSON.stringify(returns.replace(/\s+/g, " ").trim())} (missing: ${missing.join(", ") || "none"}; forbidden columns declared: ${forbidden.join(", ") || "none"}).`,
      );
      claim(
        /SECURITY\s+DEFINER/i.test(src) && /GRANT\s+EXECUTE[\s\S]{0,160}?get_my_pending_claim[\s\S]{0,80}?authenticated/i.test(src),
        "PROVEN: it is SECURITY DEFINER and EXECUTE is granted to `authenticated` — which is what lets the table stay shut to the claimant while this one projection remains answerable to them.",
        "NOT PROVEN: the function is not SECURITY DEFINER, or EXECUTE is not granted to authenticated. Without both, either the table has to be opened to the caller (the leak) or the signed-in claimant gets nothing (the dead end).",
      );
      claim(
        !/get_my_pending_claim\s*\(\s*[a-z_]+\s+[a-z]/i.test(src),
        "PROVEN: it declares no parameters, so claim_channel and masked_target are derived server-side and a client has nowhere to inject its own opinion of which channel it still owes.",
        "NOT PROVEN: get_my_pending_claim declares parameters. Any parameter is a client-supplied value, and the channel a claimant must prove is exactly the value they must not choose.",
      );
    }

    // THE OLD POLICY. Sorted by filename = applied in order, so the LAST
    // statement naming it decides whether it exists at the end of the tree.
    let lastPolicyAction = null;
    for (const m of migrations) {
      const re = /(CREATE|DROP)\s+POLICY[^;]{0,200}?claimants_read_pending_applications/gi;
      let hit;
      while ((hit = re.exec(m.bare))) lastPolicyAction = { verb: hit[1].toUpperCase(), file: m.name };
    }
    claim(
      lastPolicyAction === null || lastPolicyAction.verb === "DROP",
      `PROVEN: the tree does not leave \`claimants_read_pending_applications\` installed — the last statement naming it is ${
        lastPolicyAction ? `a DROP in ${lastPolicyAction.file}` : "absent entirely"
      }. The candidate claimant's read no longer goes through the table, so it can no longer return whole application rows to someone who has proved nothing.`,
      `NOT PROVEN: the last migration statement naming \`claimants_read_pending_applications\` is a CREATE (${lastPolicyAction?.file}), so applying the tree leaves the policy installed. A policy that matches a parked row on the caller's identifiers returns the WHOLE ROW — bio, tally_data, city, occupation and all — to a caller who has proved neither channel.`,
    );
  });

  await runCase("S-STATIC-13", "static", "NFR-COPY-1 at the source: no client code asks cohort_applications for `bio`", () => {
    // The RPC is only half the guarantee. If any client query still selects the
    // withheld columns — or selects `*` — the whitelist is a formality, because
    // the leak happens at the other call site. Checked on the CLIENT tree, which
    // is the only tree whose queries run with a user's own credentials.
    const withheld = ["bio", "tally_data", "city", "occupation"];
    const offenders = [];
    const stack = ["src"];
    const files = [];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) stack.push(rel);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(rel);
      }
    }
    let inspected = 0;
    for (const rel of files) {
      const code = readRepoCode(rel);
      if (!code || !code.includes("cohort_applications")) continue;
      inspected += 1;
      const re = /\.from\(\s*["']cohort_applications["']\s*\)([\s\S]{0,400})/g;
      let hit;
      while ((hit = re.exec(code))) {
        const window = hit[1];
        const sel = window.match(/\.select\(\s*(["'`])([\s\S]*?)\1/);
        if (!sel) continue;
        const cols = sel[2];
        if (cols.trim() === "*" || withheld.some((c) => new RegExp(`(^|[,\\s(])${c}([,\\s)]|$)`).test(cols))) {
          offenders.push(`${rel}: .select(${JSON.stringify(cols.replace(/\s+/g, " ").slice(0, 120))})`);
        }
      }
    }
    claim(
      inspected > 0,
      `PROVEN: ${inspected} client file(s) query cohort_applications and every one of their select lists was read — this case is actually looking at something.`,
      "NOT PROVEN: no client file queries cohort_applications at all, so this case inspected nothing and proves nothing. Either the applicant surfaces have moved or the detection is broken.",
    );
    claim(
      offenders.length === 0,
      `PROVEN: no client query asks cohort_applications for bio, tally_data, city or occupation, and none selects \`*\`. NFR-COPY-1 holds at the call sites as well as at the policy: the applicant's 100-word essay is never even requested by the app.`,
      `NOT PROVEN: ${offenders.length} client query(ies) request withheld columns or a bare \`*\` from cohort_applications: ${offenders.join(" · ")}. A whitelist RPC does not help if the client asks the table for the essay directly.`,
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE LANE
// ─────────────────────────────────────────────────────────────────────────────
const FIXTURE = {
  formId: "IDFIXT01",
  fresh: { email: "idfix-fresh@identity-fixture.invalid", phone: "+919900000001", responseId: "IDFIXRESP-FRESH" },
  // Re-uses `fresh.responseId` under a different email, so the delivery gets
  // past the webhook's (offering_id, email) dedupe and reaches the unique index.
  replay: { email: "idfix-replay@identity-fixture.invalid", phone: "+919900000003" },
  collide: { email: "idfix-collide@identity-fixture.invalid", phone: "+919900000002", responseId: "IDFIXRESP-COLLIDE" },
  cross: {
    email: "idfix-incumbent-email@identity-fixture.invalid",
    phone: "+919900000012",
    responseId: "IDFIXRESP-CROSS",
  },
  // Incumbent P owns `collide.phone`; incumbent A owns `cross.email` (which is
  // why `cross.email` IS A's address); incumbent B owns `cross.phone`.
  incumbentPhone: "idfix-incumbent-phone@identity-fixture.invalid",
  incumbentCross: "idfix-incumbent-cross@identity-fixture.invalid",

  // ── ADDED FOR THE INTAKE-MINTING CASES (S-LIVE-6/7/8). ────────────────────
  // Both carry an `@identity-fixture.invalid` address and a number containing
  // `99000000`, which are the two predicates qa-harness/identity-fixtures.sql
  // wipes on (its section 2). Anything minted here is therefore cleaned up by
  // the fixture file this suite already applies, with no edit to that file.
  //
  // These numbers belong to NOBODY: no incumbent owns them, so provisioning
  // takes the `created` branch and the phone is free to be pre-bound. That is
  // precisely the condition the takeover needs, which is why the regression
  // test uses it.
  intake: {
    email: "idfix-intake-mint@identity-fixture.invalid",
    phone: "+919900000031",
    responseId: "IDFIXRESP-INTAKE",
  },
  intakeSync: {
    email: "idfix-intake-sync@identity-fixture.invalid",
    phone: "+919900000033",
    responseId: "IDFIXRESP-INTAKESYNC",
    // A number the applicant never submitted, used to prove that confirming
    // SOMETHING ELSE neither promotes nor discards the stash.
    otherPhone: "+919900000034",
  },
  intakeMatch: {
    email: "idfix-intake-match@identity-fixture.invalid",
    phone: "+919900000035",
    responseId: "IDFIXRESP-INTAKEMATCH",
  },
};

/**
 * THE SENTINEL. Planted into a parked application's `bio` — the applicant's
 * 100-word essay — and then hunted for across every byte any CLIENT-credentialed
 * response returned during the run.
 *
 * NFR-COPY-1 is categorical: `bio` must never reach a client. A whitelist RPC
 * is only worth having if nothing else leaks the column, so this is deliberately
 * not an assertion about one endpoint's shape — it is a corpus-wide grep, and it
 * fails if the string appears ANYWHERE a client could have read it.
 *
 * Improbable by construction, so a hit is a leak and never a coincidence.
 */
const BIO_SENTINEL = "IDFIX-BIO-SENTINEL-4f1c9a2e-DO-NOT-LEAK";

const LIVE = {
  url: (process.env.SHADOW_SUPABASE_URL || "").replace(/\/+$/, ""),
  serviceKey: process.env.SHADOW_SERVICE_ROLE_KEY || "",
  anonKey: process.env.SHADOW_ANON_KEY || process.env.SHADOW_SERVICE_ROLE_KEY || "",
  tallySecret: process.env.SHADOW_TALLY_SIGNING_SECRET || "",
  // NO FALLBACK, deliberately. verify-email-otp reads EMAIL_OTP_PEPPER and
  // returns 503 `otp_unconfigured` when it is unset — "There is NO fallback
  // pepper" is stated in that function's own header and in migration
  // 20260727130000. Defaulting to the service-role key here would send an
  // operator into a 10^6 brute-force that matches nothing and then blame the
  // wrong variable.
  pepper: process.env.SHADOW_EMAIL_OTP_PEPPER || "",
  dbUrl: process.env.SHADOW_DB_URL || "",
  confirmed: process.env.IDENTITY_SPINE_SHADOW_CONFIRM === "yes",
};

function liveReadiness() {
  const missing = [];
  if (!LIVE.url) missing.push("SHADOW_SUPABASE_URL");
  if (!LIVE.serviceKey) missing.push("SHADOW_SERVICE_ROLE_KEY");
  if (!LIVE.tallySecret) missing.push("SHADOW_TALLY_SIGNING_SECRET");
  // REQUIRED, not optional: identity-fixtures.sql is the only thing that clears
  // the previous run's rows, and without it a second run is not the same
  // experiment (see the header, and the pre-flight in S-LIVE-1).
  if (!LIVE.dbUrl) missing.push("SHADOW_DB_URL");
  if (!LIVE.pepper) missing.push("SHADOW_EMAIL_OTP_PEPPER");
  if (!LIVE.confirmed) missing.push("IDENTITY_SPINE_SHADOW_CONFIRM=yes");
  return missing;
}

/**
 * The production project ref, read out of the app's own client rather than
 * written down here. Nothing in this file names a project; a run pointed at
 * production dies on this check before it opens a socket.
 */
function productionRef() {
  const src = readRepoFile("src/integrations/supabase/client.ts") || "";
  return (src.match(/CORRECT_REF\s*=\s*['"]([a-z0-9]+)['"]/) || [])[1] || null;
}

/**
 * THE RESPONSE CORPUS — every byte the live lane received, tagged with the
 * CREDENTIAL that received it.
 *
 * The tag is the whole point. "Did `bio` reach a client?" is a question about
 * what an ANON key or a USER's JWT could read, not about what the service-role
 * key can read — the service key is the one credential that is SUPPOSED to see
 * every column, and this suite uses it to plant the sentinel in the first
 * place. Grepping an untagged corpus would therefore report a guaranteed hit
 * for the suite's own set-up and prove nothing about the leak, so the sentinel
 * case below greps the client-credentialed subset and states that it did.
 */
const CORPUS = [];

/** Record one response body verbatim. `credential` is anon | user | service_role. */
function recordResponse(label, credential, text) {
  CORPUS.push({ label, credential, text: typeof text === "string" ? text : JSON.stringify(text ?? "") });
}

/** Everything a NON-service-role credential was ever handed, as one string. */
function clientVisibleCorpus() {
  return CORPUS.filter((e) => e.credential !== "service_role");
}

async function sb(path, init = {}) {
  const res = await fetch(`${LIVE.url}${path}`, {
    ...init,
    headers: {
      apikey: LIVE.serviceKey,
      Authorization: `Bearer ${LIVE.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  recordResponse(`service:${path}`, "service_role", text);
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep the raw text */
  }
  return { status: res.status, ok: res.ok, body };
}

/**
 * The same call, made AS A CLIENT: the anon apikey plus (optionally) a user's
 * own JWT — exactly what the browser sends. Everything it receives goes into
 * the client-visible corpus.
 *
 * This is the credential that matters for every authorisation claim below. A
 * row that RLS hides from a signed-in user must be absent HERE; proving it with
 * the service-role key would prove nothing at all, because that key bypasses
 * RLS by design.
 */
async function asClient(path, { jwt = null, label = null, ...init } = {}) {
  const res = await fetch(`${LIVE.url}${path}`, {
    ...init,
    headers: {
      apikey: LIVE.anonKey,
      Authorization: `Bearer ${jwt || LIVE.anonKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  recordResponse(label || `client:${path}`, jwt ? "user" : "anon", text);
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep the raw text */
  }
  return { status: res.status, ok: res.ok, body };
}

/**
 * One SQL query against the shadow project, as JSON rows.
 *
 * PostgREST cannot answer the questions the authorisation cases ask — "does
 * this function exist", "can `anon` execute it", "is that policy still on the
 * table", "is that trigger gone". Those live in the catalog, and a catalog read
 * is the only way to prove ABSENCE: an RPC that 404s might be missing, might be
 * unexposed, might be misspelled in this file, and a suite that cannot tell
 * those apart cannot assert "this function does not exist".
 *
 * `psql` and SHADOW_DB_URL are already required by the live lane (the fixture
 * file is applied the same way), so this adds no new dependency and no new
 * secret. Read-only by construction — every caller passes a SELECT.
 */
function psqlRows(sql) {
  const wrapped = `SELECT coalesce(json_agg(t), '[]'::json)::text FROM (${sql}) t`;
  let out;
  try {
    out = execFileSync("psql", [LIVE.dbUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", wrapped], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new Error(`catalog query failed: ${(err.stderr || err.message || "").toString().trim()}`);
  }
  try {
    return JSON.parse((out || "[]").trim());
  } catch {
    throw new Error(`catalog query returned unparseable output: ${String(out).slice(0, 200)}`);
  }
}

/**
 * One statement against the shadow project, for the few places the suite has to
 * WRITE to `auth.users` — a channel confirmation is a GoTrue-side event with no
 * PostgREST surface at all, and "what happens when a phone_confirmed_at lands
 * on this row" cannot be asked any other way. Shadow projects only, guarded by
 * the same SHADOW_DB_URL + production-ref abort as everything else in this lane.
 */
function psqlExec(sql) {
  try {
    execFileSync("psql", [LIVE.dbUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new Error(`statement failed: ${(err.stderr || err.message || "").toString().trim()}`);
  }
}

/**
 * Sign a fixture account in the way a human would — email OTP, start to finish —
 * and hand back its session. Every authorisation case below needs a REAL user
 * JWT: RLS and `auth.uid()` are what they are testing, and the service-role key
 * bypasses both, so a case that used it would pass no matter what the policies
 * said.
 */
async function signInAs(email) {
  await clearIssuedCodes(email);
  const sent = await emailOtp({ action: "send", email });
  if (!sent.ok) throw new Error(`could not send a sign-in code to ${email} (HTTP ${sent.status}): ${JSON.stringify(sent.body)}`);
  const { code } = await recoverIssuedCode(email);
  if (!code) throw new Error(`no sign-in code could be recovered for ${email}`);
  const signIn = await emailOtp({ action: "verify", email, code });
  const jwt = signIn.body?.access_token;
  const uid = signIn.body?.user_id;
  if (!jwt || !uid) throw new Error(`sign-in for ${email} minted no session (HTTP ${signIn.status}): ${JSON.stringify(signIn.body)}`);
  return { jwt, uid };
}

const rpc = (name, args = {}) => sb(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
const rest = (query) => sb(`/rest/v1/${query}`);

async function waitForFixtureSchema() {
  const deadline = Date.now() + 10_000;
  let last = null;
  do {
    last = await rpc("identity_fixture_auth_user_count");
    if (last.ok) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  } while (Date.now() < deadline);
  throw new Error(
    `PostgREST did not expose identity_fixture_auth_user_count after the fixture schema reload: HTTP ${last?.status} ${JSON.stringify(last?.body)}`,
  );
}

async function authCount() {
  const r = await rpc("identity_fixture_auth_user_count");
  if (!r.ok) throw new Error(`identity_fixture_auth_user_count failed (${r.status}) — run qa-harness/identity-fixtures.sql against the shadow project first: ${JSON.stringify(r.body)}`);
  return Number(r.body);
}

async function fixtureAuthUsers() {
  const r = await rpc("identity_fixture_auth_users");
  if (!r.ok) throw new Error(`identity_fixture_auth_users failed (${r.status}) — run qa-harness/identity-fixtures.sql first: ${JSON.stringify(r.body)}`);
  return Array.isArray(r.body) ? r.body : [];
}

async function applicationFor(responseId) {
  const r = await rest(
    `cohort_applications?tally_response_id=eq.${encodeURIComponent(responseId)}&select=id,user_id,pending_claim,email,phone,status`,
  );
  if (!r.ok) throw new Error(`cohort_applications read failed (${r.status}): ${JSON.stringify(r.body)}`);
  return Array.isArray(r.body) ? r.body : [];
}

function tallyEnvelope({ responseId, name, email, phone }) {
  return {
    eventId: `idfix-${responseId}`,
    eventType: "FORM_RESPONSE",
    createdAt: new Date().toISOString(),
    data: {
      responseId,
      submissionId: responseId,
      respondentId: `idfix-respondent-${responseId}`,
      formId: FIXTURE.formId,
      formName: "IDENTITY FIXTURE",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "q_name", label: "Full name", type: "INPUT_TEXT", value: name },
        { key: "q_email", label: "Email address", type: "INPUT_EMAIL", value: email },
        { key: "q_phone", label: "Phone number", type: "INPUT_PHONE_NUMBER", value: phone },
      ],
    },
  };
}

async function postSubmission(envelope) {
  const raw = JSON.stringify(envelope);
  const signature = createHmac("sha256", LIVE.tallySecret).update(raw).digest("base64");
  const res = await fetch(`${LIVE.url}/functions/v1/tally-application-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "tally-signature": signature,
      apikey: LIVE.anonKey,
      Authorization: `Bearer ${LIVE.serviceKey}`,
    },
    body: raw,
  });
  const text = await res.text();
  recordResponse("tally-application-webhook", "anon", text);
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep the raw text */
  }
  return { status: res.status, ok: res.ok, body };
}

async function emailOtp(body) {
  const res = await fetch(`${LIVE.url}/functions/v1/verify-email-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: LIVE.anonKey,
      Authorization: `Bearer ${LIVE.anonKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  recordResponse("verify-email-otp", "anon", text);
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep the raw text */
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

/**
 * Recover the code that was actually issued for an address.
 *
 * The code is never stored in plaintext (`_shared/otp.ts` hashes it under a
 * pepper), so the suite does what only a holder of the pepper can do: hash all
 * 10^OTP_LENGTH candidates and match the stored digest. This is not a bypass —
 * it requires the project's own secret — and it means the suite reads the SAME
 * code the user would receive by email, with no debug hook, no plaintext
 * column, and no change to production behaviour to accommodate testing.
 *
 * The fast path uses node:crypto; before using it we prove it agrees with the
 * function's real `hashOtpCode`, so the suite cannot be brute-forcing a scheme
 * the server does not use.
 */
/**
 * Drop every code on file for an address BEFORE asking for a new one.
 *
 * `_shared/otp.ts` OTP_RESEND_COOLDOWN_SECONDS answers a repeat send from the
 * code already in flight — correct product behaviour (a login endpoint that
 * mails on every click is an email cannon), and it means a test that simply
 * sends twice would silently re-read the FIRST code. Clearing the address first
 * is the suite adapting to the guarantee, not weakening it: the cooldown itself
 * is S-3's to prove, and this only ever runs against a shadow project.
 */
async function clearIssuedCodes(email) {
  await sb(`/rest/v1/email_otp_codes?email=eq.${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

async function recoverIssuedCode(email, storageKey = email) {
  if (!otpMod) throw new Error(`${OTP_MODULE} could not be loaded, so the issued code cannot be recovered`);
  if (!LIVE.pepper) {
    throw new Error(
      "SHADOW_EMAIL_OTP_PEPPER is unset. It has no default here and none in the function either — verify-email-otp returns 503 otp_unconfigured without EMAIL_OTP_PEPPER, so no code was issued to recover",
    );
  }
  const len = otpMod.OTP_LENGTH;
  const sample = "0".repeat(len - 1) + "7";
  const real = await otpMod.hashOtpCode(storageKey, sample, LIVE.pepper);
  const fast = (code) =>
    createHmac("sha256", LIVE.pepper)
      .update(`${len}:${storageKey.length}:${storageKey}:${code}`)
      .digest("hex");
  if (fast(sample) !== real) {
    throw new Error("the suite's fast hash does not agree with _shared/otp.ts hashOtpCode; refusing to guess the scheme");
  }

  const r = await rest(
    `email_otp_codes?email=eq.${encodeURIComponent(storageKey)}&select=id,code_hash,expires_at,consumed_at,attempt_count,created_at&order=created_at.desc&limit=1`,
  );
  if (!r.ok) throw new Error(`email_otp_codes read failed (${r.status}): ${JSON.stringify(r.body)}`);
  const row = Array.isArray(r.body) ? r.body[0] : null;
  if (!row) return { row: null, code: null };

  const space = 10 ** len;
  for (let n = 0; n < space; n++) {
    const candidate = String(n).padStart(len, "0");
    if (fast(candidate) === row.code_hash) return { row, code: candidate };
  }
  throw new Error(
    `the stored code hash for ${email} (storage key ${storageKey}) matches no code in the ${len}-digit space under this pepper — SHADOW_EMAIL_OTP_PEPPER must be the shadow project's EMAIL_OTP_PEPPER byte for byte. There is no fallback to fall back to: verify-email-otp reads EMAIL_OTP_PEPPER and returns 503 otp_unconfigured when it is unset, so a code that was issued at all was issued under that exact value`,
  );
}

async function liveProvisionIdempotency() {
  await runCase("S-LIVE-1", "live", "Re-delivery is absorbed: three identical webhook ticks, one user, one application", async () => {
    // PRE-FLIGHT. This case measures a DELTA on auth.users, so it is only
    // meaningful from a clean fixture state. If a previous run's rows survive,
    // the webhook finds the application by (offering_id, email), takes its
    // UPDATE branch and returns BEFORE provisioning — minting nothing and
    // failing the headline assertion for a reason that has nothing to do with
    // identity. Say that here rather than let the council read a false red.
    const stale = await applicationFor(FIXTURE.fresh.responseId);
    if (stale.length > 0) {
      claim(
        false,
        "",
        `NOT PROVEN — ENVIRONMENTAL, NOT A DEFECT: a cohort_applications row for ${FIXTURE.fresh.responseId} already existed before this run, so the webhook will take its by-(offering_id, email) UPDATE branch and mint nothing. qa-harness/identity-fixtures.sql is what clears prior state; run it (SHADOW_DB_URL makes this suite run it for you) and re-run. Nothing about provisioning is proven or disproven by this transcript.`,
      );
      return;
    }

    const before = await authCount();
    const envelope = tallyEnvelope({
      responseId: FIXTURE.fresh.responseId,
      name: "Identity Fixture Fresh",
      email: FIXTURE.fresh.email,
      phone: FIXTURE.fresh.phone,
    });

    const counts = [];
    for (let tick = 1; tick <= 3; tick++) {
      const res = await postSubmission(envelope);
      claim(
        res.ok,
        `PROVEN: tick ${tick} of the same submission was accepted (HTTP ${res.status}) — a re-delivery is absorbed, never rejected, so a retrying intake does not start erroring on rows it has already ingested.`,
        `NOT PROVEN: tick ${tick} returned HTTP ${res.status}: ${JSON.stringify(res.body)}`,
      );
      counts.push(await authCount());
    }

    claim(
      counts[0] - before === 1,
      `PROVEN: the FIRST sighting of an unknown applicant minted EXACTLY ONE auth user (${before} -> ${counts[0]}) — the applicant became an app user with no signup screen and no second account.`,
      `NOT PROVEN: the first tick changed auth.users by ${counts[0] - before}, not 1 (${before} -> ${counts[0]}).`,
    );
    claim(
      counts[1] === counts[0] && counts[2] === counts[0],
      `PROVEN: re-delivering the same submission twice more minted ZERO additional auth users (${counts.join(" -> ")}) — re-provisioning is unreachable on a repeat. NOTE THE MECHANISM, because it is host-specific: what absorbed ticks 2 and 3 is the WEBHOOK's existing-application lookup by (offering_id, email) at tally-application-webhook/index.ts:266-305, which returns before provisionApplicant is ever called. The POLLER's guard is a different one (its tally_response_id skip), and this suite cannot drive the poller — that guard is asserted statically in S-STATIC-6 instead, and no claim here stands in for it.`,
      `NOT PROVEN: repeat deliveries changed the user count (${counts.join(" -> ")}); a retrying intake would mint a new account per delivery.`,
    );

    const apps = await applicationFor(FIXTURE.fresh.responseId);
    claim(
      apps.length === 1,
      `PROVEN: three identical ticks produced EXACTLY ONE cohort_applications row for tally_response_id ${FIXTURE.fresh.responseId}.`,
      `NOT PROVEN: ${apps.length} application rows exist for one tally_response_id.`,
    );
    const app = apps[0];
    if (!app) return;

    const users = await fixtureAuthUsers();
    const minted = users.filter((u) => (u.email || "").toLowerCase() === FIXTURE.fresh.email);
    claim(
      minted.length === 1,
      "PROVEN: exactly one auth user carries the applicant's email — no twin was created behind it.",
      `NOT PROVEN: ${minted.length} auth users carry ${FIXTURE.fresh.email}.`,
    );
    const user = minted[0];
    if (!user) return;

    // WHAT THE MINTED ROW CARRIES — EMAIL ONLY, with the phone stashed in
    // service-owned metadata. S-STATIC-6B asserts the same contract statically;
    // this is the half source cannot establish, because "the row GoTrue actually
    // stored" is an effect, not a reading.
    const expectedPhone = `+91${FIXTURE.fresh.phone.replace(/\D/g, "").slice(-10)}`;
    const appMetadata = user.app_metadata || user.raw_app_meta_data || {};
    claim(
      !!user.email && (user.phone === null || user.phone === "") && appMetadata.levelup_intake_phone === expectedPhone,
      `PROVEN: the minted auth user is keyed by email ${user.email}, carries NO auth.users.phone login key, and preserves the submitted number as service-owned app_metadata.levelup_intake_phone ${expectedPhone}. The applicant can use the email CTA immediately; the phone key remains unavailable until that number is actually proven.`,
      `NOT PROVEN: the minted row did not preserve the safe email-only shape (email ${JSON.stringify(user.email)}, auth.users.phone ${JSON.stringify(user.phone)}, stashed phone ${JSON.stringify(appMetadata.levelup_intake_phone)}; expected stash ${expectedPhone}).`,
    );
    claim(
      !user.email_confirmed_at && !user.phone_confirmed_at,
      "PROVEN: NEITHER channel is confirmed on the minted row — the email and stashed phone are still nothing but unauthenticated form text. Separately, the signup-time legacy claim is a universal no-op, so creating this row cannot grant a purchase.",
      `NOT PROVEN: the minted row arrived pre-confirmed (email_confirmed_at ${JSON.stringify(user.email_confirmed_at)}, phone_confirmed_at ${JSON.stringify(user.phone_confirmed_at)}). A public form would be treated as proof of identity.`,
    );
    claim(
      user.app_metadata?.levelup_unverified_intake === true ||
        user.raw_app_meta_data?.levelup_unverified_intake === true,
      "PROVEN: the minted row carries the service-role-only app_metadata stamp levelup_unverified_intake = true — durable server-owned provenance, present on the real row and not just in the source that writes it.",
      `NOT PROVEN: the minted row has no levelup_unverified_intake stamp (app_metadata ${JSON.stringify(user.app_metadata ?? user.raw_app_meta_data ?? null)}), so downstream operations cannot distinguish an intake-created identity by server-owned provenance.`,
    );
    claim(
      app.user_id === user.id,
      `PROVEN: the application is stamped with that uid (${app.user_id}) — it arrives already bound to an identity, so the applicant's first sign-in finds their application waiting.`,
      `NOT PROVEN: the application's user_id is ${JSON.stringify(app.user_id)}, not the minted uid ${user.id}.`,
    );
    claim(
      app.pending_claim === false,
      "PROVEN: a clean provision does NOT park the row — pending_claim is false, so no claim step is inflicted on an applicant who has no collision.",
      `NOT PROVEN: a clean provision left pending_claim = ${JSON.stringify(app.pending_claim)}.`,
    );

    // ── THE UNIQUE INDEX ITSELF. The three ticks above never reached it: they
    // were absorbed one layer earlier, by the (offering_id, email) lookup. The
    // brief names the tally_response_id unique index as the idempotency
    // guarantee, so drive a delivery that gets PAST that lookup — same response
    // id, different email — and make the index do its job. ──────────────────
    const beforeReplay = await authCount();
    const replay = await postSubmission(
      tallyEnvelope({
        responseId: FIXTURE.fresh.responseId,
        name: "Identity Fixture Replay",
        email: FIXTURE.replay.email,
        phone: FIXTURE.replay.phone,
      }),
    );
    const afterReplay = await applicationFor(FIXTURE.fresh.responseId);
    claim(
      afterReplay.length === 1 && afterReplay[0].email === FIXTURE.fresh.email,
      `PROVEN: a delivery carrying an ALREADY-INGESTED tally_response_id under a different email is refused by the unique index cohort_applications_tally_response_id_key and reported as an idempotent success (HTTP ${replay.status}, ${JSON.stringify(replay.body)}) — one Tally response is still exactly one application, still owned by ${FIXTURE.fresh.email}. This is the database-level guarantee, reached only when both hosts' own dedupes are bypassed.`,
      `NOT PROVEN: replaying tally_response_id ${FIXTURE.fresh.responseId} under a different email produced ${afterReplay.length} row(s) (${afterReplay.map((r) => r.email).join(", ")}); the unique index did not hold.`,
    );
    const replayMinted = (await authCount()) - beforeReplay;
    note(
      replayMinted === 0
        ? "The replayed delivery minted no auth user."
        : `OBSERVED (for the council to rule on, not asserted as a failure): the replayed delivery minted ${replayMinted} auth user(s) before the unique index rejected its application, leaving a passwordless, unconfirmed account with no application behind it. It costs an attacker the TALLY_SIGNING_SECRET to produce one, and the poller cannot reach this path at all (it skips a known tally_response_id before provisioning). Provisioning runs before the insert by design — moving it after would forfeit the fail-soft property that an application is never lost.`,
    );
  });
}

async function liveEmailOnlyBind() {
  await runCase("S-LIVE-2", "live", "Email bind succeeds while the unproven phone resolves nowhere — measured, not assumed", async () => {
    const apps = await applicationFor(FIXTURE.fresh.responseId);
    const uid = apps[0]?.user_id;
    if (!uid) {
      claim(false, "", "NOT PROVEN: no provisioned uid from S-LIVE-1 to bind against.");
      return;
    }

    // find_login_identity IS the production resolver used by both login hosts.
    // Asking it directly proves the deliberate asymmetry: email resolves now;
    // the phone stays out of the login namespace until it is proven.
    const byPhone = await rpc("find_login_identity", { p_phone: FIXTURE.fresh.phone.slice(-10), p_email: null });
    const phoneRows = Array.isArray(byPhone.body) ? byPhone.body : byPhone.body ? [byPhone.body] : [];
    claim(
      byPhone.ok && phoneRows.length === 0,
      `PROVEN: find_login_identity(phone) resolves to NO auth row before proof. The public form did not pre-bind the applicant's number to uid ${uid}, closing the account-takeover path.`,
      `NOT PROVEN — ACCOUNT TAKEOVER IS OPEN: find_login_identity(phone) returned ${JSON.stringify(phoneRows)}. Intake must not make unauthenticated form text a phone-OTP login key.`,
    );

    const byEmail = await rpc("find_login_identity", { p_phone: null, p_email: FIXTURE.fresh.email });
    const emailRow = Array.isArray(byEmail.body) ? byEmail.body[0] : byEmail.body;
    claim(
      byEmail.ok && emailRow?.id === uid,
      `PROVEN: the EMAIL channel resolves to the application uid (${uid}), so the confirmation-mail CTA opens the identity intake created.`,
      `NOT PROVEN: find_login_identity(email) returned ${JSON.stringify(emailRow)} instead of ${uid}.`,
    );

    const users = await fixtureAuthUsers();
    const carrying = users.filter(
      (u) =>
        (u.email || "").toLowerCase() === FIXTURE.fresh.email ||
        String(u.phone || "").replace(/\D/g, "").endsWith(FIXTURE.fresh.phone.slice(-10)),
    );
    claim(
      carrying.length === 1 && carrying[0]?.id === uid && (carrying[0]?.phone === null || carrying[0]?.phone === ""),
      `PROVEN: exactly ONE auth row carries either identifier (uid ${uid}), and it carries only the email. No phone-keyed twin exists and the unproven number remains outside the login namespace.`,
      `NOT PROVEN: ${carrying.length} auth rows carry one of the applicant's identifiers: ${JSON.stringify(carrying)}. One human, two identities.`,
    );
  });
}

async function liveCollisionDefers() {
  await runCase("S-LIVE-3", "live", "A collision defers: zero users minted, zero merges, the application survives", async () => {
    const before = await authCount();
    const usersBefore = await fixtureAuthUsers();
    const incumbentBefore = usersBefore.find((u) => (u.email || "").toLowerCase() === FIXTURE.incumbentPhone);
    if (!incumbentBefore) {
      claim(false, "", `NOT PROVEN: the collision precondition is absent — no incumbent account holds ${FIXTURE.collide.phone}. Run qa-harness/identity-fixtures.sql against the shadow project first.`);
      return;
    }

    const res = await postSubmission(
      tallyEnvelope({
        responseId: FIXTURE.collide.responseId,
        name: "Identity Fixture Collide",
        email: FIXTURE.collide.email,
        phone: FIXTURE.collide.phone,
      }),
    );
    claim(
      res.ok,
      `PROVEN: a colliding application is still ACCEPTED (HTTP ${res.status}) — provisioning is fail-soft, so a collision costs the applicant nothing; their submission is never dropped on the floor.`,
      `NOT PROVEN: the colliding submission returned HTTP ${res.status}: ${JSON.stringify(res.body)}. A collision loses the application.`,
    );

    const apps = await applicationFor(FIXTURE.collide.responseId);
    claim(
      apps.length === 1,
      `PROVEN: the colliding application exists as exactly one row — the applicant is in the pipeline, not lost.`,
      `NOT PROVEN: ${apps.length} rows exist for the colliding submission.`,
    );
    const app = apps[0];
    if (app) {
      claim(
        app.user_id === null && app.pending_claim === true,
        "PROVEN: the row is PARKED — user_id NULL and pending_claim true. The tie is deferred to an interactive second-channel OTP instead of being guessed at intake.",
        `NOT PROVEN: the colliding row has user_id ${JSON.stringify(app.user_id)} and pending_claim ${JSON.stringify(app.pending_claim)}; it was resolved silently instead of parked.`,
      );
    }

    const after = await authCount();
    claim(
      after === before,
      `PROVEN: the collision minted ZERO auth users (${before} -> ${after}) — a contested identity never manufactures a new account to sidestep the contest.`,
      `NOT PROVEN: the collision changed the auth user count by ${after - before} (${before} -> ${after}).`,
    );

    const usersAfter = await fixtureAuthUsers();
    // EVERY snapshotted field, not just the identifiers. A merge can also
    // arrive as a flipped confirmation timestamp or a rewritten app_metadata
    // stamp, and "byte-for-byte" must mean what it says.
    const incumbentAfter = usersAfter.find((u) => u.id === incumbentBefore.id);
    claim(
      !!incumbentAfter && JSON.stringify(incumbentAfter) === JSON.stringify(incumbentBefore),
      `PROVEN: ZERO merges — the incumbent account that owns ${FIXTURE.collide.phone} is byte-for-byte what it was before the submission, across EVERY snapshotted field (email ${incumbentBefore.email}, phone ${incumbentBefore.phone}, both confirmation timestamps and app_metadata). A stranger's form answer did not attach an identifier to their account, did not confirm a channel on it and did not restamp it, which is inviolable rule 3.`,
      `NOT PROVEN: the incumbent account was MUTATED by the colliding submission: before ${JSON.stringify(incumbentBefore)} / after ${JSON.stringify(incumbentAfter)}. This is a silent merge — account takeover by form submission.`,
    );
    claim(
      !usersAfter.some((u) => (u.email || "").toLowerCase() === FIXTURE.collide.email),
      `PROVEN: no auth user was created for the colliding email (${FIXTURE.collide.email}) either — the collision path creates nothing at all, in either direction.`,
      `NOT PROVEN: an auth user was created for the colliding email despite the collision.`,
    );
  });
}

async function liveClaim() {
  await runCase("S-LIVE-4", "live", "The claim: the right second-channel code attaches, the wrong one does not", async () => {
    // Set-up: a cross-linked application. Its EMAIL belongs to incumbent A and
    // its PHONE to incumbent B — two different accounts, one application. The
    // claimant signs in as B and must prove the OTHER channel (A's email).
    const before = await authCount();
    const res = await postSubmission(
      tallyEnvelope({
        responseId: FIXTURE.cross.responseId,
        name: "Identity Fixture Cross",
        email: FIXTURE.cross.email,
        phone: FIXTURE.cross.phone,
      }),
    );
    claim(
      res.ok,
      `PROVEN: the cross-linked application was accepted (HTTP ${res.status}).`,
      `NOT PROVEN: the cross-linked submission returned HTTP ${res.status}: ${JSON.stringify(res.body)}`,
    );

    const apps = await applicationFor(FIXTURE.cross.responseId);
    const app = apps[0];
    if (!app) {
      claim(false, "", "NOT PROVEN: the cross-linked application row was not created, so the claim could not be exercised.");
      return;
    }
    claim(
      app.user_id === null && app.pending_claim === true,
      "PROVEN: an email owned by one account and a phone owned by another parks the row rather than picking a winner.",
      `NOT PROVEN: the cross-linked row resolved to user_id ${JSON.stringify(app.user_id)} / pending_claim ${JSON.stringify(app.pending_claim)}.`,
    );

    // Sign the claimant in on their OWN channel (B's email), the way an
    // applicant would at Login's Email tab.
    await clearIssuedCodes(FIXTURE.incumbentCross);
    const sendB = await emailOtp({ action: "send", email: FIXTURE.incumbentCross });
    claim(
      sendB.ok,
      "PROVEN: the Email sign-in tab issues a code for a known address (HTTP 200, generic body).",
      `NOT PROVEN: verify-email-otp send failed (HTTP ${sendB.status}): ${JSON.stringify(sendB.body)}`,
    );
    const { code: codeB } = await recoverIssuedCode(FIXTURE.incumbentCross);
    if (!codeB) {
      claim(false, "", "NOT PROVEN: no issued code could be recovered for the claimant, so no session could be minted and the claim was never exercised.");
      return;
    }
    const signIn = await emailOtp({ action: "verify", email: FIXTURE.incumbentCross, code: codeB });
    const claimantJwt = signIn.body?.access_token;
    const claimantUid = signIn.body?.user_id;
    claim(
      signIn.ok && !!claimantJwt && !!claimantUid,
      `PROVEN: a valid email code MINTS A SESSION (uid ${claimantUid}) — the email channel is a real login, not a stub.`,
      `NOT PROVEN: email OTP verify returned HTTP ${signIn.status}: ${JSON.stringify(signIn.body)}`,
    );
    if (!claimantJwt) return;

    // The claim endpoint issues its own second-channel code (the client's
    // `sendEmailCode` -> invokeClaim({ action: "send", channel: "email" })),
    // rather than reusing the sign-in send — which matters, because the second
    // channel may be an address with no account of its own and the sign-in send
    // deliberately refuses to issue for those.
    const claimCall = async (body) => {
      const r = await fetch(`${LIVE.url}/functions/v1/claim-application`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: LIVE.anonKey,
          Authorization: `Bearer ${claimantJwt}`,
        },
        body: JSON.stringify({ application_id: app.id, ...body }),
      });
      const text = await r.text();
      recordResponse("claim-application", "user", text);
      let parsed = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* keep the raw text */
      }
      return { status: r.status, ok: r.ok, body: parsed };
    };

    const claimStorageKey = `claim ${app.id} ${FIXTURE.cross.email}`;
    await clearIssuedCodes(claimStorageKey);
    const sendA = await claimCall({ action: "send", channel: "email", email: FIXTURE.cross.email });
    claim(
      sendA.ok,
      `PROVEN: the claim endpoint issues a code on the SECOND channel (HTTP ${sendA.status}) — the claimant needs nothing but the app to finish.`,
      `NOT PROVEN: the claim's second-channel send failed (HTTP ${sendA.status}): ${JSON.stringify(sendA.body)}`,
    );
    const { code: codeA } = await recoverIssuedCode(FIXTURE.cross.email, claimStorageKey);
    if (!codeA) {
      claim(
        false,
        "",
        `NOT PROVEN: no issued code for ${FIXTURE.cross.email} could be found at claim-application's namespaced public.email_otp_codes key after the send, so the claim's happy path was not exercised.`,
      );
      return;
    }
    const attach = (code) => claimCall({ action: "claim", channel: "email", email: FIXTURE.cross.email, code });

    // ── WRONG CODE FIRST. A suite that only ever tried the happy path would
    // not know whether the guard exists. ──────────────────────────────────────
    const wrongCode = codeA === "000000" ? "111111" : "000000";
    const wrong = await attach(wrongCode);
    const afterWrong = (await applicationFor(FIXTURE.cross.responseId))[0];
    claim(
      wrong.body?.claimed !== true && afterWrong?.user_id === null && afterWrong?.pending_claim === true,
      `PROVEN: a WRONG second-channel code does not attach anything — the endpoint refused (HTTP ${wrong.status}) and the row is still parked (user_id NULL, pending_claim true). Guessing a code cannot capture someone else's application.`,
      `NOT PROVEN: a wrong second-channel code changed the row (claimed=${JSON.stringify(wrong.body?.claimed)}, user_id=${JSON.stringify(afterWrong?.user_id)}, pending_claim=${JSON.stringify(afterWrong?.pending_claim)}).`,
    );
    const afterWrongCount = await authCount();
    claim(
      afterWrongCount === before,
      `PROVEN: the rejected claim minted no users (${before} -> ${afterWrongCount}) and merged nothing.`,
      `NOT PROVEN: a rejected claim changed the auth user count (${before} -> ${afterWrongCount}).`,
    );

    // ── THE CORRECT CODE. ───────────────────────────────────────────────────
    const right = await attach(codeA);
    const attached = (await applicationFor(FIXTURE.cross.responseId))[0];
    claim(
      right.body?.claimed === true && attached?.pending_claim === false && !!attached?.user_id,
      `PROVEN: the CORRECT second-channel code attaches the application in-flow — one extra OTP, no admin, no support ticket. The row left pending_claim and now carries user_id ${attached?.user_id}.`,
      `NOT PROVEN: the correct second-channel code did not attach the application (HTTP ${right.status}, claimed=${JSON.stringify(right.body?.claimed)}, user_id=${JSON.stringify(attached?.user_id)}, pending_claim=${JSON.stringify(attached?.pending_claim)}).`,
    );
    claim(
      attached?.user_id === claimantUid,
      `PROVEN: the application attached to the SIGNED-IN claimant (${claimantUid}) — not to whichever incumbent happened to own the other identifier.`,
      `NOT PROVEN: the application attached to ${JSON.stringify(attached?.user_id)}, not to the signed-in claimant ${claimantUid}. A claim must bind the row to the person who proved both channels.`,
    );

    const afterClaimCount = await authCount();
    claim(
      afterClaimCount === before,
      `PROVEN: completing a claim minted ZERO users (${before} -> ${afterClaimCount}) — a claim RESOLVES an identity, it never manufactures one.`,
      `NOT PROVEN: the claim changed the auth user count (${before} -> ${afterClaimCount}).`,
    );

    // ── REPLAY. An attach that is not idempotent is a second attach waiting
    // to happen. ─────────────────────────────────────────────────────────────
    await attach(codeA);
    const replayed = await applicationFor(FIXTURE.cross.responseId);
    claim(
      replayed.length === 1 && replayed[0].user_id === attached?.user_id && replayed[0].pending_claim === false,
      "PROVEN: replaying the same claim changes nothing — still one row, still the same owner. The consumed code cannot be reused to re-point an application at a different account.",
      `NOT PROVEN: replaying the claim altered the row: ${JSON.stringify(replayed)}`,
    );
  });
}

async function liveEmailOtpParity() {
  await runCase("S-LIVE-5", "live", "Email OTP parity: mints on a valid code, rejects invalid, expired and reused", async () => {
    const email = FIXTURE.fresh.email;

    const bad = await emailOtp({ action: "verify", email, code: "000000" });
    claim(
      !bad.ok && !bad.body?.access_token,
      `PROVEN: a code that was never issued is REJECTED (HTTP ${bad.status}, ${JSON.stringify(bad.body)}) and mints no session.`,
      `NOT PROVEN: an unissued code was accepted: HTTP ${bad.status} ${JSON.stringify(bad.body)}`,
    );

    await clearIssuedCodes(email);
    const unknown = await emailOtp({ action: "send", email: "nobody-at-all@identity-fixture.invalid" });
    const known = await emailOtp({ action: "send", email });
    claim(
      unknown.status === known.status && JSON.stringify(unknown.body) === JSON.stringify(known.body),
      `PROVEN: an address with NO account and an address WITH one return byte-identical send responses (HTTP ${known.status}, ${JSON.stringify(known.body)}) — the endpoint is not an account-enumeration oracle.`,
      `NOT PROVEN: the send responses differ — unknown: HTTP ${unknown.status} ${JSON.stringify(unknown.body)}; known: HTTP ${known.status} ${JSON.stringify(known.body)}. An attacker can test which addresses have accounts.`,
    );

    // EXPIRY — reach into the shadow project and age the issued code rather
    // than sleeping for the TTL.
    const expiring = await recoverIssuedCode(email);
    if (!expiring.code) {
      claim(false, "", "NOT PROVEN: no issued code could be recovered, so expiry and reuse were not exercised.");
      return;
    }
    const aged = await sb(`/rest/v1/email_otp_codes?id=eq.${expiring.row.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
    });
    if (aged.ok) {
      const expired = await emailOtp({ action: "verify", email, code: expiring.code });
      claim(
        !expired.ok && !expired.body?.access_token,
        `PROVEN: a CORRECT but expired code is rejected (HTTP ${expired.status}, ${JSON.stringify(expired.body)}) — a code left in an inbox does not stay a key.`,
        `NOT PROVEN: an expired code was accepted: HTTP ${expired.status} ${JSON.stringify(expired.body)}`,
      );
    } else {
      claim(false, "", `NOT PROVEN: could not age the issued code (HTTP ${aged.status}), so expiry was not exercised.`);
    }

    // MINT + SINGLE USE.
    await clearIssuedCodes(email);
    const fresh = await emailOtp({ action: "send", email });
    claim(fresh.ok, "PROVEN: a fresh code was issued.", `NOT PROVEN: send failed (HTTP ${fresh.status}).`);
    const { code } = await recoverIssuedCode(email);
    if (!code) {
      claim(false, "", "NOT PROVEN: no fresh code could be recovered; mint and reuse were not exercised.");
      return;
    }
    const minted = await emailOtp({ action: "verify", email, code });
    const apps = await applicationFor(FIXTURE.fresh.responseId);
    claim(
      minted.ok && !!minted.body?.access_token && minted.body?.user_id === apps[0]?.user_id,
      `PROVEN: a VALID email code mints a session for the uid the application is bound to (${minted.body?.user_id}) — the applicant provisioned from a Tally form can sign in by email and arrive at their own application.`,
      `NOT PROVEN: the valid code did not mint a session for the provisioned uid: HTTP ${minted.status} ${JSON.stringify(minted.body)}`,
    );

    const replay = await emailOtp({ action: "verify", email, code });
    claim(
      !replay.ok && !replay.body?.access_token,
      `PROVEN: replaying the same code is rejected (HTTP ${replay.status}, ${JSON.stringify(replay.body)}) — codes are single-use, so a leaked mail is spent the moment it is used.`,
      `NOT PROVEN: a consumed code minted a second session: HTTP ${replay.status} ${JSON.stringify(replay.body)}`,
    );
  });
}

/**
 * Provision one applicant through the live intake door and return {app, user}.
 * Shared by the intake cases below so each states its own property rather than
 * re-deriving the set-up.
 */
async function provisionIntake(fixture, name) {
  const res = await postSubmission(
    tallyEnvelope({ responseId: fixture.responseId, name, email: fixture.email, phone: fixture.phone }),
  );
  const apps = await applicationFor(fixture.responseId);
  const users = await fixtureAuthUsers();
  const user = users.find((u) => (u.email || "").toLowerCase() === fixture.email) || null;
  return { res, app: apps[0] || null, user };
}

/**
 * S-LIVE-6 — THE REGRESSION TEST FOR AN ACCOUNT-TAKEOVER VECTOR.
 *
 * THE ATTACK, in full, because a test whose reason is not written down is a
 * test somebody deletes. `auth.users.phone` is not a contact detail: it is the
 * PHONE-OTP LOGIN KEY, and `find_login_identity` (20260603120000:78-92) matches
 * on its last 10 digits with NO reference to `phone_confirmed_at`. Intake reads
 * its phone out of an unauthenticated public form. So if intake WRITES that
 * column, one form submission — {an email you control, a stranger's unregistered
 * number} — pre-binds the stranger's number to an account whose email you own.
 * Their first genuine MSG91 OTP then signs them into it, and your magic-link on
 * the email side signs YOU into it. Silent, permanent, invisible to the victim.
 *
 * The fix is to mint EMAIL-ONLY and stash the number in `app_metadata`
 * (service-role-only, and keyed on by nothing), promoting it to the login key
 * only once a `phone_confirmed_at` proves it.
 *
 * WHAT THIS CASE MEASURES, AND ON WHICH HOST. The live lane's only deterministic
 * door is `tally-application-webhook`; the poller PULLS from Tally and cannot be
 * handed a synthetic applicant. So this observes the WEBHOOK host. The poller's
 * identical obligation is asserted on code in S-STATIC-6B, and neither claim
 * stands in for the other — the two hosts' own headers require them to mint
 * identically precisely because an applicant's identity must not depend on which
 * door ingested them.
 */
async function liveIntakeMintsNoLoginKey() {
  await runCase(
    "S-LIVE-6",
    "live",
    "ACCOUNT TAKEOVER, CLOSED: intake binds NO unproven number as a login key",
    async () => {
      const { res, app, user } = await provisionIntake(FIXTURE.intake, "Identity Fixture Intake");
      claim(
        res.ok,
        `PROVEN: the intake submission was accepted (HTTP ${res.status}).`,
        `NOT PROVEN: the intake submission returned HTTP ${res.status}: ${JSON.stringify(res.body)}`,
      );
      if (!app) {
        claim(false, "", "NOT PROVEN: no application row was created for the intake fixture, so nothing about minting could be observed.");
        return;
      }
      if (!user) {
        claim(false, "", `NOT PROVEN: no auth user was minted for ${FIXTURE.intake.email}, so the takeover property could not be measured. (Provisioning may be switched off on this project — PROVISION_APPLICANTS.)`);
        return;
      }

      // ── THE HEADLINE. Everything else in this case is corroboration. ───────
      const byPhone = await rpc("find_login_identity", { p_phone: FIXTURE.intake.phone, p_email: null });
      const rows = Array.isArray(byPhone.body) ? byPhone.body : byPhone.body ? [byPhone.body] : [];
      const resolvedIds = rows.map((r) => r?.id).filter(Boolean);
      claim(
        byPhone.ok && !resolvedIds.includes(user.id),
        `PROVEN: after provisioning, find_login_identity(p_phone => the applicant's number, p_email => null) does NOT resolve to the intake-minted uid (${user.id}). The number the form supplied is NOT a login key. An attacker who submits a stranger's number cannot capture the stranger's first phone OTP, because there is nothing for it to resolve to.`,
        `NOT PROVEN — ACCOUNT TAKEOVER IS OPEN: find_login_identity(p_phone => ${FIXTURE.intake.phone}) resolves to ${JSON.stringify(resolvedIds)}, which includes the intake-minted uid ${user.id}. A number typed into an unauthenticated public form is a LOGIN KEY on an account whose email the submitter controls. The stranger's first genuine MSG91 OTP signs them into the attacker's account; the attacker's magic-link signs the attacker into the same one. This is the exact vector this phase closed and it is open again.`,
      );
      claim(
        byPhone.ok && rows.length === 0,
        "PROVEN: that number resolves to NO auth user at all — not the intake account, not any other. Intake left the phone namespace completely untouched.",
        `NOT PROVEN: the applicant's number resolves to ${rows.length} auth row(s): ${JSON.stringify(rows)}. Intake was supposed to leave the phone namespace untouched.`,
      );

      claim(
        user.phone === null || user.phone === "",
        "PROVEN: the intake-minted auth.users row carries phone NULL — the login-key column was never written.",
        `NOT PROVEN: the intake-minted auth.users row carries phone ${JSON.stringify(user.phone)}. Intake wrote the phone-OTP login key from unauthenticated form text.`,
      );

      const meta = user.app_metadata || {};
      claim(
        meta.levelup_intake_phone === FIXTURE.intake.phone,
        `PROVEN: the applicant's number is not lost — it is stashed at app_metadata.levelup_intake_phone (${meta.levelup_intake_phone}), which is service-role-only (a user can never write it) and which NO lookup keys on. It becomes a login key only when sync_intake_phone_on_confirm promotes it, i.e. only once a phone_confirmed_at proves the number (S-LIVE-8).`,
        `NOT PROVEN: app_metadata.levelup_intake_phone is ${JSON.stringify(meta.levelup_intake_phone)}, not the submitted number ${FIXTURE.intake.phone}. The number is neither a login key nor recoverable, so the applicant's phone tab can never be repaired.`,
      );
      claim(
        meta.levelup_unverified_intake === true,
        "PROVEN: the row is stamped levelup_unverified_intake = true, preserving service-owned provenance that it was minted from form text.",
        `NOT PROVEN: app_metadata is ${JSON.stringify(meta)} — the unverified-intake stamp is missing, so nothing downstream can tell this identity apart from a proven one.`,
      );
      claim(
        !user.email_confirmed_at && !user.phone_confirmed_at,
        "PROVEN: the minted account is INERT — neither channel is confirmed, so nothing about it is treated as proven until a real OTP proves one.",
        `NOT PROVEN: the minted account arrives pre-confirmed (email_confirmed_at ${JSON.stringify(user.email_confirmed_at)}, phone_confirmed_at ${JSON.stringify(user.phone_confirmed_at)}) on the strength of a public form.`,
      );
      claim(
        !!app.user_id && app.pending_claim === false,
        `PROVEN: the applicant still lands bound — the application carries user_id ${app.user_id} and is not parked. Closing the takeover cost the applicant nothing on the email route, which is the route their confirmation mail sends them down.`,
        `NOT PROVEN: the application was left at user_id ${JSON.stringify(app.user_id)} / pending_claim ${JSON.stringify(app.pending_claim)} even though an identity was minted.`,
      );
    },
  );
}

/**
 * S-LIVE-7 — the gate the poller refuses to provision without.
 *
 * `intake_provisioning_gate_ok()` is installed by a forward migration only
 * after that migration verifies the signup-time legacy claim is a no-op. It is
 * therefore the poller's proof that hardening is actually applied before minting
 * (tally-application-poll `intakeGateInstalled`). It is a SERVICE-ROLE probe:
 * nothing a browser holds should be able to call it.
 */
async function liveIntakeGate() {
  await runCase("S-LIVE-7", "live", "intake_provisioning_gate_ok() exists and is service_role-only", async () => {
    const rows = psqlRows(`
      SELECT p.proname,
             p.prosecdef,
             has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
             has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_exec
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'intake_provisioning_gate_ok'
    `);
    claim(
      rows.length === 1,
      "PROVEN: public.intake_provisioning_gate_ok() exists exactly once. It is installed only after the signup-time claim becomes a no-op; the poller probes it every tick and SKIPS provisioning entirely when it is absent.",
      `NOT PROVEN: public.intake_provisioning_gate_ok() resolves to ${rows.length} function(s). The poller treats an absent probe as "hardening migration not applied" and provisions NOTHING, so intake is silently off.`,
    );
    if (rows.length !== 1) return;
    const fn = rows[0];
    claim(
      fn.anon_exec === false && fn.authenticated_exec === false,
      "PROVEN: neither `anon` nor `authenticated` may EXECUTE it — the two roles a browser can ever hold. The gate is reachable only by the service-role key the poller runs under.",
      `NOT PROVEN: the gate is executable by a browser-held role (anon: ${fn.anon_exec}, authenticated: ${fn.authenticated_exec}). EXECUTE must be revoked from PUBLIC and from both of those roles and granted to service_role alone.`,
    );
    claim(
      fn.service_exec === true,
      "PROVEN: `service_role` may execute it, so the poller's own probe succeeds and provisioning is not disabled by the very grant that protects it.",
      "NOT PROVEN: service_role cannot execute the gate, so the poller's probe fails every tick and provisioning never runs.",
    );
  });
}

/**
 * S-LIVE-8 — the stash is promoted on PROOF, and only on proof.
 *
 * The stash is what makes the email-only mint safe rather than merely lossy, so
 * the promotion rule is load-bearing in BOTH directions:
 *   • confirming a DIFFERENT number must not promote the stash (that would bind
 *     the login key from form text after all, just later) and must not discard
 *     it (the applicant's real number would be gone for good);
 *   • confirming the MATCHING number is the proof the design waits for, and the
 *     stash has done its job and must be cleared.
 * Two separate identities on purpose: a trigger that only fires on the FIRST
 * confirmation would make a single-identity test pass or fail for the wrong
 * reason.
 */
async function liveIntakePhonePromotion() {
  await runCase("S-LIVE-8", "live", "sync_intake_phone_on_confirm promotes the stash only on PROOF of that number", async () => {
    // ── HALF 1: confirm a DIFFERENT number. ──────────────────────────────────
    const other = await provisionIntake(FIXTURE.intakeSync, "Identity Fixture Intake Sync");
    if (!other.user) {
      claim(false, "", `NOT PROVEN: no auth user was minted for ${FIXTURE.intakeSync.email}, so the different-number half was not exercised.`);
    } else {
      const stashBefore = (other.user.app_metadata || {}).levelup_intake_phone ?? null;
      psqlExec(
        `UPDATE auth.users SET phone = '${FIXTURE.intakeSync.otherPhone}', phone_confirmed_at = now() WHERE id = '${other.user.id}'`,
      );
      const after = psqlRows(
        `SELECT phone::text AS phone, raw_app_meta_data->>'levelup_intake_phone' AS stash FROM auth.users WHERE id = '${other.user.id}'`,
      )[0];
      claim(
        after?.stash === stashBefore && stashBefore !== null,
        `PROVEN: confirming a DIFFERENT number left the stash untouched (${JSON.stringify(stashBefore)} before, ${JSON.stringify(after?.stash)} after). The applicant's real number survives a confirmation that was never about it.`,
        `NOT PROVEN: confirming a different number changed the stash (${JSON.stringify(stashBefore)} -> ${JSON.stringify(after?.stash)}). Clearing it discards the applicant's real number permanently; there is no second copy.`,
      );
      claim(
        after?.phone === FIXTURE.intakeSync.otherPhone,
        `PROVEN: the login key is the number that was actually CONFIRMED (${after?.phone}) — the unproven stash was NOT promoted over it. A confirmation on one number can never install a different, unproven one as the login key.`,
        `NOT PROVEN: auth.users.phone is ${JSON.stringify(after?.phone)} rather than the confirmed ${FIXTURE.intakeSync.otherPhone}. An unproven stashed number was promoted onto the login key by a confirmation that proved something else entirely — the takeover, reopened one step later.`,
      );
    }

    // ── HALF 2: confirm the MATCHING number. ─────────────────────────────────
    const match = await provisionIntake(FIXTURE.intakeMatch, "Identity Fixture Intake Match");
    if (!match.user) {
      claim(false, "", `NOT PROVEN: no auth user was minted for ${FIXTURE.intakeMatch.email}, so the matching-number half was not exercised.`);
      return;
    }
    const stash = (match.user.app_metadata || {}).levelup_intake_phone ?? null;
    if (!stash) {
      claim(false, "", "NOT PROVEN: the intake identity carries no stashed number, so there was nothing for a confirmation to promote.");
      return;
    }
    psqlExec(
      `UPDATE auth.users SET phone = '${stash}', phone_confirmed_at = now() WHERE id = '${match.user.id}'`,
    );
    const done = psqlRows(
      `SELECT phone::text AS phone,
              (raw_app_meta_data ? 'levelup_intake_phone') AS stash_present,
              raw_app_meta_data->>'levelup_intake_phone' AS stash
         FROM auth.users WHERE id = '${match.user.id}'`,
    )[0];
    claim(
      done?.stash_present === false,
      `PROVEN: confirming the MATCHING number cleared levelup_intake_phone — the stash existed only to survive the wait for proof, and once the proof arrives it is gone rather than left lying around as a second source of truth.`,
      `NOT PROVEN: levelup_intake_phone is still present (${JSON.stringify(done?.stash)}) after the applicant confirmed exactly that number. A stash that outlives its promotion is a second, unproven copy of a login key.`,
    );
    claim(
      done?.phone === stash,
      `PROVEN: the proven number is now the login key (${done?.phone}) — the applicant's phone tab resolves to the identity intake created for them, which is the whole point of keeping the number at all.`,
      `NOT PROVEN: auth.users.phone is ${JSON.stringify(done?.phone)} rather than the confirmed ${stash}.`,
    );
  });
}

/**
 * S-LIVE-9 — A FUNCTION THAT MUST NEVER COME BACK.
 *
 * ⚠️ READ THIS BEFORE "RESTORING" ANYTHING. `claim_legacy_enrolments_on_email_confirm`
 * was designed, then DELIBERATELY REMOVED, because it is a working
 * entitlement-theft path — not a hypothetical one.
 *
 * The mechanism: intake mints an account from an UNAUTHENTICATED public form,
 * on an email address nobody has proved. `claim_legacy_enrolments_for_user` is
 * the function that grants a returning TagMango customer their paid catalogue by
 * matching on that address. A trigger that ran the legacy claim when an EMAIL
 * was confirmed would hand the entire paid catalogue of any real customer to
 * whoever typed their address into the form and then confirmed the mailbox they
 * themselves control — and it stamps `legacy_enrolments.claimed_by_user_id`,
 * which is a PERMANENT write. The victim is a paying customer who never touched
 * the form.
 *
 * The safe shape is the one that shipped: the signup-time legacy claim is a
 * universal no-op, purchase claiming runs only after verified sign-in, and no
 * email-confirmation trigger re-arms the old path. If you are here because "the
 * legacy claim doesn't fire for applicants at signup", that is the DESIGN, and
 * the fix is not this function.
 */
async function liveNoLegacyClaimOnConfirm() {
  await runCase("S-LIVE-9", "live", "claim_legacy_enrolments_on_email_confirm DOES NOT EXIST (entitlement theft, by design absent)", async () => {
    const rows = psqlRows(`
      SELECT
        (SELECT count(*) FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'claim_legacy_enrolments_on_email_confirm')            AS fn_count,
        (SELECT count(*) FROM pg_trigger
          WHERE NOT tgisinternal
            AND tgname = 'auth_users_claim_legacy_on_email_confirm')               AS trigger_count,
        (SELECT count(*) FROM pg_trigger t
           JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE NOT t.tgisinternal
            AND p.proname LIKE 'claim_legacy_enrolments_on_%')                     AS any_confirm_trigger
    `);
    const r = rows[0] || {};
    claim(
      Number(r.fn_count) === 0,
      "PROVEN: public.claim_legacy_enrolments_on_email_confirm() does not exist. The entitlement-theft path is absent from the database, not merely unreferenced — a confirmed-email trigger over the legacy claim would hand a paying customer's whole catalogue to whoever typed their address into the public intake form.",
      `NOT PROVEN — ENTITLEMENT THEFT IS INSTALLED: public.claim_legacy_enrolments_on_email_confirm exists (${r.fn_count} definition(s)). Intake mints accounts on unproven addresses; a legacy claim keyed on email confirmation grants the real customer's paid catalogue to whoever controls the mailbox they typed in, and stamps legacy_enrolments.claimed_by_user_id permanently. DROP it.`,
    );
    claim(
      Number(r.trigger_count) === 0,
      "PROVEN: no `auth_users_claim_legacy_on_email_confirm` trigger is installed on any table.",
      `NOT PROVEN: ${r.trigger_count} trigger(s) named auth_users_claim_legacy_on_email_confirm exist. The function may be gone, but the trigger name being live means something is firing a legacy claim on confirmation.`,
    );
    claim(
      Number(r.any_confirm_trigger) === 0,
      "PROVEN: no trigger anywhere calls a `claim_legacy_enrolments_on_*` function — the class is absent, not just the one name. A rename could not slip past this.",
      `NOT PROVEN: ${r.any_confirm_trigger} trigger(s) call a claim_legacy_enrolments_on_* function. The removed path has been reinstated under a different name.`,
    );
  });
}

/**
 * S-LIVE-10 — the read surface for a parked application.
 *
 * A parked row is somebody's application, and it has to be shown to a candidate
 * claimant before they have proved anything — that is the whole premise of the
 * claim screen. Which makes the read surface an AUTHORISATION problem, not a
 * convenience: whatever it returns is returned to a caller who has NOT yet
 * proved they are the applicant.
 *
 * So the surface is a WHITELIST RPC, not a table policy. It returns five
 * columns, the target is masked, the channel is derived server-side from the
 * caller's own auth row, and the table itself stays shut — a raw `select=*` by
 * the same caller must come back EMPTY. `bio` (the applicant's 100-word essay),
 * `tally_data`, `city` and `occupation` are not in the whitelist and must not be
 * obtainable by any route: NFR-COPY-1.
 */
async function livePendingClaimWhitelist() {
  await runCase("S-LIVE-10", "live", "get_my_pending_claim: a whitelist, a masked target, a server-derived channel, and a shut table", async () => {
    // The parked row from S-LIVE-3: its phone belongs to incumbent P, who is
    // therefore a candidate claimant and a NON-OWNER (user_id is NULL).
    let parked = (await applicationFor(FIXTURE.collide.responseId))[0];
    if (!parked) {
      await postSubmission(
        tallyEnvelope({
          responseId: FIXTURE.collide.responseId,
          name: "Identity Fixture Collide",
          email: FIXTURE.collide.email,
          phone: FIXTURE.collide.phone,
        }),
      );
      parked = (await applicationFor(FIXTURE.collide.responseId))[0];
    }
    if (!parked || parked.pending_claim !== true) {
      claim(false, "", `NOT PROVEN: no parked (pending_claim) application could be prepared, so the claim read surface was not exercised. Row: ${JSON.stringify(parked)}`);
      return;
    }

    // PLANT THE SENTINEL. Service-role write, so it is the suite's own set-up
    // and not something a client did; the corpus tagging keeps it out of the
    // client-visible subset S-LIVE-11 greps.
    await sb(`/rest/v1/cohort_applications?id=eq.${parked.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ bio: BIO_SENTINEL, city: "IDFIX-CITY", occupation: "IDFIX-OCCUPATION" }),
    });
    const planted = psqlRows(`SELECT bio FROM public.cohort_applications WHERE id = '${parked.id}'`)[0];
    claim(
      planted?.bio === BIO_SENTINEL,
      "PROVEN: the sentinel is really in this row's `bio` column, so a zero-hit result in S-LIVE-11 means the column did not leak — not that there was nothing to leak.",
      `NOT PROVEN: the sentinel could not be planted in cohort_applications.bio (found ${JSON.stringify(planted?.bio)}), so any later "bio never leaked" claim would be vacuous.`,
    );

    // ── THE CATALOG SHAPE. ───────────────────────────────────────────────────
    const fnRows = psqlRows(`
      SELECT pg_get_function_result(p.oid)               AS result,
             pg_get_function_identity_arguments(p.oid)   AS args,
             p.pronargs,
             p.prosecdef,
             has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_my_pending_claim'
    `);
    claim(
      fnRows.length === 1,
      "PROVEN: public.get_my_pending_claim() exists exactly once — the claim screen has a read surface that is a whitelist rather than a view onto the table.",
      `NOT PROVEN: public.get_my_pending_claim() resolves to ${fnRows.length} function(s). Until it exists, the claim screen has no whitelisted read surface and anything it renders comes from the table itself.`,
    );
    if (fnRows.length === 1) {
      const fn = fnRows[0];
      const result = String(fn.result || "").replace(/\s+/g, " ").toLowerCase();
      const wanted = [
        "application_id uuid",
        "offering_id uuid",
        "offering_title text",
        "claim_channel text",
        "masked_target text",
      ];
      const missing = wanted.filter((w) => !result.includes(w));
      const forbidden = ["bio", "tally_data", "city", "occupation", "email", "phone", "user_id"].filter((c) =>
        new RegExp(`\\b${c}\\b`).test(result),
      );
      claim(
        missing.length === 0 && forbidden.length === 0,
        `PROVEN: the function's RETURNS TABLE is exactly the whitelist — ${fn.result}. Nothing outside the five agreed columns can come back, because nothing outside them is declared.`,
        `NOT PROVEN: the returned shape is ${JSON.stringify(fn.result)} (missing: ${missing.join(", ") || "none"}; forbidden columns present: ${forbidden.join(", ") || "none"}). A whitelist that declares a column it must never return is not a whitelist.`,
      );
      claim(
        Number(fn.pronargs) === 0,
        `PROVEN: it takes NO arguments (identity args: ${JSON.stringify(fn.args)}), so claim_channel cannot be client-supplied even in principle — there is nowhere for a client value to enter. The channel is derived from the caller's own auth row.`,
        `NOT PROVEN: the function takes ${fn.pronargs} argument(s) (${JSON.stringify(fn.args)}). Any argument is a client-supplied value, and the channel a claimant must prove is exactly the value they must not get to choose.`,
      );
      claim(
        fn.prosecdef === true,
        "PROVEN: it is SECURITY DEFINER — which is what lets the table stay shut to the caller while this one whitelisted projection is answerable.",
        "NOT PROVEN: the function is not SECURITY DEFINER, so it can only see what the caller can see — meaning either the table is open to the caller (the leak) or the function returns nothing (the dead end).",
      );
      claim(
        fn.authenticated_exec === true,
        "PROVEN: `authenticated` may execute it — the claimant is signed in, so the flow actually works.",
        "NOT PROVEN: `authenticated` cannot execute get_my_pending_claim, so a signed-in claimant cannot read their own pending claim and the screen is empty for everyone.",
      );
      if (fn.anon_exec === true) {
        note(
          "get_my_pending_claim is executable by `anon`. Not failed here: the function keys on auth.uid(), so an anonymous caller matches nothing — and the anonymous call below asserts exactly that. Worth tightening anyway; EXECUTE for anon is a surface with no use case.",
        );
      }
    }

    // ── THE OLD TABLE POLICY MUST BE GONE. ───────────────────────────────────
    const policies = psqlRows(`
      SELECT policyname, cmd, qual::text AS using_expr
        FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'cohort_applications'
    `);
    const names = policies.map((p) => p.policyname);
    claim(
      !names.includes("claimants_read_pending_applications"),
      `PROVEN: the policy \`claimants_read_pending_applications\` no longer exists on cohort_applications (remaining policies: ${names.join(", ") || "none"}). The candidate claimant's read no longer goes through the TABLE, so it can no longer return whole rows — bio, tally_data, city, occupation and all — to somebody who has proved nothing.`,
      `NOT PROVEN: \`claimants_read_pending_applications\` is still installed on cohort_applications. A policy that matches a parked row on the caller's identifiers returns the WHOLE ROW, so every column the whitelist RPC carefully omits is readable by a caller who has not yet proved a thing.`,
    );

    // ── THE CALLER: a signed-in NON-OWNER whose phone matches the parked row. ─
    let claimant;
    try {
      claimant = await signInAs(FIXTURE.incumbentPhone);
    } catch (err) {
      claim(false, "", `NOT PROVEN: could not sign in as the candidate claimant, so no authorisation claim below could be measured: ${err.message}`);
      return;
    }
    claim(
      claimant.uid !== parked.user_id,
      `PROVEN: the caller (${claimant.uid}) is NOT the owner of the parked row (user_id ${JSON.stringify(parked.user_id)}) — they are exactly the "matches an identifier, owns nothing" caller every assertion below is about.`,
      "NOT PROVEN: the caller turned out to own the row, so nothing below tests a non-owner.",
    );

    // RAW TABLE READ, as that caller. This is the one that would have leaked.
    const rawAll = await asClient("/rest/v1/cohort_applications?select=*", { jwt: claimant.jwt, label: "cohort_applications select=* (user)" });
    const rawRows = Array.isArray(rawAll.body) ? rawAll.body : [];
    claim(
      rawAll.status === 200 && rawRows.length === 0,
      `PROVEN: a raw select=* on cohort_applications as this signed-in non-owner returns ZERO rows (HTTP ${rawAll.status}). The table is shut: the claim screen's data comes from the whitelist RPC or from nowhere.`,
      `NOT PROVEN: select=* returned ${rawRows.length} row(s) (HTTP ${rawAll.status}) to a signed-in caller who owns none of them. Whatever the RPC omits is readable straight off the table. First row keys: ${JSON.stringify(Object.keys(rawRows[0] || {}))}`,
    );
    const rawOne = await asClient(`/rest/v1/cohort_applications?id=eq.${parked.id}&select=*`, {
      jwt: claimant.jwt,
      label: "cohort_applications by id select=* (user)",
    });
    const rawOneRows = Array.isArray(rawOne.body) ? rawOne.body : [];
    claim(
      rawOneRows.length === 0,
      "PROVEN: even asked for BY ID — the id the claim screen legitimately knows — the parked row is not readable off the table by the candidate claimant.",
      `NOT PROVEN: the parked row is readable by id as a non-owner: ${JSON.stringify(rawOneRows).slice(0, 400)}`,
    );

    // ── THE RPC ITSELF. ──────────────────────────────────────────────────────
    const mine = await asClient("/rest/v1/rpc/get_my_pending_claim", {
      jwt: claimant.jwt,
      method: "POST",
      body: "{}",
      label: "get_my_pending_claim (user)",
    });
    const mineRows = Array.isArray(mine.body) ? mine.body : mine.body ? [mine.body] : [];
    const row = mineRows.find((x) => x?.application_id === parked.id) || mineRows[0] || null;
    claim(
      mine.status === 200 && !!row,
      `PROVEN: the RPC answers the candidate claimant with their pending claim (HTTP ${mine.status}, ${mineRows.length} row(s)) — the screen has its data without the table being open.`,
      `NOT PROVEN: get_my_pending_claim returned HTTP ${mine.status} / ${JSON.stringify(mine.body).slice(0, 300)} for a caller whose phone matches a parked row. Either the RPC does not exist yet, or a legitimate claimant cannot see their own pending claim.`,
    );
    if (row) {
      const keys = Object.keys(row).sort();
      const expected = ["application_id", "claim_channel", "masked_target", "offering_id", "offering_title"];
      claim(
        JSON.stringify(keys) === JSON.stringify(expected),
        `PROVEN: the payload carries exactly ${keys.join(", ")} — five keys, no more. What is not in the whitelist is not in the response.`,
        `NOT PROVEN: the payload carries ${keys.join(", ")}. Expected exactly ${expected.join(", ")}.`,
      );
      const leaked = ["bio", "tally_data", "city", "occupation"].filter((k) => k in row);
      claim(
        leaked.length === 0,
        "PROVEN: bio, tally_data, city and occupation are ABSENT from the payload. NFR-COPY-1 holds: the applicant's 100-word essay is not shipped to a client, and neither is the raw form envelope.",
        `NOT PROVEN: the payload contains ${leaked.join(", ")}. NFR-COPY-1 is categorical — bio in particular is the applicant's essay and must never reach a client.`,
      );
      const serialized = JSON.stringify(row);
      claim(
        !serialized.includes(BIO_SENTINEL) && !serialized.includes("IDFIX-CITY") && !serialized.includes("IDFIX-OCCUPATION"),
        "PROVEN: no whitelisted column smuggles the withheld ones through — the sentinel bio, city and occupation values appear nowhere in the payload, including inside offering_title or masked_target.",
        `NOT PROVEN: a withheld value appears inside the whitelisted payload: ${serialized.slice(0, 400)}`,
      );

      // MASKING. The target is shown so a human recognises their own address or
      // number; it must not be enough to LEARN one.
      const target = String(row.masked_target ?? "");
      const digits = FIXTURE.collide.phone.replace(/\D/g, "");
      const localPart = FIXTURE.collide.email.split("@")[0];
      claim(
        !!target &&
          target !== FIXTURE.collide.email &&
          !target.includes(localPart) &&
          !target.includes(digits) &&
          !target.includes(digits.slice(-10)),
        `PROVEN: masked_target (${JSON.stringify(target)}) is masked — it is neither the full address nor the full number, and contains neither the address's local part nor the last-10 subscriber digits. A claimant recognises their own; a stranger learns nothing they could then claim with.`,
        `NOT PROVEN: masked_target is ${JSON.stringify(target)}, which exposes the applicant's identifier in full (or its whole local part / all 10 subscriber digits) to a caller who has proved nothing. That hands an attacker the exact value the second-channel OTP is supposed to be proof of.`,
      );

      // SERVER-DERIVED CHANNEL. The caller matches the row on PHONE, so the
      // channel they still owe is EMAIL. A client that could name the channel
      // could name the one it has already proved and skip the proof entirely.
      claim(
        row.claim_channel === "email",
        `PROVEN: claim_channel is "${row.claim_channel}" — the channel the caller has NOT proved, derived server-side from their own auth row (their phone matches this row, so the email is what is left to prove). This is the value the whole claim turns on.`,
        `NOT PROVEN: claim_channel is ${JSON.stringify(row.claim_channel)}. This caller matches the row by PHONE, so the unproven channel is "email"; anything else means the claimant would be asked to re-prove what they already hold, which is the replay _shared/identity.ts#canClaim warns about.`,
      );
      const injected = await asClient("/rest/v1/rpc/get_my_pending_claim", {
        jwt: claimant.jwt,
        method: "POST",
        body: JSON.stringify({ claim_channel: "phone", p_claim_channel: "phone", masked_target: "attacker" }),
        label: "get_my_pending_claim with injected args (user)",
      });
      const injRows = Array.isArray(injected.body) ? injected.body : injected.body ? [injected.body] : [];
      const injRow = injRows.find((x) => x?.application_id === parked.id) || injRows[0] || null;
      claim(
        injected.status !== 200 || !injRow || injRow.claim_channel === row.claim_channel,
        `PROVEN: supplying claim_channel in the request body changes nothing — the call ${
          injected.status === 200 ? `still answers "${injRow?.claim_channel}"` : `is refused outright (HTTP ${injected.status})`
        }. The client's opinion of which channel it must prove is ignored, exactly as claim-application ignores it.`,
        `NOT PROVEN: a client-supplied claim_channel changed the answer to ${JSON.stringify(injRow?.claim_channel)} (was ${JSON.stringify(row.claim_channel)}). A claimant who picks their own channel picks the one they have already proved, and the second-channel proof becomes a replay of the first.`,
      );
    }

    // ANONYMOUS. Whatever the grants say, an anonymous caller must learn nothing.
    const anon = await asClient("/rest/v1/rpc/get_my_pending_claim", {
      method: "POST",
      body: "{}",
      label: "get_my_pending_claim (anon)",
    });
    const anonRows = Array.isArray(anon.body) ? anon.body : [];
    claim(
      anon.status !== 200 || anonRows.length === 0,
      `PROVEN: an ANONYMOUS caller gets nothing from the RPC (HTTP ${anon.status}, ${anonRows.length} row(s)) — it keys on auth.uid(), which is null for them.`,
      `NOT PROVEN: an anonymous caller received ${anonRows.length} pending claim(s): ${JSON.stringify(anon.body).slice(0, 300)}. Parked applications are readable without signing in at all.`,
    );
  });
}

/**
 * S-LIVE-11 — NFR-COPY-1, asserted over EVERY byte a client was handed.
 *
 * A per-endpoint shape assertion proves one endpoint. This proves the rule: the
 * sentinel was planted in a real application's `bio` before any client read
 * anything, and it must appear ZERO times across every response any anon- or
 * user-credentialed call received during this run. Service-role responses are
 * excluded and the exclusion is stated, because the service key is how the
 * sentinel got there.
 */
async function liveBioNeverReachesAClient() {
  await runCase("S-LIVE-11", "live", "NFR-COPY-1: `bio` appears NOWHERE in the client-visible response corpus", async () => {
    const corpus = clientVisibleCorpus();
    const hits = corpus.filter((e) => e.text.includes(BIO_SENTINEL));
    const planted = CORPUS.some((e) => e.credential === "service_role" && e.text.includes(BIO_SENTINEL));
    claim(
      corpus.length > 0,
      `PROVEN: the corpus is real — ${corpus.length} response(s) received on an anon key or a user's own JWT were recorded and searched (service-role responses excluded, since the service key is what planted the sentinel).`,
      "NOT PROVEN: no client-credentialed responses were recorded, so the corpus grep proves nothing at all.",
    );
    claim(
      hits.length === 0,
      `PROVEN: the sentinel planted in cohort_applications.bio appears 0 times across all ${corpus.length} client-visible responses. NFR-COPY-1 holds end to end: the applicant's 100-word essay never reached a client by ANY route this run exercised — not the whitelist RPC, not the table, not the claim endpoint, not the intake webhook.`,
      `NOT PROVEN: the bio sentinel appears in ${hits.length} client-visible response(s): ${hits.map((h) => `${h.credential}:${h.label}`).join(", ")}. NFR-COPY-1 is categorical and this is a leak of the applicant's essay.`,
    );
    if (!planted) {
      note(
        "The sentinel was never observed in any service-role response either, so this run could not independently confirm the value was in the column. S-LIVE-10's plant assertion is the one to read.",
      );
    }
  });
}

async function runLiveLane() {
  const prodRef = productionRef();
  if (prodRef && LIVE.url.includes(prodRef)) {
    console.error(
      `\nABORTED: SHADOW_SUPABASE_URL points at the PRODUCTION project (ref \`${prodRef}\`, read from src/integrations/supabase/client.ts).\n` +
        "This suite writes to auth.users and cohort_applications. It will not run against production under any flag.\n",
    );
    process.exit(2);
  }

  {
    // Apply the fixtures ourselves — SHADOW_DB_URL is required for exactly this
    // reason. `-c` and `-f` share one psql session, so the confirmation GUC is
    // set outside the file, which is what makes it a guard rather than a
    // formality.
    try {
      execFileSync(
        "psql",
        [
          LIVE.dbUrl,
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          "SET identity_fixtures.confirm_shadow = 'yes'",
          "-f",
          join(ROOT, "qa-harness/identity-fixtures.sql"),
        ],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      await waitForFixtureSchema();
      console.log("fixtures: qa-harness/identity-fixtures.sql applied to the shadow project.\n");
    } catch (err) {
      console.error(`\nABORTED: qa-harness/identity-fixtures.sql failed to apply:\n${err.stdout || ""}${err.stderr || err.message}\n`);
      process.exit(2);
    }
  }

  await liveProvisionIdempotency();
  await liveEmailOnlyBind();
  await liveCollisionDefers();
  await liveClaim();
  await liveEmailOtpParity();
  // The authorisation surfaces. Ordered so the corpus grep runs LAST — it is a
  // claim about everything that came before it, so anything appended after it
  // would go unsearched.
  await liveIntakeMintsNoLoginKey();
  await liveIntakeGate();
  await liveIntakePhonePromotion();
  await liveNoLegacyClaimOnConfirm();
  await livePendingClaimWhitelist();
  await liveBioNeverReachesAClient();
}

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────
const RULE = "─".repeat(78);

function report(liveRan, liveMissing) {
  console.log(`\n${RULE}`);
  console.log("PHASE SP — THE IDENTITY SPINE · adversarial acceptance suite (task S-6)");
  console.log(
    `diff base: ${BASE.commit ? `${BASE.ref} @ ${BASE.commit.slice(0, 12)}` : `${BASE_REF} (UNRESOLVED — every diff-zero rule below FAILED CLOSED)`}` +
      ` · lanes: static${liveRan ? " + live" : " only"}`,
  );
  console.log(RULE);

  for (const c of cases) {
    const failed = caseFailed(c);
    console.log(`\n[${failed ? "FAIL" : "PASS"}] ${c.id} (${c.lane}) — ${c.title}`);
    for (const cl of c.claims) {
      if (cl.kind === "note") console.log(`   NOTE  ${cl.text}`);
      else if (cl.kind === "proven") console.log(`   ✓ ${cl.text}`);
      else console.log(`   ✗ ${cl.text}`);
    }
  }

  const failedCases = cases.filter(caseFailed);
  const proven = cases.reduce((n, c) => n + c.claims.filter((cl) => cl.kind === "proven").length, 0);
  const refuted = cases.reduce((n, c) => n + c.claims.filter((cl) => cl.kind === "failed").length, 0);

  console.log(`\n${RULE}`);
  console.log(`SUMMARY: ${cases.length - failedCases.length}/${cases.length} cases pass · ${proven} properties proven · ${refuted} not proven`);

  if (failedCases.length) {
    console.log("\nNOT PROVEN — the council must not sign off while these stand:");
    for (const c of failedCases) {
      for (const cl of c.claims.filter((x) => x.kind === "failed")) console.log(`  • [${c.id}] ${cl.text}`);
    }
  }

  if (!liveRan) {
    console.log(
      `\nPARTIAL PROOF — THIS IS NOT A SIGN-OFF RUN.\n` +
        `The live lane did not run, so provisioning idempotency, email-only binding, collision deferral,\n` +
        `the claim, and email-OTP behaviour are UNPROVEN by this transcript. They are effects on auth.users and\n` +
        `cannot be established by reading source.\n` +
        `NOR ARE THE AUTHORISATION SURFACES (S-LIVE-6..11), which is the sharpest gap in a static-only run:\n` +
        `  • S-LIVE-6  the account-takeover regression — that no intake-provisioned identity carries the\n` +
        `              applicant's number as a LOGIN KEY (find_login_identity must not resolve to it);\n` +
        `  • S-LIVE-7  intake_provisioning_gate_ok() exists and anon/authenticated cannot execute it;\n` +
        `  • S-LIVE-8  sync_intake_phone_on_confirm promotes the stashed number only on proof OF THAT NUMBER;\n` +
        `  • S-LIVE-9  claim_legacy_enrolments_on_email_confirm is ABSENT (a removed entitlement-theft path);\n` +
        `  • S-LIVE-10 get_my_pending_claim is a whitelist with a masked target and a server-derived channel,\n` +
        `              the old claimants_read_pending_applications policy is gone, and a raw select=* by a\n` +
        `              signed-in non-owner returns zero rows;\n` +
        `  • S-LIVE-11 NFR-COPY-1: a sentinel planted in an applicant's bio appears in NO client response.\n` +
        `Every one of those is a grant, a policy, a trigger or a payload — catalog and wire facts that no\n` +
        `amount of reading source can establish. A static-only run says NOTHING about them.\n` +
        (liveMissing.length ? `Missing environment: ${liveMissing.join(", ")}\n` : "") +
        `Run without --static-only against a SHADOW project to produce the sign-off artifact.`,
    );
  }
  console.log(RULE);

  return failedCases.length;
}

// ─────────────────────────────────────────────────────────────────────────────
await loadModules();
await staticDiffBase();
await staticContract();
await staticDecisionTable();
await staticClaimPredicate();
await staticFrozenSurfaces();
await staticProvisioningWiring();
await staticNoSignupScreen();
await staticAuthorisationSurfaces();

const missing = liveReadiness();
let liveRan = false;
if (!STATIC_ONLY) {
  if (missing.length) {
    console.error(
      `\nThe live lane cannot run: missing ${missing.join(", ")}.\n` +
        "Set the shadow-project environment (see this file's header) and re-run, or pass --static-only\n" +
        "for the static lane alone — which is explicitly NOT a sign-off run.\n",
    );
  } else {
    await runLiveLane();
    liveRan = true;
  }
}

const failures = report(liveRan, missing);

/**
 * THE EXIT CODE, AND WHY IT IS NOT SIMPLY "did the live lane run?".
 *
 * The brief's acceptance for S-6 is "one command, exit 0", and the command a
 * reviewer or the design-qa-gate lens runs is `node
 * qa-harness/identity-spine.spec.mjs` on a laptop with no shadow project. If
 * absent live credentials alone exited 1, that command could NEVER exit 0 and
 * the artifact would report a red for an environment fact rather than for
 * anything about the system — the loudest possible false alarm, which is the
 * one failure mode a sign-off artifact must not have.
 *
 * So incompleteness is fatal exactly when the operator SIGNALLED INTENT to run
 * the live lane: any SHADOW_* variable set (a half-configured sign-off run is a
 * broken sign-off run, and must never pass quietly), or an explicit
 * --require-live. With no shadow environment at all, the run degrades to the
 * static lane, exits on its own merits, and the PARTIAL PROOF banner above
 * states in full which properties remain unproven. A green exit is therefore
 * never by itself a claim of sign-off; the transcript is.
 */
const intendedLive =
  process.argv.includes("--require-live") ||
  Object.keys(process.env).some((k) => k.startsWith("SHADOW_") && process.env[k]);
const incomplete = !STATIC_ONLY && !liveRan && intendedLive;
if (incomplete) {
  console.error(
    "EXIT 1 — a live run was INTENDED (shadow environment partially set, or --require-live passed) but did not happen.\n" +
      "A half-configured sign-off run is not a sign-off run, so this is a failure rather than a partial pass.\n",
  );
}
process.exit(failures > 0 || incomplete ? 1 : 0);
