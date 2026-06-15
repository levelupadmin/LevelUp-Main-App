export const meta = {
  name: 'bugfix-council',
  description: 'Adversarial pre-ship review of a bug fix: root-cause, blast-radius red-team, alternatives, security — then a decisive verdict with the verifications required before shipping. Gate on blast radius, not diff size.',
  phases: [
    { title: 'Review' },
    { title: 'Verdict' },
  ],
}

// Invoke: Workflow({ name: "bugfix-council", args: { fix, files, scope } })
//   fix   — what changed and why (the author's description of the fix)
//   files — array of touched files (or omit; the council reads the git diff)
//   scope — optional: which platforms/surfaces this touches
const a = (typeof args === 'object' && args) ? args : {}
const FIX = a.fix || a.description || 'Review the current uncommitted diff (git diff HEAD) and the last commit (git show HEAD) in this repo.'
const FILES = Array.isArray(a.files) ? a.files.join(', ') : (a.files || '(infer from the git diff)')
const SCOPE = a.scope || 'Infer which platforms/surfaces this touches: desktop web, Android System WebView, Android Chrome, iOS WKWebView, server/edge functions, database.'

const BASE = `You are on a council reviewing a proposed BUG FIX before it ships to production. Work in this repo.
Inspect the ACTUAL change first: run \`git diff HEAD\`, \`git diff --staged\`, and \`git show HEAD\`, and read the touched files: ${FILES}.

THE FIX (as described by the author): ${FIX}
SURFACES/SCOPE: ${SCOPE}

Be adversarial, concrete, and evidence-based. Cite file:line. Do NOT rubber-stamp — your job is to find what's wrong before users do.`

phase('Review')
const lenses = [
  { key: 'root-cause', q: `LENS — ROOT CAUSE vs SYMPTOM. Is this fixing the actual underlying cause or masking a symptom? What is the true root cause? Could the same bug resurface elsewhere because the real cause is untouched? Is there a more correct fix at a different layer (the offending component/route/data) rather than a global guard?` },
  { key: 'blast-radius', q: `LENS — BLAST RADIUS / RED-TEAM. THE MOST IMPORTANT LENS. Enumerate EVERYTHING this change can affect beyond the reported bug: which screens, components, routes, user states, locales, and especially which PLATFORMS (desktop web vs Android System WebView vs Android Chrome vs iOS WKWebView — they diverge). For shared surfaces (global CSS, scroll/layout roots, routing, auth, env, native shell, payments, DB/RLS) state plainly that the change is app-wide and multi-platform. Name concrete things that could break that the author probably did NOT test. Try hard to find one platform or edge case where the fix ITSELF breaks something.` },
  { key: 'alternatives', q: `LENS — ALTERNATIVES. Propose 2-3 other ways to fix this. For each, give pros/cons vs the chosen fix. Is the chosen fix the best trade-off, or is there a safer / simpler / more-targeted option (e.g., constrain the real offending element instead of a global guard)? Recommend the option you'd ship.` },
  { key: 'security', q: `LENS — SECURITY / DATA SAFETY. Could this fix introduce a vulnerability, leak data, weaken auth/RLS, bypass a gate, mishandle untrusted input, or create an irreversible/destructive risk? If clearly not applicable, say so in one line and move on.` },
]

const reviews = await parallel(lenses.map((l) => () =>
  agent(`${BASE}\n\n${l.q}`, {
    label: `review:${l.key}`,
    phase: 'Review',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['lens', 'verdict', 'findings', 'recommendation'],
      properties: {
        lens: { type: 'string' },
        verdict: { type: 'string', enum: ['ship', 'revise', 'needs-verification', 'block'] },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['issue', 'severity', 'evidence'],
            properties: {
              issue: { type: 'string' },
              severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
              evidence: { type: 'string' },
              files: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        requiredVerifications: { type: 'array', items: { type: 'string' } },
        recommendation: { type: 'string' },
      },
    },
  }).then((r) => ({ ...r, key: l.key }))
))

phase('Verdict')
const verdict = await agent(
  `${BASE}

You are the chair. The four lens reviews are below. Weigh them, resolve disagreements, and produce the final, decisive pre-ship verdict. Remember: the council surfaces RISKS; those risks must be VERIFIED on the real surface before shipping, not argued away.

LENS REVIEWS:
${JSON.stringify(reviews.filter(Boolean), null, 2)}`,
  {
    label: 'verdict',
    phase: 'Verdict',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['decision', 'riskTier', 'rationale', 'mustVerifyBeforeShip', 'blockingIssues', 'saferAlternative', 'stagedRolloutRecommended'],
      properties: {
        decision: { type: 'string', enum: ['SHIP', 'SHIP-AFTER-VERIFICATION', 'REVISE', 'BLOCK'] },
        riskTier: { type: 'string', enum: ['1-high-blast-radius', '2-component', '3-trivial'] },
        rationale: { type: 'string' },
        mustVerifyBeforeShip: { type: 'array', items: { type: 'string' } },
        blockingIssues: { type: 'array', items: { type: 'string' } },
        saferAlternative: { type: 'string' },
        stagedRolloutRecommended: { type: 'boolean' },
      },
    },
  }
)

return { verdict, reviews: reviews.filter(Boolean) }
