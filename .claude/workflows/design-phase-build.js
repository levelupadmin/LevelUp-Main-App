export const meta = {
  name: 'design-phase-build',
  description: 'Build one phase of the design revamp: Opus crew implements briefed tasks in file-ownership clusters, adversarial per-task review, then integrate + commit.',
  whenToUse: 'Invoked by the orchestrator per DESIGN-STRATEGY.md phase. args = { phase, briefPath, tasks, branch }',
  phases: [
    { title: 'Plan-check', detail: 'validate brief + task file-ownership map', model: 'opus' },
    { title: 'Build', detail: 'implement tasks in parallel clusters', model: 'opus' },
    { title: 'Integrate', detail: 'full build + tests + commits', model: 'opus' },
  ],
}

// ── args ────────────────────────────────────────────────────────────────────
// phase:     number|string  — phase id, e.g. 0 or "1"
// briefPath: string         — design/briefs/phase-N.md (the single source of truth)
// tasks:     [{ id, title, spec, files: [..], tier: 1|2|3 }]
// branch:    string         — expected git branch, e.g. "design/phase-1"
let a = (typeof args === 'object' && args) ? args : {}
if (typeof args === 'string') { try { a = JSON.parse(args) } catch { a = {} } }
if (!a.briefPath || !Array.isArray(a.tasks) || !a.tasks.length || !a.branch) {
  throw new Error('design-phase-build requires args { phase, briefPath, tasks[], branch }')
}
const PHASE = String(a.phase ?? '?')
const REPO = a.repoPath || '/Users/rahul/Claude Code/LevelUp-Main-App'
const REPO_RULES = `Repo root: ${REPO} — cd there first; ALL file paths and git/npm commands are relative to it.
Repo: LevelUp-Main-App (Vite + React 18 + TS + Tailwind + shadcn + Capacitor; ships to Android WebView, iOS WKWebView, desktop web).
NON-NEGOTIABLE RULES for every agent:
- Read the brief first: ${a.briefPath}. Also skim DESIGN-STRATEGY.md for the north star and CLAUDE.md change-risk tiers.
- Motion/perf budget: animate transform/opacity ONLY; cap backdrop-blur usage (Android WebView compositing); never regress prefers-reduced-motion; never touch html/body overflow behavior (see the 2026-06-14 scroll-outage lesson in CLAUDE.md).
- Use the existing token system (src/index.css variables, tailwind.config.ts, src/lib/motion tokens once they exist). No raw hex, no one-off easings.
- Match surrounding code style. No TODO stubs. No console.log leftovers.
- Do NOT run "npm run build" (integration does that once). Do NOT git commit/push. Stay strictly inside your assigned files.`

// ── Plan-check ──────────────────────────────────────────────────────────────
phase('Plan-check')
const planCheck = await agent(
  `${REPO_RULES}

You are the line producer for design-revamp phase ${PHASE}. Confirm the shoot is ready:
1. Run \`git branch --show-current\` — it must equal "${a.branch}" and \`git status --porcelain\` should show a clean tree (untracked files are OK). If not, set ready=false and explain.
2. Read the brief at ${a.briefPath} and audit the task list below: does the file-ownership map cover every file each task realistically needs to touch? Add missing files to the tasks. Flag any two tasks that will collide on files not declared.
3. Flag anything the brief promises that no task delivers.

TASKS:
${JSON.stringify(a.tasks, null, 2)}`,
  {
    label: 'plan-check', phase: 'Plan-check', model: 'opus',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['ready', 'tasks', 'warnings'],
      properties: {
        ready: { type: 'boolean' },
        reason: { type: 'string' },
        tasks: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'title', 'spec', 'files'],
            properties: {
              id: { type: 'string' }, title: { type: 'string' }, spec: { type: 'string' },
              files: { type: 'array', items: { type: 'string' } },
              tier: { type: 'number' },
            },
          },
        },
        warnings: { type: 'array', items: { type: 'string' } },
      },
    },
  }
)
if (!planCheck || !planCheck.ready) {
  return { phase: PHASE, aborted: true, reason: planCheck ? planCheck.reason : 'plan-check agent failed', warnings: planCheck ? planCheck.warnings : [] }
}
const tasks = planCheck.tasks
log(`Plan-check OK — ${tasks.length} tasks${planCheck.warnings.length ? `; warnings: ${planCheck.warnings.join(' | ')}` : ''}`)

// ── Cluster tasks by file overlap (union-find) ─────────────────────────────
const parent = tasks.map((_, i) => i)
const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])))
const union = (x, y) => { parent[find(x)] = find(y) }
for (let i = 0; i < tasks.length; i++)
  for (let j = i + 1; j < tasks.length; j++)
    if (tasks[i].files.some((f) => tasks[j].files.includes(f))) union(i, j)
const clusterMap = {}
tasks.forEach((t, i) => { const r = find(i); (clusterMap[r] = clusterMap[r] || []).push(t) })
const clusters = Object.values(clusterMap)
log(`Build plan: ${clusters.length} parallel cluster(s) — sizes ${clusters.map((c) => c.length).join(', ')}`)

// ── Build ───────────────────────────────────────────────────────────────────
phase('Build')
const BUILD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['status', 'filesTouched', 'summary', 'checks'],
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    filesTouched: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string', description: 'exact commands run and their pass/fail' },
  },
}
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['approved', 'issues'],
  properties: {
    approved: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['issue', 'severity', 'evidence'],
        properties: {
          issue: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          evidence: { type: 'string' },
        },
      },
    },
  },
}

const buildTask = async (t) => {
  let result = await agent(
    `${REPO_RULES}

You are a senior builder on design-revamp phase ${PHASE}. Implement this task COMPLETELY:

TASK ${t.id} — ${t.title}
SPEC: ${t.spec}
YOUR FILES (exclusive ownership, do not stray): ${t.files.join(', ')}

When done, verify your work: run \`npx vitest run\` and \`npx eslint <your touched files>\`. Fix failures until green. Report exactly what you ran.`,
    { label: `build:${t.id}`, phase: 'Build', model: 'opus', effort: 'high', schema: BUILD_SCHEMA }
  )
  if (!result || result.status !== 'done') return { task: t.id, title: t.title, status: 'blocked', detail: result ? result.summary : 'builder died' }

  let review = null
  for (let round = 0; round < 3; round++) {
    review = await agent(
      `${REPO_RULES}

You are an adversarial reviewer. REFUTE that this implementation meets its spec — hunt for spec gaps, motion/perf budget violations (non-transform/opacity animation, uncapped blur, reduced-motion regressions), broken states (loading/empty/error), 360px-width breakage, and platform divergence (Android WebView vs iOS WKWebView). Read the actual diff: \`git diff -- ${t.files.join(' ')}\` and the files themselves.

TASK ${t.id} — ${t.title}
SPEC: ${t.spec}
BUILDER'S CLAIM: ${result.summary}

Approve ONLY if you genuinely cannot find a real issue. Cosmetic nitpicks are not blocking issues.`,
      { label: `review:${t.id}${round ? `#${round + 1}` : ''}`, phase: 'Build', model: 'opus', effort: 'high', schema: REVIEW_SCHEMA }
    )
    if (!review || review.approved) break
    if (round === 2) break
    result = await agent(
      `${REPO_RULES}

You are fixing review findings on task ${t.id} (${t.title}). SPEC: ${t.spec}
FILES: ${t.files.join(', ')}
FINDINGS TO FIX (all of them):
${JSON.stringify(review.issues, null, 2)}

Fix every finding, re-run \`npx vitest run\` + eslint on touched files until green.`,
      { label: `fix:${t.id}#${round + 1}`, phase: 'Build', model: 'opus', effort: 'high', schema: BUILD_SCHEMA }
    ) || result
  }
  return {
    task: t.id, title: t.title,
    status: review && !review.approved ? 'review-failed' : 'done',
    summary: result.summary, files: result.filesTouched, risks: result.risks || [],
    openIssues: review && !review.approved ? review.issues : [],
  }
}

const clusterResults = await parallel(clusters.map((cluster) => async () => {
  const out = []
  for (const t of cluster) out.push(await buildTask(t))
  return out
}))
const taskResults = clusterResults.filter(Boolean).flat()
const failed = taskResults.filter((r) => r.status !== 'done')
log(`Build done: ${taskResults.length - failed.length}/${tasks.length} tasks clean${failed.length ? `; needs attention: ${failed.map((f) => f.task).join(', ')}` : ''}`)

// ── Integrate ───────────────────────────────────────────────────────────────
phase('Integrate')
const integrate = await agent(
  `${REPO_RULES}

You are the integration engineer for design-revamp phase ${PHASE} on branch ${a.branch}. All builders are finished. Now:
1. Run the FULL suite: \`npm run build\`, \`npx vitest run\`, \`npm run lint\`. Fix ONLY integration-level breakage (imports, type errors from parallel work) — do not redesign anything.
2. Group the working-tree changes into logical commits (conventional commit messages, e.g. "feat(design): ..."). End every commit message with:
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
3. Do NOT push. Report \`git log --oneline\` of your commits and \`git diff main --stat | tail -1\`.

TASK RESULTS (for commit grouping context):
${JSON.stringify(taskResults.map((r) => ({ task: r.task, title: r.title, files: r.files })), null, 2)}`,
  {
    label: 'integrate', phase: 'Integrate', model: 'opus', effort: 'high',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['buildGreen', 'testsGreen', 'lintClean', 'commits', 'diffstat'],
      properties: {
        buildGreen: { type: 'boolean' }, testsGreen: { type: 'boolean' }, lintClean: { type: 'boolean' },
        commits: { type: 'array', items: { type: 'string' } },
        diffstat: { type: 'string' },
        notes: { type: 'string' },
      },
    },
  }
)

return {
  phase: PHASE,
  branch: a.branch,
  planCheckWarnings: planCheck.warnings,
  tasks: taskResults,
  integrate,
  tokensSpent: budget.spent(),
}
