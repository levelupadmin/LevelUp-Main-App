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
      `NOT PROVEN: ${BASE.error}. Every diff-zero rule in this suite (verify-msg91-otp, the payment pipeline, the isIOS() guard, the exempted signup page) is therefore UNEVALUATED and is reported as failed, not as passing.`,
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

  await runCase("S-STATIC-5", "static", "Inviolable rule 1: the payment pipeline and the isIOS() guard are untouched", () => {
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
    const status = diffZero([statusPath]);
    const src = readRepoFile(statusPath) || "";
    const guards = grepText(src, /isIOS\(\)/);
    if (!status.ok) {
      claim(false, "", diffUnavailable(`${statusPath} (the isIOS() guard)`, status.error));
    } else {
      claim(
        status.touched.length === 0 && guards.length > 0,
        `PROVEN: ${statusPath} has a ZERO diff against \`${BASE.ref}\` and still carries its isIOS() guard at ${guards.map((g) => g.line).join(", ")} — the App Store payment guard is exactly as shipped. (The brief cites lines 319/337; the guard has since moved to the lines listed here, so this suite asserts the file's diff and the guard's presence rather than a stale line number.)`,
        status.touched.length
          ? `NOT PROVEN: ${statusPath} is MODIFIED (${status.touched.join(", ")}) — the isIOS() guard is inside a file this phase was forbidden to touch.`
          : `NOT PROVEN: ${statusPath} no longer contains an isIOS() call at all; the App Store payment guard is gone.`,
      );
    }
  });
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
      claim(
        pollArgs.length === 1 && argShape(pollArgs) === argShape(hookArgs),
        `PROVEN: each host has exactly ONE createUser call site and both take the SAME argument set (${renderKeys(pollArgs[0]).join(", ")}) — compared on key names AND on each spread's source expression, so a host that spread in a differently-sourced identifier would fail here even though its key names matched. An applicant's minted account is identical whichever door ingested them, and neither host has a second minting path.`,
        `NOT PROVEN: the hosts do not mint identically. Poller call sites: ${argShape(pollArgs)}. Webhook call sites: ${argShape(hookArgs)}.`,
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

  await runCase("S-STATIC-6B", "static", "REQ-IDENT-2: a minted account carries BOTH identifiers, both unconfirmed", () => {
    // WHAT THIS CASE ENFORCES. The brief's ground truth (line 21) writes the
    // provisioning surface as
    // `createUser({ email, phone, email_confirm:false, phone_confirm:false })`,
    // and line 6 promises that "a later OTP on EITHER channel resolves to the
    // same auth.uid". S-2 ships exactly that. This case asserts it on CODE —
    // both identifiers present, both unconfirmed, the number normalised rather
    // than copied out of form text, and nothing written into the ONE field that
    // would let unproven text squat the public mirror.
    //
    // It is deliberately worded so that it can only pass for the shipped shape.
    // The conditional spread `...(phone ? { phone } : {})` is invisible to a
    // naive comma-token parser; the parser above sees it, so "phone is passed"
    // is a fact this case can actually establish rather than assume.
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
        sites.length > 0 && names.every((k) => k.includes("email") && k.includes("phone")),
        `PROVEN: ${path} mints with {${shown}} — BOTH identifiers on ONE auth row, which is the whole phase ("one passwordless auth.users row carries both phone and email, so a later OTP on either channel resolves to the same auth.uid"). The phone arrives via a CONDITIONAL SPREAD, so this is asserted by a spread-aware parser: a minting path that dropped the phone, or that added a second identifier, changes this set and fails here.`,
        `NOT PROVEN: ${path} does not pass both identifiers to createUser (keys: ${shown}). Minting email-only dead-ends the Phone tab — find_login_identity finds no row for the number, verify-msg91-otp answers 404 signup_requires_email_and_name, and the applicant is pushed at the signup screen this phase promises they will never see.`,
      );
      claim(
        names.every((k) => k.includes("email_confirm") && k.includes("phone_confirm")) &&
          /email_confirm\s*:\s*false/.test(code) &&
          /phone_confirm\s*:\s*false/.test(code),
        `PROVEN: ${path} passes email_confirm: false AND phone_confirm: false — both values are still unauthenticated form text, so the account is minted INERT and nothing is treated as proven until a real OTP proves a channel. This is the guest-create-order/index.ts:247-255 pattern the brief names as the proven precedent.`,
        `NOT PROVEN: ${path} does not mint with both confirmations false (keys: ${shown}). An intake account whose channels arrive pre-confirmed would be trusted on the strength of a public form.`,
      );
      // THE NUMBER MUST BE NORMALISED, NOT COPIED. `e164()` only prepends "+",
      // so raw form text like "9788385577" would mint "+9788385577" — a number
      // that exists nowhere and that no MSG91 login can ever present, i.e. a
      // login key bound to digits nobody can prove.
      const mintable = /function mintablePhone\s*\([\s\S]{0,200}?normalizePhone\s*\([\s\S]{0,120}?\+91/.test(code);
      // SHORTHAND is the load-bearing part. `{ phone }` can only carry the local
      // `phone` binding, which is assigned from mintablePhone(). A spread that
      // ASSIGNED a value — `...{ phone: applicant.phone }` — would contribute
      // the same key name while smuggling raw form text past the normaliser, so
      // an assigned phone is rejected here even though its key matches.
      const boundToMintable = /const phone\s*=\s*mintablePhone\s*\(/.test(code);
      const spreadIsShorthand = sites.some((site) =>
        site.some((d) => d.spread && d.name === "phone" && d.shorthand),
      );
      const assignedPhone = sites.some((site) =>
        site.some((d) => d.name === "phone" && !d.shorthand),
      );
      claim(
        mintable && boundToMintable && spreadIsShorthand && !assignedPhone,
        `PROVEN: the number ${path} writes is mintablePhone(applicant.phone) — normalizePhone() then a literal +91 prefix — and it reaches createUser as SHORTHAND ({ phone }), which can carry only that binding. A number the normaliser rejects yields null, the spread contributes nothing, and the account is minted email-only rather than bound to digits no MSG91 login could present. A call site that assigned the key instead (\`phone: <expression>\`) fails here even though the key name is identical, because that is how raw form text would get past the normaliser.`,
        `NOT PROVEN: ${path} does not derive the minted phone from mintablePhone() via a shorthand property (normalising helper present: ${mintable}; phone bound to it: ${boundToMintable}; passed as shorthand: ${spreadIsShorthand}; passed as an assigned expression instead: ${assignedPhone}). An unnormalised number reaching createUser mints a login key that its owner can never present.`,
      );
      claim(
        !/user_metadata\s*:\s*\{[^}]*\bphone\b/.test(code),
        `PROVEN: ${path} keeps the unproven number out of user_metadata.phone — a DIFFERENT field from the one above. handle_new_user mirrors raw_user_meta_data->>'phone' (never NEW.phone) into the UNIQUE public.users.phone, where an unproven value both fires the PHONE-keyed legacy-entitlement claim and squats the column against its real owner. The mirror is written later, by sync_confirmed_phone_to_users, and only once GoTrue has recorded phone_confirmed_at.`,
        `NOT PROVEN: ${path} writes an unproven phone into user_metadata, which handle_new_user mirrors into the UNIQUE public.users.phone — squatting the column and firing a phone-keyed entitlement claim on somebody else's number.`,
      );
      claim(
        /app_metadata\s*:\s*\{[\s\S]{0,80}?INTAKE_APP_METADATA/.test(code) &&
          /levelup_unverified_intake\s*:\s*true/.test(code),
        `PROVEN: ${path} stamps app_metadata.levelup_unverified_intake = true on every account it mints. app_metadata is service-role-only (a user can never write it, unlike user_metadata), which is what makes it usable as a TRUST SIGNAL travelling on the row itself.`,
        `NOT PROVEN: ${path} does not stamp levelup_unverified_intake on the accounts it mints, so nothing downstream can tell an intake-provisioned identity from one whose owner proved a channel.`,
      );
    }

    // The trust signal is only worth stamping if something READS it. This is
    // what stops a minted-but-unproven identity from collecting entitlements.
    const pendingMigName = readdirSync(join(ROOT, "supabase/migrations")).find((f) => f.startsWith("20260727120000"));
    const gateSrc = pendingMigName ? readRepoFile(`supabase/migrations/${pendingMigName}`) : null;
    claim(
      !!gateSrc &&
        /levelup_unverified_intake'\s*=\s*'true'[\s\S]{0,200}?email_confirmed_at IS NULL[\s\S]{0,120}?phone_confirmed_at IS NULL/.test(
          gateSrc,
        ),
      `PROVEN: supabase/migrations/${pendingMigName} gates claim_legacy_enrolments_for_user on that stamp — an identity tagged levelup_unverified_intake with NEITHER channel confirmed is granted NOTHING. So minting both identifiers up front hands out no entitlement until an OTP actually proves a channel.`,
      "NOT PROVEN: no migration gates the legacy-entitlement claim on levelup_unverified_intake with both channels unconfirmed. An account minted from unauthenticated form text could collect a paying customer's entitlements before anyone proved a channel.",
    );

    const loginFix = readRepoFile("supabase/migrations/20260603120000_legacy_login_fix.sql") || "";
    claim(
      /right\(regexp_replace\(u\.phone[^)]*\)[^)]*\)\s*=\s*right\(w\.digits/.test(loginFix),
      "PROVEN: find_login_identity resolves a phone against auth.users.phone (last-10 digits) — the exact column intake writes. That is WHY writing it closes the phone half of REQ-IDENT-2: the applicant's later MSG91 OTP resolves to the identity intake already created, instead of missing and minting a second one. (It consults no other table, so a number living only on an application row would be invisible to it.)",
      "NOT PROVEN: find_login_identity's phone predicate could not be read from supabase/migrations/20260603120000_legacy_login_fix.sql, so what the phone channel can resolve is unknown.",
    );

    // ── DISCLOSED RESIDUAL RISK — a note, not a failure. ────────────────────
    // The council should rule on this with its eyes open; it is inherent to the
    // brief's design (mint both identifiers unconfirmed), not to S-2's
    // implementation of it, and S-2 discloses it in its own source.
    const discloses = /ACCEPTED RESIDUAL RISK/.test(readRepoFile(POLL_HOST) || "");
    note(
      `ACCEPTED RESIDUAL RISK, for the council to rule on explicitly — carried here because it is the cost of REQ-IDENT-2 and is disclosed in the poller's own header (${
        discloses ? "present" : "NO LONGER DOCUMENTED IN SOURCE — that is itself worth a finding"
      }): auth.users.phone IS the phone-OTP login key and find_login_identity matches it with no reference to phone_confirmed_at, so a number written at intake is reachable before anyone proves it. Someone submitting the public form with {their own email, a stranger's number} pre-binds that number, and the stranger's first genuine MSG91 OTP resolves into an account whose email the submitter controls. It is BOUNDED: a number that already belongs to an account is never touched (that is the phone_taken collision, parked and proven in S-LIVE-3), so only unregistered numbers can be pre-bound, and the entitlement gate above means such an account holds nothing until a channel is proven. Closing it fully means teaching find_login_identity to prefer a confirmed row — a change to the live login path of every existing user, which inviolable rule 2 puts outside this phase.`,
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
};

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
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep the raw text */
  }
  return { status: res.status, ok: res.ok, body };
}

const rpc = (name, args = {}) => sb(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
const rest = (query) => sb(`/rest/v1/${query}`);

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

async function recoverIssuedCode(email) {
  if (!otpMod) throw new Error(`${OTP_MODULE} could not be loaded, so the issued code cannot be recovered`);
  if (!LIVE.pepper) {
    throw new Error(
      "SHADOW_EMAIL_OTP_PEPPER is unset. It has no default here and none in the function either — verify-email-otp returns 503 otp_unconfigured without EMAIL_OTP_PEPPER, so no code was issued to recover",
    );
  }
  const len = otpMod.OTP_LENGTH;
  const sample = "0".repeat(len - 1) + "7";
  const real = await otpMod.hashOtpCode(sample, LIVE.pepper);
  const fast = (code) => createHmac("sha256", LIVE.pepper).update(`${len}:${code}`).digest("hex");
  if (fast(sample) !== real) {
    throw new Error("the suite's fast hash does not agree with _shared/otp.ts hashOtpCode; refusing to guess the scheme");
  }

  const r = await rest(
    `email_otp_codes?email=eq.${encodeURIComponent(email)}&select=id,code_hash,expires_at,consumed_at,attempt_count,created_at&order=created_at.desc&limit=1`,
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
    `the stored code hash for ${email} matches no code in the ${len}-digit space under this pepper — SHADOW_EMAIL_OTP_PEPPER must be the shadow project's EMAIL_OTP_PEPPER byte for byte. There is no fallback to fall back to: verify-email-otp reads EMAIL_OTP_PEPPER and returns 503 otp_unconfigured when it is unset, so a code that was issued at all was issued under that exact value`,
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

    // WHAT THE MINTED ROW CARRIES — BOTH IDENTIFIERS, observed as a fact on a
    // real project rather than read off the source. S-STATIC-6B asserts the
    // same contract statically; this is the half that source cannot establish,
    // because "the row GoTrue actually stored" is an effect, not a reading.
    // The expected number is the fixture's phone as mintablePhone() renders it
    // (normalizePhone -> last 10 digits -> "+91" prefix), which is what makes
    // this a claim about the value written and not merely about nullness.
    const expectedPhone = `+91${FIXTURE.fresh.phone.replace(/\D/g, "").slice(-10)}`;
    const gotPhone = String(user.phone || "");
    claim(
      !!user.email && gotPhone.replace(/\D/g, "") === expectedPhone.replace(/\D/g, ""),
      `PROVEN: the minted auth user carries BOTH identifiers on ONE row — email ${user.email} and auth.users.phone ${gotPhone}, the applicant's number normalised to ${expectedPhone}. This is REQ-IDENT-2's precondition observed rather than assumed: because auth.users.phone is the column find_login_identity matches, a later MSG91 OTP on this number can only resolve to THIS uid, which S-LIVE-2 then measures directly.`,
      `NOT PROVEN: the minted row does not carry both identifiers (email ${JSON.stringify(user.email)}, phone ${JSON.stringify(user.phone)}; expected ${expectedPhone}). Without the phone on the auth row, the applicant's Phone tab misses in find_login_identity, verify-msg91-otp answers 404 signup_requires_email_and_name, and they are pushed at the signup screen this phase promises they will never see.`,
    );
    claim(
      !user.email_confirmed_at && !user.phone_confirmed_at,
      "PROVEN: NEITHER channel is confirmed on the minted row — both identifiers are still nothing but unauthenticated form text, so the account is inert (the 20260727120000 gate grants it no legacy entitlement) until a real OTP proves a channel.",
      `NOT PROVEN: the minted row arrived pre-confirmed (email_confirmed_at ${JSON.stringify(user.email_confirmed_at)}, phone_confirmed_at ${JSON.stringify(user.phone_confirmed_at)}). A public form would be treated as proof of identity, and the entitlement gate that keys on "neither channel confirmed" would not hold it back.`,
    );
    claim(
      user.app_metadata?.levelup_unverified_intake === true ||
        user.raw_app_meta_data?.levelup_unverified_intake === true,
      "PROVEN: the minted row carries the service-role-only app_metadata stamp levelup_unverified_intake = true — the trust signal the entitlement gate reads, present on the real row and not just in the source that writes it.",
      `NOT PROVEN: the minted row has no levelup_unverified_intake stamp (app_metadata ${JSON.stringify(user.app_metadata ?? user.raw_app_meta_data ?? null)}). The entitlement gate keys on that stamp, so without it an intake-minted identity is indistinguishable from one whose owner proved a channel.`,
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

async function liveBothIdentifierBind() {
  await runCase("S-LIVE-2", "live", "Both-identifier bind: either channel resolves to the SAME uid — measured, not assumed", async () => {
    const apps = await applicationFor(FIXTURE.fresh.responseId);
    const uid = apps[0]?.user_id;
    if (!uid) {
      claim(false, "", "NOT PROVEN: no provisioned uid from S-LIVE-1 to bind against.");
      return;
    }

    // find_login_identity IS the production resolver — the one verify-msg91-otp
    // calls on every phone login, and the one verify-email-otp calls on every
    // email login. Asking it directly is the closest a suite can get to "a later
    // OTP" without MSG91 in the loop.
    const byPhone = await rpc("find_login_identity", { p_phone: FIXTURE.fresh.phone.slice(-10), p_email: null });
    const phoneRow = Array.isArray(byPhone.body) ? byPhone.body[0] : byPhone.body;
    claim(
      byPhone.ok && phoneRow?.id === uid,
      `PROVEN: a later PHONE OTP resolves to the SAME uid the application is stamped with (${uid}) — REQ-IDENT-2 holds on the phone channel, MEASURED through find_login_identity, the production resolver verify-msg91-otp calls on every phone login. The applicant who signs in on the Phone tab lands on the identity intake already created for them; no second account is minted and no signup screen is reached.`,
      `NOT PROVEN — THIS IS REQ-IDENT-2 FAILING, AND IT LOCKS APPLICANTS OUT. find_login_identity(phone) returned ${JSON.stringify(phoneRow ?? null)}, not uid ${uid}: the number intake wrote to auth.users is not resolving, so the applicant's phone reaches NOTHING. On the Phone tab verify-msg91-otp therefore misses, falls through to its "no auth user for this phone" branch and answers 404 signup_requires_email_and_name — which src/pages/Login.tsx renders as "No account with this number. Sign up first.", pushing the applicant at the one screen this phase promises they will never see. It cannot be patched inside verify-msg91-otp (inviolable rule 2, diff = 0); the fix belongs in what intake writes. Read S-STATIC-6B, which asserts the same contract on source: if that case passed and this one failed, the write is happening and the RESOLVER is the problem.`,
    );

    const byEmail = await rpc("find_login_identity", { p_phone: null, p_email: FIXTURE.fresh.email });
    const emailRow = Array.isArray(byEmail.body) ? byEmail.body[0] : byEmail.body;
    claim(
      byEmail.ok && emailRow?.id === uid,
      `PROVEN: the EMAIL channel resolves to that same uid (${uid}) — one auth row, two doors, no divergence.`,
      `NOT PROVEN: find_login_identity(email) returned ${JSON.stringify(emailRow)} instead of ${uid}.`,
    );

    const users = await fixtureAuthUsers();
    const carrying = users.filter(
      (u) =>
        (u.email || "").toLowerCase() === FIXTURE.fresh.email ||
        String(u.phone || "").replace(/\D/g, "").endsWith(FIXTURE.fresh.phone.slice(-10)),
    );
    claim(
      carrying.length === 1,
      `PROVEN: exactly ONE auth row carries either of the applicant's identifiers (uid ${carrying[0]?.id}) — and it carries BOTH, so the email door and the phone door open the same account. One human, one identity, no phone-keyed twin beside it: that single row is what makes "a later OTP on either channel resolves to the same auth.uid" true rather than aspirational.`,
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
      let parsed = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* keep the raw text */
      }
      return { status: r.status, ok: r.ok, body: parsed };
    };

    await clearIssuedCodes(FIXTURE.cross.email);
    const sendA = await claimCall({ action: "send", channel: "email", email: FIXTURE.cross.email });
    claim(
      sendA.ok,
      `PROVEN: the claim endpoint issues a code on the SECOND channel (HTTP ${sendA.status}) — the claimant needs nothing but the app to finish.`,
      `NOT PROVEN: the claim's second-channel send failed (HTTP ${sendA.status}): ${JSON.stringify(sendA.body)}`,
    );
    const { code: codeA } = await recoverIssuedCode(FIXTURE.cross.email);
    if (!codeA) {
      claim(
        false,
        "",
        `NOT PROVEN: no issued code for ${FIXTURE.cross.email} could be found in public.email_otp_codes after the claim's send, so the claim's happy path was not exercised. If claim-application stores its codes somewhere else, this suite cannot recover them and the positive claim case cannot be proven.`,
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
      console.log("fixtures: qa-harness/identity-fixtures.sql applied to the shadow project.\n");
    } catch (err) {
      console.error(`\nABORTED: qa-harness/identity-fixtures.sql failed to apply:\n${err.stdout || ""}${err.stderr || err.message}\n`);
      process.exit(2);
    }
  }

  await liveProvisionIdempotency();
  await liveBothIdentifierBind();
  await liveCollisionDefers();
  await liveClaim();
  await liveEmailOtpParity();
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
        `The live lane did not run, so provisioning idempotency, both-identifier binding, collision deferral,\n` +
        `the claim, and email-OTP behaviour are UNPROVEN by this transcript. They are effects on auth.users and\n` +
        `cannot be established by reading source.\n` +
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
