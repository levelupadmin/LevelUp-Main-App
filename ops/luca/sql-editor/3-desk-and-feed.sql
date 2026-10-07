-- LUCA step 3 of the SQL editor runs. Safe to re-run. Replaces two LUCA functions
-- (luca_desk, luca_calendar_feed), adds one (luca_demo_clock) and records the
-- migration. No table changes.

-- ============================================================================
-- LUCA — mentor desk v2, calendar feed access check, demo display clock
--
-- 1. luca_desk also returns the program's assignments (a mentor who is not a
--    learner never receives them in luca_room) and whether the caller is an
--    admin (to show admin-only actions like forming Clans).
-- 2. luca_calendar_feed stops serving a feed once the member no longer has
--    access (refunded, withdrawn, balance overdue) or the program is hidden.
--
-- 3. luca_demo_clock: the demo cohort's display shift (see below).
--
-- Additive and idempotent: CREATE OR REPLACE of three functions, same
-- signatures and grants. Safe to run more than once.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.luca_desk(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog public.luca_programs; v_mentor uuid;
BEGIN
  v_prog := public.luca__program(p_slug);
  v_mentor := public.luca__require_staff(v_prog.id);
  RETURN jsonb_build_object(
    'my_mentor_id', v_mentor,
    'is_admin', public.is_admin(),
    'assignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'week_n', a.week_n, 'title', a.title, 'due_at', a.due_at, 'parts', a.parts,
               'is_group', a.is_group, 'review_session_id', a.review_session_id) ORDER BY a.week_n, a.due_at)
        FROM public.luca_assignments a WHERE a.program_id = v_prog.id), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', m.display_name, 'initials', m.initials, 'photo_url', m.photo_url,
               'niche', m.niche, 'handle', m.handle, 'track', m.track, 'clan_id', m.clan_id,
               'coins', m.coins, 'streak', m.streak, 'streak_day', m.streak_day, 'ghost', m.is_ghost,
               'email', CASE WHEN public.is_admin() THEN u.email END,
               'phone', CASE WHEN public.is_admin() THEN u.phone END, 'joined_at', m.joined_at) ORDER BY m.display_name)
        FROM public.luca_members m LEFT JOIN public.users u ON u.id = m.user_id
       WHERE m.program_id = v_prog.id), '[]'::jsonb),
    'clans', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.sort, c.name)
        FROM public.luca_clans c WHERE c.program_id = v_prog.id), '[]'::jsonb),
    'submissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id, 'assignment_id', s.assignment_id, 'member_id', s.member_id, 'links', s.links,
               'submitted_at', s.submitted_at, 'on_time', s.on_time, 'verdict', s.verdict,
               'notes', to_jsonb(s.notes), 'reviewed_by', s.reviewed_by, 'reviewed_at', s.reviewed_at,
               'fix_due_at', s.fix_due_at, 'fix_url', s.fix_url, 'fix_submitted_at', s.fix_submitted_at,
               'was_fix', s.was_fix) ORDER BY s.submitted_at)
        FROM public.luca_submissions s JOIN public.luca_assignments a ON a.id = s.assignment_id
       WHERE a.program_id = v_prog.id), '[]'::jsonb),
    'sprint_posts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'member_id', p.member_id, 'day_n', p.day_n,
               'kind', p.kind, 'url', p.url, 'log', p.log, 'title', p.title, 'posted_at', p.posted_at,
               'verdict', p.verdict, 'verdict_note', p.verdict_note) ORDER BY p.posted_at DESC)
        FROM public.luca_sprint_posts p WHERE p.program_id = v_prog.id), '[]'::jsonb),
    'attendance', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('session_id', a.session_id, 'member_id', a.member_id, 'at', a.joined_at))
        FROM public.luca_attendance a JOIN public.luca_sessions s ON s.id = a.session_id
       WHERE s.program_id = v_prog.id), '[]'::jsonb),
    'prewatch', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('member_id', p.member_id, 'week_n', p.week_n,
               'quiz_score', p.quiz_score, 'summary_url', p.summary_url, 'completed_at', p.completed_at))
        FROM public.luca_prewatch p JOIN public.luca_members m ON m.id = p.member_id
       WHERE m.program_id = v_prog.id AND p.completed_at IS NOT NULL), '[]'::jsonb),
    'hotseat', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('session_id', h.session_id, 'member_id', h.member_id,
               'position', h.position, 'rec_at_sec', h.rec_at_sec) ORDER BY h.session_id, h.position)
        FROM public.luca_hotseat h JOIN public.luca_sessions s ON s.id = h.session_id
       WHERE s.program_id = v_prog.id), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.luca_desk(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_desk(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_calendar_feed(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_mem public.luca_members; v_prog public.luca_programs;
BEGIN
  SELECT * INTO v_mem FROM public.luca_members WHERE cal_token = p_token AND NOT is_ghost;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_prog FROM public.luca_programs WHERE id = v_mem.program_id;
  -- Real cohorts: only while the program is live and the member still holds a seat.
  IF NOT v_prog.is_demo THEN
    IF NOT (v_prog.enabled AND public.luca__switch_on()) THEN RETURN NULL; END IF;
    IF v_mem.user_id IS NULL OR public.luca__access(v_prog.id, v_mem.user_id) <> 'learner' THEN RETURN NULL; END IF;
  END IF;
  RETURN jsonb_build_object(
    'program', jsonb_build_object('slug', v_prog.slug, 'name', v_prog.name, 'cohort_label', v_prog.cohort_label,
                 'timezone', v_prog.timezone, 'breaks', v_prog.content->'breaks', 'sprint', v_prog.sprint),
    'sessions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'title', s.title,
                 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'updated_at', s.updated_at) ORDER BY s.starts_at)
                 FROM public.luca_sessions s WHERE s.program_id = v_prog.id), '[]'::jsonb),
    'assignments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'week_n', a.week_n, 'title', a.title,
                 'due_at', a.due_at, 'updated_at', a.updated_at) ORDER BY a.due_at)
                 FROM public.luca_assignments a WHERE a.program_id = v_prog.id), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.luca_calendar_feed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.luca_calendar_feed(uuid) TO service_role;

-- 3. The demo cohort's display clock. The day switcher shifts every demo
--    timestamp by an exact offset (so "live now" is really live), which puts a
--    6 PM session at, say, 1:48 AM. The app adds this display shift to every
--    time it SHOWS for the demo, so sessions read at their mockup times while
--    all logic keeps using real instants. Staff only, demo programs only.
CREATE OR REPLACE FUNCTION public.luca_demo_clock(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog public.luca_programs; v_day_shift integer; v_off numeric;
BEGIN
  SELECT * INTO v_prog FROM public.luca_programs WHERE slug = p_slug;
  IF NOT FOUND OR NOT v_prog.is_demo OR NOT public.luca_is_staff(v_prog.id) THEN RETURN NULL; END IF;
  v_off := COALESCE((v_prog.content->'demo'->>'offset_secs')::numeric, 0);
  SELECT w.starts_on - (v_prog.content->'demo'->'canon'->'week_starts'->>'0')::date INTO v_day_shift
    FROM public.luca_weeks w WHERE w.program_id = v_prog.id AND w.n = 0;
  RETURN jsonb_build_object('display_shift_secs', COALESCE(v_day_shift, 0) * 86400 - v_off);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_demo_clock(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_demo_clock(text) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261007100300', 'luca_desk_feed', '{}')
ON CONFLICT (version) DO NOTHING;
