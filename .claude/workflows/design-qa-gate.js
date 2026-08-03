export const meta = {
  name: 'design-qa-gate',
  description: 'Acceptance gate for a design-revamp phase: multi-lens Opus QA (motion, layout, a11y, perf, visual-vs-strategy) + completeness critic + chair verdict with punch list.',
  whenToUse: 'Run after design-phase-build or design-fix-sprint. args = { phase, briefPath, routes, devPort?, notes? }',
  phases: [
    { title: 'Lenses', detail: 'parallel QA lenses + completeness critic', model: 'opus' },
    { title: 'Verdict', detail: 'chair weighs lenses into PASS / FIX-LIST / BLOCK', model: 'opus' },
  ],
}

// ── args ────────────────────────────────────────────────────────────────────
// phase:     number|string — phase id
// briefPath: string        — design/briefs/phase-N.md
// routes:    string[]      — app routes the phase touched, e.g. ["/home", "/learn"]
// devPort:   number        — port to run the vite dev server on (default 5175)
// notes:     string        — optional orchestrator notes (e.g. "re-gate after fix sprint #2")
let a = (typeof args === 'object' && args) ? args : {}
if (typeof args === 'string') { try { a = JSON.parse(args) } catch { a = {} } }
if (!a.briefPath || !Array.isArray(a.routes) || !a.routes.length) {
  throw new Error('design-qa-gate requires args { phase, briefPath, routes[] }')
}
const PHASE = String(a.phase ?? '?')
const PORT = a.devPort || 5175
const SHOTS_DIR = `design/qa/phase-${PHASE}`

const REPO = a.repoPath || '/Users/rahul/Claude Code/LevelUp-Main-App'
const BASE = `Repo root: ${REPO} — cd there first; all paths/commands are relative to it.
You are QA on design-revamp phase ${PHASE} of LevelUp-Main-App (Vite + React + Capacitor; ships to Android WebView, iOS WKWebView, web).
Ground truth documents (read first): the phase brief at ${a.briefPath}, DESIGN-STRATEGY.md (north star + §6 acceptance criteria), CLAUDE.md (change-risk tiers).
The diff under review: \`git diff main\` on the current branch (if empty, review the last commits: \`git log main..HEAD --oneline\` + \`git show\`).
${a.notes ? `ORCHESTRATOR NOTES: ${a.notes}` : ''}
Be adversarial and evidence-based. Cite file:line or screenshot filenames. Your job is to find what is NOT world-class yet — do not rubber-stamp.`

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['lens', 'verdict', 'findings'],
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['issue', 'screen', 'severity', 'evidence'],
        properties: {
          issue: { type: 'string' },
          screen: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          evidence: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    summary: { type: 'string' },
  },
}

// ── Lenses ──────────────────────────────────────────────────────────────────
phase('Lenses')
const VISUAL_SETUP = `SETUP for live inspection: start the dev server yourself with \`npm run dev -- --port ${PORT} --strictPort\` (repo root; a .env with VITE_DEV_ADMIN_BYPASS=true already exists, so /home etc. are reachable without OTP login — a yellow dev banner at the top is expected, ignore it in judgments). Use Playwright for screenshots/interaction — follow the webapp-testing skill's tooling if available, otherwise \`npx playwright\` directly (install with \`npx playwright install chromium\` if needed). Capture BOTH 375x812 and 360x740 viewports. Save all screenshots under ${SHOTS_DIR}/ (create it) with self-describing names like home-375.png, chapter-scrolled-360.png. Routes to cover: ${a.routes.join(', ')}. Kill the dev server when done.`

const lenses = [
  { key: 'motion', q: `LENS — MOTION & INTERACTION CORRECTNESS. Verify every motion/interaction behavior the brief promises actually exists and uses the shared tokens (src/lib/motion, tailwind motion tokens) — not one-off values. Check springs/durations/easings in the diff, exit animations, stagger correctness, interruptibility (no blocking animations), and that press states exist on every new tappable surface. Static-code lens: read the diff and components; no browser needed.` },
  { key: 'layout', q: `LENS — LAYOUT AT PHONE WIDTHS. ${VISUAL_SETUP} Audit every covered route at both widths: overflow/clipped text, safe-area collisions, letterboxed or missing imagery, broken alignment, tap targets under 44px, content hidden behind the tab bar. Scroll each route fully.` },
  { key: 'a11y-motion', q: `LENS — REDUCED MOTION + ACCESSIBILITY. Static + code lens. Verify prefers-reduced-motion still fully neutralizes new animations (check the new code paths — framer-motion springs do NOT automatically respect it; look for useReducedMotion/MotionConfig handling), focus rings on new interactive elements, aria labels on icon-only buttons, contrast of any new text-on-image treatments.` },
  { key: 'perf', q: `LENS — PERFORMANCE SMELLS. Static lens on the diff: animations of layout properties (width/height/top/left), uncapped or stacked backdrop-filter blurs, unthrottled scroll/resize listeners, useScroll handlers doing layout reads, missing will-change/transform hints where springs run on large surfaces, images without dimensions (CLS), new heavy deps. Flag anything that will jank a mid-range Android WebView.` },
  { key: 'visual', q: `LENS — VISUAL QUALITY vs THE STRATEGY. ${VISUAL_SETUP} Judge the screenshots against DESIGN-STRATEGY.md §6 acceptance criteria and the phase brief's goals: does this actually look world-class? Depth/light logic, image treatment (no letterboxing/voids/pop-in), typography hierarchy, badge/accent discipline, empty/loading states. Name the specific screens that still look template-y and why.` },
  { key: 'identity-spine', q: `LENS — IDENTITY & AUTH INTEGRITY (only when the diff touches auth, provisioning, OTP or \`cohort_applications\`; if it does not, return verdict "pass" with an empty findings array and say so in the summary). The adversarial suite is \`node qa-harness/identity-spine.spec.mjs\` — RUN IT and read the transcript, do not summarise the source instead. Without a shadow project in the environment it degrades to the static lane and still exits 0 — that exit code is NOT a sign-off. Read the banner: when it prints "PARTIAL PROOF — THIS IS NOT A SIGN-OFF RUN", say so in your summary and treat every live case it names (idempotency, both-identifier bind, collision deferral, the claim, email-OTP behaviour) as UNPROVEN rather than assuming it passes. Each line states the property it proves, so quote the exact "NOT PROVEN" lines as evidence. Then go past the suite: the invariants are that provisioning is idempotent (one auth user, one application, however many ticks), that ONE auth row per human means an OTP resolves to the identity intake created rather than minting a second one, that a collision NEVER silent-merges (user_id NULL + pending_claim, zero users minted, the incumbent row untouched), that a wrong second-channel code attaches nothing, that the phone path (\`verify-msg91-otp\`) and the payment pipeline have a ZERO diff, and that no signup screen or password field is reachable on the applicant path (Tally -> provisioned user -> Login OtpTabs -> ClaimApplication -> Home ApplicantStageCard) — the legacy /signup route is a DISCLOSED, pre-existing exemption the suite prints, not a finding. On identifiers, verify against the CODE rather than any summary: the contract is the brief's line 21 (\`createUser({ email, phone, email_confirm:false, phone_confirm:false })\`), S-STATIC-6B asserts it statically and S-LIVE-1/2 measure it, and the phone is passed via a CONDITIONAL SPREAD — so read the call sites themselves (\`tally-application-poll/index.ts\`, \`tally-application-webhook/index.ts\`) before writing any finding about what a minted account carries, and treat a claim that an identifier is absent as needing that evidence. S-STATIC-6B also prints an ACCEPTED RESIDUAL RISK note (an intake-written phone is resolvable before an OTP proves it, bounded by the phone_taken collision and the unverified-intake entitlement gate) — rule on it explicitly rather than passing over it. Hunt for what the suite cannot see: a fail-soft catch that swallows a real error, an unprovisioned applicant left with no route in, a claim that needs an admin, PII in a log line. Rank anything that could merge two identities or lock a real user out as critical.` },
  { key: 'room-access-leak', q: `LENS — ROOM ACCESS LEAK (blocking, Tier-1). SCOPE GATE FIRST: this lens applies ONLY to the cohort-rooms phases R0, R1, R2, R3, R4. Phase under review is "${PHASE}" — if that is not one of those, return verdict "pass" with zero findings and summary "not a rooms phase" and do NOTHING else. Otherwise: the adversarial access suite is the sign-off artifact that proves one cohort's private content cannot leak to another cohort's students, and it must be re-proven on every rooms phase because R1–R4 add UI and RPC surface on top of the R0 wall. PREREQUISITE — PROVISION THE SHADOW BEFORE THE SUITE COMMAND, EVERY RUN, AND RUN ALL FOUR STEPS IN THIS ORDER. The suite refuses to run against a shadow that lacks production's table grants, and exits 2 saying so. That is correct behaviour and a SETUP STEP, not a finding: a database built from supabase/migrations/ alone grants the client roles almost nothing, PostgreSQL checks the GRANT before it ever consults RLS, and every RLS assertion would pass vacuously.
  0. IF \`supabase db push\` HAS EVER RUN AGAINST THIS SHADOW, EMPTY IT FIRST — \`psql "$SHADOW_DB_URL" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' -c 'DELETE FROM supabase_migrations.schema_migrations;'\`, or re-create the shadow project. Step 1 arms \`ALTER DEFAULT PRIVILEGES\`, which PostgreSQL consults at CREATE TABLE time and never again, so it cannot retrofit the nine tables R0 creates. On an already-pushed shadow steps 1–3 all succeed, print their NOTICEs, change nothing that matters, and leave exactly the state the suite aborts on. DO NOT USE \`supabase db reset\` FOR THIS STEP: it resets the target with the local migrations, i.e. it drops the schema and then re-applies everything in supabase/migrations/ and refills supabase_migrations.schema_migrations — so it hands back a database in which the nine R0 tables already exist, step 1 has nothing to arm, step 2 is a no-op, and you land back on the same abort. What step 0 must produce is an EMPTY database at the moment step 1 runs. Note also that dropping schema public clears the pg_default_acl rows step 1 writes (they are schema-scoped), so any later schema drop silently un-arms a shadow that used to pass — re-run from step 0 after one.
  1. \`psql "$SHADOW_DB_URL" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql\` — BEFORE \`db push\`. This pass arms the create-time default privileges, which only affect tables created afterwards, and re-grants \`USAGE ON SCHEMA public\` to the client roles, which the step-0 schema drop took away. Skipping it after step 0 leaves every request refused above the table ACL; the suite aborts on that too.
  2. \`supabase db push --db-url "$SHADOW_DB_URL"\` — builds the schema.
  3. \`psql "$SHADOW_DB_URL" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql\` — the identical line again, AFTER \`db push\`. This pass applies the generated per-table grants, which skipped every table that did not yet exist on pass 1.
THE \`-v ROOM_QA_SHADOW=1\` MARKER IS MANDATORY ON BOTH psql PASSES: shadow-grants.sql refuses to run without it, because it permanently alters a database's grant model — a copy of the line that lost the marker exits non-zero every time and provisions nothing. Both passes are idempotent; the ORDERING block at the top of qa-harness/shadow-grants.sql is the authority. A shadow CLONED from prod already carries the grants and arrives with the R0 tables not yet created, so on a fresh clone step 0 has nothing to undo — but once \`db push\` has run against that clone, step 0 applies to it like any other shadow. Ask the orchestrator for SHADOW_DB_URL if it is not in the environment. Only report a grant-precondition abort as a finding if it persists AFTER all four steps — the emptying included, and done as written rather than via \`db reset\` — have actually been carried out; then it is critical, because it means the shadow cannot be provisioned and the wall cannot be proven. An abort that clears once the shadow is emptied and re-provisioned was a missing setup step, not a leak, and is not a finding at all. Every abort the suite prints reproduces this recipe verbatim under a "FIX —" heading; if what you ran differs from it, run the printed one before writing a finding.
Then run the suite as ONE command against the SHADOW Supabase project (never prod ivkvluezuiojovpotlyb): \`SUPABASE_PAT=… ROOM_QA_PROJECT_REF=<shadow ref> npm run test:room-access\` (source SUPABASE_PAT from the vault .env.supabase; ask the orchestrator for the shadow ref if it is not in the environment). EXIT CODES: 0 = the wall holds; 1 = a leak (critical); 2 = the suite COULD NOT RUN — missing credentials, an ungranted shadow, migrations absent, fixtures failed to apply — which is NEVER a pass and must never be reported as one; 3 = \`--list\` was passed, which proves nothing and means you ran the wrong command. ANY non-zero exit is a CRITICAL finding — report the failing case ids and the "↳" evidence lines verbatim, and never downgrade a leak to medium. Exit 0 is NOT the whole verdict: the run also prints CARRIED lines and a "⚠ N KNOWN GAP(S) CARRIED" block for holes it measured in walls R0 does not own (a pre-existing policy on a table outside the room-content set). Report EVERY carried gap as its own finding at severity high, quoting the gap id, its evidence line and its "closing it:" line verbatim — the exit code is 0 by design there, and the whole point of the block is that a green run must not swallow it. Also read qa-harness/cohort-room-access.spec.mjs against design/cohorts/docs/05-ACCESS-SECURITY.md §7 and report, as findings, any case in that matrix which this phase's new surface has made reachable but the suite does not yet attack (a new RPC, a new table, a new client read path). If the suite cannot run at all AFTER the prerequisite above has been carried out — missing credentials, a shadow that still reports itself ungranted, fixtures fail to apply, migrations not on the shadow project — that is itself a critical finding: an unproven wall is a failed lens, never a pass.` },
]

const lensRuns = lenses.map((l) => () =>
  agent(`${BASE}\n\n${l.q}`, {
    label: `lens:${l.key}`, phase: 'Lenses', model: 'opus', effort: 'high', schema: FINDINGS_SCHEMA,
  }).then((r) => (r ? { ...r, key: l.key } : null))
)
const criticRun = () =>
  agent(
    `${BASE}\n\nLENS — COMPLETENESS CRITIC. Read the brief's task list and promises. What did the brief promise that is NOT visibly delivered or verified in the diff? List every promised behavior/screen/state you cannot confirm exists. Also list brief acceptance criteria that no other artifact proves.`,
    { label: 'lens:completeness', phase: 'Lenses', model: 'opus', effort: 'high', schema: FINDINGS_SCHEMA }
  ).then((r) => (r ? { ...r, key: 'completeness' } : null))

const reviews = (await parallel([...lensRuns, criticRun])).filter(Boolean)
const totalFindings = reviews.reduce((n, r) => n + r.findings.length, 0)
log(`Lenses done: ${reviews.filter((r) => r.verdict === 'pass').length}/${reviews.length} pass, ${totalFindings} findings`)

// ── Verdict ─────────────────────────────────────────────────────────────────
phase('Verdict')
const verdict = await agent(
  `${BASE}

You are the gate CHAIR. Lens reviews are below. Produce the decisive verdict:
- PASS only if nothing critical/high remains AND the visual lens confirms the strategy bar is met.
- FIX-LIST when concrete fixable findings remain: deduplicate them across lenses into one punch list (merge same-issue-different-lens entries; keep the strongest evidence).
- BLOCK only for structural problems a fix sprint cannot address (wrong approach, Tier-1 risk needing council).
Screenshots live under ${SHOTS_DIR}/ — reference the key ones for the orchestrator to review.

LENS REVIEWS:
${JSON.stringify(reviews, null, 2)}`,
  {
    label: 'chair-verdict', phase: 'Verdict', model: 'opus', effort: 'high',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['decision', 'summary', 'punchList', 'keyScreenshots'],
      properties: {
        decision: { type: 'string', enum: ['PASS', 'FIX-LIST', 'BLOCK'] },
        summary: { type: 'string' },
        punchList: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['issue', 'screen', 'severity', 'evidence'],
            properties: {
              issue: { type: 'string' }, screen: { type: 'string' },
              severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
              evidence: { type: 'string' },
              files: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        keyScreenshots: { type: 'array', items: { type: 'string' } },
        blockReason: { type: 'string' },
      },
    },
  }
)

return { phase: PHASE, verdict, lenses: reviews, screenshotsDir: SHOTS_DIR, tokensSpent: budget.spent() }
