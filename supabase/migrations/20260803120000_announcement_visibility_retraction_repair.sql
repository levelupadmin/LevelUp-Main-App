-- ============================================================================
-- COHORT ROOM ANNOUNCEMENTS — canonical visibility + safe retraction repair
--
-- This is intentionally a NEW version after 20260801120000. That migration was
-- edited in place during review, but Supabase records versions rather than
-- checksums; an environment that ran either earlier body would otherwise skip
-- the repair. The earlier file remains history. This file is authoritative.
--
-- The defect class was predicate drift. "Can user U read announcement A?" had
-- four independent implementations, and the newest omitted active status and
-- offering-wide mentor/host scope. The omission could copy a revoked batch's
-- private title and body into an active member's shipped inbox. The internal
-- grant relation below is now the one source of row visibility. RLS, recipient
-- fan-out, the board RPC, legacy reconciliation and retraction all delegate to it.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. ONE announcement-read grant relation.
--
-- The view expands each active membership into the announcement row scopes it
-- grants: NULL for offering-level notices, a concrete batch for exact-batch
-- access, and every offering batch for NULL-batch mentors/hosts. It is revoked
-- from every client role because exposing it would enumerate memberships.
--
-- A relation rather than a scalar membership function is deliberate. Retraction
-- scans announcements x recipients; a SECURITY DEFINER scalar cannot inline and
-- measured at 3.48 s / 9.62 s for 2,000 / 5,001 notices x 200 members. Joining
-- this one relation lets PostgreSQL plan the same predicate set-wise.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.room_announcement_read_grants AS
  -- Every active room tier reads offering-level announcements.
  SELECT DISTINCT m.user_id, m.offering_id, NULL::uuid AS batch_id
  FROM public.cohort_room_members m
  WHERE m.status = 'active'
    AND m.role IN ('member','alumni','mentor','host','pre_member')

  UNION

  -- A concrete membership grants that concrete batch. This includes the
  -- defensive hand-inserted batch-scoped pre_member shape R0 already permits.
  SELECT DISTINCT m.user_id, m.offering_id, m.batch_id
  FROM public.cohort_room_members m
  WHERE m.status = 'active'
    AND m.batch_id IS NOT NULL
    AND m.role IN ('member','alumni','mentor','host','pre_member')

  UNION

  -- NULL-batch mentors/hosts are offering-wide, so expand them across the
  -- offering's real batches. Announcement batch_id is FK-backed by this table.
  SELECT DISTINCT m.user_id, m.offering_id, b.id AS batch_id
  FROM public.cohort_room_members m
  JOIN public.cohort_batches b ON b.offering_id = m.offering_id
  WHERE m.status = 'active'
    AND m.batch_id IS NULL
    AND m.role IN ('mentor','host');

REVOKE ALL ON TABLE public.room_announcement_read_grants FROM PUBLIC, anon, authenticated;
REVOKE SELECT (user_id, offering_id, batch_id)
  ON public.room_announcement_read_grants FROM PUBLIC, anon, authenticated;

COMMENT ON VIEW public.room_announcement_read_grants IS
  'THE ONE announcement visibility relation: exact (user, offering, row batch) '
  'grants derived only from active membership, including offering-level lobby '
  'and NULL-batch mentor/host expansion. Revoked from every client role.';

CREATE OR REPLACE FUNCTION public.room_announcement_user_can_read(
  p_user uuid,
  p_offering uuid,
  p_batch uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.room_announcement_read_grants g
    WHERE g.user_id = p_user
      AND g.offering_id = p_offering
      AND g.batch_id IS NOT DISTINCT FROM p_batch
  );
$$;

REVOKE ALL ON FUNCTION public.room_announcement_user_can_read(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.room_announcement_user_can_read(uuid, uuid, uuid) FROM anon, authenticated;

COMMENT ON FUNCTION public.room_announcement_user_can_read(uuid, uuid, uuid) IS
  'Boolean resolver over THE ONE room_announcement_read_grants relation. '
  'Resolver-internal and revoked from all client roles because p_user is arbitrary.';

CREATE OR REPLACE FUNCTION public.cohort_room_can_read_announcement(
  p_offering uuid,
  p_batch uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
      OR public.room_announcement_user_can_read(auth.uid(), p_offering, p_batch);
$$;

REVOKE ALL ON FUNCTION public.cohort_room_can_read_announcement(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cohort_room_can_read_announcement(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.cohort_room_can_read_announcement(uuid, uuid) IS
  'Current-caller wrapper over THE ONE announcement visibility predicate, with '
  'the established admin lift. Safe for RLS and client-facing board RPCs.';

-- Verify the two distinct ACL contracts after applying. Supabase grants anon
-- and authenticated directly through default ACLs, so PUBLIC-only revokes are
-- insufficient and a successful REVOKE statement alone proves nothing.
DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.room_announcement_user_can_read(uuid, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.room_announcement_user_can_read(uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'room_announcement_user_can_read must not be executable by a client role';
  END IF;

  IF has_function_privilege('anon',
       'public.cohort_room_can_read_announcement(uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.cohort_room_can_read_announcement(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'cohort_room_can_read_announcement ACL must be authenticated-only';
  END IF;

  IF has_table_privilege('anon',
       'public.room_announcement_read_grants', 'SELECT')
     OR has_table_privilege('authenticated',
       'public.room_announcement_read_grants', 'SELECT')
     OR has_any_column_privilege('anon',
       'public.room_announcement_read_grants', 'SELECT')
     OR has_any_column_privilege('authenticated',
       'public.room_announcement_read_grants', 'SELECT') THEN
    RAISE EXCEPTION 'room_announcement_read_grants must not be selectable by a client role';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. RLS and fan-out use the same predicate.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ann_member_read ON public.cohort_announcements;
CREATE POLICY ann_member_read ON public.cohort_announcements FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND public.cohort_room_can_read_announcement(offering_id, batch_id)
  );

CREATE OR REPLACE FUNCTION public.room_announcement_targets(
  p_offering uuid,
  p_batch uuid,
  p_author uuid
)
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER ROWS 200 SET search_path = public AS $$
  SELECT DISTINCT g.user_id
  FROM public.room_announcement_read_grants g
  WHERE g.offering_id = p_offering
    AND g.batch_id IS NOT DISTINCT FROM p_batch
    AND (p_author IS NULL OR g.user_id <> p_author);
$$;

REVOKE ALL ON FUNCTION public.room_announcement_targets(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.room_announcement_targets(uuid, uuid, uuid) FROM anon, authenticated;

COMMENT ON FUNCTION public.room_announcement_targets(uuid, uuid, uuid) IS
  'Recipients of one cohort announcement, one row per user. Candidate users '
  'come from THE ONE announcement visibility grant relation, which decides '
  'eligibility. The author is excluded. Revoked from every client role.';


-- ---------------------------------------------------------------------------
-- 3. Reconcile identities written by either pre-repair trigger revision.
--
-- Revision 1 left link_url NULL. Revision 2 wrote a non-navigable
-- cohort_announcement:<uuid> pseudo-link. For every unread legacy room badge,
-- re-point to the newest live notice the recipient can still read and has not
-- already read; delete the badge if no such notice exists. This also scrubs any
-- cross-batch content a vulnerable retraction wrote before this repair landed.
-- Read history keeps its exact identity where available, but converts it to a
-- valid room URL so a future link fallback cannot navigate to a broken scheme.
-- ---------------------------------------------------------------------------
WITH replacements AS MATERIALIZED (
  SELECT
    n.id AS notification_id,
    a.id AS announcement_id,
    a.title,
    a.body,
    a.created_at AS announcement_created_at
  FROM public.notifications n
  CROSS JOIN LATERAL (
    SELECT a.id, a.title, a.body, a.created_at
    FROM public.cohort_announcements a
    WHERE n.link = '/cohort/' || a.offering_id::text
      AND a.deleted_at IS NULL
      AND EXISTS (
            SELECT 1
            FROM public.room_announcement_read_grants g
            WHERE g.user_id = n.user_id
              AND g.offering_id = a.offering_id
              AND g.batch_id IS NOT DISTINCT FROM a.batch_id
          )
      -- A badge that was already read is the recipient's lower bound. Never
      -- manufacture a second unread copy of that notice during reconciliation.
      AND a.created_at > COALESCE((
            SELECT max(h.created_at)
            FROM public.notifications h
            WHERE h.user_id = n.user_id
              AND h.type = 'room_announcement'
              AND h.link = n.link
              AND h.is_read = true
          ), '-infinity'::timestamptz)
      AND NOT EXISTS (
            SELECT 1
            FROM public.notifications h
            WHERE h.user_id = n.user_id
              AND h.type = 'room_announcement'
              AND h.link = n.link
              AND h.is_read = true
              AND (
                h.link_url = 'cohort_announcement:' || a.id::text
                OR h.link_url = n.link || '?announcement=' || a.id::text
              )
          )
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 1
  ) a
  WHERE n.type = 'room_announcement'
    AND n.is_read = false
    AND (n.link_url IS NULL OR n.link_url LIKE 'cohort_announcement:%')
)
UPDATE public.notifications n
SET title = COALESCE(NULLIF(btrim(r.title), ''), 'New announcement'),
    body = LEFT(btrim(COALESCE(r.body, '')), 140),
    link_url = n.link || '?announcement=' || r.announcement_id::text,
    created_at = r.announcement_created_at
FROM replacements r
WHERE n.id = r.notification_id;

-- Any unread legacy badge left behind has no live, still-unread survivor.
DELETE FROM public.notifications n
WHERE n.type = 'room_announcement'
  AND n.is_read = false
  AND (n.link_url IS NULL OR n.link_url LIKE 'cohort_announcement:%');

-- Read rows are history. Keep them, but make their stored identity a valid URL.
UPDATE public.notifications n
SET link_url = n.link || '?announcement=' ||
               substring(n.link_url from '^cohort_announcement:(.+)$')
WHERE n.type = 'room_announcement'
  AND n.is_read = true
  AND n.link_url ~ '^cohort_announcement:[0-9a-fA-F-]{36}$';


-- ---------------------------------------------------------------------------
-- 4. Authoritative trigger.
--
-- Retraction keys only on the badge identity. It must not re-evaluate whether
-- the recipient still belongs to the retracted notice's audience: revocation
-- and batch transfer are exactly when cleanup is most important. A survivor is
-- chosen through THE ONE grant relation and must not predate the recipient's latest
-- read room badge. Its own created_at is retained, so inbox and board ordering
-- agree and an old notice never becomes "just now".
--
-- Final repeated cost on the local PostgreSQL 17 shadow, without a new index:
-- 279-298 ms at 2,000 live notices x 200 members; 1,192-1,202 ms at 5,001 x 200.
-- The direct scalar-helper version measured 3,482.55 / 9,616.95 ms and was not
-- retained. The set-wise relation is the performance boundary for this repair.
-- ---------------------------------------------------------------------------
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
  v_self  text;
BEGIN
  v_link  := '/cohort/' || NEW.offering_id::text;
  v_title := COALESCE(NULLIF(btrim(NEW.title), ''), 'New announcement');
  v_body  := LEFT(btrim(COALESCE(NEW.body, '')), 140);
  -- Valid navigation if a future client falls back to link_url, while retaining
  -- a stable per-announcement identity for exact retraction cleanup.
  v_self  := v_link || '?announcement=' || NEW.id::text;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      WITH replacements AS MATERIALIZED (
        SELECT
          n.id AS notification_id,
          a.id AS announcement_id,
          a.title,
          a.body,
          a.created_at AS announcement_created_at
        FROM public.notifications n
        CROSS JOIN LATERAL (
          SELECT a.id, a.title, a.body, a.created_at
          FROM public.cohort_announcements a
          WHERE a.offering_id = NEW.offering_id
            AND a.deleted_at IS NULL
            AND a.id <> NEW.id
            AND EXISTS (
                  SELECT 1
                  FROM public.room_announcement_read_grants g
                  WHERE g.user_id = n.user_id
                    AND g.offering_id = a.offering_id
                    AND g.batch_id IS NOT DISTINCT FROM a.batch_id
                )
            AND a.created_at > COALESCE((
                  SELECT max(h.created_at)
                  FROM public.notifications h
                  WHERE h.user_id = n.user_id
                    AND h.type = 'room_announcement'
                    AND h.link = v_link
                    AND h.is_read = true
                ), '-infinity'::timestamptz)
            AND NOT EXISTS (
                  SELECT 1
                  FROM public.notifications h
                  WHERE h.user_id = n.user_id
                    AND h.type = 'room_announcement'
                    AND h.link = v_link
                    AND h.is_read = true
                    AND h.link_url = v_link || '?announcement=' || a.id::text
                )
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT 1
        ) a
        WHERE n.type = 'room_announcement'
          AND n.link = v_link
          AND n.is_read = false
          AND n.link_url = v_self
      )
      UPDATE public.notifications n
      SET title = COALESCE(NULLIF(btrim(r.title), ''), 'New announcement'),
          body = LEFT(btrim(COALESCE(r.body, '')), 140),
          link_url = v_link || '?announcement=' || r.announcement_id::text,
          created_at = r.announcement_created_at
      FROM replacements r
      WHERE n.id = r.notification_id;

      -- Identity alone is sufficient: this row was delivered at post time.
      -- No current-membership filter belongs here, or transferred/revoked users
      -- retain a badge for a notice that no longer exists.
      DELETE FROM public.notifications n
      WHERE n.type = 'room_announcement'
        AND n.link = v_link
        AND n.is_read = false
        AND n.link_url = v_self;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.notifications n
  SET title = v_title,
      body = v_body,
      link_url = v_self,
      created_at = NEW.created_at
  FROM public.room_announcement_targets(
         NEW.offering_id, NEW.batch_id, NEW.author_id) t
  WHERE n.user_id = t.user_id
    AND n.link = v_link
    AND n.type = 'room_announcement'
    AND n.is_read = false;

  INSERT INTO public.notifications
    (user_id, type, title, body, link, link_url, is_read, created_at)
  SELECT
    t.user_id, 'room_announcement', v_title, v_body, v_link, v_self, false,
    NEW.created_at
  FROM public.room_announcement_targets(
         NEW.offering_id, NEW.batch_id, NEW.author_id) t
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = t.user_id
      AND n.link = v_link
      AND n.type = 'room_announcement'
      AND n.is_read = false
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;

EXCEPTION
  WHEN query_canceled OR assert_failure OR admin_shutdown
       OR crash_shutdown OR cannot_connect_now THEN
    RAISE;
  WHEN OTHERS THEN
    RAISE WARNING 'room announcements: fan-out failed for announcement % (%) [%] — the notice is posted and readable in the room; only the inbox badge is missing.',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. The board RPC delegates row scope to the same predicate as RLS/fan-out.
-- ---------------------------------------------------------------------------
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
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  -- The offering-level row is the least-privileged announcement scope. If the
  -- caller cannot read it, they have no room grant and are refused rather than
  -- handed an ambiguous empty set.
  IF NOT public.cohort_room_can_read_announcement(p_offering, NULL::uuid) THEN
    RAISE EXCEPTION 'not a member of this room'
      USING ERRCODE = '42501';
  END IF;

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
    AND a.deleted_at IS NULL
    AND public.cohort_room_can_read_announcement(
          a.offering_id, a.batch_id)
  ORDER BY a.is_pinned DESC, a.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END $$;

REVOKE ALL ON FUNCTION public.get_room_announcements(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_announcements(uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_room_announcements(uuid, integer, integer) IS
  'Paged cohort noticeboard, pinned first. Every row delegates to THE ONE '
  'announcement visibility relation used by RLS, fan-out and retraction. '
  'Raises 42501 without an offering-level grant; returns the pinned ten-column '
  'projection and never applicant bio, tally data, phone or email.';


-- ============================================================================
-- REVERSAL (manual, deliberately not executed)
--
-- Re-applying 20260801120000 restores its historical function/policy bodies.
-- Then drop only the helpers introduced here:
--   DROP FUNCTION public.cohort_room_can_read_announcement(uuid, uuid);
--   DROP FUNCTION public.room_announcement_user_can_read(uuid, uuid, uuid);
--   DROP VIEW public.room_announcement_read_grants;
-- Identity reconciliation is intentionally not reversed: the replacement
-- values are valid room URLs and preserve the same notice UUID.
-- ============================================================================
