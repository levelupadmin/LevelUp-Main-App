-- ============================================================================
-- DRAFT — DO NOT APPLY. design/cohorts/migrations-draft/0004_cohort_room_rpcs.sql
-- 🔴 Tier 1 (SECURITY DEFINER read paths). Doctrine (inherited from the
-- community draft, invariant #6): every RPC asserts access FIRST, then reads.
-- Also fixes two known thin spots from COHORT-LOGIC.md §4:
--   • sessions returned as their own set (kills the one-session-per-week
--     LEFT-JOIN duplication in get_cohort_progress)
--   • recording_url finally surfaced to members.
-- ============================================================================

----------------------------------------------------------------------
-- 1. get_my_cohort_rooms() — the My Cohorts surface + nav, one round-trip.
--    Replaces useActiveCohort()'s 3-query single-slot waterfall.
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    (SELECT count(*)::int FROM cohort_weeks w WHERE w.cohort_batch_id = m.batch_id),
    (SELECT w.week_number FROM cohort_weeks w
      WHERE w.cohort_batch_id = m.batch_id AND w.status = 'active'
      ORDER BY w.week_number LIMIT 1),
    (SELECT min(ls.scheduled_at) FROM live_sessions ls
      JOIN cohort_weeks w ON w.id = ls.week_id
      WHERE w.cohort_batch_id = m.batch_id
        AND ls.status = 'scheduled' AND ls.scheduled_at > now()),
    (SELECT min(w.assignment_due_at) FROM cohort_weeks w
      WHERE w.cohort_batch_id = m.batch_id
        AND w.assignment_due_at > now()
        AND NOT EXISTS (SELECT 1 FROM cohort_week_submissions s
                        WHERE s.cohort_week_id = w.id AND s.user_id = auth.uid())),
    (SELECT count(*)::int FROM cohort_announcements a
      WHERE a.offering_id = m.offering_id
        AND (a.batch_id IS NULL OR a.batch_id = m.batch_id)
        AND a.deleted_at IS NULL
        AND a.created_at > COALESCE(
          (SELECT max(rs.seen_at) FROM cohort_room_seen rs
            WHERE rs.user_id = auth.uid() AND rs.offering_id = m.offering_id),
          'epoch'::timestamptz))
  FROM public.cohort_room_members m
  JOIN public.offerings o ON o.id = m.offering_id
  LEFT JOIN public.cohort_batches cb ON cb.id = m.batch_id
  LEFT JOIN public.cohort_room_configs c
    ON c.offering_id = m.offering_id AND c.batch_id IS NULL
  WHERE m.user_id = auth.uid() AND m.status = 'active'
  ORDER BY (c.phase = 'alumni'), o.title;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_cohort_rooms() TO authenticated;

-- last-seen marker for the unseen-announcements count
CREATE TABLE public.cohort_room_seen (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, offering_id)
);
ALTER TABLE public.cohort_room_seen ENABLE ROW LEVEL SECURITY;
CREATE POLICY room_seen_own ON public.cohort_room_seen FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

----------------------------------------------------------------------
-- 2. get_cohort_room(p_offering) — the room-open envelope, one round-trip:
--    config + membership + this-week + upcoming sessions + counts.
--    Weeks×submissions detail keeps riding the existing get_cohort_progress
--    (unchanged, still consumed by the weeks module).
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cohort_room(p_offering uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch uuid;
  result jsonb;
BEGIN
  -- Assert access FIRST (invariant #6)
  IF NOT public.cohort_room_is_member(p_offering) THEN
    RAISE EXCEPTION 'not a member of this room';
  END IF;

  SELECT m.batch_id INTO v_batch
  FROM public.cohort_room_members m
  WHERE m.user_id = auth.uid() AND m.offering_id = p_offering
    AND m.status = 'active'
  ORDER BY m.batch_id NULLS LAST LIMIT 1;

  SELECT jsonb_build_object(
    'config', (SELECT to_jsonb(c) FROM cohort_room_configs c
               WHERE c.offering_id = p_offering
               ORDER BY (c.batch_id = v_batch) DESC NULLS LAST LIMIT 1),
    'attendance_pct', public.get_attendance_pct(auth.uid(), p_offering),
    'sessions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', ls.id, 'title', ls.title, 'scheduled_at', ls.scheduled_at,
        'duration_minutes', ls.duration_minutes, 'status', ls.status,
        'session_type', ls.session_type, 'week_id', ls.week_id,
        'zoom_link', CASE WHEN ls.scheduled_at - interval '1 hour' <= now()
                          THEN ls.zoom_link END,   -- keep the T-60 gate server-side
        'recording_url', ls.recording_url,
        'my_position', (SELECT rp.position_seconds FROM cohort_recording_progress rp
                        WHERE rp.live_session_id = ls.id AND rp.user_id = auth.uid())
      ) ORDER BY ls.scheduled_at), '[]'::jsonb)
      FROM live_sessions ls
      JOIN cohort_weeks w ON w.id = ls.week_id
      WHERE w.cohort_batch_id = v_batch
    ),
    'announcements', (
      SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.is_pinned DESC, a.created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM cohort_announcements a
            WHERE a.offering_id = p_offering
              AND (a.batch_id IS NULL OR a.batch_id = v_batch)
              AND a.deleted_at IS NULL
            ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 10) a
    ),
    'roster_count', (SELECT count(*) FROM cohort_room_members rm
                     WHERE rm.offering_id = p_offering AND rm.status = 'active'
                       AND rm.role IN ('member','alumni'))
  ) INTO result;

  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION public.get_cohort_room(uuid) TO authenticated;

----------------------------------------------------------------------
-- 3. get_room_roster(p_offering) — people in the room (safe columns only,
--    via the existing public_user_profiles projection pattern).
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_room_roster(p_offering uuid)
RETURNS TABLE (user_id uuid, full_name text, avatar_url text, occupation text, city text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.cohort_room_is_member(p_offering) THEN
    RAISE EXCEPTION 'not a member of this room';
  END IF;
  RETURN QUERY
  SELECT m.user_id, u.full_name, u.avatar_url, u.occupation, u.city, m.role
  FROM public.cohort_room_members m
  JOIN public.users u ON u.id = m.user_id
  WHERE m.offering_id = p_offering AND m.status = 'active'
  ORDER BY (m.role IN ('mentor','host')) DESC, u.full_name;
  -- NOTE for council: confirm the exact safe column set against
  -- public_user_profiles; never expose phone/email here.
END $$;
GRANT EXECUTE ON FUNCTION public.get_room_roster(uuid) TO authenticated;

----------------------------------------------------------------------
-- 4. get_cohort_progress hardening note (applied migration, not here):
--    the existing RPC's LEFT JOIN on live_sessions duplicates week rows when
--    a week has >1 session. The applied version should drop the session
--    columns from get_cohort_progress (sessions now come from get_cohort_room)
--    — Postgres requires DROP FUNCTION before changing RETURNS TABLE
--    (per reference_ml_db_apply lesson; same rule on this project).
----------------------------------------------------------------------
