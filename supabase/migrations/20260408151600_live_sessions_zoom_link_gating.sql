-- #10: Hide live_sessions.zoom_link from students outside the session window.
--
-- Previous state: live_sessions_student_read gave enrolled students full
-- SELECT — including zoom_link — for every session of every course they
-- had access to, regardless of whether the session was tomorrow or months
-- away. This let a student forward the link publicly long before the
-- session, making the cohort link a drop-everywhere URL.
--
-- New state (mirrors the events venue_link pattern):
--   1. Create a `live_sessions_safe` view (security_invoker = true) that
--      excludes zoom_link. Frontend reads from that.
--   2. REVOKE SELECT (zoom_link) on the base table from anon/authenticated
--      so a direct `from("live_sessions").select("*")` can no longer
--      expose the link.
--   3. Provide a SECURITY DEFINER RPC get_live_session_zoom_link(uuid)
--      that returns the link only if:
--        - caller is admin, OR
--        - caller has an active enrolment AND now() is between
--          (scheduled_at - 1 hour) and (scheduled_at + duration_minutes
--          + 1 hour). i.e. link is only handed out in a narrow window
--          around the actual session.

-- 1. Safe view
DROP VIEW IF EXISTS public.live_sessions_safe CASCADE;
CREATE VIEW public.live_sessions_safe
  WITH (security_invoker = true) AS
  SELECT
    id,
    course_id,
    title,
    description,
    scheduled_at,
    duration_minutes,
    recording_url,
    status,
    created_at,
    updated_at
  FROM public.live_sessions;

GRANT SELECT ON public.live_sessions_safe TO anon, authenticated;

-- 2. Column-level revoke on the base table
REVOKE SELECT (zoom_link) ON public.live_sessions FROM anon, authenticated;

-- 3. Gated RPC
CREATE OR REPLACE FUNCTION public.get_live_session_zoom_link(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session        record;
  v_is_admin       boolean;
  v_has_enrolment  boolean;
  v_window_start   timestamptz;
  v_window_end     timestamptz;
BEGIN
  SELECT id, course_id, scheduled_at, duration_minutes, zoom_link, status
    INTO v_session
    FROM public.live_sessions
   WHERE id = p_session_id;

  IF NOT FOUND OR v_session.zoom_link IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT public.is_admin() INTO v_is_admin;
  IF v_is_admin THEN
    RETURN v_session.zoom_link;
  END IF;

  -- Student path: must be actively enrolled in a course mapped to this session
  SELECT EXISTS (
    SELECT 1
    FROM public.enrolments e
    JOIN public.offering_courses oc ON oc.offering_id = e.offering_id
    WHERE e.user_id = auth.uid()
      AND e.status = 'active'
      AND oc.course_id = v_session.course_id
  ) INTO v_has_enrolment;

  IF NOT v_has_enrolment THEN
    RETURN NULL;
  END IF;

  -- Only hand out the link in the narrow window around the session:
  -- from 1 hour before scheduled_at until 1 hour after the scheduled
  -- end time (scheduled_at + duration_minutes).
  v_window_start := v_session.scheduled_at - interval '1 hour';
  v_window_end   := v_session.scheduled_at
                    + make_interval(mins => COALESCE(v_session.duration_minutes, 60))
                    + interval '1 hour';

  IF now() BETWEEN v_window_start AND v_window_end
     AND v_session.status <> 'cancelled' THEN
    RETURN v_session.zoom_link;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_session_zoom_link(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_live_session_zoom_link(uuid) TO anon, authenticated;
