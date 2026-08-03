-- Close the three legacy read paths that predated cohort-room batch/tier
-- authorization. This is deliberately additive and keeps the April client
-- contracts intact: the safe view has the same columns, and the link RPC keeps
-- the same name, argument, return type and T-60 -> end+1h window.
--
-- Compatibility rule:
--   * a week-linked session with an effective room config (offering default or
--     exact-batch override) uses the room's exact-batch/tier authorization;
--   * a batchless session, or a week whose batch has no effective room config,
--     retains the established course-access rule for workshops/legacy cohorts.

CREATE OR REPLACE FUNCTION public.cohort_live_session_can_access(
  p_course_id uuid,
  p_week_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH room_context AS (
    SELECT cb.offering_id, cb.id AS batch_id
    FROM public.cohort_weeks cw
    JOIN public.cohort_batches cb ON cb.id = cw.cohort_batch_id
    WHERE cw.id = p_week_id
  ),
  effective_room AS (
    SELECT rc.offering_id, rc.batch_id
    FROM room_context ctx
    JOIN public.cohort_room_configs rc
      ON rc.offering_id = ctx.offering_id
     AND (rc.batch_id IS NULL OR rc.batch_id = ctx.batch_id)
    LIMIT 1
  )
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.is_admin() THEN true
    WHEN p_week_id IS NOT NULL AND EXISTS (SELECT 1 FROM effective_room) THEN
      COALESCE((
        SELECT public.cohort_room_can_access(ctx.offering_id, ctx.batch_id)
        FROM room_context ctx
      ), false)
    ELSE public.has_course_access(p_course_id)
  END;
$$;

REVOKE ALL ON FUNCTION public.cohort_live_session_can_access(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cohort_live_session_can_access(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cohort_live_session_can_access(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.cohort_live_session_can_access(uuid, uuid) IS
  'Batch/tier authorization for room-backed live sessions, with course-access compatibility for batchless and non-room legacy sessions.';

-- PostgreSQL ORs permissive policies. Both historical student policies must be
-- removed; leaving either one would preserve the cross-batch leak.
DROP POLICY IF EXISTS live_sessions_read ON public.live_sessions;
DROP POLICY IF EXISTS live_sessions_student_read ON public.live_sessions;

CREATE POLICY live_sessions_cohort_or_legacy_read
  ON public.live_sessions
  FOR SELECT
  TO authenticated
  USING (public.cohort_live_session_can_access(course_id, week_id));

-- Revocation changes enrolments.status without deleting the historical roster
-- row. The old policy trusted that roster row alone, so it outlived refunds.
DROP POLICY IF EXISTS cohort_weeks_student_read ON public.cohort_weeks;
CREATE POLICY cohort_weeks_student_read
  ON public.cohort_weeks
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.cohort_batch_members cbm
    JOIN public.enrolments e ON e.id = cbm.enrolment_id
    WHERE cbm.batch_id = cohort_weeks.cohort_batch_id
      AND e.user_id = auth.uid()
      AND e.status = 'active'
  ));

CREATE OR REPLACE FUNCTION public.get_live_session_zoom_link(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session      record;
  v_window_start timestamptz;
  v_window_end   timestamptz;
BEGIN
  SELECT id, course_id, week_id, scheduled_at, duration_minutes, zoom_link, status
    INTO v_session
    FROM public.live_sessions
   WHERE id = p_session_id;

  IF NOT FOUND OR v_session.zoom_link IS NULL THEN
    RETURN NULL;
  END IF;

  -- Preserve the established unconditional admin bypass.
  IF public.is_admin() THEN
    RETURN v_session.zoom_link;
  END IF;

  IF NOT public.cohort_live_session_can_access(v_session.course_id, v_session.week_id) THEN
    RETURN NULL;
  END IF;

  v_window_start := v_session.scheduled_at - interval '1 hour';
  v_window_end := v_session.scheduled_at
    + make_interval(mins => COALESCE(v_session.duration_minutes, 60))
    + interval '1 hour';

  IF now() BETWEEN v_window_start AND v_window_end
     AND v_session.status <> 'cancelled' THEN
    RETURN v_session.zoom_link;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_session_zoom_link(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_live_session_zoom_link(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_live_session_zoom_link(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_live_session_zoom_link(uuid) IS
  'Returns a join link only to an authorized batch/tier (or legacy course-access) caller inside the session window; admins bypass the window.';

-- Migration-time certificate: fail rather than stamp a partially-hardened
-- policy set or accidentally reopen either SECURITY DEFINER helper to anon.
DO $$
DECLARE
  broken text := '';
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'live_sessions'
      AND policyname IN ('live_sessions_read', 'live_sessions_student_read')
  ) THEN
    broken := broken || ' legacy live_sessions policy still present;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'live_sessions'
      AND policyname = 'live_sessions_cohort_or_legacy_read'
      AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated']::name[]
      AND qual LIKE '%cohort_live_session_can_access%'
  ) THEN
    broken := broken || ' hardened live_sessions policy missing/malformed;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cohort_weeks'
      AND policyname = 'cohort_weeks_student_read'
      AND qual LIKE '%status%active%'
  ) THEN
    broken := broken || ' cohort_weeks active-status guard missing;';
  END IF;

  IF has_function_privilege('anon', 'public.cohort_live_session_can_access(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_live_session_zoom_link(uuid)', 'EXECUTE') THEN
    broken := broken || ' anon can execute a session-link helper;';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.cohort_live_session_can_access(uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_live_session_zoom_link(uuid)', 'EXECUTE') THEN
    broken := broken || ' authenticated lost a required helper grant;';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid IN (
      'public.cohort_live_session_can_access(uuid, uuid)'::regprocedure,
      'public.get_live_session_zoom_link(uuid)'::regprocedure
    )
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    broken := broken || ' PUBLIC can execute a session-link helper;';
  END IF;

  IF broken <> '' THEN
    RAISE EXCEPTION 'room legacy-access hardening self-check FAILED:%', broken;
  END IF;
  RAISE NOTICE 'room legacy-access hardening: policy and grant self-check passed';
END
$$;

-- Rollback recipe (manual, only if the release itself must be reverted):
--   1. DROP POLICY live_sessions_cohort_or_legacy_read and restore the two
--      historical policies from 20260405074258 / 20260408140000.
--   2. Restore get_live_session_zoom_link from 20260408151600, then reapply
--      20260801140000 so anon/PUBLIC remain revoked.
--   3. Restore cohort_weeks_student_read from 20260526180000.
--   4. DROP FUNCTION cohort_live_session_can_access(uuid, uuid).
-- This rollback intentionally reopens GAP-1/2/4 and therefore requires a
-- separate security decision; it is not an operational recovery default.
