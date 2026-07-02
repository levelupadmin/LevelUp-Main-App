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
