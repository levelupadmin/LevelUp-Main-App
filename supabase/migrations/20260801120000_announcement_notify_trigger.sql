-- ============================================================================
-- PHASE R3 · Task R3-T1 — the noticeboard's server half.
-- 🔴 Tier 1 by CLAUDE.md's blast-radius rule, and NOT because of its size.
--    §1 adds an index to `public.notifications`, a SHIPPED table that
--    `src/hooks/useNotifications.ts` reads on every app open and
--    `src/pages/admin/AdminAnnouncements.tsx` writes in 50-row batches. Nothing
--    else in this file touches a surface outside the room.
--    The R3 brief's line that this phase needs "one trigger, not a schema" does
--    NOT survive contact with the table: see §1.
--
-- WHAT THIS FILE ADDS, in the order it adds it:
--   §1  notifications_room_unread_uniq   partial unique index — the volume cap's
--                                        race backstop, scoped to ONE type.
--   §2  room_announcement_targets()      who a notice reaches, exactly once.
--   §3  notify_room_on_announcement()    + trigger cohort_announcement_notify.
--   §4  get_room_announcements()         the paged read with an AUTHOR on it.
--
-- SHAPE MIRRORED FROM 20260611120000_comment_notification_trigger.sql
--   (symbol `notify_post_author_on_comment`, trigger `community_comment_notify`):
--   AFTER INSERT, SECURITY DEFINER with a pinned search_path so the write clears
--   the notifications INSERT policy (`notifications_admin_insert`, is_admin()
--   only, 20260408150700), and a handler so a notification can never block the
--   thing it is about. What this file does NOT copy is that trigger's bare
--   `EXCEPTION WHEN OTHERS` — see §3, THE CANCEL CODES.
--
-- ── NFR-COPY-1 ──────────────────────────────────────────────────────────────
-- Neither `cohort_applications.bio` nor `tally_data` is referenced anywhere in
-- this file, and §4's RETURNS TABLE is a pinned column list that carries no
-- email, no phone and no essay. Grep BOTH names against this file; both are
-- clean, and the projection is the reason they stay that way.
--
-- ── MEMBER-1 ────────────────────────────────────────────────────────────────
-- `pre_member` holds an announcements-READ grant, so the lobby is notified and
-- can read §4 — but only for the OFFERING-LEVEL rows, which is exactly what
-- R0's `ann_member_read` policy grants at the table. §2 restates that policy's
-- predicate row-side; §4 restates `get_cohort_room`'s. Neither widens it.
--
-- ── WHAT THE CLIENT OWES THIS FILE, and does not pay yet ────────────────────
-- Two gaps live OUTSIDE this task's file lane and are recorded here because
-- this is the file that creates them. Both are cosmetic; neither loses data.
--   1. `src/hooks/useNotifications.ts` subscribes to `{ event: "INSERT" }`
--      only, so the cap's REFRESH arm (§3) fires no realtime event. See §3.
--   2. `src/components/NotificationDropdown.tsx`'s `TYPE_META` has no
--      `room_announcement` entry, so a room notice draws the generic `Bell`
--      from `FALLBACK_META` instead of the `Megaphone` that file already
--      imports for the sibling `admin_announcement` type. One line in a file
--      R3-T1 does not own; hand it to whoever next opens the inbox.
--
-- 🔴 Do NOT apply to prod without the shadow project + council + a quiet
--    `public.notifications`. §1 is the statement that wants the quiet window.
-- ============================================================================


----------------------------------------------------------------------
-- 1. THE VOLUME CAP NEEDS AN INDEX, AND THE KEY IT INDEXES MUST BE IMMUTABLE.
--
--    The spec is "at most one UNREAD notification per room". `public.notifications`
--    (20260410160000_add_notifications_inbox.sql, re-shaped from the older
--    20260405063128) carries NO unique index of any kind and NO offering or room
--    column at all — its columns are id, user_id, type, title, body, link,
--    link_url, is_read, read_at, created_at. So the cap needs (a) a deterministic
--    per-room key in an existing column and (b) something that enforces one row
--    for it. `link` is that column.
--
--    ⚠️ THE STRING IN IT IS THE OFFERING'S CANONICAL ADDRESS,
--    `/cohort/:offering_id`, AND NOT `/room/:slug`. That is the cap itself, not
--    a formatting preference, because a uniqueness key that MUTATES while a row
--    is unread is not a uniqueness key at all:
--      · A slug is mutable for the life of an unread notice, and by ordinary
--        operator action rather than by a bug. Creating the FIRST
--        `cohort_room_configs` row for an offering flips every member's address
--        from `/cohort/<uuid>` to `/room/<slug>`; adding a batch-level override
--        config flips THAT batch's members from the offering slug to the batch
--        slug (`ORDER BY (cfg.batch_id IS NOT NULL) DESC`, the precedence
--        `get_cohort_room` and `get_my_cohort_rooms` both apply). Neither has a
--        writer in `src/pages/admin` or `supabase/functions`, so both are done
--        by hand, mid-rollout, exactly while notices are unread.
--      · Keyed on a slug, every one of those flips silently re-arms the cap:
--        §3's UPDATE arm matches zero rows, its `NOT EXISTS` arm is therefore
--        true, and every member still holding the first notice takes a SECOND
--        unread row for the same room. That is the "three posts, three badges"
--        outcome the spec exists to forbid, produced by a config edit rather
--        than by a post.
--      · `offering_id` is the announcement's own column, is a primary key
--        elsewhere, and never changes. The address built from it is a REAL
--        route: `/cohort/:offeringId` is mounted in src/App.tsx precisely
--        because already-sent notification emails link it (R-D9), and
--        `CohortRoomRedirect` (src/pages/room/RoomShell.tsx) resolves it to
--        THAT caller's own room slug — including their batch override — before
--        falling back to the legacy cohort dashboard. So the immutable key
--        costs the recipient one redirect and gives up no navigation at all.
--
--    ⚠️ THE PREDICATE IS SCOPED TO `type = 'room_announcement'` ON PURPOSE, and
--    dropping that term would be a production incident rather than a tidy-up.
--    AdminAnnouncements.tsx inserts rows with type 'admin_announcement' and a
--    free-text `link` an admin typed. A cap keyed on (user_id, link) alone would
--    make the SECOND admin announcement carrying the same link fail with 23505
--    for every recipient who had not yet read the first — a working, shipped
--    surface broken by an index added for a different feature. Scoped this way,
--    the only rows the index constrains are the ones §3 writes.
--
--    WHY THE COLUMN IS `is_read` AND NOT `read`: the inbox's live column is
--    `is_read` (20260410160000 adds it and backfills from the legacy `read_at`);
--    `read` does not exist on this table at all.
--
--    GUARDED ON 20260729100200 §0's PATTERN, for its reason: a non-CONCURRENT
--    `CREATE INDEX` takes SHARE on `public.notifications` and every WRITE queues
--    behind it, and on the `npx -y supabase@latest db push` path the session
--    `lock_timeout` is 0 (wait forever). The probe — not the `IF NOT EXISTS` —
--    is what avoids taking the lock at all on a project that already carries the
--    index: `CREATE INDEX IF NOT EXISTS` opens and locks the table BEFORE it
--    looks the name up.
--
--    WHAT DEGRADATION COSTS HERE, stated because it is NOT the same answer
--    20260729100200 §0 gives. There the missing index cost a seq scan and
--    nothing else. Here it costs the RACE arm of the cap: §3 caps by
--    `WHERE NOT EXISTS (an unread row)` FIRST, which holds for serial traffic on
--    its own, and this index is what makes two mentors posting in the same
--    instant still produce one badge. Without it the worst case is a member
--    holding two unread notices for one room — a cosmetic miscount, never a
--    leak, and never a lost notification. §3 is written so that it does NOT
--    depend on the index existing: it uses a bare `ON CONFLICT DO NOTHING` with
--    no inference clause, which needs no arbiter index and therefore cannot
--    raise 42P10 when the index is absent.
----------------------------------------------------------------------
DO $$
DECLARE
  v_prev_lock_timeout text;
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND to_regclass('public.notifications_room_unread_uniq') IS NULL
  THEN
    BEGIN
      v_prev_lock_timeout := current_setting('lock_timeout', true);
      PERFORM set_config('lock_timeout', '1s', true);   -- LOCAL: this txn only

      CREATE UNIQUE INDEX IF NOT EXISTS notifications_room_unread_uniq
        ON public.notifications (user_id, link)
        WHERE is_read = false AND type = 'room_announcement';

      PERFORM set_config('lock_timeout',
                         COALESCE(NULLIF(v_prev_lock_timeout, ''), '0'), true);
    EXCEPTION WHEN lock_not_available OR query_canceled OR assert_failure
                OR admin_shutdown OR crash_shutdown OR cannot_connect_now
                OR others THEN
      -- lock_not_available (55P03) is what the 1s lock_timeout raises;
      -- query_canceled (57014) is a statement_timeout or a pg_cancel_backend()
      -- aimed at the push and is NAMED because `others` does not trap it
      -- (20260729100000 contract note 10). The subtransaction rollback also
      -- restores lock_timeout, so nothing is left set for the rest of this file.
      RAISE WARNING 'room announcements: could not create notifications_room_unread_uniq (%) [%] — announcements still fan out and are still capped for serial posts, but two SIMULTANEOUS posts can leave a member with two unread notices for one room. Another db push will NOT fix this: re-run this DO block by hand when public.notifications is quiet (20260729100000 contract note 11), then confirm with SELECT to_regclass(''public.notifications_room_unread_uniq'').',
        SQLERRM, SQLSTATE;
    END;
  END IF;
EXCEPTION WHEN lock_not_available OR query_canceled OR assert_failure
            OR admin_shutdown OR crash_shutdown OR cannot_connect_now
            OR others THEN
  -- Covers the two to_regclass probes, which take no relation lock.
  RAISE WARNING 'room announcements: notifications_room_unread_uniq probe failed (%) [%] — index not created; re-run this DO block by hand.', SQLERRM, SQLSTATE;
END $$;


----------------------------------------------------------------------
-- 2. room_announcement_targets(offering, batch, author) — WHO a notice reaches.
--
--    ONE ROW PER USER, WHICH IS THE WHOLE POINT. The brief's edge case is an
--    announcement with `batch_id NULL` spanning two batches: it must notify each
--    member EXACTLY ONCE, not once per batch. `cohort_room_members` is keyed
--    (user_id, offering_id, batch_id) for batch-scoped rows
--    (`room_member_unique_batch`, 20260729100000), so a user who sits in two
--    batches of one offering holds two rows and a naive join fans out twice.
--    `DISTINCT ON (m.user_id)` collapses that.
--
--    IT RETURNS user_id AND NOTHING ELSE. An earlier revision also resolved a
--    per-user `room_link` through `cohort_room_configs`, which made the cap's
--    key depend on a slug that an operator can change while notices are unread
--    (§1, THE STRING IN IT). The link is now derived from the announcement's own
--    `offering_id` in §3, one string for the whole fan-out, so this function has
--    no reason to read the config table at all.
--
--    THE PREDICATE IS `ann_member_read` READ FROM THE ROW'S SIDE. The policy asks
--    "may THIS caller read that row?"; this asks "does that row reach THIS
--    member?". Both arms are restated rather than delegated, because the helpers
--    key off auth.uid() and there is no auth.uid() inside a trigger fired by
--    someone else's INSERT:
--      · enrolled tiers (member/alumni/mentor/host) — an offering-level notice
--        (batch NULL) reaches all of them; a batch-scoped one reaches that
--        batch, plus NULL-batch mentors/hosts, who hold the offering wide;
--      · pre_member (lobby) — offering-level notices only. A lobby row is never
--        batch-scoped (R-1 contract note 4), so the second arm is defensive: it
--        keeps a hand-inserted batch-scoped lobby row out of another batch's
--        noticeboard rather than assuming one cannot exist.
--    A revoked member (status <> 'active') is matched by neither arm and is
--    notified about nothing, which matches every read policy in R0.
--
--    THE AUTHOR IS EXCLUDED. A mentor does not need a badge for their own post.
--    The `p_author IS NULL` arm matters twice: `author_id` is nullable with ON
--    DELETE SET NULL (20260729100100 §1) so a bare `m.user_id <> p_author` would
--    evaluate NULL for every row and notify nobody, AND §3's retract arm passes
--    NULL deliberately to reach EVERY recipient of the notice being pulled.
--
--    NOT REACHABLE BY ANY CLIENT ROLE, AND THAT TAKES TWO REVOKES. This is
--    exactly 20260729100200's ungranted class: a SECURITY DEFINER function whose
--    scope is DECIDED BY ITS ARGUMENTS asserts nothing, so it must not be
--    callable by a client. `REVOKE ... FROM PUBLIC` ALONE DOES NOT ACHIEVE THAT
--    on a hosted Supabase project: the bootstrap runs `ALTER DEFAULT PRIVILEGES
--    IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated,
--    service_role`, which attaches grants directly TO THOSE ROLES on every new
--    function in `public` — grants a PUBLIC revoke cannot touch, and which
--    both CREATE OR REPLACE and the DROP/CREATE below re-apply. Left at one
--    revoke, any logged-in user could POST /rest/v1/rpc/room_announcement_targets
--    with an arbitrary p_offering and read back the complete user_id list of that
--    cohort, lobby included, unscoped by batch and unasserted — strictly wider
--    than `get_room_roster`, which asserts and is batch-scoped (ROSTER-SCOPE-1).
--    R0 handles the two functions in this same class with a second revoke line
--    each (`grep -n 'FROM anon, authenticated' 20260729100200_cohort_room_rpcs.sql`);
--    so does this one, and qa-harness/announcement-fanout.sql C9 asserts the
--    result with has_function_privilege rather than trusting the statement.
--    §3 reaches it as the trigger's definer; the SQL harness reaches it as the
--    project owner. Nobody else reaches it at all.
--
--    THE DROP IS LOAD-BEARING ON A RE-APPLY. A shadow project that already ran
--    an earlier revision of this file carries the two-column
--    `RETURNS TABLE (user_id uuid, room_link text)`, and `CREATE OR REPLACE`
--    cannot narrow a function's result type (42P13). Dropping first is the only
--    way this file is idempotent; the two REVOKEs below re-apply afterwards, so
--    the privileges the DROP discards do not survive as a hole.
--
--    `ROWS 200` FOR THE SAME REASON `cohort_room_roster_ids` CARRIES IT. A
--    SECURITY DEFINER SQL function can never be inlined, so this is always a
--    Function Scan, and without an estimate Postgres assumes the 1000-row
--    default. §3 joins it against `public.notifications` — a shipped table that
--    only grows — and a 5x over-estimate is enough to tip those joins off a
--    per-row index probe and onto a hash join over a scan of the inbox. 200 is
--    a room's realistic ceiling, and being wrong high costs nothing here.
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.room_announcement_targets(uuid, uuid, uuid);

CREATE FUNCTION public.room_announcement_targets(
  p_offering uuid,
  p_batch uuid,
  p_author uuid
)
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER ROWS 200 SET search_path = public AS $$
  SELECT DISTINCT m.user_id
  FROM public.cohort_room_members m
  WHERE m.offering_id = p_offering
    AND m.status = 'active'
    AND (p_author IS NULL OR m.user_id <> p_author)
    AND (
      (
        m.role IN ('member','alumni','mentor','host')
        AND (
          p_batch IS NULL
          OR m.batch_id = p_batch
          OR (m.batch_id IS NULL AND m.role IN ('mentor','host'))
        )
      )
      OR (
        m.role = 'pre_member'
        AND (p_batch IS NULL OR m.batch_id = p_batch)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.room_announcement_targets(uuid, uuid, uuid) FROM PUBLIC;
-- Explicit, and NOT redundant with the line above: Supabase's default
-- privileges grant EXECUTE to these two roles directly, so a PUBLIC revoke
-- leaves the function client-reachable. Same doctrine, same wording, same
-- reason as cohort_room_roster_ids and cohort_room_allowed_channels in
-- 20260729100200. Asserted by announcement-fanout.sql C9.
REVOKE EXECUTE ON FUNCTION public.room_announcement_targets(uuid, uuid, uuid) FROM anon, authenticated;

COMMENT ON FUNCTION public.room_announcement_targets(uuid, uuid, uuid) IS
  'Recipients of one cohort announcement, ONE ROW PER USER. Restates '
  'ann_member_read row-side (an offering-wide notice reaches every active tier '
  'including the pre_member lobby; a batch-scoped one reaches that batch plus '
  'NULL-batch mentors/hosts). The author is excluded unless p_author is NULL. '
  'Reachable by NO client role — REVOKEd from PUBLIC and from anon/authenticated, '
  'because it enumerates a roster and asserts nothing.';


----------------------------------------------------------------------
-- 3. notify_room_on_announcement() + trigger cohort_announcement_notify.
--
--    THE ROOM'S ADDRESS IS BUILT ONCE, from the announcement's own
--    `offering_id`, and is the same string for every recipient: see §1 for why
--    it is `/cohort/:offering_id` and not the room slug. It is never NULL, and
--    that matters twice over — it is the cap's key, and NULLs are distinct in a
--    unique index, so a NULL link would silently switch the cap off.
--
--    THE VOLUME CAP, in two statements and no more:
--      (a) REFRESH — every recipient who already holds an UNREAD notice for this
--          room gets that row rewritten to the new notice and floated to the top
--          of their inbox (`useNotifications` orders by created_at DESC). Three
--          posts in an hour therefore produce ONE badge showing the newest, not
--          three badges.
--      (b) INSERT — everyone else gets a row. `NOT EXISTS (an unread row)` is
--          what caps it; §1's index is the race backstop. `ON CONFLICT DO
--          NOTHING` is written with NO conflict target on purpose: a bare form
--          needs no arbiter index, so this statement behaves identically whether
--          or not §1's index landed.
--    A read notice is deliberately NOT reused. Once a member has been to the
--    room, the next notice is a NEW event and deserves a new badge.
--
--    THE RETRACT ARM. R0 gives mentors and hosts an UPDATE verb whose only
--    purpose is pulling a wrong notice (`ann_host_retract` +
--    `_room_announcement_pin_columns`, 20260729100100), and R3-T1 puts that
--    lever in the room's UI. A retraction that left the fan-out alone would
--    leave the mistake's TITLE sitting in every member's inbox pointing at a
--    board that no longer shows it, which is most of what retraction is for. So
--    a retract deletes the unread badges that are still showing THAT notice —
--    matched on title AND body, so a badge that has already been refreshed to a
--    LATER notice is untouched. Read rows are left exactly where they are: they
--    are the member's own history, and rewriting history is not retraction.
--    Nothing is restored when an admin un-deletes a row; the next post earns a
--    fresh badge, which is the same rule as everywhere else in this file.
--
--    ⚠️ KNOWN CONSEQUENCE OF THE REFRESH ARM, stated rather than hidden: it is
--    invisible to a client that already has the app open. `useNotifications.ts`
--    subscribes to `{ event: "INSERT", table: "notifications" }` only, so for a
--    recipient who already holds an unread room notice, notices 2..N of an hour
--    take the UPDATE path and fire NO realtime event — their inbox keeps showing
--    the FIRST title until the next fetch or reload. Nothing is lost (the board
--    itself is correct, the badge count is correct, and the row carries the
--    newest notice the moment anything refetches) and this is the cap working as
--    specified rather than a bug in it. Widening that subscription to
--    `event: "*"` is the fix, and it belongs to whoever owns
--    src/hooks/useNotifications.ts — R3-T1 does not, and a shipped inbox is the
--    wrong thing for the noticeboard task to reach into. The retract arm's
--    DELETE has the same blind spot for the same reason.
--
--    ⚠️ THE CANCEL CODES. `EXCEPTION WHEN OTHERS` does NOT trap query_canceled
--    (57014) — the R0 lesson, 20260729100000 contract note 10. The mirrored
--    community trigger's bare `WHEN OTHERS` therefore leaves a reader unable to
--    tell "cancels fall through" from "nobody thought about cancels". Here it is
--    written out: a cancel or a shutdown is the OPERATOR's instruction and is
--    re-raised so the statement really stops, and everything else degrades to a
--    WARNING so a notification failure can never roll back the announcement a
--    mentor just posted, nor the retraction of one. Naming them in the first
--    branch also means adding a later `WHEN OTHERS`-shaped fix cannot silently
--    start swallowing cancels.
--
--    WHY THE UPDATE ARM IS NARROW: the board is append-only for its TEXT
--    (`_room_announcement_pin_columns` pins title, body, offering, batch and
--    created_at for every non-admin), so the only UPDATEs worth reacting to are
--    the retraction transition. A pin, an unpin and an admin edit all fall
--    through and notify nobody, which is correct: re-ordering the board is not
--    news.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_room_on_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_title text;
  v_body  text;
  v_link  text;
BEGIN
  -- The immutable per-room key, and a route that resolves to this caller's own
  -- room (CohortRoomRedirect, src/pages/room/RoomShell.tsx). See §1.
  v_link  := '/cohort/' || NEW.offering_id::text;
  v_title := COALESCE(NULLIF(btrim(NEW.title), ''), 'New announcement');
  v_body  := LEFT(btrim(COALESCE(NEW.body, '')), 140);

  IF TG_OP = 'UPDATE' THEN
    -- Retraction, and only retraction: a pin or an unpin notifies nobody.
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      DELETE FROM public.notifications n
      WHERE n.type    = 'room_announcement'
        AND n.link    = v_link
        AND n.is_read = false
        AND n.title   = v_title
        AND COALESCE(n.body, '') = v_body;
    END IF;

    RETURN NEW;
  END IF;

  -- A row that arrives already retracted is not news.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.notifications n
  SET title      = v_title,
      body       = v_body,
      created_at = now()
  FROM public.room_announcement_targets(NEW.offering_id, NEW.batch_id, NEW.author_id) t
  WHERE n.user_id = t.user_id
    AND n.link    = v_link
    AND n.type    = 'room_announcement'
    AND n.is_read = false;

  INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
  SELECT t.user_id, 'room_announcement', v_title, v_body, v_link, false
  FROM public.room_announcement_targets(NEW.offering_id, NEW.batch_id, NEW.author_id) t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = t.user_id
      AND n.link    = v_link
      AND n.type    = 'room_announcement'
      AND n.is_read = false
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;

EXCEPTION
  WHEN query_canceled OR assert_failure OR admin_shutdown
       OR crash_shutdown OR cannot_connect_now THEN
    -- 57014 and the shutdown conditions are the operator's, not ours to absorb.
    -- Named explicitly because `OTHERS` below does not trap 57014 at all.
    RAISE;
  WHEN OTHERS THEN
    -- A notification must never block the announcement itself.
    RAISE WARNING 'room announcements: fan-out failed for announcement % (%) [%] — the notice is posted and readable in the room; only the inbox badge is missing.',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cohort_announcement_notify ON public.cohort_announcements;
CREATE TRIGGER cohort_announcement_notify
  AFTER INSERT OR UPDATE OF deleted_at ON public.cohort_announcements
  FOR EACH ROW EXECUTE FUNCTION public.notify_room_on_announcement();


----------------------------------------------------------------------
-- 4. get_room_announcements(offering, limit, offset) — the paged board read.
--
--    WHY THIS EXISTS AT ALL, given `get_cohort_room` already returns an
--    `announcements` key. Two reasons, and neither is solvable client-side:
--
--    (a) THE AUTHOR. The envelope's projection is a bare `to_jsonb(a)` (the
--        'announcements' key in `get_cohort_room`, 20260729100200), and
--        `cohort_announcements` stores `author_id` and nothing else about the
--        author — no name, no role. Resolving it through `get_room_roster` does
--        not work in the lobby, where that RPC raises 42501 for a pre_member,
--        so the one tier whose whole whitelist is the noticeboard is exactly the
--        tier that could not render a byline. The projection is extended HERE
--        rather than by rewriting another task's function.
--    (b) THE CAP. The envelope's list is `ORDER BY a.is_pinned DESC,
--        a.created_at DESC LIMIT 10`. A board rendered off it silently truncates
--        at ten, and a twelve-week cohort passes ten notices. This read pages,
--        and `p_offset` is REACHED: `useRoomAnnouncements` is an infinite query
--        whose "Show older notices" control asks for the next page, so a board
--        with 41 notices on it is one tap away from all 41 rather than silently
--        forty. Anything that replaces that hook with a single fixed-limit fetch
--        re-creates exactly the truncation this section was written to remove,
--        one order of magnitude further out.
--
--    THE COLUMN LIST IS THE CONTRACT (NFR-COPY-1). Ten columns, pinned in the
--    signature: the announcement's own row plus `author_name` and `author_role`.
--    NEVER email, NEVER phone, NEVER `cohort_applications.bio` and never
--    `tally_data`. An author is always a mentor, a host or an admin —
--    `ann_host_insert` admits nobody else — so no member identity is disclosed
--    here that `get_room_roster` does not already disclose to members, and the
--    lobby learns only which staff member wrote the notice it is already allowed
--    to read.
--
--    SCOPE is `get_cohort_room`'s, restated: offering-level rows for anyone with
--    a grant, this batch's rows for a batch-scoped caller, every batch's rows for
--    offering-wide staff and admins. Access is asserted FIRST and raises 42501,
--    so "denied" and "empty" stay different answers (the rule
--    src/hooks/useCohortRooms.ts is built on).
--
--    `p_limit` is clamped rather than trusted: a client asking for a million
--    rows gets a hundred.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_room_announcements(
  p_offering uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  offering_id uuid,
  batch_id uuid,
  title text,
  body text,
  is_pinned boolean,
  created_at timestamptz,
  author_id uuid,
  author_name text,
  author_role text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch  uuid;
  v_wide   boolean;
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  -- Assert access FIRST. Full member OR lobby (pre_member); an `accepted`
  -- applicant holds neither and raises, exactly as the envelope does.
  IF NOT (public.cohort_room_is_member(p_offering)
          OR public.cohort_room_in_lobby(p_offering)) THEN
    RAISE EXCEPTION 'not a member of this room'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.batch_id, s.offering_wide INTO v_batch, v_wide
  FROM public.cohort_room_caller_scope(p_offering) s;

  -- An admin with no membership row gets no scope row, so the helper that ORs
  -- in is_admin() has to be asked directly. Same COALESCE `get_cohort_room` uses.
  v_wide := COALESCE(v_wide, public.cohort_room_is_offering_wide(p_offering));

  RETURN QUERY
  SELECT
    a.id,
    a.offering_id,
    a.batch_id,
    a.title,
    a.body,
    a.is_pinned,
    a.created_at,
    a.author_id,
    u.full_name,
    ar.role
  FROM public.cohort_announcements a
  LEFT JOIN public.users u ON u.id = a.author_id
  -- The author's standing IN THIS ROOM, not their platform role. A host outranks
  -- a mentor when someone holds both; an admin with no room row resolves NULL
  -- and the client renders the neutral wordmark.
  LEFT JOIN LATERAL (
    SELECT m.role
    FROM public.cohort_room_members m
    WHERE m.user_id = a.author_id
      AND m.offering_id = a.offering_id
      AND m.status = 'active'
    ORDER BY (m.role = 'host') DESC, (m.role = 'mentor') DESC, m.created_at
    LIMIT 1
  ) ar ON true
  WHERE a.offering_id = p_offering
    AND (a.batch_id IS NULL OR v_wide OR a.batch_id = v_batch)
    AND a.deleted_at IS NULL
  ORDER BY a.is_pinned DESC, a.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_room_announcements(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_room_announcements(uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_room_announcements(uuid, integer, integer) IS
  'Paged cohort noticeboard, pinned first. Scope mirrors get_cohort_room: '
  'offering-level rows for any grant, own batch for a batch-scoped caller, '
  'every batch for offering-wide staff. Raises 42501 for a caller with no '
  'grant. The projection is PINNED at ten columns and adds author_name + '
  'author_role to what the envelope carries; it never returns email, phone, '
  'cohort_applications.bio or tally_data (NFR-COPY-1).';


-- ============================================================================
-- REVERSAL (paste by hand; deliberately not executed here)
--
--   DROP TRIGGER IF EXISTS cohort_announcement_notify ON public.cohort_announcements;
--   DROP FUNCTION IF EXISTS public.notify_room_on_announcement() CASCADE;
--   DROP FUNCTION IF EXISTS public.get_room_announcements(uuid, integer, integer);
--   DROP FUNCTION IF EXISTS public.room_announcement_targets(uuid, uuid, uuid);
--   DROP INDEX IF EXISTS public.notifications_room_unread_uniq;
--
-- The DROP INDEX runs to completion whether or not §1 landed, so a degraded
-- apply is still cleanly reversible.
-- ============================================================================
