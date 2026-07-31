# LevelUp Cohort Product — Build Handoff

**Written 2026-07-30. For a fresh session taking this over completely.**
Read this whole file before touching anything. Several traps below have already
cost real hours; they are documented so they are not rediscovered.

---

## 1. What this is

A live-cohort product for the LevelUp main app (React + Vite + Supabase +
Capacitor). The plan is **`design/cohorts/EXECUTION-BACKLOG-V3.md`** (present in
every worktree). Twelve phases; the funnel half is built, the room half is
partly built.

**Pilot offering:** "Creator Academy Edition 2", ₹57,000, ~8 weeks out.
Offering id `449056b9-9269-4bc5-ba8b-4c079c2104ee`.

**Production Supabase ref:** `ivkvluezuiojovpotlyb` (region ap-northeast-1).
⚠️ `supabase/config.toml`'s `project_id` is STALE/WRONG — always
`link --project-ref ivkvluezuiojovpotlyb` explicitly.

---

## 2. Current state — everything is safe

All seven branches: **0 uncommitted, 0 unpushed, 0 behind `origin/main`**
(`origin/main` @ `cbfe628`).

| Worktree | Branch | HEAD | Tests |
|---|---|---|---|
| `LevelUp-cohort` | `design/cohort-sp` | `a6bda49` | 558 |
| `LevelUp-iv` | `design/cohort-iv` | `0de5da6` | 683 |
| `LevelUp-dc` | `design/cohort-dc` | `a36bdd0` | 841 |
| `LevelUp-re` | `design/cohort-re` | `cee17e7` | 691 |
| `LevelUp-r0` | `design/cohort-r0` | `4d8a565` ⚠️ | 539 |
| `LevelUp-r1` | `design/cohort-r1` | `6bd6f46` ⚠️ | 577 |
| `LevelUp-r2` | `design/cohort-r2` | `c6f41d5` ⚠️ | 662 |

⚠️ **R0, R1 and R2's HEADs are `wip(checkpoint)` auto-saves**, not clean
deliverables. A session limit killed three workflows mid-flight and an automatic
checkpoint loop committed whatever was on disk. **Re-run each phase's gate
before trusting those three**, and expect some half-finished edits.

**SHIPPED TO PRODUCTION:** RC (funnel reconciler, merged, runs dark) and
TP (Tally poller — LIVE, pg_cron every 15 min, ingesting real applications).
**NOTHING ELSE IS MERGED. No migration from these branches is applied. No edge
function from these branches is deployed.**

---

## 3. The environment

**One worktree per phase.** This is not preference — a concurrent session
sharing a checkout destroyed an agent's work once.

- `/Users/rahulsrinivas/Claude/LevelUp-Main-App` — the main checkout.
  **🔴 A CONCURRENT SESSION OWNS THIS. Do not commit into it.** It has had
  uncommitted work and its own branches throughout.
- `LevelUp-Main-App-fieldguide` — someone else's worktree. **Never touch it.**
  Its upstream is misconfigured to `origin/main`, so an ordinary `git push`
  from there would target main. Worth fixing separately.
- **Every new worktree needs `ln -s ../LevelUp-Main-App/node_modules node_modules`.**
  Skipping it cost real time: an agent ran `npm install`, producing a
  426-package tree missing `@lovable.dev/email-js` (present only in the main
  checkout's 427), so an UNMODIFIED file reported a phantom `typecheck:functions`
  failure that looked like a regression.

**Checkpoint loop** (recreate it; it dies with each session):
`/private/tmp/claude-501/-Users-rahulsrinivas-Claude/<session>/scratchpad/checkpoint.sh`
was lost. Rebuild it with two properties that were learned the hard way:
1. **An EXPLICIT ALLOWLIST of worktree names, never a glob.** A `LevelUp-*`
   glob with a single `LevelUp-Main-App` exclusion also matched
   `LevelUp-Main-App-fieldguide` and auto-committed 7 files into it. The push
   only failed because that branch's upstream is misconfigured.
2. **Force-push ONLY when every remote-only commit is its own `wip(checkpoint)`.**
   A workflow's integrate step resets the branch and re-commits, orphaning
   earlier checkpoints; local then holds the good history. Anything else on the
   remote is real work and needs a human.

**Local shadow stack:** OrbStack is installed (`brew install --cask orbstack`;
Docker CLI at `/Applications/OrbStack.app/Contents/MacOS/xbin`, NOT on PATH).
`npx -y supabase@latest start` gives a real Postgres + GoTrue + PostgREST.
`psql` is at `/opt/homebrew/opt/libpq/bin` (keg-only, not on PATH).

---

## 4. Standing rulings from Rahul — do not re-litigate

- **INTEG-PAY-1** — the Tally → ₹400 → Calendly intake chain is FROZEN. The app
  enriches it; it never inserts into it and never originates an order.
- **SOR-1** — TeleCRM is the master. The app NEVER writes a funnel status.
- **SEAT-1** — seat release stays MANUAL in v1. No auto-release cron.
- **MEMBER-1** — three room access tiers. `accepted` = no membership row, no read
  into any room-content table, no preview RPC (that RPC was DELETED).
- **NFR-COPY-1** — the applicant's 100-word essay NEVER reaches a client. It is
  in `cohort_applications.bio`; the raw submission is in `tally_data`.
  **Grep BOTH columns** — an earlier phase grepped one, missed the other, and
  certified a surface clean that was not.
- **No em dashes** in any LevelUp-facing copy.
- **REQ-INT-0 REVERSED (2026-07-28)** — Rahul overrode the parked ruling and
  wants native slot buttons over the Calendly availability API, NOT an embed.
- **V9 RULING (2026-07-30)** — `RecordingPlayer.tsx` STAYS. See §7 R2.
- **Autonomy granted:** build, review, fix, commit, push freely. **Merging to
  main, applying migrations, deploying functions, and flipping any flag that
  reaches real users are Rahul's calls.**

---

## 5. Lessons that cost real hours

1. **`npm run typecheck:functions` before ANY edge-function ship.** Nothing else
   sees `supabase/functions/` — tsconfig covers only `src`, the build is a bare
   `vite build`, and vitest only imports the pure `_shared/*` modules. A
   non-compiling handler once passed 395 tests, a green build and a clean lint.
2. **Verify the data source exists before briefing a UI that renders it.** Three
   surfaces were briefed against sources that do not exist (interviewer
   selectivity rate, review-batch ledger, RE's form-incomplete pool). The right
   answer each time was to render nothing.
3. **Never cite a line number in a brief.** `ApplicationStatus.tsx:319,337` was
   repeated across 23 citations in 15 files; the real guards had drifted to
   396/533/551 and line 319 was unrelated. Cite the symbol plus a grep.
4. **Check a "precedent" before building on it.** A fix round guarded rupee
   amounts on `isIOS()` "matching ApplicationStatus" — whose only `₹` is inside
   a comment. That guard exposed prices in the Play shell, violating the Reader
   Rule. **Purchase UI on Android gates on `isNative()`, not `isIOS()`.**
5. **`grep "^DO \$\$"` silently matches nothing** (BRE parses trailing `$$` as
   literal-`$` + anchor). This produced a false "zero top-level DO blocks"
   certification to a council when there were seven. Use `grep -F` or `^DO`.
6. **`EXCEPTION WHEN OTHERS` does NOT trap `QUERY_CANCELED` (57014).** A
   statement timeout inside an AFTER trigger still aborts — so a room trigger
   could roll back the ENROLMENT (money) write.
7. **`ALTER TABLE` holds ACCESS EXCLUSIVE until COMMIT, not until the statement
   ends.** A contract note asserting otherwise hid a dashboard-blocking migration
   from four reviewers and a whole fix round.
8. **`supabase db push` runs ONE implicit transaction PER FILE**, not one across
   the set (verified against the shipped CLI binary).
9. **A migrations-only database does NOT reproduce production's grants.**
   Measured: 3 of 103 tables granted `SELECT` to anon before
   `qa-harness/shadow-grants.sql`, 101 after. **Every RLS assertion on an
   ungranted shadow passes because permission is denied BEFORE RLS is
   consulted** — green for the wrong reason, worse than no test.
10. **The plan-check has caught more real defects than any council**, because
    the weakest link is the brief. Six of R2's briefing claims were wrong; five
    were verifiable with a one-line grep I did not run. **Verify before
    asserting.**
11. **Distinguish a stale brief from a transient failure.** Both surface as
    "workflow aborted". Ask: *did any agent actually do anything?* A stale brief
    must be rewritten, never retried; a 529 should be retried unchanged.

---

## 6. Two production problems found and closed

**The legacy signup outage — FIXED, verified on prod 2026-07-29.** For ~7 weeks
every TagMango legacy customer's signup aborted: `claim_legacy_enrolments_for_user`
inserted `source='tagmango_migration'`, which `enrolments_source_check` rejects,
inside an AFTER trigger with no handler. Measured: **0 signups from a
legacy-matching phone across 248 attempts** in three months. A concurrent session
fixed it (12 commits, `20260727220000_claim_at_signin.sql`, applied). The live
function is now intentionally empty; claiming moved to `claim_my_purchases()`
after a *verified* sign-in.

**The repo could not build a database from scratch — FIXED.**
`live_sessions.week_id` was created `text`; a later migration adds an FK to a
`uuid`. Prod works only because someone converted it by hand and never recorded
it. Every fresh build died there.

---

## 7. What is outstanding, per phase

### SP — identity spine (`LevelUp-cohort`)
Green. Council passed after a fix round that closed a **net-new account
takeover** (intake wrote an unproven phone into `auth.users.phone`, the phone-OTP
login key).
- **Dead code to remove:** SP's Part 3 gate is now inert — main's
  `claim_at_signin` empties the function it guards. Harmless, worth deleting.
- Live-lane suite: 17/26 cases, 86 properties proven. The failures are **local
  edge functions lacking secrets** (`TALLY_SIGNING_SECRET`, `EMAIL_OTP_PEPPER`),
  not defects. Needs `supabase/functions/.env` for the local stack.

### IV — the interview (`LevelUp-iv`)
Green. **🔴 NEEDS A VERIFICATION COUNCIL** — one was launched and died on the
session limit with zero agents completing. It has had a fix round AND Rahul's
slot-buttons reversal land since its only council.
- Deploy needs a `CALENDLY_SIGNING_KEY` edge secret AND a Calendly-side webhook
  subscription. **Neither exists yet.**
- Calendly facts (verified live): `event_type_available_times` returns real
  slots each carrying a `scheduling_url` deep-link to that exact slot, which
  resolves 200 bare and with `?name=&email=` prefill. **Calendly has NO API to
  create a booking** — the final confirm must happen on their surface.
- The pilot's `offerings.calendly_url` is now set to the Creators Academy
  interview link. **All other offerings still have NULL** — set one per cohort.

### DC — the decision (`LevelUp-dc`)
Green, two councils, two fix rounds, last one verified directly. Closest to
shippable. Its second council found the **Android Reader-Rule violation** that
its own first fix round created — the reason IV and RE need their re-councils.

### RE — re-entry (`LevelUp-re`)
Green. **🔴 NEEDS A VERIFICATION COUNCIL** for the same reason.
- **TWO switches, not one:** `VITE_REMINDER_LADDER` (client) AND
  `REMINDER_LADDER_ENABLED` (server). The client flag cannot gate a Deno cron —
  `import.meta.env` does not exist there.
- **Nothing has ever been sent.** Proven against prod: ledger table absent, 0
  cron jobs, 0 templates, 0 tokens minted, 0 of 4 migrations applied.
- **OPEN DECISION:** unsubscribe stops the ladder but NOT bulk marketing.
  `suppressed_emails` is append-only and gates every transactional send, so
  writing there would kill payment receipts. Both pages state the limit and
  offer support@. A true global opt-out needs a category column or a second list.

### R0 — room backbone (`LevelUp-r0`)
The heaviest phase: RLS on the enrolment path. Two councils, two fix rounds, plus
a residuals round whose integrate step died.
- **🔴 THE ADVERSARIAL SUITE HAS NEVER BEEN EXECUTED.** It needs a shadow with
  grant parity — apply `qa-harness/shadow-grants.sql` AFTER `supabase start`, or
  every assertion passes vacuously.
- Outstanding from the residuals round: the unguarded `CREATE INDEX` on
  `live_sessions` (`20260729100200:67`), the half-guarded DO block in
  `content.sql:265` (has an EXCEPTION handler but no `lock_timeout`, so its
  `query_canceled` branch can never fire), and the grant-layer documentation in
  `design/cohorts/docs/05-ACCESS-SECURITY.md` (which has **zero** mentions of
  TRUNCATE while `design-qa-gate.js` names its §7 as the authority).
- **Stale prose:** `cohort-room-access.spec.mjs:1649,1712` still say "4s
  lock_timeout"; all six sites are now 1s.

### R1 — room shell (`LevelUp-r1`)
**Complete.** Routes, redirect shim, all five components, the hook, MyCohortsPage,
and the nav slot. `useActiveCohort` was deliberately KEPT — the backlog claims
one consumer; there are three, and one drives the community feed's batch scoping.

### R2 — the season (`LevelUp-r2`)
Modules built (~5,300 lines) and correct. **The wiring round died mid-flight.**
- `src/App.tsx` still routes R1's placeholders, so **the modules may still be
  unreachable** — verify. `RoomHome.tsx` may still render "{title} opens here."
- Y-1 reportedly mounted `SessionSlot` and removed the duplicate `SessionRow`;
  **confirm on disk**, since the integrate step never ran.
- **`App.tsx` is Tier 1** (routing root) — it needs the council + cross-platform
  verify, not a tier-2 pass.
- **R2-T5 (retire `/cohort`, flip the flag default) is Rahul's call**, gated on
  his own Android + iOS device pass.

### R3, R4 — NOT STARTED
R3 (announcements, roster, feed, resources — 4 tasks) and R4 (demo day,
certificates, alumni — 4 tasks). Sections are in `ROOMS-BACKLOG.md`.

---

## 8. The deploy sequence — ordering is not obvious

1. **Migrations BEFORE functions.** The poller probes
   `intake_provisioning_gate_ok` and mints nothing without it. Deploy the
   function first and ordinary rows mint intake-tagged auth users while the gate
   is absent — and that stamping is irreversible.
2. **For DC:** migration → reconciler deploy → client ship, in that order.
3. **R0's backbone takes ACCESS EXCLUSIVE on `cohort_batches` during apply**, and
   the shipped dashboard reads that table. The apply window is a brief
   read-block on every platform — pick a quiet hour.
4. **Staged rollout** for any store release (CLAUDE.md has the runbook). Never
   100% on a first push.

---

## 9. Credentials — by location, never by value

All in `~/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/`
(dotfiles — use `ls -a`): `.env.supabase`, `.env.calendly`, `.env.tally`,
`.env.telecrm`, `.env.msg91`, `.env.razorpay`, `.env.interakt`, `.env.meta`,
plus `keystores/`. **Never echo or commit these.**

Prod DB access pattern that works: `node pg` from `~/Claude/ml-team-hub`
(the only checkout with `pg` installed), host
`aws-1-ap-northeast-1.pooler.supabase.com`, user `postgres.ivkvluezuiojovpotlyb`,
password from `SUPABASE_MAIN_APP_DB_PASS`.

---

## 10. How to run things

```bash
# workflows (invoke by scriptPath — the name registry resolves from the wrong root)
/Users/rahulsrinivas/Claude/LevelUp-Main-App/.claude/workflows/design-phase-build.js
/Users/rahulsrinivas/Claude/LevelUp-Main-App/.claude/workflows/bugfix-council.js
/Users/rahulsrinivas/Claude/LevelUp-Main-App/.claude/workflows/design-qa-gate.js

# per-phase gate
npx vitest run && npm run build && npm run typecheck:functions
```

**The workflow pattern that works:** write the brief with verified facts →
`design-phase-build` (its plan-check will catch your brief's errors — read those
warnings carefully, they are the highest-value output) → `bugfix-council` →
fix round → **re-council** (fix rounds are where regressions get born).

---

## 11. First five things the next session should do

1. **Re-arm a checkpoint loop** with the allowlist and force-push rules in §3.
2. **Run each phase's gate** on R0, R1, R2 — their HEADs are auto-saves.
3. **Verify R2's wiring actually landed** (`App.tsx` routes, `RoomHome` slots,
   `SessionSlot` mounted). The integrate step never ran.
4. **Launch the two missing verification councils** — IV and RE.
5. **Stand up the local shadow and run R0's suite** — it is the proof artifact
   for RLS on the enrolment path and has never been executed anywhere.

Then R3/R4, then the merge-and-deploy sequence with Rahul.
