-- ============================================================================
-- PHASE R0 · Task R-3 — Cohort room read + write RPCs (SECURITY DEFINER).
-- 🔴 Tier 1. Finalises design/cohorts/migrations-draft/0004_cohort_room_rpcs.sql
-- against the Round-F corrections and the 2026-07-27 line-producer audit.
--
-- DOCTRINE (05-ACCESS-SECURITY.md §5.4, invariant #6): every RPC asserts access
-- FIRST and RAISEs for a caller without a grant — it never returns a silently
-- empty set that a UI could misread as "no content yet".
--   Corollary, added after the 2026-07-27 audit: a SECURITY DEFINER function
--   whose scope is DECIDED BY ITS ARGUMENTS cannot assert anything, so it must
--   not be reachable by a client. Two helpers here are in that class —
--   cohort_room_roster_ids and cohort_room_allowed_channels — and both are
--   REVOKEd from PUBLIC/anon/authenticated, which leaves the function owner
--   (i.e. only the asserting RPCs below) as their caller.
--     · cohort_room_roster_ids ALSO reads auth.uid(), on one arm: a caller with
--       no batch resolved matches their OWN row and nothing else (§1b). That
--       arm NARROWS the argument-driven scope, it does not replace it — the
--       offering, the batch and the p_all widening all still arrive from the
--       caller — so the function stays squarely in the ungranted class and the
--       grant criterion in this paragraph is unchanged for it.
--   cohort_room_caller_scope is the exception that stays granted: it derives
--   its scope from auth.uid() ALONE — no argument can widen it — and can
--   therefore only ever describe the caller to themselves.
--
-- 🚫 THERE IS NO get_cohort_room_preview RPC, UNDER ANY NAME.
--    MEMBER-1 (Rahul, 2026-07-18) DELETED that path. An `accepted` applicant
--    holds NO cohort_room_members row and therefore NO read grant into any room
--    surface; the confirm-seat "locked future view" veil is rendered by the
--    client from public-safe offering chrome only (SEC-PUBLIC-1 class data).
--    Do not add a preview/teaser/redacted-room RPC here in a later pass.
--
-- DEPENDS ON (same db push, earlier filenames — this file is not standalone):
--   20260729100000_cohort_rooms_backbone.sql  (R-1)
--     · table  public.cohort_room_configs  (incl. the `vocab` jsonb column)
--     · table  public.cohort_room_members
--     · fn     public.cohort_room_is_member(uuid)      -- full member/mentor/admin
--     · fn     public.cohort_room_in_lobby(uuid)       -- pre_member only
--     · fn     public.cohort_room_can_access(uuid, uuid)
--     · fn     public.cohort_room_is_offering_wide(uuid)  -- the ONE staff scope
--       lift. R-1 contract note 1 assigns R-3 the job of calling it instead of
--       restating the predicate (NFR-SEC-2); §1 below does exactly that, and
--       nothing in this file recomputes room scope.
--   20260729100100_cohort_room_content.sql    (R-2)
--     · tables public.cohort_announcements, public.cohort_room_posts,
--              public.cohort_room_post_replies, public.cohort_recording_progress,
--              public.cohort_room_seen
--     · cols   cohort_room_posts.channel_key, cohort_room_posts.cohort_week_id,
--              cohort_room_post_replies.is_mentor_answer
--     · the REVOKE INSERT/DELETE on both feed tables and the BEFORE UPDATE
--       guards that freeze channel_key / is_mentor_answer. R-2 owns those; this
--       file owns only the RPCs that are then the sole write path.
--   (cohort_room_seen is created by R-2 — this file only SELECTs from it.)
--
-- REVERSAL: a single DROP script — see the runbook block at the foot of this
-- file, which also carries the VERBATIM prior definition of get_cohort_progress.
-- No DO block in this migration raises; nothing here can abort a shared db push.
-- Do NOT apply to prod: shadow project + council + adversarial suite first.
-- ============================================================================


----------------------------------------------------------------------
-- 0. Supporting index for the room envelope's session scan.
--    live_sessions.week_id carries an FK but no index (FKs do not create one),
--    so the envelope's weeks→sessions join degrades to a seq scan at prod
--    scale. Additive and idempotent.
----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS live_sessions_week_idx
  ON public.live_sessions (week_id, scheduled_at)
  WHERE week_id IS NOT NULL;


----------------------------------------------------------------------
-- 1. cohort_room_caller_scope(p_offering) — the caller's ONE resolved
--    membership row for a room. Every RPC below scopes off this, so batch
--    scope is derived server-side exactly once and is never client-claimed
--    (NFR-SEC-1).
--
--    ROSTER-SCOPE-1 is PINNED HERE as **BATCH-SCOPED** (05-ACCESS-SECURITY.md
--    :298 recommended default): `offering_wide` is true ONLY for a NULL-batch
--    mentor/host grant (or an admin). A member/alumni row is always scoped to
--    its own batch_id, so batch A1 can never enumerate batch A2.
--
--    ONE FLAG, ONE OWNER (NFR-SEC-2, and R-1 contract note 1 under the heading
--    "CITE THESE BY NAME, NEVER BY LINE", which names closing this duplication
--    as R-3's job).
--    `offering_wide` is not recomputed here: it is R-1's published
--    `public.cohort_room_is_offering_wide(uuid)` (20260729100000 §3), which is
--    the single definition of the staff scope lift and already ORs in
--    public.is_admin(). Nothing in this file restates the predicate inline.
--
--    A ROUND-G ROLLBACK, recorded so it is not re-attempted: an earlier pass
--    carried a SECOND flag, `all_batches`, that added `pre_member` to the
--    widening, on the stated grounds that R-1 had made
--    cohort_room_in_lobby(offering, batch) permissive for a batch-less lobby
--    row. THAT WAS FALSE. The real helper —
--    `public.cohort_room_in_lobby(uuid, uuid)`, 20260729100000 §3 — reads
--        AND m.role = 'pre_member'
--        AND (p_batch IS NULL OR m.batch_id = p_batch)
--    with no `OR m.batch_id IS NULL` clause, so for a lobby row and a batch-A1
--    row the predicate is `NULL = A1` → NULL → false. R-1 contract note 4 says
--    it in words: for member/alumni/pre_member a NULL batch unlocks the
--    offering-level surfaces "and NOTHING batch-specific". Widening the lobby
--    made this SECURITY DEFINER RPC grant strictly MORE than R-2's table
--    policy: a confirmation_paid lobby occupant of offering A received batch
--    A2's private noticeboard bodies, A2's session titles and dates, and a
--    cohort-mate count summed over both batches — the exact cross-cohort leak
--    the brief names as this phase's worst outcome.
--
--    So THE BATCH-LESS TIERS SPLIT TWO WAYS, and only one of them widens:
--      · NULL-batch mentor/host (+ admin) → offering_wide TRUE. Staff hold the
--        whole offering by grant.
--      · NULL-batch member (pre_start), alumni, and EVERY pre_member → FALSE.
--        They resolve to the offering-LEVEL rows (the masthead config, an
--        offering-wide announcement) and to no batch's rows at all. For the
--        member that is the brief's "config + empty sessions, no raise"; for
--        the lobby it is exactly what ann_member_read already grants them at
--        the table, so the RPC and the policy now agree.
--
--    Precedence when a user holds more than one row for an offering:
--      1. a mentor/host grant (offering-wide staff) wins;
--      2. then a row with a real batch over a batch-less row;
--      3. then the oldest row, for determinism.
----------------------------------------------------------------------
-- A prior shadow apply of this file published a 4-column shape (the withdrawn
-- `all_batches`), and CREATE OR REPLACE cannot narrow a RETURNS TABLE, so the
-- old shape is dropped first. Safe and non-raising — Postgres records no
-- dependency from one function on another, and the only callers are the RPCs
-- recreated below in this same file.
DROP FUNCTION IF EXISTS public.cohort_room_caller_scope(uuid);

CREATE FUNCTION public.cohort_room_caller_scope(p_offering uuid)
RETURNS TABLE (batch_id uuid, member_role text, offering_wide boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.batch_id,
    m.role,
    public.cohort_room_is_offering_wide(p_offering)
  FROM public.cohort_room_members m
  WHERE m.user_id = auth.uid()
    AND m.offering_id = p_offering
    AND m.status = 'active'
  ORDER BY (m.role IN ('mentor','host')) DESC,
           (m.batch_id IS NULL),
           m.created_at
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.cohort_room_caller_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cohort_room_caller_scope(uuid) TO authenticated;

COMMENT ON FUNCTION public.cohort_room_caller_scope(uuid) IS
  'Resolves the calling user''s single effective cohort_room_members row for an '
  'offering: (batch_id, member_role, offering_wide). offering_wide is delegated '
  'to cohort_room_is_offering_wide() — NULL-batch mentor/host, or an admin — and '
  'is the ONE flag every RPC in this file scopes its payload with. '
  'ROSTER-SCOPE-1 is pinned batch-scoped: member/alumni/pre_member rows read '
  'their own batch plus the offering-level rows, never another batch.';


----------------------------------------------------------------------
-- 1b. cohort_room_roster_ids(p_offering, p_batch, p_all) — THE ONE roster
--     predicate. get_room_roster (§4) and get_cohort_room.roster_count (§3)
--     both read it, so the list and the count can never disagree again: the
--     count is literally the cohort-mate subset of the rows the roster
--     returns. (They did disagree before — the count filtered
--     role IN ('member','alumni') on a batch predicate while the list
--     re-admitted offering-wide staff, which is R-4's named case C3.2.)
--
--     Scope, in one place:
--       p_all               → every active room member of the offering;
--       role mentor/host    → always visible (staff are offering-wide);
--       a real p_batch      → strictly the caller's own batch;
--       p_batch IS NULL     → the caller's OWN row, and nothing else.
--     pre_member rows are never listed — the lobby is not yet a cohort-mate.
--
--     THE NULL-BATCH ARM IS NOT DECORATION EITHER. This predicate used to read
--     `m.batch_id IS NOT DISTINCT FROM p_batch`, which treats NULL as a VALUE to
--     match rather than as "not placed yet": every batch-less caller enumerated
--     every OTHER batch-less member of the offering, and roster_count counted
--     them — the exact opposite of what §3's roster_count comment and runbook B2
--     both claim. It was reachable, not theoretical: R-1's resolver branch (a2)
--     (20260729100000 §4, `public.cohort_room_resolve_user(uuid)` — the INSERT
--     under the "(a2) OFFERING-WIDE membership for a paid, enrolled student the
--     admin has not put in a batch yet" comment; cited by that comment and not
--     by a line number, because that file moves under its own maintenance —
--     R-1's §7A restructure shifted this range once already)
--     mints exactly those rows for a paid, enrolled
--     student an admin has not put in a batch yet, so an unplaced student was
--     handed the names, faces, occupations and cities of every other unplaced
--     student in the offering. Those people are a QUEUE, not cohort-mates, and
--     by §1 nothing else in their envelope crosses a batch — the roster was the
--     one surface that did.
--
--     Own-row-only rather than denied-outright, deliberately: get_room_roster
--     must not raise or return a stranger-shaped empty set for a legitimate
--     pre_start member (the brief's "config + empty sessions, no raise" edge
--     case), and this keeps ONE rule for everybody — you see your own batch, and
--     before placement your own batch is just you. A lobby caller still counts
--     and lists nobody, because a pre_member row fails the role filter above
--     even when it is the caller's own.
--
--     INTERNAL, NOT CLIENT-CALLABLE: its scope is decided by its ARGUMENTS —
--     p_offering, p_batch and the p_all widening all arrive from the caller —
--     so it asserts nothing, notwithstanding that the NULL-batch arm above
--     additionally reads auth.uid() to pin the caller to their own row. That
--     read NARROWS one arm; it does not make the function self-scoping the way
--     cohort_room_caller_scope is, so the file-header doctrine's
--     argument-scoped class still holds it and it stays ungranted. It is
--     REVOKEd from PUBLIC and never granted, which leaves the function owner
--     (i.e. the SECURITY DEFINER RPCs below, which DO assert first) as its
--     only caller.
----------------------------------------------------------------------
--     ROWS 200 is not decoration. A SECURITY DEFINER SQL function can never be
--     inlined by the planner, so this is always a Function Scan, and Postgres
--     would otherwise assume the 1000-row default — a large enough estimate to
--     tip get_room_roster's join to public.users from a per-row PK probe into a
--     hash join over a seq scan of a prod-scale users table. 200 is the
--     acceptance fixture's room size (design/briefs/cohort-r0.md:44). Confirm
--     the chosen join in the EXPLAIN capture (runbook B4) rather than assuming
--     the estimate settled it.
CREATE OR REPLACE FUNCTION public.cohort_room_roster_ids(
  p_offering uuid, p_batch uuid, p_all boolean
) RETURNS TABLE (user_id uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER ROWS 200 SET search_path = public AS $$
  SELECT m.user_id, m.role
  FROM public.cohort_room_members m
  WHERE m.offering_id = p_offering
    AND m.status = 'active'
    AND m.role IN ('member','alumni','mentor','host')
    AND (
      COALESCE(p_all, false)
      OR m.role IN ('mentor','host')
      OR (p_batch IS NOT NULL AND m.batch_id = p_batch)
      -- No batch resolved for the caller ⇒ their own row only. NEVER a
      -- NULL-matches-NULL bucket shared with the rest of the unplaced queue.
      OR (p_batch IS NULL AND m.user_id = auth.uid())
    );
$$;
REVOKE EXECUTE ON FUNCTION public.cohort_room_roster_ids(uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cohort_room_roster_ids(uuid, uuid, boolean) FROM anon, authenticated;

COMMENT ON FUNCTION public.cohort_room_roster_ids(uuid, uuid, boolean) IS
  'Internal roster predicate shared by get_room_roster and '
  'get_cohort_room.roster_count so the list and the count cannot drift. '
  'p_all lists the whole offering; mentors/hosts are always listed; a real '
  'p_batch lists that batch; a NULL p_batch lists the CALLER''S OWN ROW ONLY, '
  'never the other not-yet-placed members. Asserts nothing — it is not granted '
  'to any client role; only the access-asserting SECURITY DEFINER RPCs may '
  'call it.';


----------------------------------------------------------------------
-- 2. get_my_cohort_rooms() — the My Cohorts surface + nav, one round-trip.
--    Replaces useActiveCohort()'s 3-query single-slot waterfall.
--
--    Access assert: authentication. This RPC is self-scoped (it can only ever
--    read the caller's own membership rows), so an authenticated user with no
--    rooms legitimately returns zero rows; an ANONYMOUS caller RAISEs rather
--    than receiving an empty list.
--
--    pre_member redaction (MEMBER-1 tier 2): next_due_at is NULLed — assignment
--    state is outside the lobby whitelist. Masthead/theme, schedule and the
--    announcements counter stay, because those ARE the whitelist.
--
--    BATCH SCOPE per row comes from the `sb` lateral, not from m.batch_id, for
--    the reason spelled out in §1: a NULL-batch mentor/host holds the whole
--    offering by grant, so keying their aggregates on m.batch_id handed every
--    mentor total_weeks 0 / current_week NULL / next_session_at NULL inside
--    their own room. It widens for THAT tier and no other — a pre_member and a
--    batch-less member both resolve to no batch, by §1.
--    total_weeks counts DISTINCT week numbers rather
--    than rows, so a 2-batch offering still reports a 12-week programme as 12
--    weeks and not 24. For a single-batch member every one of these subqueries
--    returns exactly what it returned before.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_cohort_rooms()
RETURNS TABLE (
  offering_id uuid,
  offering_title text,
  room_slug text,
  batch_id uuid,
  batch_name text,
  role text,
  phase text,
  theme jsonb,
  modules jsonb,
  total_weeks integer,
  current_week integer,
  next_session_at timestamptz,
  next_due_at timestamptz,
  unseen_announcements integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required to read cohort rooms'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.offering_id,
    o.title,
    c.slug,
    m.batch_id,
    cb.name,
    m.role,
    c.phase,
    c.theme,
    c.modules,
    -- DISTINCT week_number, not count(*): cohort_weeks_unique_per_batch makes
    -- (cohort_batch_id, week_number) unique, so for a single-batch caller this
    -- is exactly the old count(*), and for a batch-less one it is the
    -- PROGRAMME length rather than the sum over batches (12, not 24).
    (SELECT count(DISTINCT w.week_number)::int FROM public.cohort_weeks w
      WHERE w.cohort_batch_id = ANY (sb.ids)),
    (SELECT min(w.week_number) FROM public.cohort_weeks w
      WHERE w.cohort_batch_id = ANY (sb.ids) AND w.status = 'active'),
    (SELECT min(ls.scheduled_at) FROM public.live_sessions ls
      JOIN public.cohort_weeks w ON w.id = ls.week_id
      WHERE w.cohort_batch_id = ANY (sb.ids)
        AND ls.status = 'scheduled' AND ls.scheduled_at > now()),
    CASE WHEN m.role = 'pre_member' THEN NULL::timestamptz ELSE
      (SELECT min(w.assignment_due_at) FROM public.cohort_weeks w
        WHERE w.cohort_batch_id = ANY (sb.ids)
          AND w.assignment_due_at > now()
          AND NOT EXISTS (SELECT 1 FROM public.cohort_week_submissions s
                          WHERE s.cohort_week_id = w.id AND s.user_id = auth.uid()))
    END,
    (SELECT count(*)::int FROM public.cohort_announcements a
      WHERE a.offering_id = m.offering_id
        AND (a.batch_id IS NULL OR a.batch_id = ANY (sb.ids))
        AND a.deleted_at IS NULL
        AND a.created_at > COALESCE(
          (SELECT max(rs.seen_at) FROM public.cohort_room_seen rs
            WHERE rs.user_id = auth.uid() AND rs.offering_id = m.offering_id),
          'epoch'::timestamptz))
  FROM public.cohort_room_members m
  JOIN public.offerings o ON o.id = m.offering_id
  LEFT JOIN public.cohort_batches cb ON cb.id = m.batch_id
  -- The batches this row's aggregates resolve over. Own batch when there is
  -- one; every batch of the offering ONLY for an offering-wide staff grant,
  -- decided by R-1's helper rather than by an inline role list (NFR-SEC-2);
  -- and NO batch at all for the other batch-less tiers — a member awaiting
  -- assignment (whose envelope is specified as empty) and every pre_member,
  -- whose lobby is offering-LEVEL by R-1 contract note 4. The lobby therefore
  -- reports total_weeks 0 / current_week NULL / next_session_at NULL and
  -- counts only the offering-wide announcements (`a.batch_id IS NULL`),
  -- which is precisely what R-2's ann_member_read lets them read at the table.
  -- The helper is safe to evaluate per row: it keys off auth.uid(), and this
  -- query's WHERE clause already pins m.user_id = auth.uid().
  CROSS JOIN LATERAL (
    SELECT CASE
             WHEN m.batch_id IS NOT NULL THEN ARRAY[m.batch_id]
             WHEN public.cohort_room_is_offering_wide(m.offering_id) THEN COALESCE(
               (SELECT array_agg(b.id) FROM public.cohort_batches b
                 WHERE b.offering_id = m.offering_id), ARRAY[]::uuid[])
             ELSE ARRAY[]::uuid[]
           END AS ids
  ) sb
  -- Resolved config, same precedence as get_cohort_room and cohort_room_phase:
  -- the caller's batch override when one exists, else the offering-level row.
  -- (The draft joined `batch_id IS NULL` only, which showed a batch-A2 member
  -- offering A's default skin instead of their own batch override.)
  LEFT JOIN LATERAL (
    SELECT cfg.slug, cfg.phase, cfg.theme, cfg.modules
    FROM public.cohort_room_configs cfg
    WHERE cfg.offering_id = m.offering_id
      AND (cfg.batch_id IS NULL OR cfg.batch_id = m.batch_id)
    ORDER BY (cfg.batch_id IS NOT NULL) DESC
    LIMIT 1
  ) c ON true
  WHERE m.user_id = auth.uid() AND m.status = 'active'
  ORDER BY (c.phase = 'alumni'), o.title;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_my_cohort_rooms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_cohort_rooms() TO authenticated;


----------------------------------------------------------------------
-- 3. get_cohort_room(p_offering) — the room-open envelope, one round-trip:
--    config + this-week + sessions + announcements + cohort-mate count.
--    Weeks×submissions detail keeps riding get_cohort_progress (§6).
--
--    THE ZOOM GATE IS SERVER-SIDE AND IT IS A WINDOW, NOT A THRESHOLD. It
--    opens at T-60 and CLOSES one hour after the scheduled end, which is the
--    same window get_live_session_zoom_link has enforced since
--    20260408151600:88-97 — the RPC this envelope supersedes for room members.
--    The client cannot render what it never received (PRD REQ-ROOM-2), and
--    live_sessions carries a column-level REVOKE SELECT (zoom_link) for
--    authenticated (20260408151600), so no client reaches the column by reading
--    the TABLE.
--
--    ⚠️ IT IS NOT, HOWEVER, THE ONLY MEMBER-FACING PATH TO A JOIN LINK, and this
--    header used to claim it was. Two other SECURITY DEFINER functions are
--    GRANTed to authenticated and read the same column:
--      · get_live_session_zoom_link (20260408151600) — same window, still
--        granted; R-4 asserts it returns the near link to member_A1. Superseded
--        for room members, not revoked, because non-room callers still use it.
--      · get_cohort_progress (§6 of this file) — selects ls.zoom_link RAW at the
--        SELECT list with NO time gate at all, and its enrolment join is not
--        filtered on status. Both are INHERITED VERBATIM from
--        20260526180000:233-245 (that definition has neither), so closing them
--        here would widen this phase past its own change; they are booked as a
--        follow-up in runbook B5.4 instead. Until that follow-up lands, the gate
--        below closes THIS envelope's hole, not the offering's last one — say so
--        in the PR rather than reading this section as an all-clear.
--
--    MEMBER-1 tier 2: a pre_member (lobby) caller gets the WHITELIST ONLY —
--    masthead/theme, session titles + dates, cohort-mate count, announcements
--    (read), schedule. recordings, recording_url, my_position, curriculum
--    detail, assignments, feedback and attendance are STRIPPED SERVER-SIDE.
--
--    ⚠️ AND THE LOBBY WHITELIST IS OFFERING-LEVEL, NOT OFFERING-WIDE. A lobby
--    row is never batch-scoped (§1), and R-1 contract note 4 rules that a NULL
--    batch on a non-staff row unlocks the offering-LEVEL rows and nothing
--    batch-specific. So a pre_member's envelope carries the masthead config,
--    the offering-wide announcements and access='pre_member', while `sessions`
--    and `roster_count` — both of which only exist per batch — resolve EMPTY
--    until enrolment assigns a batch. That is the same scope R-2's
--    `ann_member_read` grants at the table, and it is deliberate: widening it
--    to every batch (the withdrawn `all_batches` flag) handed a batch-A1 lobby
--    occupant batch A2's private noticeboard and schedule. If product wants a
--    non-empty lobby schedule, the fix is upstream — give the lobby row the
--    batch it is queued for — NOT a second widening here. Flagged for the
--    council as a PRODUCT question, not re-litigated as a security one.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cohort_room(p_offering uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch  uuid;
  v_role   text;
  v_wide   boolean;   -- offering-wide staff/admin: payload spans every batch
  v_lobby  boolean;
  v_config jsonb;
  result   jsonb;
BEGIN
  -- Assert access FIRST (invariant #6). Full member OR lobby (pre_member).
  -- An `accepted` applicant holds neither and RAISEs here — there is no
  -- preview path for them, by design (MEMBER-1).
  IF NOT (public.cohort_room_is_member(p_offering)
          OR public.cohort_room_in_lobby(p_offering)) THEN
    RAISE EXCEPTION 'not a member of this room'
      USING ERRCODE = '42501';
  END IF;

  -- Full membership is the ONLY thing that lifts the lobby redaction.
  -- cohort_room_is_member is never widened to include pre_member (MEMBER-1).
  v_lobby := NOT public.cohort_room_is_member(p_offering);

  SELECT s.batch_id, s.member_role, s.offering_wide
    INTO v_batch, v_role, v_wide
  FROM public.cohort_room_caller_scope(p_offering) s;

  -- ONE payload scope, from ONE helper, applied to EVERY field below. The
  -- COALESCE covers the no-membership-row case: an admin with no room row gets
  -- no row back from the scope function, so v_wide comes back NULL and the
  -- helper (which ORs in is_admin()) has to be asked directly. There is
  -- deliberately no inline `OR public.is_admin()` here — that was one of the
  -- four places room scope used to be decided, and four places is how the
  -- lobby ended up widened past the table policy.
  v_wide := COALESCE(v_wide, public.cohort_room_is_offering_wide(p_offering));

  -- Resolved config: the batch override when one exists for the caller's
  -- batch, else the offering-level row. Never another batch's override.
  -- A batch-less caller (lobby, offering-wide staff) resolves to the
  -- offering-level row — a batch skin is not theirs to wear.
  SELECT to_jsonb(c) INTO v_config
  FROM public.cohort_room_configs c
  WHERE c.offering_id = p_offering
    AND (c.batch_id IS NULL OR c.batch_id = v_batch)
  ORDER BY (c.batch_id IS NOT NULL) DESC
  LIMIT 1;

  result := jsonb_build_object(
    'offering_id', p_offering,
    'batch_id',    v_batch,
    'role',        v_role,
    -- 'member' | 'pre_member' — the access tier this envelope was built for.
    'access',      CASE WHEN v_lobby THEN 'pre_member' ELSE 'member' END,
    'config',      v_config,
    'roster_count', (
      -- Cohort-mate count, read from the SAME predicate get_room_roster
      -- returns rows from (§1b), narrowed to cohort-mates: staff are listed in
      -- the roster but are not counted as cohort-mates, and R-4's C3.2 asserts
      -- exactly that relationship. Batch-scoped (ROSTER-SCOPE-1); offering-wide
      -- for staff and admins only. A headcount summed across batches is still a
      -- cross-batch fact, so a caller with no batch resolved counts only
      -- themselves: a LOBBY caller counts 0 (a pre_member row is not listed by
      -- §1b at all, and this narrows to member/alumni on top of that), and an
      -- unplaced pre_start MEMBER counts exactly 1. It used to count every
      -- other unplaced member of the offering — see the NULL-batch note in §1b.
      SELECT count(*) FROM public.cohort_room_roster_ids(p_offering, v_batch, v_wide) r
      WHERE r.role IN ('member','alumni')
    ),
    'announcements', (
      SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.is_pinned DESC, a.created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.cohort_announcements a
            WHERE a.offering_id = p_offering
              -- Mirrors ann_member_read exactly: offering-level rows for
              -- everyone with a grant, this batch's rows for a batch-scoped
              -- caller, every batch's rows for staff/admin. Never another
              -- batch's private noticeboard.
              AND (a.batch_id IS NULL OR v_wide OR a.batch_id = v_batch)
              AND a.deleted_at IS NULL
            ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 10) a
    )
  );

  IF v_lobby THEN
    -- Lobby whitelist: session TITLES + DATES only. No zoom_link at any
    -- distance from the session, no recording_url, no resume position.
    -- Scope is the same single flag as everywhere else, so today this resolves
    -- EMPTY (a lobby row carries no batch and is not offering-wide) — see the
    -- ⚠️ note in this function's header. The branch stays because it pins the
    -- SHAPE the lobby is allowed to receive: the moment a lobby row does carry
    -- a batch, it gets titles and dates and still no links.
    result := result || jsonb_build_object(
      'sessions', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', ls.id,
          'title', ls.title,
          'scheduled_at', ls.scheduled_at,
          'duration_minutes', ls.duration_minutes,
          'status', ls.status,
          'session_type', ls.session_type
        ) ORDER BY ls.scheduled_at), '[]'::jsonb)
        FROM public.live_sessions ls
        JOIN public.cohort_weeks w ON w.id = ls.week_id
        JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
        WHERE b.offering_id = p_offering
          AND (v_wide OR w.cohort_batch_id = v_batch)
      )
    );
  ELSE
    result := result || jsonb_build_object(
      'attendance_pct', public.get_attendance_pct(auth.uid(), p_offering),
      'sessions', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', ls.id, 'title', ls.title, 'scheduled_at', ls.scheduled_at,
          'duration_minutes', ls.duration_minutes, 'status', ls.status,
          'session_type', ls.session_type, 'week_id', ls.week_id,
          -- The join-link WINDOW, server-side: opens at T-60, closes one hour
          -- after the scheduled end. The upper bound is the half that was
          -- missing, and it is this file's own defect, not an inherited one:
          -- without it the envelope was strictly MORE permissive than
          -- get_live_session_zoom_link (20260408151600:88-97), which it claims
          -- to supersede. These cohorts run on RECURRING meeting links and
          -- cohort_room_can_access admits role='alumni', so an open-ended gate
          -- meant every past student held a live join link into every future
          -- session of the offering, indefinitely.
          -- A cancelled session hands out nothing, and a session with a BLANK
          -- status hands out nothing either. `ls.status IS NOT NULL AND
          -- ls.status <> 'cancelled'` is the exact truth table of the function
          -- this supersedes: get_live_session_zoom_link (20260408151600:96-97)
          -- tests `status <> 'cancelled'` inside an IF, which evaluates NULL for
          -- a NULL status and falls through to RETURN NULL — it DENIES a blank
          -- status. status is nullable (the CHECK at 20260408140000:11 passes on
          -- NULL) so the row is insertable and the cell is reachable; an earlier
          -- pass wrote COALESCE(status,'scheduled') here, which ADMITTED it, and
          -- that was strictly wider than the thing being replaced. "Match or
          -- tighten" is the rule for a gate, and a status explicitly written
          -- over a DEFAULT 'scheduled' column is a data-integrity signal, not a
          -- class about to lose its link — so this conforms. §6's LATERAL uses
          -- COALESCE for the OPPOSITE job (choosing which session represents a
          -- week, where "unspecified" must not read as "cancelled"); the two
          -- expressions differ because the questions do.
          'zoom_link', CASE
            WHEN now() >= ls.scheduled_at - interval '1 hour'
             AND now() <= ls.scheduled_at
                          + make_interval(mins => COALESCE(ls.duration_minutes, 60))
                          + interval '1 hour'
             AND ls.status IS NOT NULL AND ls.status <> 'cancelled'
            THEN ls.zoom_link END,
          'recording_url', ls.recording_url,
          'my_position', (SELECT rp.position_seconds
                          FROM public.cohort_recording_progress rp
                          WHERE rp.live_session_id = ls.id
                            AND rp.user_id = auth.uid())
        ) ORDER BY ls.scheduled_at), '[]'::jsonb)
        FROM public.live_sessions ls
        JOIN public.cohort_weeks w ON w.id = ls.week_id
        JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
        WHERE b.offering_id = p_offering
          AND (v_wide OR w.cohort_batch_id = v_batch)
      )
    );
  END IF;

  -- Edge case (pre_start): a MEMBER whose batch is not assigned yet is not
  -- offering-wide (§1), so v_batch NULL selects no batch and the envelope
  -- returns config + offering-level announcements + an EMPTY sessions array.
  -- That is a legitimate empty, not a denial: no raise, per the brief.
  RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_cohort_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cohort_room(uuid) TO authenticated;


----------------------------------------------------------------------
-- 4. get_room_roster(p_offering) — people in the room.
--
--    THE PERMITTED COLUMN LIST IS EXACTLY:
--        user_id, full_name, avatar_url, occupation, city, role
--    NEVER phone, NEVER email, never bio (05-ACCESS-SECURITY.md:295).
--
--    Resolves the draft's standing "NOTE for council" — should the four profile
--    columns come from public_user_profiles (20260417100000_foundation_
--    hardening.sql)? **No: this function reads public.users ONCE, directly.**
--      · That view's doctrine (:26) binds CLIENT code, which cannot be trusted
--        to pick its own column list. This is not client code. It is SECURITY
--        DEFINER with a pinned RETURNS TABLE, so the projection is fixed in the
--        signature and R-4's C1.1 asserts the exact six columns over the wire.
--      · The view could not have supplied the whole row anyway: it omits `city`
--        by design (it is an APP-WIDE peer view), and 05 §5.4 rules `city`
--        in-scope for cohort-mates. Joining BOTH meant reading public.users
--        twice per roster call — and public_user_profiles is declared
--        security_barrier, which blocks subquery pull-up, so the planner cannot
--        push `p.id = m.user_id` inside it and scans users through the view
--        instead of index-probing it. Two passes over a prod-scale users table
--        for four columns is not a p95 <150ms shape.
--      · Grep audit stays trivial: exactly one reference to public.users in
--        this function, projecting exactly full_name, avatar_url, occupation,
--        city. Nothing else is selected from that table anywhere in this file.
--
--    ROSTER-SCOPE-1 = BATCH-SCOPED: a member sees their own batch plus the
--    offering-wide mentors/hosts. A mentor/host (NULL-batch grant) and an admin
--    see the whole offering. A member who has no batch yet (pre_start, resolver
--    branch (a2)) sees the mentors and their own row and no one else — the
--    unplaced are a queue, not a batch. The predicate itself lives in
--    cohort_room_roster_ids (§1b) so roster_count cannot drift from this list.
--
--    pre_member is DENIED. The lobby whitelist grants a cohort-mate COUNT
--    (served by get_cohort_room.roster_count), not cohort-mate identities.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_room_roster(p_offering uuid)
RETURNS TABLE (user_id uuid, full_name text, avatar_url text, occupation text, city text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch uuid;
  v_wide  boolean;
BEGIN
  IF NOT public.cohort_room_is_member(p_offering) THEN
    RAISE EXCEPTION 'not a member of this room'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.batch_id, s.offering_wide
    INTO v_batch, v_wide
  FROM public.cohort_room_caller_scope(p_offering) s;

  -- True here only for a NULL-batch mentor/host or an admin (a pre_member never
  -- reaches this line — the assert above rejects them). The COALESCE covers an
  -- admin holding no membership row at all, for whom the scope function
  -- returns no row; the helper is still the one place the answer comes from.
  v_wide := COALESCE(v_wide, public.cohort_room_is_offering_wide(p_offering));

  RETURN QUERY
  SELECT r.user_id, u.full_name, u.avatar_url, u.occupation, u.city, r.role
  FROM public.cohort_room_roster_ids(p_offering, v_batch, v_wide) r
  JOIN public.users u ON u.id = r.user_id
  ORDER BY (r.role IN ('mentor','host')) DESC, u.full_name;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_room_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_room_roster(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_room_roster(uuid) IS
  'Room roster, batch-scoped (ROSTER-SCOPE-1) via cohort_room_roster_ids — the '
  'same predicate get_cohort_room.roster_count counts. Returns exactly '
  'user_id, full_name, avatar_url, occupation, city, role — never phone or '
  'email. One indexed read of public.users, projection pinned in the '
  'signature. pre_member callers are denied.';


----------------------------------------------------------------------
-- 5. The community WRITE path (Δ3 / SEC-WRITE-1).
--
--    These two RPCs are the ONLY write path into cohort_room_posts /
--    cohort_room_post_replies, because a table policy cannot express channel
--    validation or the mentor-answer stamp. The other half of that contract —
--    REVOKE INSERT, DELETE … FROM authenticated, anon, no member INSERT policy,
--    and the BEFORE UPDATE triggers that freeze channel_key and
--    is_mentor_answer against forgery-by-UPDATE — is owned by R-2
--    (20260729100100_cohort_room_content.sql:283-326,398-399) and is
--    deliberately NOT restated here: one owner per grant.
----------------------------------------------------------------------

-- Resolves a room's allowed channel_key set: the three standing keys plus the
-- niche keys configured on cohort_room_configs.vocab.niche_channels
-- (03-DATA-MODEL-ERD.md:567,592). Niche channels are a config edit with no
-- deploy, which is why channel_key carries no CHECK constraint and is validated
-- here instead. Accepts niche entries as bare strings or {"key":…} objects.
--
-- INTERNAL, NOT CLIENT-CALLABLE — same rule as cohort_room_roster_ids (§1b).
-- It takes an offering/batch pair as arguments and asserts nothing, so a GRANT
-- to `authenticated` would have let any logged-in user enumerate any room's
-- vocab.niche_channels for arbitrary uuids, straight past the RLS on
-- cohort_room_configs, in a file whose stated doctrine is that every RPC
-- asserts access FIRST. Its only callers are the two write RPCs below, which
-- run as the function owner and have already asserted membership.
CREATE OR REPLACE FUNCTION public.cohort_room_allowed_channels(
  p_offering uuid, p_batch uuid
) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_niche jsonb;
  v_keys  text[];
BEGIN
  SELECT c.vocab -> 'niche_channels' INTO v_niche
  FROM public.cohort_room_configs c
  WHERE c.offering_id = p_offering
    AND (c.batch_id IS NULL OR c.batch_id = p_batch)
  ORDER BY (c.batch_id IS NOT NULL) DESC
  LIMIT 1;

  IF v_niche IS NULL OR jsonb_typeof(v_niche) <> 'array' THEN
    v_niche := '[]'::jsonb;
  END IF;

  SELECT COALESCE(array_agg(k), ARRAY[]::text[]) INTO v_keys
  FROM (
    SELECT CASE WHEN jsonb_typeof(e) = 'object' THEN e ->> 'key' ELSE e #>> '{}' END AS k
    FROM jsonb_array_elements(v_niche) e
  ) t
  WHERE k IS NOT NULL AND btrim(k) <> '';

  -- Standing keys. Announcements is a separate table, and Wins is selected by
  -- cohort_room_posts.kind='win' — neither is a channel_key (DATA §4.7).
  RETURN ARRAY['this_week','assignments_help','general'] || v_keys;
END $$;
REVOKE EXECUTE ON FUNCTION public.cohort_room_allowed_channels(uuid, uuid) FROM PUBLIC;
-- Explicit, not merely "never granted": a prior shadow apply of this file DID
-- grant it, and CREATE OR REPLACE preserves existing grants.
REVOKE EXECUTE ON FUNCTION public.cohort_room_allowed_channels(uuid, uuid) FROM anon, authenticated;


-- cohort_room_post_write — the ONLY way a feed post is created.
--   · asserts membership, then batch access, through cohort_room_can_access();
--   · REJECTS a pre_member outright (lobby is read-only — R-4 W6b);
--   · VALIDATES channel_key against the room's resolved set (R-4 W8);
--   · derives batch_id server-side (never client-claimed). p_batch is honoured
--     ONLY for an offering-wide mentor/host/admin author, who has no batch of
--     their own, and is verified to belong to p_offering.
CREATE OR REPLACE FUNCTION public.cohort_room_post_write(
  p_offering      uuid,
  p_body          text,
  p_kind          text    DEFAULT 'post',
  p_channel_key   text    DEFAULT 'general',
  p_cohort_week_id uuid   DEFAULT NULL,
  p_media         jsonb   DEFAULT '[]'::jsonb,
  p_batch         uuid    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch   uuid;
  v_role    text;
  v_wide    boolean;
  v_body    text;
  v_channel text;
  v_week    uuid;
  v_id      uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT s.batch_id, s.member_role, s.offering_wide
    INTO v_batch, v_role, v_wide
  FROM public.cohort_room_caller_scope(p_offering) s;

  IF v_role IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;

  -- MEMBER-1 tier 2: the lobby is read-only. Community write unlocks at
  -- `enrolled` (R-4 W6b).
  IF v_role = 'pre_member' THEN
    RAISE EXCEPTION 'community posting unlocks when your enrolment completes'
      USING ERRCODE = '42501';
  END IF;

  -- One helper, one answer. The COALESCE covers an admin with no membership
  -- row, for whom the scope function returned nothing.
  v_wide := COALESCE(v_wide, public.cohort_room_is_offering_wide(p_offering));

  -- Batch resolution. A batch-scoped author's own batch always wins; p_batch is
  -- ignored for them, so a member cannot post into another batch's feed.
  IF v_batch IS NULL THEN
    IF NOT v_wide THEN
      RAISE EXCEPTION 'no batch assigned in this room yet'
        USING ERRCODE = '42501';
    END IF;
    IF p_batch IS NULL THEN
      RAISE EXCEPTION 'p_batch is required for an offering-wide author'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cohort_batches b
                   WHERE b.id = p_batch AND b.offering_id = p_offering) THEN
      RAISE EXCEPTION 'batch does not belong to this offering'
        USING ERRCODE = '22023';
    END IF;
    v_batch := p_batch;
  END IF;

  -- The one access helper, batch-precise (NFR-SEC-2).
  IF NOT public.cohort_room_can_access(p_offering, v_batch) THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('post','question','win') THEN
    RAISE EXCEPTION 'invalid post kind' USING ERRCODE = '22023';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF v_body = '' THEN
    RAISE EXCEPTION 'post body cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF length(v_body) > 20000 THEN
    RAISE EXCEPTION 'post body exceeds 20000 characters' USING ERRCODE = '22023';
  END IF;

  IF p_media IS NOT NULL AND jsonb_typeof(p_media) <> 'array' THEN
    RAISE EXCEPTION 'media must be a json array' USING ERRCODE = '22023';
  END IF;

  -- CHANNEL-KEY-1: unknown or forged keys are rejected (R-4 W8).
  v_channel := btrim(COALESCE(p_channel_key, 'general'));
  IF NOT (v_channel = ANY (public.cohort_room_allowed_channels(p_offering, v_batch))) THEN
    RAISE EXCEPTION 'unknown channel_key: %', v_channel USING ERRCODE = '22023';
  END IF;

  -- cohort_week_id is non-NULL ONLY for this_week posts, and only for a week
  -- that belongs to the resolved batch (DATA §4.7).
  IF v_channel = 'this_week' THEN
    IF p_cohort_week_id IS NULL THEN
      RAISE EXCEPTION 'this_week posts require p_cohort_week_id'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cohort_weeks w
                   WHERE w.id = p_cohort_week_id AND w.cohort_batch_id = v_batch) THEN
      RAISE EXCEPTION 'week does not belong to this batch' USING ERRCODE = '22023';
    END IF;
    v_week := p_cohort_week_id;
  ELSE
    v_week := NULL;  -- ignored on every other channel, never client-honoured
  END IF;

  INSERT INTO public.cohort_room_posts (
    offering_id, batch_id, author_id, kind, body, media,
    channel_key, cohort_week_id
  ) VALUES (
    p_offering, v_batch, auth.uid(), p_kind, v_body,
    COALESCE(p_media, '[]'::jsonb), v_channel, v_week
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.cohort_room_post_write(uuid, text, text, text, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cohort_room_post_write(uuid, text, text, text, uuid, jsonb, uuid) TO authenticated;


-- cohort_room_reply_write — the ONLY way a reply is created.
--   · p_is_mentor_answer is ACCEPTED AND DELIBERATELY IGNORED. is_mentor_answer
--     is STAMPED from the caller's resolved cohort_room_members.role — and only
--     mentor/host earns it, not admin (amendment C6) — so a non-mentor passing
--     true still produces a row with false (R-4 W9). The parameter exists
--     purely so a forging client gets a stored `false` rather than an argument
--     error — that is the case the suite asserts.
--   · it carries the SAME batch guards as cohort_room_post_write. Replying is
--     writing into a thread, so a caller who may not start one in a batch may
--     not append to one either. Leaning on cohort_room_can_access alone was not
--     enough: its `OR m.batch_id IS NULL` clause passes a batch-less membership
--     row for EVERY batch, and admin_grant_room_member happily mints
--     (role='member', batch_id=NULL) rows — so that grant could reply into any
--     batch of the offering while post_write blocked it from starting one.
CREATE OR REPLACE FUNCTION public.cohort_room_reply_write(
  p_post              uuid,
  p_body              text,
  p_is_mentor_answer  boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_offering uuid;
  v_post_batch uuid;
  v_batch   uuid;
  v_role    text;
  v_wide    boolean;
  v_body    text;
  v_mentor  boolean;
  v_id      uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT p.offering_id, p.batch_id INTO v_offering, v_post_batch
  FROM public.cohort_room_posts p
  WHERE p.id = p_post AND p.deleted_at IS NULL;

  IF v_offering IS NULL THEN
    RAISE EXCEPTION 'post not found' USING ERRCODE = '42501';
  END IF;

  SELECT s.batch_id, s.member_role, s.offering_wide
    INTO v_batch, v_role, v_wide
  FROM public.cohort_room_caller_scope(v_offering) s;

  IF v_role IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'pre_member' THEN
    RAISE EXCEPTION 'community replies unlock when your enrolment completes'
      USING ERRCODE = '42501';
  END IF;

  v_wide := COALESCE(v_wide, public.cohort_room_is_offering_wide(v_offering));

  -- The batch guards, matching cohort_room_post_write exactly. Only an
  -- offering-wide mentor/host/admin may write into a batch that is not their
  -- own; a batch-scoped author writes into their own batch and nowhere else,
  -- and a batch-less author who is NOT offering-wide has nowhere to write yet.
  IF NOT v_wide THEN
    IF v_batch IS NULL THEN
      RAISE EXCEPTION 'no batch assigned in this room yet'
        USING ERRCODE = '42501';
    END IF;
    IF v_post_batch IS DISTINCT FROM v_batch THEN
      RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Batch-precise: replying is reading the parent thread + writing to it.
  IF NOT public.cohort_room_can_access(v_offering, v_post_batch) THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF v_body = '' THEN
    RAISE EXCEPTION 'reply body cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF length(v_body) > 10000 THEN
    RAISE EXCEPTION 'reply body exceeds 10000 characters' USING ERRCODE = '22023';
  END IF;

  -- STAMPED, never read from p_is_mentor_answer — and stamped from the
  -- caller's resolved cohort_room_members.role ALONE (line-producer amendment
  -- C6: "true only for mentor/host"). public.is_admin() is deliberately NOT
  -- OR-ed in. The badge's whole job (REQ-COMM-2) is to mark the answer as
  -- coming from THIS ROOM's mentor, so a staff account triaging a thread — an
  -- admin who is not on this room's mentor roster — must not be able to mint
  -- that authority by opening the admin console. An admin who IS a mentor here
  -- holds a mentor/host row and is stamped true through v_role like anyone
  -- else.
  v_mentor := COALESCE(v_role IN ('mentor','host'), false);

  INSERT INTO public.cohort_room_post_replies (post_id, author_id, body, is_mentor_answer)
  VALUES (p_post, auth.uid(), v_body, v_mentor)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.cohort_room_reply_write(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cohort_room_reply_write(uuid, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.cohort_room_reply_write(uuid, text, boolean) IS
  'Reply write path. p_is_mentor_answer is accepted for client compatibility '
  'and IGNORED: is_mentor_answer is stamped from the caller''s resolved room '
  'role — mentor/host ONLY, admin status alone does not earn the badge. '
  'pre_member callers are rejected, and the '
  'batch guards match cohort_room_post_write: only an offering-wide '
  'mentor/host/admin may reply into a batch that is not their own.';


----------------------------------------------------------------------
-- 6. get_cohort_progress hardening.
--
--    ⚠️ THE CLIENT CONTRACT IS UNCHANGED. All four live_session columns
--    (live_session_id / live_session_title / live_session_at /
--    live_session_zoom_link) stay in the RETURNS TABLE signature, byte for
--    byte, in the same order. src/pages/CohortDashboard.tsx:31-34 declares them
--    and :496-513 renders the session card, the TimeStateBadge and the Join
--    link; PostgREST would return a narrowed shape WITHOUT erroring, so
--    dropping them would silently blank that card for every enrolled student on
--    already-shipped Capacitor builds. R0 ships no UI, so there would be no
--    paired fix. Removing them is a later phase with a CohortDashboard.tsx
--    change in the same PR.
--
--    WHAT ACTUALLY CHANGES (three things — and (a) IS visible to the shipped
--    client, which is why it is written up in the runbook at B6 and not left
--    buried here):
--    (a) the plain LEFT JOIN on live_sessions is replaced by a LEFT JOIN
--        LATERAL … LIMIT 1, which kills the >1-session-per-week row
--        duplication (a week with 3 sessions used to emit 3 week rows, and the
--        dashboard drew 3 week cards). The lateral picks the session that has
--        not ended yet — the one in progress if a class is running, else the
--        next upcoming — falling back to the most recent past one, which is the
--        session the Join link should point at.
--        ⚠️ THE ROW COUNT IS A CLIENT-VISIBLE NUMBER. CohortDashboard.tsx:144
--        reads rows.length as totalWeeks and :157 divides by it for the
--        progress percentage, so on any offering with a multi-session week a
--        student's percentage moves the moment this is applied. The new count
--        is the CORRECT one and the change is intended, not a regression —
--        rows.length was never "weeks", it was week×session pairs — but it
--        reaches Capacitor bundles that cannot be updated and R0 ships no
--        paired .tsx fix. Runbook B6 carries the verdict, the worked arithmetic
--        and the pre-apply blast-radius query.
--    (b) an own-user-or-admin assert. This RPC is SECURITY DEFINER and took
--        p_user_id from the client with no check, so any authenticated user
--        could read any other user's submission status, rating, mentor feedback
--        and zoom links by passing their uuid. Both shipped call sites
--        (CohortDashboard.tsx:78 and :265) pass the caller's own id, so the
--        assert is a no-op for legitimate traffic. To revert just this, delete
--        the IF block — the shape is unaffected either way.
--
--        ⚠️ DECLARE (b) IN THE PR. It is a RUNTIME-CONTRACT change to an RPC
--        that already ships in Capacitor builds, and it is outside what
--        amendment C1 sanctioned (C1 authorised the four columns staying and
--        the per-week collapse, nothing else). It is kept rather than dropped
--        because deleting it re-opens a live IDOR on mentor feedback and zoom
--        links, but it must be named in the PR body, not left buried in a
--        migration comment — reviewer's call whether it rides this migration or
--        splits into its own. The one caller class it WOULD break is a
--        service-role or admin-tooling caller with a NULL auth.uid(): none
--        exists today (grep over src/, supabase/functions/, scripts/,
--        qa-harness/ and studio-worker/ finds exactly the two call sites
--        above), and any future one must be added to this assert explicitly
--        rather than discovering the raise in production.
--    (c) the LATERAL's ORDER BY ranks a CANCELLED session LAST, so it can only
--        ever represent a week that holds nothing else. This is part of (a),
--        not a separate change: the collapse is what forces a choice of one
--        session per week, and a called-off class must not win that choice over
--        a real one while this RPC still hands zoom_link out ungated (B5.4a).
--        It is a sort key and NOT a filter — filtering cancelled rows out would
--        blank the live_session columns for a cancelled-only week, and the
--        prior definition (20260526180000:278, a bare LEFT JOIN) has always
--        shown that session's title and date. An earlier pass DID filter, which
--        was an inherited-behaviour change of exactly the class this task rules
--        out of scope; it is reverted. Nothing client-visible moves: a week
--        with a real session already elected it, and a cancelled-only week
--        still renders exactly what it renders today.
--
--    CREATE OR REPLACE (not DROP + CREATE): the signature and return type are
--    identical, so a drop is not required — and CREATE OR REPLACE preserves the
--    existing grants and leaves no window where the function does not exist.
--    The GRANT is re-issued below anyway (idempotent).
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cohort_progress(p_user_id uuid, p_offering_id uuid)
RETURNS TABLE (
  cohort_batch_id uuid,
  batch_label text,
  week_id uuid,
  week_number integer,
  theme text,
  description text,
  starts_on date,
  ends_on date,
  assignment_prompt text,
  assignment_due_at timestamptz,
  feedback_session_at timestamptz,
  week_status text,
  live_session_id uuid,
  live_session_title text,
  live_session_at timestamptz,
  live_session_zoom_link text,
  submission_id uuid,
  submission_status text,
  submission_rating smallint,
  submission_feedback text,
  submission_submitted_at timestamptz,
  attended boolean,
  attendance_marked boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'cohort progress is readable for your own account only'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cb.id,
    cb.name,
    cw.id,
    cw.week_number,
    cw.theme,
    cw.description,
    cw.starts_on,
    cw.ends_on,
    cw.assignment_prompt,
    cw.assignment_due_at,
    cw.feedback_session_at,
    cw.status,
    ls.id,
    ls.title,
    ls.scheduled_at,
    ls.zoom_link,
    s.id,
    s.status,
    s.rating,
    s.feedback_text,
    s.submitted_at,
    COALESCE(a.attended, false),
    (a.id IS NOT NULL)
  FROM public.cohort_batch_members cbm
  JOIN public.enrolments e ON e.id = cbm.enrolment_id
  JOIN public.cohort_batches cb ON cb.id = cbm.batch_id
  JOIN public.cohort_weeks cw ON cw.cohort_batch_id = cb.id
  -- ONE session per week: the one that has not ENDED yet — the class in
  -- progress if there is one, else the next upcoming — falling back to the most
  -- recent past session when the week is over.
  --
  -- The bucket key is the session's END (scheduled_at + duration), never its
  -- start. Keying on the start put a CURRENTLY-RUNNING session in the past
  -- bucket, so a week that also held a later session sorted the later one first
  -- and the dashboard swapped the Join link off the class the student was
  -- supposed to be in — mid-class, with no way back in. duration_minutes
  -- defaults to 60 for a row that never set one, matching
  -- get_live_session_zoom_link (20260408151600:93).
  --
  -- A CANCELLED SESSION IS DEMOTED, NOT EXCLUDED — and the distinction is the
  -- whole point. Collapsing a week to one row forces a choice this function
  -- never had to make before, so "which session represents the week" is R-3's
  -- own decision and a cancelled class must never win it over a real one:
  -- get_cohort_progress ships zoom_link raw (no time gate — inherited, B5.4a),
  -- so electing the called-off session drew a live "Join session" button
  -- (CohortDashboard.tsx:510) for a class nobody would be in. The FIRST sort key
  -- below therefore ranks a cancelled row last, and it is applied ahead of every
  -- timing key: a cancelled class running right now still loses to a real one
  -- that finished two days ago.
  --   It is a sort key and NOT a WHERE clause because excluding the row would
  --   change what a week LOOKS like, and that is inherited behaviour this phase
  --   is not allowed to touch: the prior definition (20260526180000:278) is a
  --   bare LEFT JOIN with no cancelled handling at all, so a week whose ONLY
  --   session is cancelled has always rendered that session's title and date.
  --   Filtering it out would blank those columns, and CohortDashboard.tsx:521
  --   renders the literal 'Not scheduled yet' for a NULL title — a false
  --   statement about a class that WAS scheduled and then called off, shipped to
  --   Capacitor bundles that cannot be updated, in a phase whose acceptance is
  --   zero client-visible change. Demotion keeps §6 and §3 telling the same
  --   story: §3 LISTS a cancelled session and withholds only its link, and now
  --   so does §6 — the week still shows it when it is all there is, and the link
  --   question stays where B5.4a books it.
  -- COALESCE(status,'scheduled') is right for THIS job (a blank status is
  -- "unspecified", which is not "cancelled" when choosing a week's session) and
  -- deliberately differs from §3's stricter gate, where a blank status denies.
  LEFT JOIN LATERAL (
    SELECT lsx.id, lsx.title, lsx.scheduled_at, lsx.zoom_link
    FROM public.live_sessions lsx
    WHERE lsx.week_id = cw.id
    ORDER BY (COALESCE(lsx.status, 'scheduled') = 'cancelled') ASC,
             (lsx.scheduled_at
                + make_interval(mins => COALESCE(lsx.duration_minutes, 60)) >= now())
               DESC NULLS LAST,
             CASE WHEN lsx.scheduled_at
                         + make_interval(mins => COALESCE(lsx.duration_minutes, 60)) >= now()
                  THEN lsx.scheduled_at END ASC,
             lsx.scheduled_at DESC
    LIMIT 1
  ) ls ON true
  LEFT JOIN public.cohort_week_submissions s
    ON s.cohort_week_id = cw.id AND s.user_id = p_user_id
  LEFT JOIN public.cohort_week_attendance a
    ON a.cohort_week_id = cw.id AND a.user_id = p_user_id
  WHERE e.user_id = p_user_id
    AND cb.offering_id = p_offering_id
  ORDER BY cw.week_number, cw.sort_order;
END $$;

GRANT EXECUTE ON FUNCTION public.get_cohort_progress(uuid, uuid) TO authenticated;


-- ============================================================================
-- RUNBOOK — shadow verification, EXPLAIN capture, and reversal.
-- Nothing below executes; it is the operator's script for this migration.
-- ============================================================================
--
-- A. SHADOW APPLY (never prod):
--      export SUPABASE_ACCESS_TOKEN="$SUPABASE_PAT"
--      npx -y supabase@latest link --project-ref <SHADOW_REF>
--      npx -y supabase@latest db push
--    Then seed qa-harness/cohort-room-fixtures.sql (R-4) for correctness, and
--    pad it to the 200-member / 12-week / 2-batch acceptance shape with B1
--    below before taking any timing.
--
-- B. EXPLAIN + p95 capture for the PR (acceptance: p95 < 150ms each,
--    design/briefs/cohort-r0.md:44 + line-producer amendment C8).
--
--    ⛔ PHASE GATE: BLOCKED — NOT YET CAPTURED, AND R-3 CANNOT CAPTURE IT.
--    There is no shadow project, no local Postgres and no container runtime on
--    this branch (`psql`, `pg_ctl` and `docker` are all absent), so every plan
--    and timing below is UNMEASURED and the tables at the foot of this section
--    are EMPTY TEMPLATES, not results. The brief (design/briefs/cohort-r0.md:44)
--    and amendment C8 both make measured plans an acceptance criterion, so this
--    task is NOT signed off until an operator runs B1–B3 on a shadow project
--    and pastes the real output in. Do not read the honesty of this disclosure
--    as a waiver. R-1 carries the same standing caveat for its own harness
--    (20260729100000, "MEASUREMENT HARNESS (A6)").
--
--    THREE PLANS IN PARTICULAR HAVE NEVER BEEN SEEN EXECUTE, because the
--    2026-07-27 review changed all three branches:
--      1. the offering-wide mentor branch of get_cohort_room / get_room_roster
--         (v_wide true → every batch of the offering);
--      2. the pre_member lobby branch (v_wide false, v_batch NULL → the
--         offering-LEVEL rows only, and an empty sessions array). A fast empty
--         result proves nothing: assert the ROW COUNTS in B2, not just the ms.
--      3. get_room_roster's join to public.users THROUGH the set-returning
--         cohort_room_roster_ids. A SECURITY DEFINER SQL function is never
--         inlined, so this is always a Function Scan; the `ROWS 200` estimate
--         added in §1b is an ATTEMPT to keep the planner on a nested-loop PK
--         probe, not proof that it does. If the plan shows a Hash Join with a
--         Seq Scan on public.users, that is the finding — fix it by hinting the
--         estimate or by materialising the ids into a temp array first, NOT by
--         re-inlining the predicate into both callers (that duplication is what
--         NFR-SEC-2 and this file's §1b exist to prevent).
--
--    B1. Scale the fixture to the acceptance shape (200 members, 12 weeks, 2
--        batches). qa-harness/cohort-room-fixtures.sql builds the CORRECTNESS
--        world (a handful of users); it is not the PERFORMANCE world. Pad it:
--
--          -- 12 weeks on batch A1, each with 2 sessions (the duplication case)
--          INSERT INTO public.cohort_weeks (cohort_batch_id, week_number, theme,
--                                           starts_on, ends_on, status)
--          SELECT b.id, g, 'perf week ' || g,
--                 current_date + (g * 7), current_date + (g * 7) + 6,
--                 CASE WHEN g = 1 THEN 'active' ELSE 'upcoming' END
--          FROM public.cohort_batches b, generate_series(2, 12) g
--          WHERE b.name = 'ROOM QA Batch A1';
--
--          INSERT INTO public.live_sessions (course_id, week_id, title,
--                                            scheduled_at, duration_minutes, status)
--          SELECT c.id, w.id, 'perf session ' || w.week_number || '/' || s,
--                 now() + (w.week_number * interval '7 days') + (s * interval '2 hours'),
--                 90, 'scheduled'
--          FROM public.cohort_weeks w
--          JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
--          CROSS JOIN generate_series(1, 2) s
--          JOIN public.courses c ON c.slug = 'room-qa-course-a'
--          WHERE b.name = 'ROOM QA Batch A1';
--
--          -- 200 room members split across A1/A2 (membership rows only: this
--          -- measures the RPCs, not the resolver, which R-1 measures)
--          INSERT INTO public.cohort_room_members
--                 (user_id, offering_id, batch_id, role, source, status)
--          SELECT u.id, b.offering_id, b.id, 'member', 'manual', 'active'
--          FROM (SELECT id, row_number() OVER (ORDER BY created_at) rn
--                  FROM public.users LIMIT 200) u
--          JOIN public.cohort_batches b
--            ON b.name = CASE WHEN u.rn % 2 = 0 THEN 'ROOM QA Batch A1'
--                                                ELSE 'ROOM QA Batch A2' END
--          ON CONFLICT DO NOTHING;
--
--          ANALYZE public.cohort_room_members;
--          ANALYZE public.cohort_weeks;
--          ANALYZE public.live_sessions;
--          ANALYZE public.cohort_announcements;
--
--    B2. Become a real caller. Every RPC keys off auth.uid(), so plans captured
--        as `postgres` are worthless — they take different branches:
--
--          BEGIN;
--          SELECT set_config('request.jwt.claims',
--            json_build_object('sub', (SELECT id FROM public.users
--                                       WHERE email LIKE 'room-qa-member-a1%'),
--                              'role', 'authenticated')::text, true);
--          SET LOCAL ROLE authenticated;
--
--          EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT * FROM public.get_my_cohort_rooms();
--          EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT public.get_cohort_room('<offering_A>');
--          EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT * FROM public.get_room_roster('<offering_A>');
--          EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
--            SELECT * FROM public.get_cohort_progress('<member_A1>','<offering_A>');
--          ROLLBACK;
--
--        NOTE: EXPLAIN on a plpgsql RPC plans only the outer call. For the
--        inner statements, capture them with auto_explain instead:
--          SET LOCAL auto_explain.log_min_duration = 0;
--          SET LOCAL auto_explain.log_nested_statements = on;
--          SET LOCAL auto_explain.log_analyze = on;
--        …then read the plans out of the Supabase Postgres logs.
--
--        Repeat the whole block as mentor_A (offering-wide: v_wide true → the
--        every-batch branch) and as pre_member_A1 (the lobby branch: v_wide
--        false, v_batch NULL → offering-LEVEL rows only). Those are DIFFERENT
--        plans and neither has ever been observed.
--
--        And take the ROW COUNTS with the timings — the whole point of the
--        2026-07-27 finding is that a wrong scope is fast:
--
--          -- as pre_member_A1 (lobby): announcements must contain ONLY the
--          -- offering-level row, sessions must be [], roster_count must be 0.
--          SELECT jsonb_array_length(v -> 'announcements')            AS ann_n,
--                 v -> 'announcements' @> '[{"batch_id": null}]'      AS ann_offering_level,
--                 EXISTS (SELECT 1 FROM jsonb_array_elements(v -> 'announcements') e
--                          WHERE e ->> 'batch_id' IS NOT NULL)        AS ann_LEAK,
--                 jsonb_array_length(v -> 'sessions')                 AS sess_n,
--                 v ->> 'roster_count'                                AS mates,
--                 v ->> 'access'                                      AS tier
--            FROM (SELECT public.get_cohort_room('<offering_A>') AS v) t;
--          -- ann_LEAK must be FALSE. It was TRUE before this fix: the fixture's
--          -- 'LEAK_CANARY_A2' announcement (qa-harness/cohort-room-fixtures.sql
--          -- :317-327) reached pre_member_A1, and R-4's PRE_MEMBER_FORBIDDEN
--          -- corpus does not list CANARY.A2, so the suite went green on it.
--          -- Re-run this probe by hand until R-4 adds the canary.
--
--          -- as member_A1 (batch-scoped): same probe, ann_LEAK false, and every
--          -- session must belong to batch A1.
--          -- as mentor_A (offering-wide): sessions SPAN both batches — that is
--          -- the one caller for whom a cross-batch payload is correct.
--
--          -- as an UNPLACED member (paid + enrolled, no batch row yet — R-1
--          -- resolver branch (a2) in 20260729100000 §4, the INSERT under the
--          -- "(a2) OFFERING-WIDE membership …" comment in the SHIPPING tree; by
--          -- comment, never by line): roster_count must be
--          -- exactly 1, and get_room_roster must return that one row plus the
--          -- offering's mentors/hosts and NOBODY else. Before the §1b NULL-batch
--          -- fix this enumerated every OTHER unplaced student in the offering —
--          -- list and count alike — because the predicate matched NULL to NULL.
--          -- Seed the case first (there is no such fixture today; R-4 should
--          -- gain one):
--          --   INSERT INTO public.cohort_room_members
--          --          (user_id, offering_id, batch_id, role, source, status)
--          --   VALUES ('<u1>','<offering_A>',NULL,'member','derived','active'),
--          --          ('<u2>','<offering_A>',NULL,'member','derived','active');
--          SELECT count(*) FILTER (WHERE r.role IN ('member','alumni')) AS mates,
--                 count(*)                                              AS listed
--            FROM public.get_room_roster('<offering_A>') r;
--          -- mates must be 1 (self). Anything higher is the NULL-batch leak back.
--
--    B3. p95 over 100 sequential calls, which is the acceptance number (a
--        single ANALYZE run is a sample of one):
--
--          BEGIN;
--          SELECT set_config('request.jwt.claims', …, true);  -- as in B2
--          SET LOCAL ROLE authenticated;
--          CREATE TEMP TABLE rpc_timings (rpc text, ms double precision) ON COMMIT DROP;
--          DO $timing$
--          DECLARE t0 timestamptz; i int; v jsonb; BEGIN
--            FOR i IN 1..100 LOOP
--              t0 := clock_timestamp();
--              PERFORM * FROM public.get_my_cohort_rooms();
--              INSERT INTO rpc_timings VALUES ('get_my_cohort_rooms',
--                extract(epoch FROM clock_timestamp() - t0) * 1000);
--
--              t0 := clock_timestamp();
--              v := public.get_cohort_room('<offering_A>');
--              INSERT INTO rpc_timings VALUES ('get_cohort_room',
--                extract(epoch FROM clock_timestamp() - t0) * 1000);
--
--              t0 := clock_timestamp();
--              PERFORM * FROM public.get_room_roster('<offering_A>');
--              INSERT INTO rpc_timings VALUES ('get_room_roster',
--                extract(epoch FROM clock_timestamp() - t0) * 1000);
--
--              t0 := clock_timestamp();
--              PERFORM * FROM public.get_cohort_progress('<member_A1>','<offering_A>');
--              INSERT INTO rpc_timings VALUES ('get_cohort_progress',
--                extract(epoch FROM clock_timestamp() - t0) * 1000);
--            END LOOP;
--          END $timing$;
--          SELECT rpc,
--                 round(percentile_disc(0.50) WITHIN GROUP (ORDER BY ms)::numeric, 1) AS p50_ms,
--                 round(percentile_disc(0.95) WITHIN GROUP (ORDER BY ms)::numeric, 1) AS p95_ms,
--                 round(max(ms)::numeric, 1) AS max_ms
--            FROM rpc_timings GROUP BY rpc ORDER BY p95_ms DESC;
--          ROLLBACK;
--
--    B4. Expected access paths — anything else in the plan is the finding:
--          get_my_cohort_rooms   room_members_user_idx, then per-row
--                                cohort_weeks_batch_idx / live_sessions_week_idx
--          get_cohort_room       room_members_offering_idx (roster_count via
--                                cohort_room_roster_ids), cohort_weeks_batch_idx
--                                → live_sessions_week_idx (sessions),
--                                cohort_announcements_room_idx
--          get_room_roster       a Function Scan on cohort_room_roster_ids
--                                (never inlined — SECURITY DEFINER), driving a
--                                NESTED LOOP with a users PK index probe per
--                                row. ONE pass over public.users, no seq scan.
--                                A Hash Join over a Seq Scan on public.users is
--                                the failure mode the `ROWS 200` estimate in
--                                §1b is meant to prevent — VERIFY IT, do not
--                                assume it. (The two-pass public_user_profiles
--                                + users shape this file deliberately dropped
--                                shows up as a Seq Scan under a Subquery Scan.)
--          get_cohort_progress   cohort_batch_members → cohort_weeks_batch_idx,
--                                live_sessions_week_idx inside the LATERAL.
--                                Expect an Index Scan FEEDING A SORT there, not
--                                an ordered index read: the LATERAL's leading
--                                sort keys are expressions (cancelled-last, then
--                                ended-vs-not) that no index provides. That sort
--                                is over one week's sessions — single digits —
--                                so it is not the finding. A Seq Scan on
--                                live_sessions is.
--
--    PR EVIDENCE BLOCK (⛔ UNFILLED — these are placeholders, not results; the
--    acceptance gate is open until an operator replaces them):
--          | RPC                 | p50 ms | p95 ms | plan summary |
--          |---------------------|--------|--------|--------------|
--          | get_my_cohort_rooms |        |        |              |
--          | get_cohort_room     |        |        |              |
--          | get_room_roster     |        |        |              |
--          | get_cohort_progress |        |        |              |
--        …plus the four EXPLAIN outputs, the mentor/pre_member reruns, the
--        B2 scope probes (ann_LEAK must read false for pre_member_A1; the
--        unplaced-member roster must count exactly 1), and B7's zoom-window
--        probe (PAST withheld, LIVE present, link_exists true). Those three
--        probes are the only evidence in the PR that the roster fix and the
--        window's upper bound do anything — an unarmed run passes without them.
--
--    B5. FIVE THINGS THE PR BODY MUST SAY IN WORDS, not leave in this file:
--       1. get_cohort_progress keeps its column contract — all four
--          live_session columns, same names, same order (amendment C1). What
--          changed is one session per week instead of one row per session
--          (§6(a), including the tie-break that ranks a cancelled session last
--          among the candidates for that one slot — §6(c), a sort key, not a
--          filter: no session stops being visible), and an own-user-or-admin
--          assert (§6(b)) that is a runtime-contract change outside C1 and is
--          called out there for the reviewer to accept or split out.
--       2. The p95/EXPLAIN acceptance criterion is NOT met. See B above.
--       3. That per-week collapse changes a NUMBER THE SHIPPED CLIENT SHOWS —
--          the progress percentage. It is not an internal-only change. B6.
--       4. TWO KNOWN HOLES SURVIVE THIS MIGRATION UNTOUCHED, deliberately, and
--          need their own follow-up ticket. Both live in get_cohort_progress
--          (§6) and both are INHERITED VERBATIM from its prior definition,
--          20260526180000:233-245 — that definition has neither guard, so
--          adding one here would put a pre-existing fix inside the highest-blast
--          -radius phase in the programme, and it is booked out rather than
--          smuggled in:
--            a. NO TIME GATE ON THE JOIN LINK. §6 selects ls.zoom_link raw into
--               live_session_zoom_link and is GRANTed to authenticated, so the
--               window §3 closes for the room envelope is still wide open one
--               RPC over. Any enrolled user — including an alumnus, since (b)
--               below does not filter status — reads the link for every session
--               of their offering at any time, which matters precisely because
--               these cohorts run on RECURRING meeting links. The follow-up must
--               apply §3's window here and ship the paired CohortDashboard.tsx
--               change in the same PR (that file's own T-60 check at :510 has no
--               lower bound either).
--            b. THE ENROLMENT JOIN IS NOT FILTERED ON status='active'. A
--               withdrawn or refunded enrolment still reads week detail,
--               submissions, mentor feedback and the link from (a).
--          Neither is a regression introduced by this phase; both are live on
--          prod today. Open the ticket WITH the PR, do not let this note be the
--          only record.
--       5. §3'S ZOOM GATE MATCHES OR TIGHTENS get_live_session_zoom_link ON
--          EVERY CELL, and its upper bound is the security fix this task exists
--          for — so say both, and attach B7's evidence. The gate is a WINDOW
--          (T-60 → scheduled end + 1h). The old function had one; the first draft
--          of this file opened at T-60 and never closed, which — with recurring
--          meeting links and role='alumni' admitted by can_access — left every
--          past student holding a live join link into every future session.
--          On the one cell where an earlier pass was WIDER than the function it
--          supersedes (a NULL status: `COALESCE(status,'scheduled')` admitted it,
--          the old IF-based test evaluates NULL and falls through to RETURN NULL,
--          i.e. DENIES), this file now conforms — `ls.status IS NOT NULL AND
--          ls.status <> 'cancelled'`. That was a reviewer decision and it was
--          taken: conform. §6's LATERAL keeps COALESCE because it answers a
--          different question (which session REPRESENTS a week; "unspecified" is
--          not "cancelled" there) and it gates nothing.
--
--    B6. CLIENT-VISIBLE CHANGE THAT REACHES ALREADY-SHIPPED BUNDLES.
--        Web redeploys; the iOS and Android Capacitor builds in the field do
--        not. Both call get_cohort_progress, so this lands on them the moment
--        the migration is applied, with no paired client fix available — R0
--        ships zero .tsx (brief rule 1). Apply it deliberately or hold it.
--
--        WHAT MOVES: §6's LATERAL collapses a week to ONE row; before, a week
--        emitted one row per live session. src/pages/CohortDashboard.tsx reads
--        that row count as a domain fact:
--            :144  const totalWeeks = rows.length;
--            :157  progressPct = round((completedCount / totalWeeks) * 100)
--        so for any offering where a week holds more than one session, a
--        student's progress percentage changes. (:148-156 index into the same
--        array for "week N of M", so that moves with it.)
--
--        THE VERDICT — CORRECT AND INTENDED, NOT A REGRESSION. rows.length was
--        never "weeks"; it was week×session pairs. totalWeeks over-counted, the
--        dashboard drew duplicate week cards (the defect this collapse exists
--        to fix), and progressPct divided one inflated number by another
--        inflated by a DIFFERENT factor, so it was not even consistently wrong.
--        Worked example — week 1 completed with 3 sessions, week 2 upcoming
--        with 1: before, 4 rows / 3 completed = 75%; after, 2 rows / 1
--        completed = 50%. 50% is the true answer. Students on an affected
--        cohort will see their percentage DROP to the honest value, which is a
--        support-facing fact even though the new number is the right one.
--
--        BLAST RADIUS — measure it before applying, do not assume it. The row
--        set is byte-identical for any offering whose weeks each hold at most
--        one live session:
--
--          SELECT o.title, cb.name AS batch, cw.week_number,
--                 count(*) AS sessions_in_week
--            FROM public.live_sessions ls
--            JOIN public.cohort_weeks cw ON cw.id = ls.week_id
--            JOIN public.cohort_batches cb ON cb.id = cw.cohort_batch_id
--            JOIN public.offerings o ON o.id = cb.offering_id
--           GROUP BY 1, 2, 3
--          HAVING count(*) > 1
--           ORDER BY sessions_in_week DESC;
--
--        No rows → nobody's percentage moves and this is a no-op on the field
--        bundles. Rows → those are exactly the cohorts whose numbers change:
--        name them in the PR and tell support, or hold this migration until the
--        phase that is allowed to touch CohortDashboard.tsx can ship the paired
--        change described next.
--
--        THE PAIRED CLIENT FIX — DEDUPE THE NUMERATOR AND THE DENOMINATOR
--        TOGETHER, OR NOT AT ALL. An earlier draft of this runbook prescribed
--        "derive totalWeeks from DISTINCT week_id rather than rows.length,
--        which is correct under either shape". IT IS NOT. Only the denominator
--        is named there, and the numerator is never deduped: :145-147 computes
--        completedCount by filtering ROWS
--          rows.filter(r => ["completed","archived"].includes(r.week_status)).length
--        so under the DUPLICATING shape a completed week with 3 sessions
--        contributes 3 to completedCount while contributing 1 to a DISTINCT
--        week_id denominator. Same worked example, inverted: week 1 completed
--        with 3 sessions + week 2 upcoming with 1 → completedCount 3 /
--        distinctWeeks 2 = 150%. The footer goes with it: activeIdx (:148) is a
--        ROW index and weekOfM is progressIdx + 1 (:156) compared against M, so
--        it reads "week 4 of 2".
--
--        That is not a stale-shape hypothetical. §C of THIS FILE is a reversal
--        script that deliberately restores the duplicating LEFT JOIN, so the
--        exact sequence the old wording invited — later phase ships the client
--        fix, this migration is then rolled back — puts a >100% percentage on
--        iOS/Android Capacitor bundles that cannot be updated.
--
--        The shape-independent fix is to collapse the rows to one entry per
--        week_id FIRST and derive every one of the four numbers from that list:
--
--          const weeks = Array.from(
--            rows.reduce((m, r) => m.has(r.week_id) ? m : m.set(r.week_id, r),
--                        new Map<string, ProgressRow>()).values()
--          );
--          const totalWeeks    = weeks.length;
--          const completedCount = weeks.filter((w) =>
--            ["completed", "archived"].includes(w.week_status)).length;
--          const activeIdx     = weeks.findIndex((w) => w.week_status === "active");
--          // progressIdx / weekOfM / progressPct unchanged, but now indexing
--          // DISTINCT WEEKS on both sides of the ratio.
--
--        Under the collapsed shape `weeks` is `rows` and nothing moves; under
--        the duplicating shape it yields the same honest 50% and "week 2 of 2".
--        Correct under either shape, in either migration state, which is what
--        "safe to ship ahead of / behind this migration" actually requires.
--        currentWeek (:139-142) already keys off week_id and needs no change.
--
--        NOT PART OF THIS — THE TWO ORDERING RULES INSIDE THE SAME LATERAL.
--        Neither moves a number and neither removes a row; they only decide
--        WHICH session fills the single slot the collapse creates, and that slot
--        did not exist before, so there is no prior behaviour for them to change:
--          · a session that has STARTED but not ENDED sorts as present rather
--            than past, so a week holding a later session no longer swaps the
--            Join link away from the class a student is sitting in, mid-class;
--          · a CANCELLED session sorts LAST, so it fills the slot only for a week
--            that holds nothing else — which is the same thing that week shows
--            today under the plain LEFT JOIN. It is deliberately a sort key and
--            not a WHERE clause: filtering would blank live_session_title for a
--            cancelled-only week and CohortDashboard.tsx:521 renders 'Not
--            scheduled yet' for a NULL title, which is a false statement about a
--            class that was scheduled and then called off — a product decision,
--            on un-updatable bundles, in a phase whose acceptance is zero
--            client-visible change. An earlier pass of this file did filter; it
--            was reverted for exactly that reason, and because cancelled-session
--            VISIBILITY is inherited (20260526180000:278 has no status handling
--            at all), which puts it in the same leave-alone class as B5.4's two
--            holes.
--        The residue that survives: a cancelled-only week still renders its
--        title, its date and — because §6 ships zoom_link ungated (B5.4a) — a
--        live Join button for a called-off class. That is prod behaviour today,
--        unchanged by this migration, and it belongs to the B5.4a follow-up,
--        which must ship §3's window here together with the paired
--        CohortDashboard.tsx change. Name it in that ticket. Count the affected
--        weeks with:
--
--          SELECT o.title, cb.name AS batch, cw.week_number
--            FROM public.cohort_weeks cw
--            JOIN public.cohort_batches cb ON cb.id = cw.cohort_batch_id
--            JOIN public.offerings o ON o.id = cb.offering_id
--           WHERE EXISTS (SELECT 1 FROM public.live_sessions ls
--                          WHERE ls.week_id = cw.id)
--             AND NOT EXISTS (SELECT 1 FROM public.live_sessions ls
--                              WHERE ls.week_id = cw.id
--                                AND COALESCE(ls.status,'scheduled') <> 'cancelled');
--        -- Rows here are NOT a blast radius for this migration — they render
--        -- identically before and after it. They are the follow-up's worklist.
--
--    B7. PROVE THE ZOOM WINDOW CLOSES — the upper bound is the highest-severity
--        change in this diff and NOTHING IN THE PR CAN CURRENTLY DISTINGUISH IT
--        FROM ITS OWN ABSENCE. R-4's C2 section probes T+3h (FAR, below the
--        window), T+30m (NEAR, inside it) and T-20m (LIVE, mid-class, C2.6b) —
--        the lower edge and the middle, never the upper edge.
--        qa-harness/cohort-room-fixtures.sql concedes it ("FAR/NEAR only ever
--        exercise its lower edge"). The one fixture session that sits ABOVE the
--        window, 'ROOM QA A1 PAST session', is seeded with `zoom_link NULL`, so
--        "the past session carries no link" is TRUE WITH THE FIX AND WITHOUT IT.
--        That is exactly the vacuity C2.0 was written to prevent.
--
--        R-4 MUST GAIN AN ARMED PAST SESSION (its file, not this one — raise it
--        as an R-4 change, do not let this note be the only record):
--          · give 'ROOM QA A1 PAST session' a real zoom_link carrying its own
--            sentinel, e.g. 'https://zoom.test/j/LEAK_CANARY_ZOOMPAST_A1', add
--            that sentinel to CANARY and to the leak corpus, and
--          · add a case — C2.10, since C2.7.* is already the entitlement matrix
--            — asserting that the envelope's PAST entry has zoom_link null while
--            an admin can still pull the same link off `ids.session_past_a1`
--            (the C2.0 positive-control shape), so the NULL is the window
--            closing and not an empty column.
--        Until that lands, an operator runs the probe by hand on the shadow
--        project. It arms the column, then reads it back through the RPC:
--
--          -- arm it (the fixture ships this column NULL)
--          UPDATE public.live_sessions
--             SET zoom_link = 'https://zoom.test/j/LEAK_CANARY_ZOOMPAST_A1'
--           WHERE title = 'ROOM QA A1 PAST session';
--
--          -- then, as member_A1 (the B2 set_config + SET LOCAL ROLE block):
--          SELECT s ->> 'title'                       AS title,
--                 s ->> 'scheduled_at'                AS at,
--                 (s ->> 'zoom_link') IS NULL         AS link_withheld
--            FROM jsonb_array_elements(
--                   public.get_cohort_room('<offering_A>') -> 'sessions') s
--           WHERE s ->> 'title' LIKE '%PAST%'
--              OR s ->> 'title' LIKE '%LIVE%';
--          -- ACCEPTANCE: PAST → link_withheld TRUE (it ended 2 days ago, so it
--          -- is above scheduled_at + duration + 1h), LIVE → link_withheld FALSE
--          -- (it started 20m ago and is still running). Both rows must appear:
--          -- one TRUE and one FALSE is the WINDOW; two TRUEs is a broken column
--          -- and two FALSEs is the unbounded gate this fix removed.
--
--          -- and the positive control, so the TRUE above is a withheld string
--          -- and not an empty cell (run as the admin/owner, outside the role):
--          SELECT zoom_link IS NOT NULL AS link_exists
--            FROM public.live_sessions WHERE title = 'ROOM QA A1 PAST session';
--          -- must be TRUE. If it is FALSE the probe proved nothing.
--
--        Paste both results into the PR next to the p95 table. The upper bound
--        does not ship signed off on an unverifiable claim.
--
-- C. REVERSAL — one script, drops only what this migration added and restores
--    get_cohort_progress to its VERBATIM prior definition:
--
--      DROP FUNCTION IF EXISTS public.cohort_room_reply_write(uuid, text, boolean);
--      DROP FUNCTION IF EXISTS public.cohort_room_post_write(uuid, text, text, text, uuid, jsonb, uuid);
--      DROP FUNCTION IF EXISTS public.cohort_room_allowed_channels(uuid, uuid);
--      DROP FUNCTION IF EXISTS public.get_room_roster(uuid);
--      DROP FUNCTION IF EXISTS public.get_cohort_room(uuid);
--      DROP FUNCTION IF EXISTS public.get_my_cohort_rooms();
--      DROP FUNCTION IF EXISTS public.cohort_room_roster_ids(uuid, uuid, boolean);
--      DROP FUNCTION IF EXISTS public.cohort_room_caller_scope(uuid);
--      DROP INDEX IF EXISTS public.live_sessions_week_idx;
--    (Feed write grants need no reversal here: this migration never changed
--     them — R-2 owns the REVOKE.)
--
--    get_cohort_progress reversal — the PRIOR DEFINITION, VERBATIM from
--    supabase/migrations/20260526180000_cohort_weeks_submissions_attendance.sql
--    §9. Paste and run to restore the pre-R3 behaviour (row duplication and the
--    missing own-user assert included — that is what "verbatim" means):
--
--      CREATE OR REPLACE FUNCTION public.get_cohort_progress(p_user_id uuid, p_offering_id uuid)
--      RETURNS TABLE (
--        cohort_batch_id uuid,
--        batch_label text,
--        week_id uuid,
--        week_number integer,
--        theme text,
--        description text,
--        starts_on date,
--        ends_on date,
--        assignment_prompt text,
--        assignment_due_at timestamptz,
--        feedback_session_at timestamptz,
--        week_status text,
--        live_session_id uuid,
--        live_session_title text,
--        live_session_at timestamptz,
--        live_session_zoom_link text,
--        submission_id uuid,
--        submission_status text,
--        submission_rating smallint,
--        submission_feedback text,
--        submission_submitted_at timestamptz,
--        attended boolean,
--        attendance_marked boolean
--      )
--      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $func$
--        SELECT
--          cb.id AS cohort_batch_id,
--          cb.name AS batch_label,
--          cw.id AS week_id,
--          cw.week_number,
--          cw.theme,
--          cw.description,
--          cw.starts_on,
--          cw.ends_on,
--          cw.assignment_prompt,
--          cw.assignment_due_at,
--          cw.feedback_session_at,
--          cw.status AS week_status,
--          ls.id AS live_session_id,
--          ls.title AS live_session_title,
--          ls.scheduled_at AS live_session_at,
--          ls.zoom_link AS live_session_zoom_link,
--          s.id AS submission_id,
--          s.status AS submission_status,
--          s.rating AS submission_rating,
--          s.feedback_text AS submission_feedback,
--          s.submitted_at AS submission_submitted_at,
--          COALESCE(a.attended, false) AS attended,
--          (a.id IS NOT NULL) AS attendance_marked
--        FROM public.cohort_batch_members cbm
--        JOIN public.enrolments e ON e.id = cbm.enrolment_id
--        JOIN public.cohort_batches cb ON cb.id = cbm.batch_id
--        JOIN public.cohort_weeks cw ON cw.cohort_batch_id = cb.id
--        LEFT JOIN public.live_sessions ls ON ls.week_id = cw.id
--        LEFT JOIN public.cohort_week_submissions s
--          ON s.cohort_week_id = cw.id AND s.user_id = p_user_id
--        LEFT JOIN public.cohort_week_attendance a
--          ON a.cohort_week_id = cw.id AND a.user_id = p_user_id
--        WHERE e.user_id = p_user_id
--          AND cb.offering_id = p_offering_id
--        ORDER BY cw.week_number, cw.sort_order;
--      $func$;
--
--      GRANT EXECUTE ON FUNCTION public.get_cohort_progress(uuid, uuid) TO authenticated;
-- ============================================================================
