-- ============================================================================
-- COHORT ROOM — content tables + RLS (R0 / task R-2)
--
-- Depends on 20260729100000_cohort_rooms_backbone.sql (R-1), which defines the
-- membership table and the FOUR access helpers this file routes through:
--   public.cohort_room_is_member(offering)                 -- full member, any batch
--   public.cohort_room_can_access(offering, batch)         -- full member, batch-precise
--   public.cohort_room_in_lobby(offering, batch)           -- pre_member whitelist ONLY
--   public.cohort_room_can_post_announcement(offering)     -- mentor/host
-- THREE of those four end in `OR is_admin()`. `cohort_room_in_lobby()` does not,
-- deliberately: an admin already passes `cohort_room_can_access()`, so OR-ing
-- is_admin() into the lobby test would only make "is this caller a lobby
-- occupant?" answer yes for people who are not one.
-- `cohort_room_can_access()` deliberately EXCLUDES `pre_member` (SEC-MEMBER-1:
-- `member` is never widened to include `pre_member`); the lobby tier is
-- expressed here by OR-ing the separate `cohort_room_in_lobby()` helper into
-- exactly TWO policies and nowhere else — `ann_member_read` (§1, the whitelist
-- read surface) and `room_seen_own` (§6, the caller's own marker row).
--
-- ── INVARIANTS THIS FILE MUST KEEP (grep-provable) ──────────────────────────
-- NFR-SEC-2  Every content SELECT routes through an access helper; ZERO content
--            policies reference a membership table directly.
--              grep -n 'cohort_room_members\|cohort_batch_members\|enrolments' \
--                supabase/migrations/20260729100100_cohort_room_content.sql
--            => matches only inside comments, never inside a POLICY body.
-- NFR-CONFIG-2  No RLS policy reads `modules` (or `theme`). Security never
--            depends on a feature flag. This file never references
--            `cohort_room_configs` at all.
--              grep -n 'modules\|cohort_room_configs' <this file>  => comments only.
-- SEC-WRITE-1  Client INSERT on cohort_room_posts / cohort_room_post_replies is
--            REVOKED. There is NO member INSERT policy on either table. The
--            ONLY write path is R-3's SECURITY DEFINER RPCs
--            (cohort_room_post_write / cohort_room_reply_write), which validate
--            channel_key and stamp is_mentor_answer server-side.
--            The UPDATE verb stays granted (an author edits their own body), so
--            every limit the write RPC enforces imperatively — body non-empty
--            after btrim, body length, "media is a jsonb array" — is ALSO
--            declared as a CHECK constraint here, in BOTH directions. Without
--            them a caller could post a valid body through the RPC and then PATCH
--            `body`/`media` to anything at all (including ''), which would make
--            the RPC-only write path decorative. The CHECKs are added NOT VALID:
--            they bind every future INSERT/UPDATE, but they never scan pre-existing
--            rows, so a shadow project holding draft rows cannot abort `db push`.
-- SEC-MEMBER-1  Three tiers. `accepted` holds NO membership row, therefore both
--            helpers are false for them on every table below => zero rows on
--            EVERY room-content surface, with no policy written for them at all.
-- STANDING-1 (Δ6)  Completion is the only certificate standing. No Distinction /
--            Merit tier appears in any table, CHECK or comment here.
-- NO raised exception anywhere in this migration (a shared `db push` must not
--            abort). Scope-integrity guards are expressed as policy WITH CHECK
--            predicates or as silently-coercing BEFORE triggers instead.
--
-- ── APPLY-TIME LOCKS — WHY THIS FILE CARRIES NO `lock_timeout`, AND THE ONE
--    PLACE WHERE THAT IS STILL A COST ───────────────────────────────────────────
-- This file sets no `lock_timeout` anywhere. Counted from supabase/migrations/
-- with a pattern anchored to the executable line, so no comment about the subject
-- (this one included) can move it —
-- `grep -cE "^ +PERFORM set_config\('lock_timeout'" <file>`:
--   20260729100100_cohort_room_content.sql   =>  0   ← this file
--   20260729100000_cohort_rooms_backbone.sql => 12   (§7A's six sites, arm+restore)
--   20260729100200_cohort_room_rpcs.sql      =>  2   (its §0 index, guarded 2026-07-30)
-- That asymmetry is a CONCLUSION, audited
-- 2026-07-30 and RE-AUDITED the same day, not an omission — but "this file only
-- touches tables R0 creates, so change nothing" is NOT the conclusion, because
-- that premise is false. The honest answer is written out per class rather than as
-- a verdict, since a verdict alone is what let the wrong premise stand the first
-- time. It opened as a THREE-way split; the re-audit collapsed class (2) into
-- class (3) and the withdrawn class is kept in place, because the reason it was
-- wrong is the most useful thing in this section.
--
--   (1) DDL ON THE SEVEN TABLES THIS FILE CREATES — no `lock_timeout`, by
--       decision. Every ALTER, CREATE INDEX, ENABLE ROW LEVEL SECURITY, CREATE
--       POLICY, CREATE TRIGGER and GRANT below targets one of them. On a fresh
--       apply the CREATE TABLE has already taken ACCESS EXCLUSIVE on the table
--       inside THIS transaction, so no competing holder is possible; on a
--       shadow/re-apply they are room tables that no shipped surface touches,
--       because R0 is the migration that introduces them. A `lock_timeout` there
--       bounds a wait with no counterparty. Same argument 20260729100000 makes
--       for its own `cohort_room_configs` trigger ("a room table with no
--       money-path traffic. The lock_timeout + handler wrapper of §7A buys
--       nothing here"). Adding one for symmetry would be actively harmful: an
--       unnecessary guard is what makes the next reader distrust a necessary one.
--       ⚠️ This is NOT "no handler needed". Every handler below stays — a
--       `statement_timeout` or a `pg_cancel_backend()` aimed at the push is a real
--       event on any table, locked or not. §1's block is where that distinction
--       used to be stated wrongly; see the comment there.
--
--   ⚠️ BEFORE CLASSES (2) AND (3): THE TRANSACTION BOUNDARY, because the first
--       revision of this audit split them on a premise that is false and therefore
--       cleared three live tables it had no business clearing.
--       `supabase db push` does NOT run the migration set in one shared
--       transaction. It runs ONE IMPLICIT TRANSACTION PER FILE:
--       `pkg/migration.ApplyMigrations` loops over the pending files and, for each,
--       issues `RESET ALL` and then `(*MigrationFile).ExecBatch`, which sends THAT
--       file's statements plus THAT file's `INSERT … schema_migrations` as one
--       `pgconn.Batch` — implicitly transactional per batch, nothing wrapping the
--       loop. 20260729100000 §0's own TRANSACTION BOUNDARY note carries the
--       inspection; contract note 11(b) there already implied it by recovering a
--       SINGLE version row.
--       CONSEQUENCE FOR THIS FILE: every lock 20260729100000 took was RELEASED at
--       20260729100000's COMMIT, before this file's transaction opened. So EVERY
--       `REFERENCES` parent below is a FIRST acquisition in OUR transaction, taken
--       with the session `lock_timeout` of 0, and nothing this file does inherits
--       cover from a sibling. MEASURED 2026-07-30 (method under VERIFICATION LIMIT
--       below), modes at or above ROW EXCLUSIVE:
--         after 20260729100000's COMMIT → cohort_batches (none), users (none),
--                                          offerings (none)
--         at THIS file's transaction start → cohort_batches, users, offerings,
--                                          cohort_weeks, live_sessions ALL (none)
--       Also: our own locks are held to THIS file's COMMIT, not "to the end of the
--       push". The exposure is the length of THIS file plus nothing, and
--       20260729100200's transaction inherits none of it.
--
--   (2) WITHDRAWN — IT COLLAPSED INTO (3). This class used to clear `users`,
--       `offerings` and `cohort_batches`, and the superseded text is kept because
--       the phrase "same transaction" is exactly what stopped anyone checking:
--         "For THREE of the five the wait is nevertheless ZERO, and a guard would
--          be class-(1) noise: by the time this file runs the push already holds
--          ACCESS EXCLUSIVE on `cohort_batches` (20260729100000 §7A block 1) and
--          SHARE ROW EXCLUSIVE on `users` and `offerings` (its §1/§2 CREATE
--          TABLEs) — same transaction, at or above the mode we need — and a
--          request never conflicts with a lock its own transaction already holds."
--       That is cross-file lock inheritance, and there is none. All three are
--       first acquisitions here, `cohort_batches` among them — the table THIS FILE
--       calls the shipped student dashboard's. The class is empty; read (3).
--
--   (3) ALL FIVE PRE-EXISTING LIVE TABLES — THE RESIDUAL, AND IT IS THIS FILE'S.
--       This file locks them through `REFERENCES`, never through an ALTER of
--       theirs, and `CREATE TABLE … REFERENCES parent` takes SHARE ROW EXCLUSIVE
--       on the PARENT (measured — 20260729100000 A6 item (8)). Per parent, the
--       EARLIEST statement in this file, which is also the push's first
--       acquisition on it — cited by NAME, never by line (20260729100000 contract
--       note 1's rule; the first draft of this table gave line numbers that the
--       comment above it had already invalidated by growing):
--         offerings       §1  cohort_announcements.offering_id
--         cohort_batches  §1  cohort_announcements.batch_id
--         users           §1  cohort_announcements.author_id
--         cohort_weeks    §2  cohort_resources.cohort_week_id
--         live_sessions   §4  cohort_recording_progress.live_session_id
--       Each takes SHARE ROW EXCLUSIVE with the SESSION `lock_timeout` in force,
--       which on the `npx -y supabase@latest db push` path CLAUDE.md documents is
--       0 — wait forever. So R0 has FIVE remaining unbounded lock waits, not two,
--       and they are all in this file. (20260729100200 §0's CREATE INDEX was
--       guarded on 2026-07-30 and is bounded; it is not one of them.)
--       ALL FIVE PARENTS ARE LIVE. `cohort_batches` is joined by the shipped
--       `get_cohort_progress` and by 20260729100200's room RPCs — this file's own
--       Tier note calls it the student dashboard's table; `users` is the identity
--       spine; `offerings` backs the catalogue; `cohort_weeks` and `live_sessions`
--       are joined by `get_cohort_progress` and written by the admin cohort
--       tooling. SHARE ROW EXCLUSIVE spares READERS on every one of them, so
--       nothing here blanks a screen — what queues is WRITES: signup/profile
--       (`users`), admin roster and batch edits (`cohort_batches`), catalogue
--       edits (`offerings`), curriculum and session edits (`cohort_weeks`,
--       `live_sessions`).
--       WHY THIS ROUND DID NOT WRAP THEM — a decision, not an oversight, and it
--       is unchanged by the correction above; only its SCOPE grew from two
--       statements to five parents:
--         · §7A's pattern is DEGRADE-ON-TIMEOUT, and degrading is not available
--           here. It works there because a skipped constraint or trigger costs an
--           invariant something else still enforces. A skipped `CREATE TABLE
--           cohort_resources` costs the TABLE — and the policies, indexes and
--           grants below it, plus 20260729100200's RPCs, all reference it
--           unguarded. The push would abort a few statements later anyway, with a
--           worse error. A "degraded" apply there is a broken migration set, not a
--           performance loss.
--         · The available alternative is a BOUNDED ABORT: `SET LOCAL
--           lock_timeout` with no handler, so a wait past the ceiling raises 55P03
--           and this file's transaction rolls back cleanly, releasing every lock,
--           with THIS file's version unstamped (20260729100000 stays applied and
--           stamped — that is the per-file boundary, and it is what makes a
--           bounded abort recoverable rather than catastrophic: `db push` again
--           re-runs only this file and 20260729100200). It also CHANGES THE
--           FAILURE MODE of a shared push, against this file's own header rule
--           that nothing here aborts one. That is the phase owner's call, so it is
--           FILED HERE and deliberately not done in a residuals round — but it is
--           now filed for FIVE parents, and one of them is the dashboard's.
--       Until it is decided, ALL FIVE want to be quiet at push time alongside the
--       money tables — `users`, `offerings`, `cohort_batches`, `cohort_weeks`,
--       `live_sessions`. An earlier revision of this line named only
--       `cohort_weeks` and `live_sessions` and so left the operator sizing a
--       window that omitted the dashboard table. This is also the one place where
--       20260729100000's old "live_sessions has to be quiet at push time too"
--       guidance is still right — for a different statement than the one it named.
--
--   VERIFICATION LIMIT, stated rather than implied: every lock MODE and every
--   lock LIFETIME above is measured (PGlite 0.5.4 / PostgreSQL 18.3, WASM, this
--   machine), and THE METHOD WAS CORRECTED WITH THE PREMISE. The first pass read
--   `pg_locks` between statements run "in push order inside one open transaction"
--   — a shape `db push` never produces, and the reading that cleared three live
--   tables in the withdrawn class (2). This pass runs each file's statements
--   inside its OWN transaction with a COMMIT between files, reading `pg_locks` at
--   every boundary, which is what showed all five parents unlocked when this
--   file's transaction opens.
--   No WAIT and no DURATION is measured anywhere: a single-connection PGlite
--   cannot produce a competing lock holder, and this environment has no
--   SHADOW_DB_URL, ROOM_QA_PROJECT_REF or SUPABASE_PAT, so nothing was applied to
--   any real project. Read every claim about waiting as inspection of measured
--   modes and lifetimes plus Postgres' documented conflict matrix, never as a
--   stopwatch. The per-file-transaction claim itself is inspection of the shipped
--   CLI (`@supabase/cli-darwin-arm64` 2.110.0 on this machine), recorded in
--   20260729100200 §0.
--
-- ── TABLE × VERB POLICY MATRIX ──────────────────────────────────────────────
-- | table                     | SELECT                               | INSERT                                   | UPDATE                                       | DELETE                  |
-- |---------------------------|--------------------------------------|------------------------------------------|----------------------------------------------|-------------------------|
-- | cohort_announcements      | can_access OR in_lobby (+not deleted)| author=uid AND can_post_announcement     | can_post_announcement — deleted_at (one-way, | admin only              |
-- |                           |                                      |                                          | un-delete is admin-only) + is_pinned; the    |                         |
-- |                           |                                      |                                          | guard pins every other column                |                         |
-- | cohort_resources          | can_access                           | added_by=uid AND can_post_announcement   | admin only                                   | admin only              |
-- | cohort_room_posts         | can_access (+not deleted)            | NONE — grant REVOKED, RPC-only           | author=uid AND can_access — body/media/      | admin only (RLS); no    |
-- |                           |                                      |                                          | deleted_at only; guard pins the rest and     | member DELETE policy    |
-- |                           |                                      |                                          | pins deleted_at ONE-WAY for non-admins       |                         |
-- | cohort_room_post_replies  | parent post accessible (+not deleted)| NONE — grant REVOKED, RPC-only           | author=uid AND parent accessible; same       | admin only (RLS); no    |
-- |                           |                                      |                                          | one-way deleted_at pin                       | member DELETE policy    |
-- | cohort_recording_progress | own rows AND recording accessible    | own rows AND recording accessible        | same                                         | same                    |
-- | cohort_demo_entries       | can_access                           | user=uid AND can_access                  | own entry only                               | own entry only          |
-- | cohort_room_seen          | own rows AND (can_access OR in_lobby) | own rows AND (can_access OR in_lobby)    | own rows AND (can_access OR in_lobby)        | own rows AND (can_access|
-- |                           |                                      |                                          |                                              | OR in_lobby)            |
--
-- MODERATION IS ONE-WAY. Soft-delete is the everyday removal verb, so it must not
-- be reversible by the person being moderated: both pin guards below copy a
-- non-NULL OLD.deleted_at forward for every non-admin caller. An author may
-- retract their own row; only an admin may restore one. Admins additionally keep
-- the hard-DELETE grant (RLS still gates it to `is_admin()`), and the reply
-- counter has a DELETE branch so a hard delete — including the cascade from the
-- daily `cleanup_deleted_users()` cron — leaves `reply_count` truthful.
--
-- Tier column (who reads what):
--   admin      — every row, every table (all helpers end in `OR is_admin()`).
--   member     — everything above except other members' recording progress.
--   pre_member — cohort_announcements (READ only) and their OWN cohort_room_seen
--                marker row, plus the cohort_room_configs masthead row that R-1
--                whitelists. Nothing else.
--                DENIED here: resources (curriculum + mentor materials), the
--                commons feed and replies, COHORT recording progress, demo
--                entries, and every write verb on every one of those tables.
--                ("COHORT" is load-bearing on the progress table and is spelled
--                out in the Tier-2 block below: `recprog_own_all` is own-row
--                FOR ALL, and it is a cohort recording it denies, not a
--                week-less legacy one.) cohort_room_seen
--                is the one FOR ALL grant a lobby occupant holds, deliberately:
--                a last-seen timestamp the caller wrote about themselves is not
--                cohort content, and the row is pinned to `user_id = auth.uid()`
--                on both USING and WITH CHECK (§6).
--                ⚠️ WHERE THE WHITELIST ACTUALLY LIVES — state this plainly at the
--                Tier-1 gate rather than implying it is all RLS:
--                  • the DENY half is RLS, on every table in this file and on
--                    cohort_room_members / cohort_room_configs in R-1;
--                  • the ALLOW half is RLS for exactly THREE surfaces, and they
--                    are not all whitelist items: cohort_announcements (here,
--                    READ only) and cohort_room_configs (R-1
--                    `room_configs_member_read`, which ORs in_lobby) are the
--                    whitelist proper; the third is the caller's OWN
--                    cohort_room_seen marker row (§6), which carries no cohort
--                    content and exists so a lobby occupant's unseen-announcement
--                    count works;
--                  • the REMAINING whitelist items — this-week overview,
--                    cohort-mate presence, upcoming-session schedule — are
--                    RPC-mediated BY DESIGN: R-3's SECURITY DEFINER read RPCs
--                    are what hand a pre_member the overview/presence/schedule
--                    projection, and R-3's `get_cohort_room` v_lobby branch
--                    (20260729100200) withholds zoom_link, recording_url and the
--                    resume position from it. Neither R-1 nor R-2 widens
--                    cohort_weeks or live_sessions, and neither should: widening
--                    them would leak week/session detail to every lobby occupant
--                    of every offering.
--                  • 🔴 THE TIER-2 LINE IS **NOT** FULLY ENFORCED ON THE DIRECT
--                    TABLE READ, and an earlier revision of this comment claimed
--                    it was. Written down exactly as it stands, because a false
--                    assertion here is worse than the gap it hides:
--                    (Both policies below are cited by NAME and file, with no
--                    line number, per R-1 contract note 1: an earlier revision
--                    of this block cited `20260526180000:322`, which was wrong on
--                    the day it was written — the policy is at line 360 and 322
--                    lands inside `user_is_certificate_eligible()`. Grep the
--                    name; it cannot go stale.)
--                      – `live_sessions_student_read` (20260408140000) gates on
--                        "an ACTIVE enrolment for an offering mapped to this
--                        session's course" — it never looks at a room membership.
--                        Resolver branch (b) in R-1 mints `pre_member` for exactly
--                        one shape that HAS such an enrolment: the staged
--                        confirmation capture, where the enrolment row is written
--                        at the confirmation payment and a balance is still
--                        outstanding. That pre_member therefore DOES read
--                        live_sessions rows for the offering — titles, times and
--                        `recording_url` — straight from the table, and
--                        `get_live_session_zoom_link()` (20260408151600) hands
--                        them the join link inside its T-60 window on the same
--                        active-enrolment test. `zoom_link` itself stays
--                        column-REVOKEd, so the base-table read cannot expose it.
--                      – `cohort_weeks_student_read` (20260526180000) gates on
--                        a `cohort_batch_members` row with NO enrolment-status
--                        filter at all, so a balance-owing applicant an admin has
--                        already placed on a roster — the case R-1's resolver
--                        branch (a) deliberately keeps in the lobby — reads that
--                        batch's weeks.
--                    WHAT IS ENFORCED: everything in R0's own blast radius —
--                    written to agree with the table × verb matrix above rather
--                    than rounded off, because this is the block a reviewer reads
--                    to decide whether the tier is closed. Every table in this
--                    file denies pre_member on every ROOM-CONTENT row, on every
--                    verb. Three tables are not a flat deny, and all three are
--                    enumerated here — an earlier revision said "exactly TWO"
--                    and missed the third, which is the same class of error this
--                    block exists to stop making:
--                      1. cohort_announcements — READ only (`ann_member_read`),
--                         the whitelist surface proper.
--                      2. cohort_room_seen — `room_seen_own` is FOR ALL, but
--                         every verb is pinned to `user_id = auth.uid()` on both
--                         USING and WITH CHECK, so it reaches one timestamp the
--                         caller wrote about themselves.
--                      3. cohort_recording_progress — `recprog_own_all` (§4) is
--                         FOR ALL and routes through
--                         `cohort_room_recording_accessible()`, whose first
--                         branch is `WHEN b.id IS NULL THEN true`. For a session
--                         inside a cohort week that helper defers to
--                         `cohort_room_can_access()` and the lobby is shut out —
--                         the resume rail IS closed, as claimed. But
--                         `live_sessions.week_id` is nullable (20260721000000
--                         added the FK; every masterclass session predates it),
--                         and for a WEEK-LESS session the helper returns true
--                         unconditionally, so any authenticated caller —
--                         pre_member included — holds SELECT/INSERT/UPDATE/
--                         DELETE on their OWN progress row for it. That is
--                         deliberate and it is stated in §4: a session with no
--                         cohort week is not room content, so own-row semantics
--                         apply and a lobby occupant reaches nothing but their
--                         own playback position on a NON-cohort recording. It
--                         reveals no cohort row, no other user's row, and no
--                         recording the caller could not already play. It is
--                         listed anyway because the sentence above is an
--                         exhaustive claim a reviewer is told to trust.
--                    Beyond those three: the room RPCs' lobby envelope is
--                    redacted (see the R-3 note above).
--                    WHERE THE REAL FIX HAS TO LIVE: in the two pre-existing
--                    policies named above (and in `get_live_session_zoom_link`),
--                    by adding "…and this user is not merely a lobby occupant of
--                    the offering" — i.e. `NOT cohort_room_in_lobby(offering)`, or
--                    better, an outstanding-balance test. That is NOT R0's to
--                    make: those are shipped read paths CohortDashboard already
--                    depends on, they are outside this phase's declared files, and
--                    tightening them unilaterally from a room migration is exactly
--                    the kind of cross-surface edit the R0 brief forbids.
--                    ESCALATED to the orchestrator as a follow-up, to be scoped
--                    with the CohortDashboard read paths in hand. Until it lands,
--                    the honest statement of the tier is: R0 keeps a pre_member
--                    out of every ROOM surface that carries cohort CONTENT — the
--                    exceptions are the lobby whitelist itself (masthead config,
--                    announcements read, their own seen marker) plus their own
--                    progress row on a week-less, NON-cohort recording (item 3
--                    above) — and it does NOT
--                    close the pre-existing live_sessions / cohort_weeks
--                    direct-table reads that an active-but-unbalanced enrolment
--                    already opened.
--   accepted   — no membership row => zero rows everywhere. No policy mentions it.
--   outsider / anon — zero rows everywhere (`TO authenticated` + helpers false,
--                and `anon` additionally holds no table privilege at all — see the
--                grant block at the end of this file).
-- ============================================================================

----------------------------------------------------------------------
-- 1. cohort_announcements — mentor/host/admin append-only noticeboard.
--    The ONE table a `pre_member` may read (SEC-MEMBER-1 whitelist:
--    "welcome / announcements channel, READ only").
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.cohort_batches(id) ON DELETE CASCADE, -- NULL = every batch of the offering
  -- Nullable + SET NULL, matching cohort_resources.added_by. An announcement is
  -- an OFFICIAL cohort-wide communication, not user-owned content: deleting the
  -- host's account must not erase the noticeboard of every cohort they ran. The
  -- daily `cleanup_deleted_users()` cron hard-deletes auth.users, which cascades
  -- to public.users, so a CASCADE here would do exactly that. The INSERT policy
  -- still requires author_id = auth.uid(), so live rows are always authored.
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  title text,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz            -- soft delete; no edits (append-only board)
);

-- Idempotent re-shape for a shadow project that already carries the draft's
-- `NOT NULL … ON DELETE CASCADE` author FK. DROP NOT NULL is a no-op when the
-- column is already nullable, and the FK is touched ONLY when its delete action
-- is not already SET NULL ('n') — a fresh apply gets the right action from the
-- CREATE TABLE above and this block does nothing at all.
-- The replacement is added NOT VALID, for the same reason as the CHECKs further
-- down: it binds every future INSERT/UPDATE and the ON DELETE SET NULL action
-- still fires (NOT VALID skips only the initial full-table scan), so a shadow
-- project holding a draft row that the old CASCADE FK would have accepted can
-- never abort a shared `db push`.
DO $$
DECLARE
  v_confdeltype "char";
BEGIN
  ALTER TABLE public.cohort_announcements ALTER COLUMN author_id DROP NOT NULL;

  SELECT c.confdeltype INTO v_confdeltype
  FROM pg_constraint c
  WHERE c.conname = 'cohort_announcements_author_id_fkey'
    AND c.conrelid = 'public.cohort_announcements'::regclass;

  IF v_confdeltype IS DISTINCT FROM 'n'::"char" THEN
    IF v_confdeltype IS NOT NULL THEN
      ALTER TABLE public.cohort_announcements
        DROP CONSTRAINT cohort_announcements_author_id_fkey;
    END IF;

    ALTER TABLE public.cohort_announcements
      ADD CONSTRAINT cohort_announcements_author_id_fkey
      FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL NOT VALID;
  END IF;
-- HANDLER-GUARDED, WITH NO `lock_timeout`, AND THAT IS THE INTENDED SHAPE HERE.
-- An earlier revision of this comment opened "Guarded like every other DDL block
-- in R0"; audited 2026-07-30, that was wrong twice over and is restated rather
-- than deleted, because the phrase is what stopped anyone checking:
--   · The six §7A blocks in 20260729100000 and §0 in 20260729100200 carry a
--     LOCAL `lock_timeout` AND a handler. This block carries only the handler, so
--     it is not "like every other block" — this file sets no `lock_timeout` at
--     all, by decision (header, APPLY-TIME LOCKS, class 1, which carries the
--     comment-proof grep).
--   · Consequently the `query_canceled` branch below can NEVER be reached by a
--     bounded lock wait, which is what the old wording's "a cancelled lock wait
--     rolls back to the ORIGINAL FK" implied. 57014 arrives here only from a
--     `statement_timeout` or a `pg_cancel_backend()` aimed at the push, and 55P03
--     (`lock_not_available`) cannot arrive at all with no timeout set. The branch
--     still earns its place — those two events are real on any table — and
--     `query_canceled` still has to be NAMED, because `OTHERS` does not trap it
--     (20260729100000 contract note 10).
-- WHY NO `lock_timeout`: every statement above takes ACCESS EXCLUSIVE on
-- `cohort_announcements`, which is a table this migration creates, and there is
-- no counterparty for the wait a timeout would bound. On a fresh apply the
-- CREATE TABLE above has already taken ACCESS EXCLUSIVE on it inside this same
-- transaction (measured 2026-07-30: this block runs with `cohort_announcements`
-- already at AccessExclusiveLock), so no other holder is possible. Bounding that
-- would be noise, and noise is what makes the next reader distrust the guards
-- that are load-bearing.
-- The DROP+ADD pair is one subtransaction either way, so any failure rolls back
-- to the ORIGINAL FK rather than leaving the table with none — and, critically,
-- does not abort a shared `db push`.
-- Degradation is safe for the push but PERMANENT until someone acts: the old
-- CASCADE FK survives, so deleting a host's account would still erase the
-- noticeboard of every cohort they ran. A second `db push` does NOT converge it
-- — the version is stamped on completion and never re-applied — so recovery is
-- the manual procedure in 20260729100000 contract note 11, and the section-8
-- VERIFY query there (confdeltype = 'n') is what detects it.
-- WHAT THIS BLOCK DOES ON EACH PATH, because the old closing sentence ("The table
-- is created by this same migration on a fresh apply, so there is no lock to wait
-- on there and this block is a no-op") collapsed two different targets into one
-- and read as if the block never does anything:
--   · FRESH APPLY (what prod is). The CREATE TABLE above already produced
--     `author_id uuid REFERENCES public.users(id) ON DELETE SET NULL`, so
--     confdeltype is already 'n', the IF branch is skipped and no FK is touched.
--     The `ALTER COLUMN … DROP NOT NULL` still EXECUTES — it is a catalogue write
--     on an already-nullable column, not a parsed no-op — it is simply free and
--     unblockable. So: no-op in EFFECT, not in execution, and no lock to wait on.
--   · SHADOW / RE-APPLY, which is the case this block exists for. The table
--     PRE-EXISTS carrying the draft's `NOT NULL … ON DELETE CASCADE` FK, so the
--     DROP NOT NULL and the DROP+ADD both do real work. The "no lock to wait on"
--     reason does not apply there — but the CONCLUSION still does, for a
--     different reason: R0 is the migration that introduces
--     `cohort_announcements`, so no shipped surface reads or writes it on any
--     target, and the only possible competing holder is a hand session someone is
--     running against the same project while pushing.
EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
            OR crash_shutdown OR cannot_connect_now OR others THEN
  RAISE WARNING 'cohort_announcements: author FK re-shape skipped (%) [%] — a pre-existing ON DELETE CASCADE author FK may still be in place, so deleting a host account would erase their announcements. Another db push will NOT fix this: re-run this DO block by hand (20260729100000 contract note 11).',
    SQLERRM, SQLSTATE;
END $$;

CREATE INDEX IF NOT EXISTS cohort_announcements_room_idx
  ON public.cohort_announcements (offering_id, is_pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.cohort_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ann_admin_all ON public.cohort_announcements;
CREATE POLICY ann_admin_all ON public.cohort_announcements
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- SELECT: full members (batch-precise) OR the pre_member lobby tier.
-- A NULL batch_id row is offering-wide: `can_access(offering, NULL)` is true for
-- any active member of the offering regardless of their batch, so a 2-batch
-- fixture sees the same announcement from both batches.
DROP POLICY IF EXISTS ann_member_read ON public.cohort_announcements;
CREATE POLICY ann_member_read ON public.cohort_announcements FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.cohort_room_can_access(offering_id, batch_id)
      OR public.cohort_room_in_lobby(offering_id, batch_id)   -- pre_member, read-only
    )
  );

-- INSERT: mentor/host/admin only, cannot forge authorship, cannot file a row
-- under a batch that belongs to a different offering.
DROP POLICY IF EXISTS ann_host_insert ON public.cohort_announcements;
CREATE POLICY ann_host_insert ON public.cohort_announcements FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.cohort_room_can_post_announcement(offering_id)
    -- Outer columns are table-qualified: an unqualified `offering_id` would bind
    -- to cohort_batches.offering_id inside the subquery and the check would be a
    -- tautology.
    AND (batch_id IS NULL OR EXISTS (
      SELECT 1 FROM public.cohort_batches b
      WHERE b.id = cohort_announcements.batch_id
        AND b.offering_id = cohort_announcements.offering_id
    ))
  );
-- RETRACTION. The board stays append-only for its TEXT — nobody rewrites history
-- — but a mentor/host who posted a wrong announcement must be able to pull it
-- without waiting on an admin, and the only automated admin lever
-- (`cleanup_deleted_users()`) destroys rather than retracts. So: mentors/hosts
-- get an UPDATE verb whose guard pins the columns that decide what the notice
-- SAYS and WHERE it lives, and leaves them `deleted_at` (one-way) and
-- `is_pinned`. Retraction is theirs; restoration is admin-only.
--
-- ⚠️ A BEFORE UPDATE guard on a table with an `ON DELETE SET NULL` FK must never
-- pin that FK column unconditionally. PostgreSQL implements the action as an
-- internal `UPDATE ONLY … SET author_id = NULL` run through SPI, which fires
-- THIS trigger. `cleanup_deleted_users()` (20260522180000) runs on cron with no
-- JWT, so auth.uid() is NULL, is_admin() is false, and a bare
-- `NEW.author_id := OLD.author_id` would write the dying user's id straight back
-- — leaving a dangling FK or aborting the whole nightly batch delete. The pin
-- therefore yields to exactly one transition: NULL, applied from inside a nested
-- trigger. A client PATCH always runs at pg_trigger_depth() = 1, so
-- re-attribution (and de-attribution) from the outside is still reverted, and
-- the announcement of a departed host stays retractable by whoever remains.
CREATE OR REPLACE FUNCTION public._room_announcement_pin_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.id          := OLD.id;
  NEW.offering_id := OLD.offering_id;
  NEW.batch_id    := OLD.batch_id;
  NEW.title       := OLD.title;
  NEW.body        := OLD.body;
  NEW.created_at  := OLD.created_at;

  IF NEW.author_id IS DISTINCT FROM OLD.author_id
     AND NOT (NEW.author_id IS NULL AND pg_trigger_depth() > 1) THEN
    NEW.author_id := OLD.author_id;   -- re-attribution, not the RI action
  END IF;

  -- `is_pinned` is the noticeboard's ORDER, not its content, and
  -- cohort_announcements_room_idx sorts by it. The only non-admin UPDATE policy
  -- is ann_host_retract, so anything reaching this trigger is already a
  -- mentor/host of the offering; pinning is_pinned would have meant a host could
  -- pin a session-reschedule notice and then never demote it — the same
  -- "must not wait on an admin" problem retraction exists to solve. Re-checked
  -- here rather than inferred from the policy, so a future permissive UPDATE
  -- policy cannot silently hand this lever to a plain member.
  IF NOT public.cohort_room_can_post_announcement(OLD.offering_id) THEN
    NEW.is_pinned := OLD.is_pinned;
  END IF;

  -- One-way: a retracted announcement can only be restored by an admin.
  IF OLD.deleted_at IS NOT NULL THEN
    NEW.deleted_at := OLD.deleted_at;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS room_announcement_pin_columns ON public.cohort_announcements;
CREATE TRIGGER room_announcement_pin_columns
  BEFORE UPDATE ON public.cohort_announcements
  FOR EACH ROW EXECUTE FUNCTION public._room_announcement_pin_columns();

DROP POLICY IF EXISTS ann_host_retract ON public.cohort_announcements;
CREATE POLICY ann_host_retract ON public.cohort_announcements FOR UPDATE
  TO authenticated
  USING (public.cohort_room_can_post_announcement(offering_id))
  WITH CHECK (public.cohort_room_can_post_announcement(offering_id));
-- No member DELETE policy: hard delete is admin-only via ann_admin_all.
-- `pre_member` matches no write policy on this table at all.

----------------------------------------------------------------------
-- 2. cohort_resources — files/links library (optionally pinned to a week).
--    Curriculum + mentor materials => full members only, NO lobby read.
--
--    ⚠️ APPLY-TIME: `cohort_week_id … REFERENCES public.cohort_weeks(id)` below is
--    the PUSH'S FIRST lock acquisition on `cohort_weeks` — SHARE ROW EXCLUSIVE,
--    held to the end of THIS FILE's transaction, taken with the session
--    `lock_timeout` (0 on the `db push` path). It is one of R0's FIVE remaining
--    unbounded lock waits — all five are in this file, and an earlier revision of
--    this line said "two" on the withdrawn premise that a sibling's locks covered
--    `users`, `offerings` and `cohort_batches` — and it is NOT wrappable in the
--    §7A degrade pattern. Header, APPLY-TIME LOCKS class (3), carries the
--    reasoning and the filed decision. Do not "fix" it here without reading that.
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.cohort_batches(id) ON DELETE CASCADE,
  cohort_week_id uuid REFERENCES public.cohort_weeks(id) ON DELETE SET NULL,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'link' CHECK (kind IN ('link','file','video')),
  url text NOT NULL,
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cohort_resources_room_idx
  ON public.cohort_resources (offering_id, cohort_week_id, sort_order);

ALTER TABLE public.cohort_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS res_admin_all ON public.cohort_resources;
CREATE POLICY res_admin_all ON public.cohort_resources
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS res_member_read ON public.cohort_resources;
CREATE POLICY res_member_read ON public.cohort_resources FOR SELECT
  TO authenticated
  USING (public.cohort_room_can_access(offering_id, batch_id));

-- `added_by = auth.uid()` is pinned for the same reason ann_host_insert pins
-- `author_id`: the library is attributed in the UI, and a mentor must not be
-- able to file off-platform material under the host's name (or under nobody's).
-- Admins keep the free hand through res_admin_all; only the RI action may later
-- null the column out, which is a DELETE-time concern, not an INSERT one.
DROP POLICY IF EXISTS res_host_write ON public.cohort_resources;
CREATE POLICY res_host_write ON public.cohort_resources FOR INSERT
  TO authenticated
  WITH CHECK (
    added_by = auth.uid()
    AND public.cohort_room_can_post_announcement(offering_id)
    AND (batch_id IS NULL OR EXISTS (
      SELECT 1 FROM public.cohort_batches b
      WHERE b.id = cohort_resources.batch_id
        AND b.offering_id = cohort_resources.offering_id
    ))
  );

----------------------------------------------------------------------
-- 3. cohort_room_posts + cohort_room_post_replies — the async commons.
--    Full members only (SEC-MEMBER-1: the commons is NOT in the pre_member
--    whitelist, read or write). Writes are RPC-only (SEC-WRITE-1).
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_room_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.cohort_batches(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'post' CHECK (kind IN ('post','question','win')),
  body text NOT NULL,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_count integer NOT NULL DEFAULT 0,       -- trigger-maintained; feeds do zero COUNT(*)
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  legacy_post_id uuid UNIQUE,                   -- idempotent copy marker from community_posts
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- CHANNEL-KEY-1 (Δ1) — landed DARK in R0: no UI reads these yet, but the
-- taxonomy must exist before any feed UI is built on top of it.
--   channel_key: standing keys `this_week` | `assignments_help` | `general`,
--   plus per-cohort niche keys drawn from the room config's vocab. DELIBERATELY
--   NO CHECK CONSTRAINT — niche channels are added by a config edit with no
--   deploy, so a static CHECK would block them. Validation lives server-side in
--   R-3's cohort_room_post_write() RPC (03-DATA-MODEL-ERD §4.7).
--   Wins are NOT a channel_key: the Wins tab filters on kind='win'.
--   Announcements are NOT a channel_key: they are cohort_announcements above.
ALTER TABLE public.cohort_room_posts
  ADD COLUMN IF NOT EXISTS channel_key text NOT NULL DEFAULT 'general';
--   cohort_week_id: non-NULL ONLY for channel_key='this_week' — the per-week
--   thread's home. NULL for every other channel. Not CHECK-enforced for the same
--   reason as above (the write RPC owns the pairing rule).
ALTER TABLE public.cohort_room_posts
  ADD COLUMN IF NOT EXISTS cohort_week_id uuid REFERENCES public.cohort_weeks(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cohort_room_posts.channel_key IS
  'Channel taxonomy (CHANNEL-KEY-1). Free text by design; validated in cohort_room_post_write(), never by a CHECK, so niche channels are a config edit with no deploy.';
COMMENT ON COLUMN public.cohort_room_posts.cohort_week_id IS
  'Non-NULL only for channel_key=''this_week'' — the auto-minted per-week thread. NULL elsewhere.';

CREATE TABLE IF NOT EXISTS public.cohort_room_post_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.cohort_room_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- The visually-distinct mentor answer (REQ-COMM-2). NEVER client-set: R-3's
-- cohort_room_reply_write() stamps it from the caller's RESOLVED room role, and
-- the immutability guard below pins it on every non-admin UPDATE.
ALTER TABLE public.cohort_room_post_replies
  ADD COLUMN IF NOT EXISTS is_mentor_answer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cohort_room_post_replies.is_mentor_answer IS
  'Server-stamped from the author''s resolved room role (mentor/host only). Client input is ignored on insert (RPC) and pinned on update (guard trigger). The membership table is named only in this file''s header comments, never in SQL, so the NFR-SEC-2 grep stays clean.';

-- ── Body/media shape constraints (SEC-WRITE-1, the UPDATE half) ─────────────
-- The write RPCs reject a body that is blank after btrim OR over 20000 (post) /
-- 10000 (reply) chars, and a `media` that is not a jsonb array. Those limits
-- have to hold on the UPDATE verb too, which stays granted so an author can edit
-- their own row and which deliberately does NOT pin `body`/`media`. Declared
-- here so the database — not one code path — is what enforces them: otherwise a
-- caller writes a valid body through the RPC and then PATCHes it to anything,
-- including `''`, which renders as an empty card no moderator can tell apart
-- from a rendering bug; and `media` stops being an array under a feed that does
-- `media.map(...)` on Android WebView, iOS WKWebView and desktop web alike.
-- BOTH bounds are mirrored, and both sides use btrim exactly as the RPCs do
-- (`btrim(COALESCE(p_body,''))` then `length(...) > N`), so the declarative rule
-- and the imperative one can never drift apart in either direction.
-- NOT VALID: binding on every future INSERT/UPDATE, never scanning existing
-- rows, so a shadow project holding draft rows cannot abort a shared `db push`.
-- Dropped and re-added rather than skipped-if-present, so a shadow project
-- carrying the earlier upper-bound-only definition is upgraded in place; the
-- re-add is metadata-only (NOT VALID never scans) and therefore instant.
DO $$
BEGIN
  ALTER TABLE public.cohort_room_posts
    DROP CONSTRAINT IF EXISTS room_posts_body_len_chk;
  ALTER TABLE public.cohort_room_posts
    ADD CONSTRAINT room_posts_body_len_chk
    CHECK (length(btrim(body)) BETWEEN 1 AND 20000) NOT VALID;

  ALTER TABLE public.cohort_room_posts
    DROP CONSTRAINT IF EXISTS room_posts_media_array_chk;
  ALTER TABLE public.cohort_room_posts
    ADD CONSTRAINT room_posts_media_array_chk
    CHECK (jsonb_typeof(media) = 'array') NOT VALID;

  ALTER TABLE public.cohort_room_post_replies
    DROP CONSTRAINT IF EXISTS room_reply_body_len_chk;
  ALTER TABLE public.cohort_room_post_replies
    ADD CONSTRAINT room_reply_body_len_chk
    CHECK (length(btrim(body)) BETWEEN 1 AND 10000) NOT VALID;
-- Guarded (20260729100000 contract note 10). NOT VALID never scans, so these are
-- metadata-only and effectively instant — but they still take ACCESS EXCLUSIVE
-- on two tables, and a cancelled lock wait raises 57014, which `WHEN OTHERS`
-- would NOT have caught and which would have aborted the whole shared push.
-- The whole block is one subtransaction: on failure the DROPs roll back with the
-- ADDs, so a project that already carried the earlier upper-bound-only
-- definition keeps it rather than ending with no CHECK at all. The write RPCs
-- enforce the same limits imperatively either way; only the UPDATE-verb half of
-- SEC-WRITE-1 degrades — and it stays degraded until this DO block is re-run BY
-- HAND, because a second `db push` will not re-apply a stamped file
-- (20260729100000 contract note 11; the section-8 VERIFY query detects it).
EXCEPTION WHEN query_canceled OR assert_failure OR admin_shutdown
            OR crash_shutdown OR cannot_connect_now OR others THEN
  RAISE WARNING 'cohort_room posts/replies: body+media shape constraints not (re)applied (%) [%] — the write RPCs still enforce them, but the granted UPDATE verb is unguarded until this DO block is re-run by hand. Another db push will NOT do it (20260729100000 contract note 11).',
    SQLERRM, SQLSTATE;
END $$;

-- Feed indexes. The channel view and the all-channel view are each ONE keyset
-- scan, no COUNT(*), no sort.
DROP INDEX IF EXISTS public.room_posts_feed_idx;
CREATE INDEX room_posts_feed_idx
  ON public.cohort_room_posts (batch_id, channel_key, last_activity_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS room_posts_recent_idx
  ON public.cohort_room_posts (batch_id, last_activity_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS room_posts_week_thread_idx
  ON public.cohort_room_posts (cohort_week_id, created_at DESC)
  WHERE cohort_week_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS room_post_replies_idx
  ON public.cohort_room_post_replies (post_id, created_at)
  WHERE deleted_at IS NULL;

-- ── reply_count counter ─────────────────────────────────────────────────────
-- Insert => +1. Soft-delete (deleted_at NULL -> NOT NULL) => -1, floored at 0.
-- Un-delete (admin-only, see the pin guards) => +1 again, so the counter
-- survives a restore.
-- HARD DELETE => -1 as well, and it is NOT hypothetical: `author_id` cascades
-- from public.users, and `cleanup_deleted_users()`
-- (20260522180000_account_deletion.sql) runs daily on cron and hard-deletes
-- auth.users rows past their 7-day grace period, taking every reply that user
-- ever wrote with them. Without this branch the surviving posts would carry an
-- inflated reply_count forever — nothing reconciles it, R-1's
-- cohort_room_reconcile() only touches membership. A reply that was ALREADY
-- soft-deleted was already decremented, so only a live row decrements again.
-- The transaction-local GUC lets the immutability guard below tell a counter
-- write apart from a client write without any RAISE.
CREATE OR REPLACE FUNCTION public._room_post_reply_counter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.cohort_room_counter', '1', true);

  IF TG_OP = 'INSERT' THEN
    UPDATE public.cohort_room_posts
    SET reply_count = reply_count + 1, last_activity_at = now()
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.cohort_room_posts
    SET reply_count = greatest(reply_count - 1, 0)
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    UPDATE public.cohort_room_posts
    SET reply_count = reply_count + 1, last_activity_at = now()
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' AND OLD.deleted_at IS NULL THEN
    -- The parent post may be disappearing in the same cascade; then this
    -- UPDATE simply matches no row.
    UPDATE public.cohort_room_posts
    SET reply_count = greatest(reply_count - 1, 0)
    WHERE id = OLD.post_id;
  END IF;

  PERFORM set_config('app.cohort_room_counter', '0', true);

  -- An AFTER trigger's return value is discarded, and touching OLD on INSERT
  -- (or NEW on DELETE) is the hazard R-1 works around explicitly in
  -- `public._room_resolve_from_batch_member()` (20260729100000 §5). Branch on
  -- TG_OP the same way rather than COALESCE-ing the two together.
  -- BY NAME, NOT BY LINE: the ":443" this comment used to carry pointed at R-1's
  -- section 1 header, not at the code — R-1's own contract note 1 says line
  -- citations into that file go stale and forbids new ones.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS room_post_reply_counter ON public.cohort_room_post_replies;
CREATE TRIGGER room_post_reply_counter
  AFTER INSERT OR UPDATE OR DELETE ON public.cohort_room_post_replies
  FOR EACH ROW EXECUTE FUNCTION public._room_post_reply_counter();

-- ── Immutable-column guards (no RAISE: the server simply wins) ──────────────
-- An author may edit body/media and soft-delete their own row. Everything that
-- decides WHERE a row lives or WHO it speaks as is pinned to its stored value
-- for non-admin callers, so the UPDATE verb cannot be used to launder a forged
-- channel_key or a self-granted is_mentor_answer past the write RPC.
-- `deleted_at` is pinned ONE-WAY: a non-admin may set it (retract their own row)
-- but never clear it. Soft-delete is the everyday moderation action, and without
-- this the offender could simply PATCH `deleted_at` back to NULL — silently,
-- since the counter's un-delete branch would restore reply_count too. Only an
-- admin restores.
CREATE OR REPLACE FUNCTION public._room_post_pin_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.id             := OLD.id;
  NEW.offering_id    := OLD.offering_id;
  NEW.batch_id       := OLD.batch_id;
  NEW.author_id      := OLD.author_id;
  NEW.kind           := OLD.kind;
  NEW.channel_key    := OLD.channel_key;      -- W8: channel forgery via UPDATE
  NEW.legacy_post_id := OLD.legacy_post_id;
  NEW.created_at     := OLD.created_at;

  -- Same RI carve-out as _room_announcement_pin_columns(): cohort_week_id is
  -- `ON DELETE SET NULL`, and PostgreSQL runs that action as an internal UPDATE
  -- that fires this trigger with no JWT. Pinning it unconditionally would write
  -- the dying week's id back and leave a dangling FK (or abort the delete).
  -- Only a NULL-ing from inside a nested trigger is let through; a client PATCH
  -- runs at depth 1 and is reverted, and the reply counter's own nested UPDATE
  -- never touches this column so IS DISTINCT FROM is false there.
  IF NEW.cohort_week_id IS DISTINCT FROM OLD.cohort_week_id
     AND NOT (NEW.cohort_week_id IS NULL AND pg_trigger_depth() > 1) THEN
    NEW.cohort_week_id := OLD.cohort_week_id;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    NEW.deleted_at := OLD.deleted_at;           -- moderation is one-way
  END IF;

  -- reply_count / last_activity_at are counter-owned; a direct client write to
  -- them is discarded, a counter write passes through.
  IF COALESCE(current_setting('app.cohort_room_counter', true), '0') <> '1' THEN
    NEW.reply_count      := OLD.reply_count;
    NEW.last_activity_at := OLD.last_activity_at;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS room_post_pin_columns ON public.cohort_room_posts;
CREATE TRIGGER room_post_pin_columns
  BEFORE UPDATE ON public.cohort_room_posts
  FOR EACH ROW EXECUTE FUNCTION public._room_post_pin_columns();

CREATE OR REPLACE FUNCTION public._room_reply_pin_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.id               := OLD.id;
  NEW.post_id          := OLD.post_id;
  NEW.author_id        := OLD.author_id;
  NEW.is_mentor_answer := OLD.is_mentor_answer;   -- W9: mentor-answer forgery via UPDATE
  NEW.created_at       := OLD.created_at;

  IF OLD.deleted_at IS NOT NULL THEN
    NEW.deleted_at := OLD.deleted_at;             -- moderation is one-way
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS room_reply_pin_columns ON public.cohort_room_post_replies;
CREATE TRIGGER room_reply_pin_columns
  BEFORE UPDATE ON public.cohort_room_post_replies
  FOR EACH ROW EXECUTE FUNCTION public._room_reply_pin_columns();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.cohort_room_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_room_post_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS posts_admin_all ON public.cohort_room_posts;
CREATE POLICY posts_admin_all ON public.cohort_room_posts
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Read is membership-gated with NO author escape hatch: an author whose
-- membership is later revoked keeps their rows but can no longer read them.
DROP POLICY IF EXISTS posts_member_read ON public.cohort_room_posts;
CREATE POLICY posts_member_read ON public.cohort_room_posts FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL AND public.cohort_room_can_access(offering_id, batch_id));

-- SEC-WRITE-1: there is NO member INSERT policy, and the grant is revoked below.
-- These DROPs exist so a shadow project carrying the draft's policies is
-- brought into line by re-running this migration.
DROP POLICY IF EXISTS posts_member_insert ON public.cohort_room_posts;
DROP POLICY IF EXISTS replies_member_insert ON public.cohort_room_post_replies;

-- Author edit: still membership-gated on both sides, so a revoked author can
-- neither read nor edit, and cannot move a row into a room they can reach.
DROP POLICY IF EXISTS posts_author_update ON public.cohort_room_posts;
CREATE POLICY posts_author_update ON public.cohort_room_posts FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() AND public.cohort_room_can_access(offering_id, batch_id))
  WITH CHECK (author_id = auth.uid() AND public.cohort_room_can_access(offering_id, batch_id));

DROP POLICY IF EXISTS replies_admin_all ON public.cohort_room_post_replies;
CREATE POLICY replies_admin_all ON public.cohort_room_post_replies
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS replies_member_read ON public.cohort_room_post_replies;
CREATE POLICY replies_member_read ON public.cohort_room_post_replies FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.cohort_room_posts p
    WHERE p.id = cohort_room_post_replies.post_id
      AND public.cohort_room_can_access(p.offering_id, p.batch_id)
  ));

-- Author soft-delete / edit of their own reply (the counter's -1 path).
DROP POLICY IF EXISTS replies_author_update ON public.cohort_room_post_replies;
CREATE POLICY replies_author_update ON public.cohort_room_post_replies FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.cohort_room_posts p
    WHERE p.id = cohort_room_post_replies.post_id
      AND public.cohort_room_can_access(p.offering_id, p.batch_id)
  ))
  WITH CHECK (author_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.cohort_room_posts p
    WHERE p.id = cohort_room_post_replies.post_id
      AND public.cohort_room_can_access(p.offering_id, p.batch_id)
  ));

-- SEC-WRITE-1: the client cannot INSERT into the commons at all — a raw INSERT
-- fails on the missing grant before RLS is even consulted. R-3's SECURITY
-- DEFINER RPCs run as the table owner and are unaffected.
-- DELETE stays granted deliberately. PostgREST hands admins the same
-- `authenticated` role as everyone else, so revoking DELETE would take hard
-- delete away from ADMINS while leaving members' soft-delete intact — i.e. the
-- only moderation verb left would be the reversible one. RLS is what scopes
-- DELETE: `posts_admin_all` / `replies_admin_all` are the only policies covering
-- the verb, so a member's DELETE matches nothing and is denied. The counter's
-- DELETE branch keeps reply_count truthful when an admin (or the account-deletion
-- cascade) does remove a row.
REVOKE INSERT ON public.cohort_room_posts FROM authenticated, anon;
REVOKE INSERT ON public.cohort_room_post_replies FROM authenticated, anon;

----------------------------------------------------------------------
-- 4. cohort_recording_progress — "recordings that resume".
--    Own rows only, AND the recording's room must be reachable, so the resume
--    rail cannot become a side channel into a COHORT recording for a
--    `pre_member` (recordings are explicitly outside the SEC-MEMBER-1
--    whitelist) or for a revoked member.
--    Precisely: the gate binds when the session hangs off a cohort week. A
--    week-less session is not room content and keeps plain own-row semantics —
--    which means this table is one of the three in this file that a lobby
--    occupant holds any verb on at all. That is enumerated in the Tier-2 block
--    in the header rather than left implicit here, because the header makes an
--    exhaustive claim and this is the third item in it.
--
--    ⚠️ APPLY-TIME: `live_session_id … REFERENCES public.live_sessions(id)` below
--    is the PUSH'S FIRST lock acquisition on `live_sessions` — SHARE ROW
--    EXCLUSIVE, held to the end of THIS FILE's transaction, taken with the session
--    `lock_timeout` (0 on the `db push` path). It is one of R0's five remaining
--    unbounded lock waits. Header, APPLY-TIME LOCKS class (3).
--    IT COVERS NOTHING IN 20260729100200. An earlier revision of this note closed
--    with "and it is the reason 20260729100200 §0's guarded CREATE INDEX on the
--    SAME table cannot wait at all on a first apply: SHARE ROW EXCLUSIVE is
--    strictly stronger than the SHARE that index needs, and the push already holds
--    it from here." That is cross-file lock inheritance and `db push` provides
--    none — this lock is RELEASED at this file's COMMIT, so 20260729100200 §0's
--    SHARE is a first acquisition in its own transaction and its 1s guard is the
--    PROD path, not a shadow-only one. 20260729100200 §0, THE TRANSACTION
--    BOUNDARY, carries the correction and the measurement.
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_recording_progress (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  live_session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, live_session_id)
);

-- Resolves a session's room container and defers the verdict to the ONE helper.
-- A session with no cohort week is not room content (legacy/workshop session),
-- so own-row semantics apply unchanged.
CREATE OR REPLACE FUNCTION public.cohort_room_recording_accessible(p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
           WHEN b.id IS NULL THEN true
           ELSE public.cohort_room_can_access(b.offering_id, b.id)
         END
  FROM public.live_sessions s
  LEFT JOIN public.cohort_weeks w ON w.id = s.week_id
  LEFT JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
  WHERE s.id = p_session;
$$;
REVOKE ALL ON FUNCTION public.cohort_room_recording_accessible(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cohort_room_recording_accessible(uuid) TO authenticated;

ALTER TABLE public.cohort_recording_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recprog_own_all ON public.cohort_recording_progress;
CREATE POLICY recprog_own_all ON public.cohort_recording_progress
  FOR ALL TO authenticated
  USING (user_id = auth.uid()
         AND public.cohort_room_recording_accessible(live_session_id))
  WITH CHECK (user_id = auth.uid()
              AND public.cohort_room_recording_accessible(live_session_id));

DROP POLICY IF EXISTS recprog_admin_read ON public.cohort_recording_progress;
CREATE POLICY recprog_admin_read ON public.cohort_recording_progress FOR SELECT
  USING (public.is_admin());

----------------------------------------------------------------------
-- 5. cohort_demo_entries — demo-day showcase (wrap/alumni phases).
--    Gallery is readable by the batch; an entry is writable only by its owner.
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_demo_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.cohort_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  work_url text,                            -- link to the work (video/site/doc)
  file_urls text[] NOT NULL DEFAULT '{}',   -- rides the cohort-submissions bucket pattern
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_one_per_user UNIQUE (batch_id, user_id)
);

DROP TRIGGER IF EXISTS cohort_demo_entries_updated_at ON public.cohort_demo_entries;
CREATE TRIGGER cohort_demo_entries_updated_at
  BEFORE UPDATE ON public.cohort_demo_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cohort_demo_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demo_admin_all ON public.cohort_demo_entries;
CREATE POLICY demo_admin_all ON public.cohort_demo_entries
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS demo_member_read ON public.cohort_demo_entries;
CREATE POLICY demo_member_read ON public.cohort_demo_entries FOR SELECT
  TO authenticated
  USING (public.cohort_room_can_access(offering_id, batch_id));

DROP POLICY IF EXISTS demo_own_write ON public.cohort_demo_entries;
CREATE POLICY demo_own_write ON public.cohort_demo_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.cohort_room_can_access(offering_id, batch_id)
    AND EXISTS (
      SELECT 1 FROM public.cohort_batches b
      WHERE b.id = cohort_demo_entries.batch_id
        AND b.offering_id = cohort_demo_entries.offering_id
    )
  );

-- Own entry only, and still membership-gated: a revoked member cannot edit their
-- showcase row, and member_A can never touch member_B's.
DROP POLICY IF EXISTS demo_own_update ON public.cohort_demo_entries;
CREATE POLICY demo_own_update ON public.cohort_demo_entries FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND public.cohort_room_can_access(offering_id, batch_id))
  WITH CHECK (user_id = auth.uid() AND public.cohort_room_can_access(offering_id, batch_id));

-- A member may withdraw their own showcase entry (demo_one_per_user makes this
-- the only way to re-submit). Still their own row, still membership-gated.
DROP POLICY IF EXISTS demo_own_delete ON public.cohort_demo_entries;
CREATE POLICY demo_own_delete ON public.cohort_demo_entries FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND public.cohort_room_can_access(offering_id, batch_id));

----------------------------------------------------------------------
-- 6. cohort_room_seen — per-user last-seen marker that powers the unseen
--    announcements count in R-3's get_my_cohort_rooms(). Owned by THIS
--    migration; R-3 only reads it.
--    Every row here is a self-authored timestamp, so own-row alone would leak
--    nothing — but "EVERY SELECT routes through an access helper" (NFR-SEC-2) is
--    stated without exception, and a table this file's own matrix classifies as
--    room content must not be the one place it does not hold. USING therefore
--    carries the same helper gate as WITH CHECK, which also makes the R-4
--    "accepted/outsider reads EVERY room-content surface -> 0 rows" sweep pass
--    here because a POLICY denies it and not merely because no row exists.
--    Consequence, and it matches cohort_room_posts exactly: a revoked member's
--    own seen row persists but stops being readable — the unseen count is
--    recomputed from scratch if they are ever re-granted, which is the correct
--    behaviour anyway (R-3 reads this table as SECURITY DEFINER and is
--    unaffected). Without the WRITE half of the gate, ANY authenticated user —
--    the R-4 `outsider` and `accepted_A` fixtures included, who by Δ2 hold zero
--    grant into any room-content surface — could UPSERT rows here for an
--    arbitrary offering_id: unbounded client-driven row creation that would
--    contradict the header's claim that `accepted` gets nothing on every table
--    below. The gate is helper-routed like everything else, so NFR-SEC-2 holds:
--    this file references no membership table directly.
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_room_seen (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, offering_id)
);

ALTER TABLE public.cohort_room_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_seen_own ON public.cohort_room_seen;
CREATE POLICY room_seen_own ON public.cohort_room_seen FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      public.cohort_room_can_access(offering_id, NULL::uuid)
      OR public.cohort_room_in_lobby(offering_id, NULL::uuid)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.cohort_room_can_access(offering_id, NULL::uuid)
      OR public.cohort_room_in_lobby(offering_id, NULL::uuid)
    )
  );

----------------------------------------------------------------------
-- 7. Grant hygiene.
--    RLS already denies `anon` on every table above (every member policy is
--    `TO authenticated`, and the `*_admin_all` policies evaluate is_admin(),
--    false for a NULL auth.uid()). This block is the second lock, matching what
--    R-1 does for cohort_room_members / cohort_room_configs: Supabase's ALTER
--    DEFAULT PRIVILEGES hands `anon` full table privileges on every new table,
--    and the day someone adds a permissive policy without a TO clause, that
--    default is the difference between a bug and a leak.
--    Grants to `authenticated` are stated explicitly rather than inherited, so
--    the verb list per table is one grep, not an inference about defaults.
--
--    ⚠️ AND THE REVOKE FOR `authenticated` IS NOT OPTIONAL EITHER, which this
--    block used to assume. A `GRANT SELECT, INSERT, UPDATE, DELETE` does not
--    take away what the bootstrap already handed over: `GRANT ALL` is SEVEN
--    verbs — SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER — and
--    naming four in a GRANT is additive, not a replacement. qa-harness/
--    shadow-grants.sql, generated from production (ivkvluezuiojovpotlyb), shows
--    every public table reading 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
--    TRUNCATE, UPDATE' for `authenticated`, so on the target environment all
--    seven content tables below were leaving TRUNCATE on the role every logged-in
--    student carries — and **TRUNCATE BYPASSES RLS ENTIRELY**: not one of the 21
--    policies above is consulted for it, including the ones protecting the rows
--    the access suite plants its LEAK_CANARY sentinels in.
--    SCOPED HONESTLY: PostgREST exposes no TRUNCATE verb, so this is not a live
--    client-reachable exploit today. It is defence in depth on exactly the
--    footing this block already argues for `anon` ("the day someone adds a
--    permissive policy … that default is the difference between a bug and a
--    leak"), plus accuracy for anything that signs off on the grant surface.
--    REFERENCES and TRIGGER are deliberately left alone: both need ownership of
--    or privileges on objects `authenticated` cannot reach, and neither reads or
--    destroys a row. TRUNCATE does. Same shape as 20260729100000 §7.
----------------------------------------------------------------------
REVOKE ALL ON public.cohort_announcements       FROM anon;
REVOKE ALL ON public.cohort_resources           FROM anon;
REVOKE ALL ON public.cohort_room_posts          FROM anon;
REVOKE ALL ON public.cohort_room_post_replies   FROM anon;
REVOKE ALL ON public.cohort_recording_progress  FROM anon;
REVOKE ALL ON public.cohort_demo_entries        FROM anon;
REVOKE ALL ON public.cohort_room_seen           FROM anon;

-- TRUNCATE first, on all seven, because a later GRANT of the four DML verbs
-- would not have removed it. Ordered before the GRANTs so the end state is
-- readable top to bottom: take away what the bootstrap gave, then state exactly
-- what each table hands back.
REVOKE TRUNCATE ON public.cohort_announcements       FROM authenticated;
REVOKE TRUNCATE ON public.cohort_resources           FROM authenticated;
REVOKE TRUNCATE ON public.cohort_room_posts          FROM authenticated;
REVOKE TRUNCATE ON public.cohort_room_post_replies   FROM authenticated;
REVOKE TRUNCATE ON public.cohort_recording_progress  FROM authenticated;
REVOKE TRUNCATE ON public.cohort_demo_entries        FROM authenticated;
REVOKE TRUNCATE ON public.cohort_room_seen           FROM authenticated;

-- ⚠️ THE SAME "A GRANT DOES NOT UN-GRANT" RULE APPLIES TO INSERT ON THE TWO
-- COMMONS TABLES, AND IT IS ALREADY HANDLED — recorded here because a previous
-- revision of this note filed it as open debt ("`authenticated` still holds the
-- bootstrap's INSERT on both") and was contradicted by the very next line. The
-- GRANT below omits INSERT for cohort_room_posts / cohort_room_post_replies
-- (SEC-WRITE-1 — they are written through R-3's SECURITY DEFINER RPCs), and
-- omitting is indeed not removing — which is why §3 above does not stop at
-- omitting: it issues `REVOKE INSERT … FROM authenticated, anon` on both. So on
-- a bootstrapped project the end state carries no INSERT on either table, and a
-- raw client INSERT fails on the missing grant before RLS is consulted.
-- DO NOT "simplify" that revoke away on the grounds that RLS covers it. It does
-- not: `posts_admin_all` / `replies_admin_all` above carry no FOR and no TO
-- clause, so they are FOR ALL TO PUBLIC and DO admit INSERT for an admin JWT —
-- and PostgREST hands admins the same `authenticated` role as everyone else.
-- The grant is the thing keeping the commons RPC-only.
-- The measured end state for all nine R0 tables is in 20260729100000's A6
-- item (9); the operator-facing expectation is its section-8 THIRD CHECK.
--
-- INSERT is absent for the commons on purpose (SEC-WRITE-1, revoked in §3).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohort_announcements       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohort_resources           TO authenticated;
GRANT SELECT,         UPDATE, DELETE ON public.cohort_room_posts          TO authenticated;
GRANT SELECT,         UPDATE, DELETE ON public.cohort_room_post_replies   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohort_recording_progress  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohort_demo_entries        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohort_room_seen           TO authenticated;

GRANT ALL ON public.cohort_announcements       TO service_role;
GRANT ALL ON public.cohort_resources           TO service_role;
GRANT ALL ON public.cohort_room_posts          TO service_role;
GRANT ALL ON public.cohort_room_post_replies   TO service_role;
GRANT ALL ON public.cohort_recording_progress  TO service_role;
GRANT ALL ON public.cohort_demo_entries        TO service_role;
GRANT ALL ON public.cohort_room_seen           TO service_role;

-- ============================================================================
-- REVERSAL (single script — run in this order; nothing here is destructive to
-- any pre-existing table because every object below is net-new in R0):
--
--   DROP TABLE IF EXISTS public.cohort_room_seen           CASCADE;
--   DROP TABLE IF EXISTS public.cohort_demo_entries        CASCADE;
--   DROP TABLE IF EXISTS public.cohort_recording_progress  CASCADE;
--   DROP TABLE IF EXISTS public.cohort_room_post_replies   CASCADE;
--   DROP TABLE IF EXISTS public.cohort_room_posts          CASCADE;
--   DROP TABLE IF EXISTS public.cohort_resources           CASCADE;
--   DROP TABLE IF EXISTS public.cohort_announcements       CASCADE;
--   DROP FUNCTION IF EXISTS public.cohort_room_recording_accessible(uuid);
--   DROP FUNCTION IF EXISTS public._room_post_reply_counter();
--   DROP FUNCTION IF EXISTS public._room_post_pin_columns();
--   DROP FUNCTION IF EXISTS public._room_reply_pin_columns();
--   DROP FUNCTION IF EXISTS public._room_announcement_pin_columns();
-- ============================================================================
