export const meta = {
  name: 'design-fix-sprint',
  description: 'Punch-list fixer for the design revamp: parallel Opus fixers per issue (clustered by file overlap), adversarial verify per fix. Feeds from QA-gate punch lists and Rahul device-testing feedback.',
  whenToUse: 'args = { items: [{ issue, screen, severity?, evidence?, files? }], briefPath?, phase? }',
  phases: [
    { title: 'Fix', detail: 'one fixer per issue, clustered by file overlap', model: 'opus' },
    { title: 'Verify', detail: 'adversarial verification per fix', model: 'opus' },
  ],
}

let a = (typeof args === 'object' && args) ? args : {}
if (typeof args === 'string') { try { a = JSON.parse(args) } catch { a = {} } }
if (!Array.isArray(a.items) || !a.items.length) {
  throw new Error('design-fix-sprint requires args { items: [{ issue, screen, ... }] }')
}
const PHASE = String(a.phase ?? '?')
const RULES = `Repo root: ${a.repoPath || '/Users/rahul/Claude Code/LevelUp-Main-App'} — cd there first; all paths/commands are relative to it.
Repo: LevelUp-Main-App. Context docs: ${a.briefPath ? `${a.briefPath}, ` : ''}DESIGN-STRATEGY.md (north star), CLAUDE.md (risk tiers).
RULES: animate transform/opacity only; cap backdrop-blur; never regress prefers-reduced-motion; never touch html/body overflow; use existing tokens (src/index.css, tailwind.config.ts, src/lib/motion); match surrounding style; do NOT commit or push; do NOT run "npm run build" (orchestrator integrates); verify with npx vitest run + eslint on touched files.`

const FIX_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['status', 'filesTouched', 'summary'],
  properties: {
    status: { type: 'string', enum: ['fixed', 'cannot-reproduce', 'blocked'] },
    filesTouched: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    notes: { type: 'string' },
  },
}
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verified', 'notes'],
  properties: { verified: { type: 'boolean' }, notes: { type: 'string' } },
}

// Cluster items by declared file overlap; items with unknown files go in ONE
// sequential lane so parallel fixers can't collide blindly.
const known = a.items.filter((it) => Array.isArray(it.files) && it.files.length)
const unknown = a.items.filter((it) => !Array.isArray(it.files) || !it.files.length)
const parent = known.map((_, i) => i)
const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])))
for (let i = 0; i < known.length; i++)
  for (let j = i + 1; j < known.length; j++)
    if (known[i].files.some((f) => known[j].files.includes(f))) parent[find(i)] = find(j)
const clusterMap = {}
known.forEach((it, i) => { const r = find(i); (clusterMap[r] = clusterMap[r] || []).push(it) })
const clusters = Object.values(clusterMap)
if (unknown.length) clusters.push(unknown)
log(`Fix sprint: ${a.items.length} items in ${clusters.length} lane(s)`)

phase('Fix')
const fixOne = async (it, idx) => {
  const label = `${it.screen || 'app'}#${idx}`
  let fix = await agent(
    `${RULES}

You are fixing ONE issue from the design-revamp phase ${PHASE} punch list. Reproduce it in the code first (read the files, run the dev server briefly if needed — kill it after), then fix it properly (root cause, not a patch-over).

ISSUE: ${it.issue}
SCREEN: ${it.screen || 'unknown'}
SEVERITY: ${it.severity || 'unspecified'}
EVIDENCE: ${it.evidence || 'none provided'}
LIKELY FILES: ${Array.isArray(it.files) && it.files.length ? it.files.join(', ') : 'unknown — locate them yourself'}`,
    { label: `fix:${label}`, phase: 'Fix', model: 'opus', effort: 'high', schema: FIX_SCHEMA }
  )
  if (!fix) return { ...it, status: 'blocked', summary: 'fixer died' }
  if (fix.status !== 'fixed') return { ...it, status: fix.status, summary: fix.summary, filesTouched: fix.filesTouched }

  let verify = await agent(
    `${RULES}

Adversarially verify this fix. Read the diff (\`git diff -- ${fix.filesTouched.join(' ')}\`) and the surrounding code. Try to REFUTE that the issue is truly fixed at the root cause, without side effects (other screens using the same component, reduced-motion, 360px width, Android WebView vs iOS divergence).

ORIGINAL ISSUE: ${it.issue} (screen: ${it.screen || '?'}; evidence: ${it.evidence || 'n/a'})
FIXER'S CLAIM: ${fix.summary}`,
    { label: `verify:${label}`, phase: 'Verify', model: 'opus', effort: 'high', schema: VERIFY_SCHEMA }
  )
  if (verify && !verify.verified) {
    const fix2 = await agent(
      `${RULES}

Your fix for this issue FAILED verification. Address the verifier's objection completely.
ISSUE: ${it.issue}
YOUR PREVIOUS FIX: ${fix.summary} (files: ${fix.filesTouched.join(', ')})
VERIFIER'S OBJECTION: ${verify.notes}`,
      { label: `refix:${label}`, phase: 'Fix', model: 'opus', effort: 'high', schema: FIX_SCHEMA }
    )
    if (fix2 && fix2.status === 'fixed') {
      fix = fix2
      verify = await agent(
        `${RULES}\n\nRe-verify (attempt 2). Try to refute: ISSUE: ${it.issue}\nFIX: ${fix2.summary}\nDiff: \`git diff -- ${fix2.filesTouched.join(' ')}\``,
        { label: `reverify:${label}`, phase: 'Verify', model: 'opus', effort: 'high', schema: VERIFY_SCHEMA }
      )
    }
  }
  return {
    ...it,
    status: verify && verify.verified === false ? 'fix-unverified' : 'fixed',
    summary: fix.summary,
    filesTouched: fix.filesTouched,
    verifierNotes: verify ? verify.notes : 'verifier unavailable',
  }
}

const laneResults = await parallel(clusters.map((lane) => async () => {
  const out = []
  for (let i = 0; i < lane.length; i++) out.push(await fixOne(lane[i], i))
  return out
}))
const results = laneResults.filter(Boolean).flat()
const fixed = results.filter((r) => r.status === 'fixed')
log(`Fix sprint done: ${fixed.length}/${a.items.length} fixed`)

return {
  phase: PHASE,
  fixed,
  deferred: results.filter((r) => r.status !== 'fixed'),
  tokensSpent: budget.spent(),
}
