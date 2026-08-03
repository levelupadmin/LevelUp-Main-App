# LevelUp Cohort Product — Handoff

**Written 2026-08-01. For a fresh assistant (any model) taking this over completely.**
Read §0 and §5 before touching anything. There is a branch in a BLOCKED state
with a live-inbox data-disclosure defect that a previous fix round *introduced*.

---

## 0. STOP — the one thing that is currently unsafe

`design/cohort-r3` is **BLOCKED**. Do not merge it, do not apply its migration,
do not "just fix the small stuff first".

An adversarial review returned **BLOCK** with 9 findings, 2 critical. The worst
one was **created by the previous fix round**, and it is worse in kind than the
bug it replaced: the old bug lost a notification badge; the new one **writes one
cohort's private announcement title and body into a different cohort's student's
inbox**.

Everything else in the project is either live and verified, or built and green
and parked. §5 is the job.

---

## 1. What this is

A live-cohort product inside the **LevelUp main app** (React + Vite + TypeScript +
Supabase + Capacitor for Android/iOS). Students apply, pay a ₹400 application fee,
book an interview, get a decision, pay the balance, then enter a private "room"
where the course runs (weeks, live classes, recordings, assignments, announcements,
roster).

- Plan: `design/cohorts/EXECUTION-BACKLOG-V3.md` (12 phases, present in every worktree)
- Pilot offering: "Creator Academy Edition 2", ₹57,000, offering id
  `449056b9-9269-4bc5-ba8b-4c079c2104ee`
- Production Supabase ref: **`ivkvluezuiojovpotlyb`** (ap-northeast-1)
- ⚠️ `supabase/config.toml`'s `project_id` is **STALE/WRONG**. Always
  `link --project-ref ivkvluezuiojovpotlyb` explicitly.
- Repo: `github.com/levelupadmin/LevelUp-Main-App`, default branch `main`.
  `gh` CLI is authenticated as `levelupadmin`.
- Owner: Rahul Srinivas, founder/CEO (`ceo@leveluplearning.in`). Not a full-time
  engineer. Explain in plain language; he is decisive when the choice is framed
  clearly.

---

## 2. Environment

**One git worktree per phase.** This is not preference: a concurrent session
sharing one checkout destroyed an agent's work once.

| Path (all under `/Users/rahulsrinivas/Claude/`) | Branch |
|---|---|
| `LevelUp-Main-App` | `main` — **a concurrent session often owns this. Do not commit here.** |
| `LevelUp-Main-App-fieldguide` | someone else's. **Never touch** (its upstream is misconfigured to `origin/main`) |
| `LevelUp-cohort` | `design/cohort-sp` |
| `LevelUp-iv` | `design/cohort-iv` |
| `LevelUp-dc` | `design/cohort-dc` |
| `LevelUp-re` | `design/cohort-re` |
| `LevelUp-r0` | `design/cohort-r0` |
| `LevelUp-r1` | `design/cohort-r1` |
| `LevelUp-r2` | `design/cohort-r2` |
| `LevelUp-r3` | `design/cohort-r3` ← **BLOCKED, see §5** |
| `LevelUp-linkgate` | `design/cohort-linkgate` (merged to main) |

**Every new worktree needs `ln -s ../LevelUp-Main-App/node_modules node_modules`.**
A fresh `npm install` produces a 426-package tree missing `@lovable.dev/email-js`
(the main checkout has 427), which makes an *unmodified* file report a phantom
`typecheck:functions` failure.

**Verify what is actually pushed with `git ls-remote --heads origin 'design/cohort-*'`,
never by trusting a document.** A branch with ~5,300 lines was believed pushed for
days and was not.

### Commands

```bash
# per-phase gate (run all three)
npx vitest run && npm run build && npm run typecheck:functions

# types are NOT in that gate — `npm run build` is a bare `vite build` with no tsc.
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"   # baseline is 8 on main
```

- `psql` is at `/opt/homebrew/opt/libpq/bin` (keg-only, **NOT on PATH**)
- `docker` is at `/Applications/OrbStack.app/Contents/MacOS/xbin` (**NOT on PATH**)
- Supabase CLI is not installed globally: always `npx -y supabase@latest ...`

### Local shadow database (needed for the SQL suites)

```bash
open -a OrbStack && npx -y supabase@latest start       # run inside LevelUp-r0
# DB: postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Provision **in this exact order**. Step 0 is a manual empty — never
`supabase db reset`, which re-applies migrations and lands the very state step 1
must precede (`ALTER DEFAULT PRIVILEGES` is consulted at CREATE TABLE time and
cannot retrofit an existing table):

```bash
psql "$DB" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' \
           -c 'DELETE FROM supabase_migrations.schema_migrations;'
psql "$DB" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql   # arms default privileges
npx -y supabase@latest db push --db-url "$DB"
psql "$DB" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql   # grants the new tables
```

**Why shadow-grants matters:** a migrations-only database grants the client roles
almost nothing, and PostgreSQL checks the GRANT *before* it consults RLS. Measured:
3 of 103 tables granted SELECT to `anon` before that file, 101 after. Without it
every RLS assertion passes because permission was denied first — green for the
wrong reason, which is worse than no test.

### The two SQL suites

```bash
# R0's adversarial room-access suite (163 cases). Exit 0 = wall holds. Exit 2 = could not run, NOT a pass.
ROOM_QA_LOCAL=1 ROOM_QA_PSQL=/opt/homebrew/opt/libpq/bin/psql \
ROOM_QA_ANON_KEY=<from `npx supabase status`> ROOM_QA_SERVICE_KEY=<same> \
npm run test:room-access

# R3's announcement fan-out harness (self-contained, ends in ROLLBACK, shadow only)
psql "$DB" -v ON_ERROR_STOP=1 -f qa-harness/announcement-fanout.sql
```

⚠️ `npm run test:announcement-fanout` exists in package.json but **exits 127** —
it calls bare `psql`, which is not on PATH. Fixing that is finding B-HIGH-5.

---

## 3. Credentials — by location, never by value

All in `~/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/`
(dotfiles, use `ls -a`): `.env.supabase`, `.env.calendly`, `.env.tally`,
`.env.telecrm`, `.env.msg91`, `.env.razorpay`, `.env.interakt`, `.env.meta`, plus
`keystores/`.

**Never echo, print, or commit these.** Reference them as shell-variable
references only. Project refs and URLs are public; keys and passwords are not.

Applying migrations to production:
```bash
export SUPABASE_ACCESS_TOKEN="$(grep -E '^SUPABASE_PAT=' "<vault>/.env.supabase" | cut -d= -f2- | tr -d '"')"
npx -y supabase@latest link --project-ref ivkvluezuiojovpotlyb
npx -y supabase@latest migration list    # ALWAYS check what is pending first
npx -y supabase@latest db push
```

Direct read-only prod queries: use `node` + the `pg` package from
`~/Claude/ml-team-hub` (the only checkout with `pg` installed), host
`aws-1-ap-northeast-1.pooler.supabase.com`, user `postgres.ivkvluezuiojovpotlyb`,
password from `SUPABASE_MAIN_APP_DB_PASS` in the vault.

---

## 4. State: what is live, built, and not started

**LIVE ON PRODUCTION**
- RC (funnel reconciler, runs dark) and TP (Tally poller, pg_cron every 15 min,
  ingesting real applications)
- **The join-link security fix (2026-08-01)** — three migrations,
  `20260801100000`, `20260801130000`, `20260801140000`, all applied and verified.
  See §7 for what they fixed and the trap they taught.

**BUILT, GATE-GREEN, NOT MERGED** — SP (identity), IV (interview), DC (decision),
RE (re-entry emails), R0 (room backbone/RLS), R1 (room shell), R2 (the season).
Each has had at least one adversarial review and a fix round.

**BLOCKED** — R3 round 1 (announcements + roster). §5.

**NOT STARTED** — R3 round 2 (feed + resources), R4 (demo day, certificates,
alumni). Sections are in `ROOMS-BACKLOG.md`.

**Nothing from any cohort branch is merged, applied, or deployed** except the
security fix above.

---

## 5. THE IMMEDIATE JOB — R3 is BLOCKED

Branch `design/cohort-r3`, file
`supabase/migrations/20260801120000_announcement_notify_trigger.sql`.

### Context

The room noticeboard fans out one in-app notification per member per
announcement, **volume-capped to at most one unread badge per room** (three posts
in an hour must not make three badges). The cap works by having the newest post
*refresh* an existing unread badge instead of inserting a second one.

That means **one badge stands for several notices**. Retraction is where it went
wrong, twice.

- **Round 1 bug:** retracting a notice DELETED the badge, so older notices that
  the same badge represented were left live, unseen, with no delivery record. The
  test suite asserted this deletion as *correct* and passed, which is why it went
  unnoticed.
- **Round 2 fix (current state):** retraction now RE-POINTS the badge at the
  newest surviving notice the recipient can still see, via a `JOIN LATERAL`. That
  LATERAL is where the two critical defects are.

### The findings (9; do not ship until 1–6 are closed)

**B-CRIT-1 — cross-cohort content disclosure into a shipped inbox.**
The survivor LATERAL's correlated `EXISTS` over `cohort_room_members` filters on
only three terms: `m.user_id`, `m.offering_id`, `m.batch_id`. It carries **no
`m.status = 'active'`** and no role filter. It is the only membership probe in the
file without a status check (`grep -n "m.status"` returns 249 and 603, both
outside the LATERAL). R0 **revokes rather than deletes**
(`grep -n "SET status = 'revoked'" supabase/migrations/20260729100000_cohort_rooms_backbone.sql`
→ 1377, 1460, 2022), and partial unique indexes deliberately allow one user to
hold both a batch row and a NULL-batch row. So an ordinary batch transfer leaves
*active in A2 + revoked in A1*, and the LATERAL happily re-points that student's
badge onto batch A1's private notice — title and body — in their inbox.
Reproduced independently on a shadow by three reviewers with three different
fixtures.

**B-CRIT-2 — the round-1 bug is still open for offering-wide mentors and hosts.**
The same LATERAL omits the `(m.batch_id IS NULL AND m.role IN ('mentor','host'))`
arm that both `room_announcement_targets` and the canonical
`cohort_room_can_access` carry. `NULL = uuid` is NULL, so a NULL-batch mentor can
never match a batch-scoped survivor, and the DELETE branch removes their badge
while that notice is live and unseen on their own board.

**THE REAL ROOT CAUSE, AND THE RECOMMENDED FIX.** "Which announcements can user U
see" is now written **four times**: `ann_member_read` (RLS),
`room_announcement_targets`, `get_room_announcements`'s payload scope, and this
new LATERAL — and the newest one disagrees with the other three. **Do not patch
the LATERAL's two missing terms in place.** That leaves the divergence, just
narrower, and guarantees a fifth copy next round. R0 already solved this class by
*factoring*: see `cohort_room_roster_ids`, documented in
`20260729100000_cohort_rooms_backbone.sql` as "THE ONE roster predicate", and
`cohort_room_is_offering_wide`. Extract one predicate and have every caller use it.

**B-HIGH-3 — the fix bred a new orphan class.** Scoping *both* retract statements
by `room_announcement_targets` re-evaluates membership **at retract time**, so
anyone revoked or transferred between the post and the retraction keeps a badge
showing the retracted notice forever. The old unscoped DELETE did clear it.
Recommendation: statement (b) should key on `link_url` alone — the identity is
already sufficient, because a badge carrying it was by construction delivered to a
target at post time.

**B-HIGH-4 — the re-point resurfaces already-read notices as brand new.**
Statement (a) sets `created_at = now()` with no lower bound on the survivor, so
fixing a typo thirty seconds after posting floats an arbitrarily old, already-read
notice to the top of every inbox stamped "just now". Measured outcome: a member
ends up holding two rows for one notice, one read and 25h old, one unread and 0h
old. Also, the board still orders by the notice's own `created_at`, so inbox and
board now disagree about what is newest.

**B-HIGH-5 — the harness runner does not work, and has no prod guard.**
`npm run test:announcement-fanout` exits 127 (bare `psql` not on PATH). It also
passes `${ROOM_QA_DB_URL}` through with no target check, while the harness header
says "SHADOW PROJECTS ONLY, never prod" and the sibling suite refuses via
`REF === PROD_REF`. Bounded by the trailing ROLLBACK, so a footgun rather than a
hazard, but the guard is one line.

**B-HIGH-6 — the fixture cannot express any of the above, so "20/20 passing" is
not evidence.** The only mentor in the fixture authors every notice (so a
non-author staff *recipient* does not exist); the only revoked row is that user's
only row (so active-here-plus-revoked-there does not exist); and no case mutates a
membership between post and retract. C7D's guard is `IF v_a2_kept < 1` over two
expected holders, so it passes on 50% loss **and would stay green if the leak
fired and raised the count to 3**. The DELETE branch has no asserted case at all.
This is a missing *world*, not missing assertions — no assertion count fixes it.

**B-MED-7 — two operational traps.** (a) Both retract statements key on
`n.link_url = v_self`; NULL never equals anything, so any badge written by the
pre-fix revision is neither re-pointed nor deleted and strands permanently. (b)
**The migration file was edited in place at the same version stamp, and
`supabase db push` tracks by VERSION.** Any environment that already ran the
pre-fix revision will **SKIP** the fixed one — including the shadow used to check
the fix. Bump the stamp or reset the shadow.

**B-MED-8 — a contract comment is false about the code it documents.** §2 says
"§3's retract arm passes NULL deliberately to reach EVERY recipient", but both
retract call sites pass `NEW.author_id`. In a file whose whole review method is
reading its own comments, a stale note is a live hazard.

**B-LOW-9 — the `link_url` justification is factually wrong.** The comment claims
"useNotifications never selects it"; that hook does `.from("notifications").select("*")`,
so the raw `cohort_announcement:<uuid>` ships to every client. Harmless today
(nothing renders it), but `link_url` is the deprecated deep-link column and the
obvious future repair `navigate(notif.link ?? notif.link_url)` would turn every
room badge into a broken navigation.

### Explicitly NOT blockers (settled; do not re-litigate)

- **Retract cost**: measured 61.8 ms at 2,000 live notices × 200 members, 245 ms
  at 5,001 × 200. Acceptable. It is O(members × live announcements) because the
  LATERAL's ORDER BY cannot ride the existing index. **Do not add an index**; do
  re-measure after the rewrite.
- **The partial unique index** `notifications_room_unread_uniq (user_id, link)
  WHERE is_read = false AND type = 'room_announcement'` is clean. All five writers
  of `notifications` use distinct `type` values, so the platform broadcast tool
  cannot hit a 23505. Prod measured: that table holds **1 row, 64 kB**, 0 rows
  match the predicate, 0 would violate it.
- **The roster's 60fps claim was genuinely measured** (headless Chrome over CDP
  with `Emulation.setCPUThrottlingRate`, with live controls). The real gap is
  narrower: no Android System WebView and no iOS WKWebView check.
- `get_room_roster` projects exactly six columns, no phone, no email, and raises
  42501 for an outsider. The composer is RLS-gated, not UI-gated.

---

## 6. Standing product rulings — never re-litigate these

A finding that contradicts one of these is a wrong finding.

- **INTEG-PAY-1** — the Tally → ₹400 → Calendly intake chain is FROZEN. The app
  enriches it; it never inserts into it and never originates an order.
- **SOR-1** — TeleCRM is the system of record. The app NEVER writes a funnel status.
- **SEAT-1** — seat release stays MANUAL in v1. No auto-release cron.
- **MEMBER-1** — three room access tiers. `accepted` = no membership row, no read
  into any room-content table. A `pre_member` in the lobby IS granted
  announcements-read.
- **ROSTER-SCOPE-1** — no DMs, no follow, no profile drilldown in v1.
- **NFR-COPY-1** — the applicant's 100-word essay must NEVER reach a client. It
  lives in `cohort_applications.bio` **and** the raw submission sits in
  `tally_data`. **Grep BOTH.** An earlier phase grepped one, missed the other, and
  certified a surface clean that was not.
- **REQ-INT-0 (reversed 2026-07-28)** — native slot buttons over the Calendly
  availability API, NOT an embed.
- **Android Reader Rule** — purchase UI gates on `isNative()`, **not** `isIOS()`.
  Getting this wrong exposes prices inside the Play shell.
- **No em dashes** in any user-facing LevelUp copy.
- **Rahul's decisions, 2026-08-01:** build the room feed now and rebuild the main
  community later to match; keep the reminder-ladder staleness bound at 26h.
- **Autonomy:** build, review, fix, commit and push freely. **Merging to main,
  applying migrations, deploying functions, and flipping any flag that reaches
  real users are Rahul's calls.** He grants them readily when asked with the
  consequence stated.

---

## 7. Traps that have cost real hours

1. **`npm run typecheck:functions` before ANY edge-function change.** Nothing else
   sees `supabase/functions/` — tsconfig covers only `src`, the build is a bare
   `vite build`, and vitest only imports the pure `_shared/*` modules. A
   non-compiling handler once passed 395 tests, a green build and a clean lint.
2. **A narrower REVOKE never cuts through a broader GRANT, and Postgres reports
   success for revoking a privilege that was never held.** Two shapes, both of
   which bit this project in the same week:
   - *Columns*: `REVOKE SELECT (col) ON t` removes only a COLUMN-level grant.
     Where `GRANT SELECT ON t` exists it changes nothing. Two shipped migrations
     were inert for four months this way, leaving every paid event's venue link
     readable by any signed-in user.
   - *Functions*: `REVOKE ALL ON FUNCTION f FROM public` removes only the PUBLIC
     entry. Supabase's `pg_default_acl` grants `anon=X` on **every function this
     project creates**, so a new function is born anon-executable — including the
     one written to fix the column bug.
   - Only `has_column_privilege()` / `has_function_privilege()` *after applying*
     proves anything. Build that assertion into the migration as a `DO` block that
     raises.
3. **`GRANT`/`REVOKE` take no relation lock.** Measured: a concurrent read ran in
   46 ms with the granting transaction held open. They need no maintenance window.
   `CREATE OR REPLACE FUNCTION` **preserves the existing ACL**, so an old PUBLIC
   grant survives a security rewrite.
4. **Verify the data source exists before building a UI that renders it.** Three
   surfaces were built against sources that do not exist. The right answer each
   time was to render nothing, not to invent a number.
5. **Never cite a line number in a brief.** One citation was repeated across 23
   places in 15 files; the real code had drifted. Cite a symbol plus a grep.
6. **Check a "precedent" before building on it.** A fix round guarded rupee
   amounts "matching ApplicationStatus", whose only `₹` is inside a comment.
7. **`grep "^DO \$\$"` silently matches nothing** (BRE parses trailing `$$` as
   literal-`$` + anchor). Use `grep -F` or `^DO`.
8. **`EXCEPTION WHEN OTHERS` does NOT trap `QUERY_CANCELED` (57014).** A statement
   timeout inside an AFTER trigger still aborts, so a room trigger could roll back
   an enrolment (money) write. Name cancel codes explicitly on any money-path trigger.
9. **`ALTER TABLE` holds ACCESS EXCLUSIVE until COMMIT**, not until the statement
   ends. **`supabase db push` runs one implicit transaction PER FILE.**
10. **`supabase db push` tracks by VERSION, not checksum.** Editing a migration in
    place means environments that already ran it will silently skip the new body.
11. **A backtick inside a SQL comment terminates a JS template literal.** Cost a
    full suite run.
12. **Two migrations must never carry the same function body.** Last-writer-wins,
    and the loser is silent. See §9's open item.
13. **When a fix breaks a test, ask which one encodes the bug.** A test forbidding
    `<iframe>` anywhere was only correct if a flag was always on — which was the
    defect. R0's grant precondition asked `has_table_privilege` and was wrong once
    a table legitimately holds none (`has_any_column_privilege` is the right
    question). Both tests were amended, not worked around.

---

## 8. The verification discipline that actually works here

This project's defect record is unambiguous: **reasoning about the code found
fewer real defects than running it against a real database.** Adopt this or you
will ship one of the above.

- **Run the artifact.** R0's suite had never been executed; executing it found
  four defects in the suite itself plus a live production leak. A test that has
  never run is a document.
- **A passing test is not evidence the behaviour is right** — only that it matches
  what somebody wrote down. Twice now a suite has *certified a defect as correct*
  and passed. Read each assertion and ask what it would permit.
- **Prove a regression test fails against the old code.** Otherwise it may be
  passing vacuously.
- **Ask whether the fixture can even express the bug.** R3's suite has 20 passing
  cases and cannot express any of its three critical defects.
- **Measure against production before asserting scope.** `has_column_privilege`
  measures a grant, not reachable data; RLS still filters rows on top.
- **After applying anything, verify it from the outside.** Both of the security
  defects this week were caught after apply, not by review.
- The previous assistant ran adversarial multi-agent reviews (5 independent
  reviewers per change). Five ran; **five returned REVISE or BLOCK, and every one
  found something real.** If you cannot run that, budget a deliberate
  self-critique pass per change and assume the first version is wrong.

---

## 9. Open items and decisions for Rahul

1. **R3 is blocked** — §5. This is the work.
2. **Two migrations define `public.get_cohort_progress`** and the later timestamp
   wins: `20260729100200` (R0, has the LATERAL that collapses a week's sessions to
   the one running now) and `20260801130000` (shipped, no LATERAL). On a fresh
   build R0's is overwritten; on prod the reverse. **Prod and a from-scratch build
   diverge.** Fix as part of the R0 merge with ONE authoritative definition dated
   after both. Merge-blocking for R0.
3. **The "community lock" does not appear to exist.** Rahul said a teammate locked
   the main community. Verified: `/community` is a live route with no guard, the
   nav item is unconditional in `StudentLayout` (sidebar and mobile), RLS
   `posts_read` is `USING (auth.uid() IS NOT NULL)`, and 12 posts are live — every
   signed-in student can walk in. **Ask him.** Also: 0 of those 12 posts carry a
   `cohort_batch_id`, so R3 round 2's "copy legacy cohort posts into the room" step
   has nothing to copy and should not be built.
4. **Tune `REENTRY_FEE_EVIDENCE_MAX_AGE_HOURS`** (currently 26h). It stops the
   reminder ladder emailing someone who already paid off-app; shorter is safer,
   longer recovers more revenue. Policy call, one env var.
5. **Unfinished review follow-ups**: IV needs an opaque per-application token on
   the Calendly `scheduling_url` so identity stops resting on a field the invitee
   types; RE has three open findings (a documented rollback that strips the
   unsubscribe link, the fee CTA dead-ending in the Android shell, and the ladder's
   input possibly being structurally empty because `FUNNEL_RECON` defaults false).
6. **No Android WebView or iOS WKWebView verification** has been done on any room
   surface.

---

## 10. Where the previous assistant was wrong — do not trust the record blindly

Stated as fact and later disproved by measurement. The pattern matters more than
the items: **claims that were reasoned rather than measured were the ones that
were wrong.**

- Claimed the venue-link leak was reachable by "any visitor". Wrong — `anon` reads
  zero rows from both tables; the exposure is every *signed-in* user.
- Claimed `GRANT`/`REVOKE` takes ACCESS EXCLUSIVE and needs a quiet hour. Wrong —
  no relation lock at all.
- Claimed no sibling worktree does `select("*")` on `live_sessions`. Wrong — all
  seven do; the grep required both calls on one line and missed a multi-line chain.
- Claimed `AdminAnnouncements` was "already batch-aware" for the room noticeboard.
  Wrong — that string is a filter on `enrolments` in a different code path, and
  the page never touches `cohort_announcements`. Confirmed a string, not a behaviour.
- Reported R3's harness as "20/20, strong signal". True but misleading — one case
  was asserting the defect as correct.
- Claimed the harness ran via the new npm script. Wrong — that script exits 127;
  the real runs used an explicit psql path.
- Claimed the roster's 60fps figure was asserted. Wrong — it was measured.

`~/Claude/COHORT-BUILD-HANDOFF.md` (also committed as `design/cohorts/HANDOFF.md`
on r0/r1/r2/linkgate) carries the longer per-phase detail. This file supersedes it
where they disagree.
