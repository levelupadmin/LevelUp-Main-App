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

**Updated 2026-08-01.** All eight branches: 0 uncommitted, 0 unpushed.

| Worktree | Branch | Tests | Note |
|---|---|---|---|
| `LevelUp-cohort` | `design/cohort-sp` | 558 | |
| `LevelUp-iv` | `design/cohort-iv` | 683 | council REVISE → both blockers closed |
| `LevelUp-dc` | `design/cohort-dc` | 841 | |
| `LevelUp-re` | `design/cohort-re` | 697 | council REVISE → B1/B2 closed |
| `LevelUp-r0` | `design/cohort-r0` | 539 | adversarial suite EXECUTED: 163/163 |
| `LevelUp-r1` | `design/cohort-r1` | 577 | |
| `LevelUp-r2` | `design/cohort-r2` | 701 | wiring confirmed landed |
| `LevelUp-linkgate` | `design/cohort-linkgate` | 493 | the production link leak, §6 |

**⚠️ THE PREVIOUS VERSION OF THIS FILE CLAIMED ALL SEVEN BRANCHES WERE PUSHED.
`design/cohort-r2` WAS NOT ON ORIGIN AT ALL** — ~5,300 lines existed only on this
machine. Now pushed. **Verify with `git ls-remote --heads origin 'design/cohort-*'`,
never by trusting this table.**

R0/R1/R2's gates were re-run after their `wip(checkpoint)` HEADs: all three green,
`typecheck:functions` 0 new failures against the 4 known-failing baseline. R2's
wiring DID land despite its integrate step dying — `App.tsx` routes the real
modules and `SessionSlot` is mounted in `ThisWeekCard`. The surviving
`{title} opens here.` in `RoomHome` is CORRECT: it is `RoomModuleRoute`, the
fallback for R3's three unbuilt modules.

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
12. **A NARROWER `REVOKE` NEVER CUTS THROUGH A BROADER GRANT. This project has
    now been bitten by it TWICE in two days, in two different shapes.**
    - *Columns:* `REVOKE SELECT (c) ON t` removes only a COLUMN-level grant.
      Where a table-level `GRANT SELECT ON t` exists it changes nothing,
      silently. Two shipped migrations were inert for four months this way. To
      withhold one column you must hold NO table-level SELECT and grant the
      others individually.
    - *Functions:* `REVOKE ALL ON FUNCTION f FROM public` removes only the
      PUBLIC pseudo-role entry (`=X/`). It cannot touch `anon=X/postgres`. And
      this project's `pg_default_acl` for functions grants `anon=X`, so **every
      function created here is born anon-executable** — including the one written
      to fix the column bug. Revoke from the NAMED role.
    - The common tell in both: Postgres raises no error and emits no warning for
      revoking a privilege that is not held. **Success means nothing here; only
      `has_column_privilege` / `has_function_privilege` afterwards does.**
    - Both were caught by verifying AGAINST PRODUCTION after applying, not by
      review. Build the check into the migration so it cannot pass silently.
13. **RUN THE ARTIFACT.** R0's suite had never been executed anywhere. Executing
    it found four defects in the suite itself — three of which would have failed
    identically on the hosted shadow it was written for — plus the §6b production
    leak. A test that has never run is not a test; it is a document.
14. **`npm run build` is a bare `vite build` with NO tsc**, so type errors reach
    main. Run `npx tsc --noEmit -p tsconfig.app.json` and compare the error COUNT
    against `origin/main` — there is a pre-existing baseline of 8, so "zero
    errors" is the wrong bar and "no new errors" is the right one.
15. **A backtick inside a SQL comment terminates a JS template literal.** Writing
    `` `live_sessions` `` inside a `sql(\`…\`)` block is a syntax error, not a
    comment. Cost a full suite run to spot.
16. **When a fix breaks a test, ask which one encodes the bug.** `ENTRY-PARITY-1`
    forbade `<iframe>` anywhere in `ThankYou.tsx` — a rule that is only correct if
    the flag is always on, which was the very defect. R0's precondition asked
    `has_table_privilege` — wrong once a table legitimately holds none. Both tests
    were amended, not worked around.

---

## 6b. A THIRD production problem — found 2026-07-31, **CLOSED ON PROD 2026-08-01**

**Status: fixed, applied and verified.** Three migrations are live —
`20260801100000` (table SELECT revoked, every other column re-granted),
`20260801130000` (the `get_cohort_progress` IDOR guard + join-link time window),
and `20260801140000` (see the third finding below). The client shipped first via
PR #26, the follow-up as PR #27. All six production checks green: gated columns
unreadable by both roles, exactly **1 of 24** columns unreadable on `events` and
**1 of 14** on `live_sessions`, the function carrying its guard, its 42501 and
its window, anon EXECUTE false with authenticated true, and both safe views
still serving.

**A THIRD defect surfaced during verification, in the fix itself.** After the
first two applied, `anon` still held EXECUTE on the newly created admin RPC —
`true` on prod where the shadow said `false`. Cause: this project's
`pg_default_acl` for functions is
`{postgres=X, anon=X, authenticated=X, service_role=X}`, so **every function
created here is born with an explicit `anon=X` grant**, and
`REVOKE ALL … FROM public` removes only the PUBLIC pseudo-role entry — it cannot
touch a grant held by a named role. The REVOKE ran, reported success, changed
nothing. Same shape as the original defect. Not a leak (the body gates on
`is_admin()`), fixed anyway, because "the body happens to refuse" is not "the
caller cannot reach it".

**Two of my own claims were wrong and are corrected below** — "any visitor"
(anon reads zero rows from both tables) and the ACCESS EXCLUSIVE lock profile
(measured: no relation lock at all; a concurrent read ran in 46ms with the
granting transaction held open, so no maintenance window is needed).

The original finding, for the record:

---

## 6b-original. The finding as first written

**Signed-in users can read join links they should not have.** Stated carefully,
because the first draft of this section overstated it and somebody could build a
breach posture on the wrong sentence. `has_column_privilege` measures a GRANT;
RLS still filters rows on top. Measured against the actual policies:

- `events.venue_link` — `events_read_authenticated` is
  `USING (auth.uid() IS NOT NULL)`, so **every signed-in user** can read the
  venue link of **every paid event**. This is the broad one.
- `live_sessions.zoom_link` — `live_sessions_read` requires
  `has_course_access()`, so exposure is **enrolment-scoped**: join links for
  courses you have access to, including classes you are not in and sessions
  outside any time window.
- **anon reads zero rows from both tables.** "Any visitor" was wrong.

**There are TWO egresses, and the grant fix only closes one.**
`get_cohort_progress` is SECURITY DEFINER, so it runs as the owner and column
grants are *structurally invisible* to it — and the definition live on prod
filters `WHERE e.user_id = p_user_id` with no `auth.uid()` check, an **IDOR**
handing any signed-in user another student's join links, submission status,
rating and mentor feedback. R0's `20260729100200` already fixes the IDOR and now
also gates the link to the T-60 window. **Applying the grant migration alone does
not close this — it only turns the alarm green.**

Measured read-only against prod:

```
role            zoom_link  venue_link  live_sessions(table SELECT)
anon            true       true        true
authenticated   true       true        true
```

Two April migrations (`20260408150800`, `20260408151600`) each ship a
`REVOKE SELECT (col)` intended to stop exactly this. **Both are no-ops and always
have been.** A table-level grant and a column-level grant are SEPARATE privileges:
`GRANT SELECT ON t` authorises every column, and a later `REVOKE SELECT (c)`
removes only a column-level grant that may never have existed — no error, no
warning, no effect.

The fix is on `design/cohort-linkgate`: revoke the table-level SELECT, grant every
other column individually, move `AdminSchedule` onto the safe view + the gated
RPC (the only client still doing `select("*")` on a base table), and add an
admin-only ids-list RPC so the admin row shortcut survives. Verified on a local
shadow, and **R0's suite then reports 163/163, exit 0** — C2.3b and C2.4, the two
cases that exposed the leak, pass.

**Applying it is Rahul's call.** GRANT/REVOKE hold ACCESS EXCLUSIVE until COMMIT
on tables the shipped dashboard reads, so it wants a quiet hour. The undo is two
`GRANT SELECT` statements, spelled out at the bottom of the migration.

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
- **THE RESIDUALS LIST ABOVE WAS ITSELF STALE — audited 2026-08-01.** Two of the
  three were already fixed, and the code's own comments were more accurate than
  this file:
  - The `CREATE INDEX` on `live_sessions` (`20260729100200` §0) is fully guarded:
    LOCAL 1s `lock_timeout`, `query_canceled` named explicitly in the handler,
    previous value restored, worst case `RAISE WARNING`.
  - The `content.sql` DO block is handler-only **by decision**, and the file says
    so under "HANDLER-GUARDED, WITH NO `lock_timeout`". The old claim that its
    `query_canceled` branch "can never fire" was garbled: 57014 does not come
    from a lock wait at all (that is 55P03 `lock_not_available`); it arrives from
    a `statement_timeout` or a `pg_cancel_backend`, both real on any table, and
    `OTHERS` does not trap it — so the branch earns its place.
  - Fixed: the stale "4s lock_timeout" prose in the suite is now 1s. Note the
    handoff cited `:1649,1712` and the real sites were `:1907,1970` — **line
    numbers in this file drift; grep for the symbol** (lesson 3).
- Still open: the grant-layer documentation in
  `design/cohorts/docs/05-ACCESS-SECURITY.md` has **zero** mentions of TRUNCATE
  while `design-qa-gate.js` names its §7 as the authority.
- **The adversarial suite now RUNS: 163/163, exit 0** (§10 for the recipe). It
  found the §6b production leak.

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

## 7b. ⚠️ MERGE-BLOCKING FOR R0 — two migrations define one function

`public.get_cohort_progress` is defined **twice**, and the later timestamp wins:

| file | body |
|---|---|
| `20260729100200` (R0) | plpgsql: IDOR guard + join-link time window **+ the LATERAL** that collapses a week's several sessions to the one running now |
| `20260801130000` (linkgate, **later**) | April-based body + the same guard and window, **no LATERAL** |

Verified 2026-08-01: on a **fresh build** R0 applies first and linkgate overwrites
it, so the LATERAL is lost and R0's suite fails PROG.1/PROG.2 (161/163). On
**production** the reverse holds — linkgate is applied, R0 is still pending, so
R0 will apply afterwards and win. **Prod and a from-scratch build therefore
diverge**, which is the same class as the already-once-fixed "the repo could not
build a database from scratch".

Fix it as part of the R0 merge: one authoritative definition in a migration dated
after both. **Do not leave two copies of the body** — that is the
last-writer-wins landmine that already bit once this week. It was deliberately
NOT fixed on 2026-08-01 because installing R0's LATERAL on prod is a behavioural
change to the shipped `CohortDashboard`, which belongs to R0's merge rather than
to a security patch.

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

# types are NOT in that gate — vite build runs no tsc. Compare the COUNT to main:
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"   # baseline is 8
```

**Running R0's adversarial suite (works, 163/163).** It now has a local mode;
the hosted path is unchanged. `docker` lives at
`/Applications/OrbStack.app/Contents/MacOS/xbin` and `psql` at
`/opt/homebrew/opt/libpq/bin` — neither is on PATH.

```bash
open -a OrbStack && npx -y supabase@latest start        # in LevelUp-r0

# PROVISION IN THIS ORDER. Step 0 is a MANUAL empty — never `supabase db reset`,
# which re-applies migrations and so lands the exact state step 1 must precede.
# Stop the rest/auth/realtime containers first or the DROP hangs on locks, and on
# a REUSED stack also clear storage (as supabase_admin inside the container —
# `postgres` is not superuser and does not own those tables) or db push dies on a
# duplicate bucket.
psql "$DB" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' \
           -c 'DELETE FROM supabase_migrations.schema_migrations;'
psql "$DB" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql   # arms ALTER DEFAULT PRIVILEGES
npx -y supabase@latest db push --db-url "$DB"
psql "$DB" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql   # grants the new tables

ROOM_QA_LOCAL=1 ROOM_QA_PSQL=/opt/homebrew/opt/libpq/bin/psql \
ROOM_QA_ANON_KEY=... ROOM_QA_SERVICE_KEY=... npm run test:room-access
```

Exit 0 = the wall holds. Exit 2 = it could not run, which is NOT a pass.

**The workflow pattern that works:** write the brief with verified facts →
`design-phase-build` (its plan-check will catch your brief's errors — read those
warnings carefully, they are the highest-value output) → `bugfix-council` →
fix round → **re-council** (fix rounds are where regressions get born).

---

## 11. What is left — updated 2026-08-01

**The previous list of five is DONE.** Checkpoint loop re-armed; R0/R1/R2 gates
re-run green; R2's wiring confirmed; the IV and RE councils ran (both REVISE,
every blocker since closed); R0's suite executed for the first time at 163/163.

Outstanding, roughly in value order:

1. ~~Apply the §6b migration~~ — **DONE, live and verified 2026-08-01.** Still
   open for Rahul: tune `REENTRY_FEE_EVIDENCE_MAX_AGE_HOURS`; the 26h default is
   a policy number and how much reach it costs depends on how often the
   reconciler actually runs.
2. **R3 round 1 (announcements + roster) is BUILT and green** on
   `design/cohort-r3` — 772 tests, build clean, `typecheck:functions` 0 new
   failures. Its council is running. Round 2 is the feed and resources: Rahul
   ruled on 2026-08-01 to **build the feed now** rather than wait on the
   community-v2 direction, and to rebuild the main community later to match.
   Useful context he gave: a teammate has LOCKED the main community because it is
   not built out, so the room feed may be the only live community surface —
   verify its state before briefing the legacy copy step.
   **R4 (demo day, certificates, alumni) — NOT STARTED**, 4 tasks in
   `ROOMS-BACKLOG.md`.
3. **The council follow-ups nobody has picked up:** IV's durable webhook fix (an
   opaque per-application token on `scheduling_url`, so identity stops resting on
   a field the invitee types), and RE's B3/B4/B5 — the rollback that strips the
   unsubscribe link, the fee CTA dead-ending in the Android shell, and the ladder
   input possibly being structurally empty because `FUNNEL_RECON` defaults false.
4. **SP's dead Part-3 gate**, and R0's residuals: the unguarded `CREATE INDEX` on
   `live_sessions`, the half-guarded DO block in `content.sql`, and the stale "4s
   lock_timeout" prose in the suite (all six sites are 1s).
5. Then the merge-and-deploy sequence in §8, with Rahul.

**Nothing from any cohort branch is merged, applied or deployed.** RC and TP
remain the only things live.
