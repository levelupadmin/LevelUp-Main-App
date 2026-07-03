# The Studio System — orchestration playbook for the design revamp

*How the DESIGN-STRATEGY.md phases get built. Any Claude session (fresh context included) runs this identically: Rahul says "run phase N" and this file is the contract. Companion docs: `DESIGN-STRATEGY.md` (the creative what), `CLAUDE.md` (risk tiers + release runbooks), `ARCHITECTURE.md` (code map).*

## Roles

**Fable 5 (main loop) = director.** Decisions, briefs, delegation, QA adjudication, releases, reporting. The director does NOT write app code and does NOT read app source wholesale during build phases. It consumes: structured workflow returns, `git diff main --stat`, QA screenshots (`design/qa/phase-N/`), and release logs. Exceptions where the director looks closer: adjudicating a BLOCK verdict, and reviewing gate screenshots before accepting a PASS.

**Opus 4.8 (workflow agents) = crew.** All building, reviewing, fixing, visual QA runs as `model: 'opus'` agents inside the three workflows below. Builders/reviewers run `effort: 'high'`; mechanical work runs `effort: 'low'`.

## Token doctrine (why this is cheap)

1. Briefs are written once per phase (`design/briefs/phase-N.md`) and passed by path — agents read from disk; the director never re-narrates context.
2. All agent outputs are schema-forced JSON — no prose parsing, no re-reading transcripts.
3. Interrupted/edited workflow runs resume with `resumeFromRunId` — completed agents return cached, only new work runs.
4. Every workflow returns `tokensSpent`; the director reports per-phase token cost to Rahul in the ship notice.
5. The director's own context stays lean: briefs, verdicts, screenshots, stats — never the diff bodies.

## The three workflows (`.claude/workflows/`)

| Workflow | Purpose | Key args |
|---|---|---|
| `design-phase-build` | Build a phase: plan-check → clustered parallel builders (file-ownership map, overlap = sequential lane) → adversarial per-task review (≤2 fix loops) → integrate (full build+tests) + conventional commits | `{ phase, briefPath, tasks[], branch }` |
| `design-qa-gate` | Acceptance gate: 5 lenses (motion, layout@360/375, reduced-motion/a11y, perf smells, visual-vs-strategy with live Playwright screenshots) + completeness critic → chair verdict `PASS / FIX-LIST / BLOCK` + deduped punch list | `{ phase, briefPath, routes[], devPort?, notes? }` |
| `design-fix-sprint` | Punch-list fixes (gate failures AND Rahul's device feedback): clustered fixers → adversarial verify per fix (1 retry) | `{ items[], briefPath?, phase? }` |

Plus the pre-existing **`bugfix-council`** — mandatory before releasing any phase whose diff touches Tier-1 surfaces (`src/index.css`, layout roots, routing, auth, native shell, payments — see CLAUDE.md).

**Operational lessons from the phase-0 dry run (2026-07-02):**
- Invoke workflows by **`scriptPath`** (absolute path into `.claude/workflows/`), NOT by name — the name registry roots at the parent workspace and serves stale/missing entries from this session layout.
- The runtime may deliver `args` as a JSON **string**; all three scripts parse both forms — keep that guard.
- Council scope: phases that release a build get a council over the accumulated Tier-1 touches since the last released build (phase 0 released nothing → its tailwind.config.ts touch is covered by phase 1's pre-release council).
- QA screenshots land in `design/qa/` (gitignored). Fix-sprint commits are the director's job (`fix(design): close QA-gate round-N punch list`).

## The per-phase loop

```
1  git checkout -b design/phase-N (from up-to-date main)
2  Director writes design/briefs/phase-N.md   (from DESIGN-STRATEGY.md §3–5; explicit task list
   with file ownership; acceptance criteria; open product questions surfaced to Rahul NOW)
3  Workflow: design-phase-build
4  Workflow: design-qa-gate
5  if FIX-LIST → design-fix-sprint → re-gate (notes: "re-gate after sprint #K")
   ── loop until PASS; after 3 failed loops STOP and escalate to Rahul with the
   punch list + screenshots (do not grind tokens on a structural problem)
   if BLOCK → director adjudicates personally (read the evidence, decide, possibly council)
6  Director reviews keyScreenshots + git diff main --stat, then: bugfix-council if Tier-1
7  ⚠️ DO NOT MERGE TO MAIN YET — main auto-deploys the web app to PRODUCTION via
   Vercel, and students use web (it's the native purchase path). Merging would break
   the internal-channels-only decision. Phase branches ship stores directly:
8  RELEASE TRAIN (director, main loop, FROM the design/phase-N branch — runbooks in CLAUDE.md):
   a. bump android versionCode/versionName + iOS CURRENT_PROJECT_VERSION (on the branch)
   b. npm run build && npx cap sync android && npx cap sync ios (commit native changes)
   c. Android: gradlew bundleRelease → play-publish.mjs <aab> --track internal
   d. iOS: xcodebuild archive/export → altool upload → TestFlight
   e. verify: play-publish --status + asc-api builds
9  Notify Rahul: what shipped, WHAT TO TEST (per-screen checklist from the brief + the
   council's mustVerifyBeforeShip list), token cost, known deferred items
10 Immediately: branch design/phase-N+1 OFF design/phase-N (stacked), write its brief, start step 3
11 On Rahul's "promote phase N": merge the phase branch → main (web prod goes live),
   push, then staged store rollout per CLAUDE.md (10–20% → watch → 100%). Promotion is
   gated on his on-device checklist, per the phase council.
11 Rahul's device feedback (any time) → director triages into items[] →
   design-fix-sprint on a fix/ branch off main → gate the touched routes → merge →
   next internal build picks it up (hotfix build only if severity demands)
```

**Production promotion is NEVER automatic.** Internal track + TestFlight only, until Rahul explicitly says "promote phase N" — then the staged-rollout doctrine in CLAUDE.md applies (10–20% → watch → 100%).

## Phase register

| Phase | Scope (see DESIGN-STRATEGY.md §5) | Branch | Status |
|---|---|---|---|
| 0 | Foundation: shadow/z tokens, motion lib + primitives, ArtworkImage, haptics install | `design/phase-0` | ✅ MERGED to main 2026-07-02 (`0939b02`) — build → gate FIX-LIST(9) → sprint 7/7 → re-gate PASS. ~2.7M Opus tokens, 44 agents. 5 low adoption-time notes carried into the phase-1 brief |
| 1 | Core loop: Home, button/card adoption, tab bar, shared-element, craft-bug sweep | `design/phase-1` | ✅ SHIPPED-INTERNAL 2026-07-03: Android 613/3.5.0 on Play internal track (prod stays 612). iOS blocked — no Xcode on this Mac. 3 gates + 3 sprints + council (REVISE→resolved). ~9.5M Opus tokens, ~120 agents. NOT merged to main (web-prod gate). Carry-overs in phase-2 brief: greeting band coarse-pointer parking (index.css:227, Tier-1+council), Learn empty CTA 40px@360, CatalogSection pills a11y, UpcomingSessions focus ring, MyCoursesPage .pressable, ken-burns device perf, HeroPlayChip legacy blur |
| 2 | Screening room: ChapterViewer, exit animations, skeleton crossfade | `design/phase-2` | pending |
| 3 | Money pages: PublicOffering/checkout choreography (+PostHog if approved) | `design/phase-3` | pending |
| 4 | Tactility: sheets/gestures, stats/streak (if approved), Community/Login/Profile | `design/phase-4` | pending |
| 5 | Hardening: device matrix, perf, microcopy → first production-promotion candidate | `design/phase-5` | pending |

Update the Status column as phases move (brief ready → building → gating → shipped-internal → promoted).

## Hard rules inherited from repo history

- The 2026-06-14 lesson: one-word CSS changes to html/body killed Android scroll in prod. **Anything touching `src/index.css` or layout roots is Tier 1** → council + real-device verify before release, no exceptions because "it looks trivial."
- Perf budget on every phase: transform/opacity-only animation, capped blur, 60fps on a mid-range Android — the gate's perf lens enforces the smells, but the director must ALSO get one real-device confirmation from Rahul's testing before promoting anything to production.
- `.env` dev-bypass flag never ships; keystore/ASC secrets never echoed (see CLAUDE.md secret rules).
