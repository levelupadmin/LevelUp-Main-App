-- ============================================================================
-- LUCA — learner and mentor RPCs
--
-- Every function here is SECURITY DEFINER, asserts the caller's access FIRST,
-- and never trusts an id the client sends without re-deriving its program.
-- Learners only ever touch their own member row. Coins only come from
-- luca__award (see 20261007100000_luca_core.sql).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Small internal helpers
-- ---------------------------------------------------------------------------

-- Resolve a visible program by slug or raise "not found" (never leaks drafts).
CREATE OR REPLACE FUNCTION public.luca__program(p_slug text)
RETURNS public.luca_programs
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog public.luca_programs;
BEGIN
  SELECT * INTO v_prog FROM public.luca_programs WHERE slug = p_slug;
  IF NOT FOUND OR NOT public.luca__visible(v_prog) THEN
    RAISE EXCEPTION 'program not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_prog;
END;
$$;
REVOKE ALL ON FUNCTION public.luca__program(text) FROM PUBLIC, anon, authenticated;

-- The caller's member id in a program, or raise 42501.
CREATE OR REPLACE FUNCTION public.luca__require_member(p_program uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_prog public.luca_programs;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  -- The kill switch and the per-program switch apply to every learner call.
  SELECT * INTO v_prog FROM public.luca_programs WHERE id = p_program;
  IF NOT FOUND OR NOT public.luca__visible(v_prog) THEN
    RAISE EXCEPTION 'program not found' USING ERRCODE = 'P0002';
  END IF;
  v_id := public.luca__ensure_member(p_program);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'not a member of this cohort' USING ERRCODE = '42501';
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.luca__require_member(uuid) FROM PUBLIC, anon, authenticated;

-- A link a learner pastes: http(s), sane length, no whitespace.
CREATE OR REPLACE FUNCTION public.luca__valid_url(p_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_url IS NOT NULL
     AND length(p_url) BETWEEN 10 AND 2000
     AND p_url ~* '^https?://[^\s/$.?#][^\s]*\.[^\s]+$';
$$;
REVOKE ALL ON FUNCTION public.luca__valid_url(text) FROM PUBLIC, anon;

-- Setup is complete when all five steps are ticked; award it once.
CREATE OR REPLACE FUNCTION public.luca__check_setup(p_member uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_setup jsonb;
BEGIN
  SELECT setup INTO v_setup FROM public.luca_members WHERE id = p_member;
  IF COALESCE((v_setup->>'seat')::boolean, false)
     AND COALESCE((v_setup->>'whatsapp')::boolean, false)
     AND COALESCE((v_setup->>'calendar')::boolean, false)
     AND COALESCE((v_setup->>'drive')::boolean, false)
     AND COALESCE((v_setup->>'pw0')::boolean, false) THEN
    PERFORM public.luca__award(p_member, 'setup', 'setup', true);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.luca__check_setup(uuid) FROM PUBLIC, anon, authenticated;

-- Clans are "out" once they exist and the reveal time has passed.
CREATE OR REPLACE FUNCTION public.luca__clans_open(p_program uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((p.features->>'clans')::boolean, true)
     AND EXISTS (SELECT 1 FROM public.luca_clans c WHERE c.program_id = p.id)
     AND now() >= COALESCE(NULLIF(p.clan_config->>'reveal_at', '')::timestamptz, p.starts_at, now())
    FROM public.luca_programs p WHERE p.id = p_program;
$$;
REVOKE ALL ON FUNCTION public.luca__clans_open(uuid) FROM PUBLIC, anon, authenticated;

-- In-app notification for a real learner (ghosts are skipped).
CREATE OR REPLACE FUNCTION public.luca__notify(p_member uuid, p_type text, p_title text, p_body text, p_link text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.luca_members WHERE id = p_member;
  IF v_user IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, type, title, body, link_url, link)
  VALUES (v_user, p_type, left(p_title, 200), left(p_body, 500), p_link, p_link);
END;
$$;
REVOKE ALL ON FUNCTION public.luca__notify(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 1. The envelope: everything one screen load needs, in one round trip.
--    Anonymous callers get the public program page; applicants get their
--    application; learners get the room. Returns NULL for an unknown or
--    invisible program.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luca_room(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prog public.luca_programs;
  v_staff boolean;
  v_access text;
  v_app jsonb;
  v_member uuid;
  v_mem public.luca_members;
  v_today date;
  v_week_start timestamptz;
  v_clans_open boolean;
  v_learner boolean;
  v_pricing jsonb;
  v_out jsonb;
BEGIN
  SELECT * INTO v_prog FROM public.luca_programs WHERE slug = p_slug;
  IF NOT FOUND OR NOT public.luca__visible(v_prog) THEN RETURN NULL; END IF;

  v_staff := public.luca_is_staff(v_prog.id);
  v_access := public.luca__access(v_prog.id, v_uid);
  v_app := public.luca__application_state(v_prog.id, v_uid);
  IF v_access = 'learner' THEN
    v_member := public.luca__ensure_member(v_prog.id);
  END IF;
  v_learner := v_member IS NOT NULL;
  v_today := public.luca__local_day(v_prog.id);

  IF v_prog.is_demo THEN
    v_pricing := jsonb_build_object(
      'price', COALESCE((v_prog.pricing->>'price')::numeric, 45000),
      'deposit', COALESCE((v_prog.pricing->>'deposit')::numeric, 8000),
      'app_fee', COALESCE((v_prog.pricing->>'app_fee')::numeric, 400),
      'hold_days', 2, 'balance_days', 15, 'emi', true);
  ELSE
    SELECT jsonb_build_object(
      'price', o.price_inr, 'deposit', o.confirmation_amount_inr, 'app_fee', o.app_fee_inr,
      'hold_days', COALESCE(o.confirmation_deadline_days, 2), 'balance_days', o.balance_deadline_days,
      'emi', COALESCE((v_prog.pricing->>'emi')::boolean, true), 'offering_status', o.status,
      'calendly_url', o.calendly_url)
      INTO v_pricing
      FROM public.offerings o WHERE o.id = v_prog.offering_id;
  END IF;

  v_out := jsonb_build_object(
    'server_now', now(),
    'access', v_access,
    'is_staff', v_staff,
    'signed_in', v_uid IS NOT NULL,
    'application', v_app,
    'program', jsonb_build_object(
      'id', v_prog.id, 'slug', v_prog.slug, 'offering_id', v_prog.offering_id,
      'is_demo', v_prog.is_demo, 'enabled', v_prog.enabled,
      'name', v_prog.name, 'short_name', v_prog.short_name, 'cohort_label', v_prog.cohort_label,
      'starts_at', v_prog.starts_at, 'demo_day_at', v_prog.demo_day_at, 'ends_at', v_prog.ends_at,
      'seats', v_prog.seats, 'hours_per_week', v_prog.hours_per_week, 'hero_url', v_prog.hero_url,
      'timezone', v_prog.timezone, 'features', v_prog.features, 'coin_rules', v_prog.coin_rules,
      'content', v_prog.content - 'demo', 'sprint', v_prog.sprint,
      'clan_reveal_at', v_prog.clan_config->'reveal_at', 'clan_size', v_prog.clan_config->'size',
      'support_whatsapp', v_prog.support_whatsapp,
      'whatsapp_url', CASE WHEN v_learner OR v_staff THEN v_prog.whatsapp_url END,
      'drive_url', CASE WHEN v_learner OR v_staff THEN v_prog.drive_url END,
      'pricing', v_pricing),
    'mentors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'angle', m.angle,
               'photo_url', m.photo_url, 'handle', m.handle) ORDER BY m.sort, m.name)
        FROM public.luca_mentors m WHERE m.program_id = v_prog.id), '[]'::jsonb),
    'weeks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'n', w.n, 'module', w.module, 'phase', w.phase, 'starts_on', w.starts_on,
               'image_url', w.image_url, 'post_note', w.post_note, 'is_sprint', w.is_sprint,
               'is_demo_week', w.is_demo_week,
               'prewatch', CASE WHEN v_learner OR v_staff THEN w.prewatch
                                ELSE w.prewatch - 'video_url' END,
               'quiz', CASE WHEN v_learner OR v_staff THEN (
                   SELECT COALESCE(jsonb_agg(jsonb_build_object('q', q->'q', 'options', q->'options')), '[]'::jsonb)
                     FROM jsonb_array_elements(w.quiz) q) ELSE '[]'::jsonb END)
             ORDER BY w.n)
        FROM public.luca_weeks w WHERE w.program_id = v_prog.id), '[]'::jsonb),
    'sessions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id, 'week_n', s.week_n, 'kind', s.kind, 'title', s.title,
               'starts_at', s.starts_at, 'ends_at', s.ends_at, 'mentor_ids', to_jsonb(s.mentor_ids),
               'prep', to_jsonb(s.prep), 'image_url', s.image_url,
               'has_zoom', s.zoom_url IS NOT NULL,
               'recording_url', CASE WHEN (v_learner OR v_staff) AND s.ends_at < now() THEN s.recording_url END,
               'recording_minutes', s.recording_minutes,
               'chapters', s.chapters,
               'files', CASE WHEN v_learner OR v_staff THEN s.files ELSE '[]'::jsonb END)
             ORDER BY s.starts_at)
        FROM public.luca_sessions s WHERE s.program_id = v_prog.id), '[]'::jsonb)
  );

  IF NOT v_learner THEN
    RETURN v_out;
  END IF;

  -- ── Learner room ──────────────────────────────────────────────────────────
  SELECT * INTO v_mem FROM public.luca_members WHERE id = v_member;

  SELECT (max(w.starts_on)::timestamp AT TIME ZONE v_prog.timezone) INTO v_week_start
    FROM public.luca_weeks w WHERE w.program_id = v_prog.id AND w.starts_on <= v_today;
  v_week_start := COALESCE(v_week_start, date_trunc('day', now()) - interval '6 days');

  v_clans_open := COALESCE(public.luca__clans_open(v_prog.id), false);

  v_out := v_out || jsonb_build_object(
    'week_start', v_week_start,
    'clans_open', v_clans_open,
    'me', jsonb_build_object(
      'id', v_mem.id, 'name', v_mem.display_name, 'initials', v_mem.initials,
      'photo_url', v_mem.photo_url, 'niche', v_mem.niche, 'handle', v_mem.handle,
      'track', v_mem.track, 'clan_id', CASE WHEN v_clans_open THEN v_mem.clan_id END,
      'coins', v_mem.coins,
      'streak', CASE WHEN v_mem.streak_day >= v_today - 1 THEN v_mem.streak ELSE 0 END,
      'streak_today', v_mem.streak_day = v_today,
      'setup', v_mem.setup, 'contract_signed_at', v_mem.contract_signed_at,
      'contract_name', v_mem.contract_name, 'cal_token', v_mem.cal_token,
      'prefs', v_mem.prefs, 'revealed_at', v_mem.revealed_at, 'joined_at', v_mem.joined_at),
    'assignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'week_n', a.week_n, 'title', a.title, 'brief', a.brief,
               'due_at', a.due_at, 'parts', a.parts, 'coins', a.coins, 'is_group', a.is_group,
               'review_session_id', a.review_session_id) ORDER BY a.due_at, a.sort)
        FROM public.luca_assignments a WHERE a.program_id = v_prog.id), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', m.display_name, 'initials', m.initials, 'photo_url', m.photo_url,
               'niche', m.niche, 'handle', m.handle, 'track', m.track,
               'clan_id', CASE WHEN v_clans_open THEN m.clan_id END,
               'coins', m.coins, 'week', COALESCE(wk.week, 0)) ORDER BY m.coins DESC, m.joined_at)
        FROM public.luca_members m
        LEFT JOIN (
          SELECT l.member_id, sum(l.amount)::integer AS week
            FROM public.luca_coin_ledger l
           WHERE l.program_id = v_prog.id AND l.created_at >= v_week_start
           GROUP BY l.member_id) wk ON wk.member_id = m.id
       WHERE m.program_id = v_prog.id), '[]'::jsonb),
    'clans', CASE WHEN v_clans_open THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
               'score', COALESCE((SELECT sum(m.coins) FROM public.luca_members m WHERE m.clan_id = c.id), 0))
             ORDER BY c.sort, c.name)
        FROM public.luca_clans c WHERE c.program_id = v_prog.id), '[]'::jsonb) ELSE '[]'::jsonb END,
    'submissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id, 'assignment_id', s.assignment_id, 'links', s.links,
               'submitted_at', s.submitted_at, 'on_time', s.on_time, 'verdict', s.verdict,
               'notes', to_jsonb(s.notes), 'reviewed_by', s.reviewed_by, 'reviewed_at', s.reviewed_at,
               'fix_due_at', s.fix_due_at, 'fix_url', s.fix_url, 'fix_submitted_at', s.fix_submitted_at,
               'was_fix', s.was_fix))
        FROM public.luca_submissions s WHERE s.member_id = v_member), '[]'::jsonb),
    'prewatch', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('week_n', p.week_n, 'quiz_score', p.quiz_score,
               'summary_url', p.summary_url, 'completed_at', p.completed_at))
        FROM public.luca_prewatch p WHERE p.member_id = v_member AND p.completed_at IS NOT NULL), '[]'::jsonb),
    'attended', COALESCE((
      SELECT jsonb_agg(a.session_id) FROM public.luca_attendance a WHERE a.member_id = v_member), '[]'::jsonb),
    'sprint_posts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'day_n', p.day_n, 'kind', p.kind, 'url', p.url,
               'log', p.log, 'title', p.title, 'posted_at', p.posted_at, 'verdict', p.verdict,
               'verdict_note', p.verdict_note) ORDER BY p.day_n)
        FROM public.luca_sprint_posts p WHERE p.member_id = v_member), '[]'::jsonb),
    'ledger', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('amount', l.amount, 'reason', l.reason, 'rule', l.rule, 'at', l.created_at)
             ORDER BY l.created_at DESC)
        FROM (SELECT * FROM public.luca_coin_ledger WHERE member_id = v_member AND amount <> 0
              ORDER BY created_at DESC LIMIT 40) l), '[]'::jsonb),
    'feedback_given', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('to', f.to_member, 'ref', f.post_ref))
        FROM public.luca_feedback f WHERE f.from_member = v_member), '[]'::jsonb),
    'feedback_received', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('from', f.from_member, 'ref', f.post_ref, 'chips', to_jsonb(f.chips),
               'body', f.body, 'at', f.created_at) ORDER BY f.created_at DESC)
        FROM (SELECT * FROM public.luca_feedback WHERE to_member = v_member ORDER BY created_at DESC LIMIT 30) f), '[]'::jsonb),
    'nudged_today', COALESCE((
      SELECT jsonb_agg(n.to_member) FROM public.luca_nudges n
       WHERE n.from_member = v_member AND n.ist_day = v_today), '[]'::jsonb),
    'rec_progress', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('session_id', r.session_id, 'seconds', r.seconds))
        FROM public.luca_rec_progress r WHERE r.member_id = v_member), '[]'::jsonb),
    'hotseat', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('session_id', h.session_id, 'member_id', h.member_id,
               'position', h.position, 'rec_at_sec', h.rec_at_sec) ORDER BY h.session_id, h.position)
        FROM public.luca_hotseat h JOIN public.luca_sessions s ON s.id = h.session_id
       WHERE s.program_id = v_prog.id), '[]'::jsonb),
    'demo_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('session_id', d.session_id, 'member_id', d.member_id,
               'slot_n', d.slot_n, 'at', d.at) ORDER BY d.slot_n)
        FROM public.luca_demo_slots d JOIN public.luca_sessions s ON s.id = d.session_id
       WHERE s.program_id = v_prog.id), '[]'::jsonb),
    'announcements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
               'link_url', a.link_url, 'pinned', a.pinned, 'at', a.created_at)
             ORDER BY a.pinned DESC, a.created_at DESC)
        FROM (SELECT * FROM public.luca_announcements WHERE program_id = v_prog.id
              ORDER BY pinned DESC, created_at DESC LIMIT 12) a), '[]'::jsonb),
    'resources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'week_n', r.week_n, 'title', r.title,
               'url', r.url, 'kind', r.kind) ORDER BY r.sort, r.title)
        FROM public.luca_resources r WHERE r.program_id = v_prog.id), '[]'::jsonb)
  );

  -- Clan pulse + clan feed: only my clan, only once clans are out.
  IF v_clans_open AND v_mem.clan_id IS NOT NULL THEN
    v_out := v_out || jsonb_build_object(
      'clan_progress', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'member_id', m.id,
                 'submitted', COALESCE((SELECT jsonb_agg(s.assignment_id) FROM public.luca_submissions s WHERE s.member_id = m.id), '[]'::jsonb),
                 'prewatch', COALESCE((SELECT jsonb_agg(p.week_n) FROM public.luca_prewatch p WHERE p.member_id = m.id AND p.completed_at IS NOT NULL), '[]'::jsonb),
                 'sprint_days', COALESCE((SELECT jsonb_agg(p.day_n) FROM public.luca_sprint_posts p WHERE p.member_id = m.id), '[]'::jsonb),
                 'attended', COALESCE((SELECT jsonb_agg(a.session_id) FROM public.luca_attendance a
                                         JOIN public.luca_sessions s ON s.id = a.session_id
                                        WHERE a.member_id = m.id AND s.starts_at > now() - interval '3 days'), '[]'::jsonb)))
          FROM public.luca_members m WHERE m.clan_id = v_mem.clan_id), '[]'::jsonb),
      'clan_feed', COALESCE((
        SELECT jsonb_agg(x ORDER BY x->>'at' DESC) FROM (SELECT x FROM (
          SELECT jsonb_build_object('member_id', p.member_id, 'ref', 'sprint:' || p.id,
                   'title', COALESCE(p.title, 'Sprint day ' || p.day_n), 'url', p.url, 'at', p.posted_at) AS x
            FROM public.luca_sprint_posts p
            JOIN public.luca_members m ON m.id = p.member_id
           WHERE m.clan_id = v_mem.clan_id AND p.member_id <> v_member AND p.kind = 'post'
             AND p.url IS NOT NULL AND p.posted_at > now() - interval '10 days'
          UNION ALL
          SELECT jsonb_build_object('member_id', s.member_id, 'ref', 'sub:' || s.id || ':' || (e.ord - 1),
                   'title', COALESCE(NULLIF(e.part->>'title', ''), NULLIF(e.part->>'label', ''), a.title), 'url', e.part->>'url', 'at', s.submitted_at)
            FROM public.luca_submissions s
            JOIN public.luca_members m ON m.id = s.member_id
            JOIN public.luca_assignments a ON a.id = s.assignment_id
            CROSS JOIN LATERAL jsonb_array_elements(s.links) WITH ORDINALITY AS e(part, ord)
           WHERE m.clan_id = v_mem.clan_id AND s.member_id <> v_member
             AND e.part->>'kind' IN ('post','profile') AND s.submitted_at > now() - interval '10 days'
        ) q0 ORDER BY x->>'at' DESC LIMIT 12) q), '[]'::jsonb)
    );
  END IF;

  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.luca_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.luca_room(text) TO anon, authenticated;


-- The programs the caller can reach (for the /luca index and the app nav).
CREATE OR REPLACE FUNCTION public.luca_my_programs()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'rank')::int DESC, x->>'starts_at' DESC) FROM (
      SELECT jsonb_build_object(
        'slug', p.slug, 'name', p.name, 'short_name', p.short_name, 'cohort_label', p.cohort_label,
        'hero_url', p.hero_url, 'is_demo', p.is_demo, 'starts_at', p.starts_at,
        'access', public.luca__access(p.id, v_uid), 'is_staff', public.luca_is_staff(p.id),
        'rank', CASE public.luca__access(p.id, v_uid) WHEN 'learner' THEN 3 WHEN 'locked' THEN 2
                     WHEN 'applicant' THEN 1 ELSE 0 END) AS x
        FROM public.luca_programs p
       WHERE public.luca__visible(p)
         AND (public.luca_is_staff(p.id) OR public.luca__access(p.id, v_uid) <> 'none')
    ) q), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_my_programs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_my_programs() TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. Applying (in-app application → the existing cohort_applications row)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luca_apply(p_slug text, p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prog public.luca_programs;
  v_user public.users;
  v_niche text := trim(COALESCE(p_answers->>'niche', ''));
  v_handle text := trim(COALESCE(p_answers->>'handle', ''));
  v_track text := COALESCE(p_answers->>'track', '');
  v_why text := trim(COALESCE(p_answers->>'why', ''));
  v_hours boolean := COALESCE((p_answers->>'hours')::boolean, false);
  v_email text;
  v_name text;
  v_app_id uuid;
  v_status text;
  v_clean jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501'; END IF;
  v_prog := public.luca__program(p_slug);
  IF NOT COALESCE((v_prog.features->>'application')::boolean, true) THEN
    RAISE EXCEPTION 'applications for this cohort are not taken in the app' USING ERRCODE = '22023';
  END IF;
  IF length(v_niche) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'niche' USING ERRCODE = '22023'; END IF;
  IF length(v_handle) > 80 THEN RAISE EXCEPTION 'handle' USING ERRCODE = '22023'; END IF;
  IF v_track NOT IN ('A','B') THEN RAISE EXCEPTION 'track' USING ERRCODE = '22023'; END IF;
  IF length(v_why) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'why' USING ERRCODE = '22023'; END IF;
  IF NOT v_hours THEN RAISE EXCEPTION 'hours' USING ERRCODE = '22023'; END IF;

  v_clean := jsonb_build_object('niche', v_niche, 'handle', v_handle, 'track', v_track, 'why', v_why, 'hours', true);

  -- One application at a time per person and program.
  PERFORM pg_advisory_xact_lock(hashtext('luca_apply:' || v_prog.id::text || ':' || v_uid::text));

  -- Answers are frozen once the fee is paid (the interviewer reads them).
  IF public.luca__status_rank(public.luca__application_state(v_prog.id, v_uid)->>'status') >= 40
     OR (public.luca__application_state(v_prog.id, v_uid)->>'status') IN ('rejected','waitlisted','withdrawn') THEN
    RAISE EXCEPTION 'Your application is already in' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.luca_applications (program_id, user_id, answers)
  VALUES (v_prog.id, v_uid, v_clean)
  ON CONFLICT (program_id, user_id) DO UPDATE SET answers = EXCLUDED.answers;

  IF v_prog.is_demo THEN
    UPDATE public.luca_applications SET demo_status = COALESCE(demo_status, 'submitted')
     WHERE program_id = v_prog.id AND user_id = v_uid
     RETURNING id, demo_status INTO v_app_id, v_status;
    RETURN jsonb_build_object('application_id', v_app_id, 'status', v_status, 'demo', true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.offerings o WHERE o.id = v_prog.offering_id AND o.status = 'active') THEN
    RAISE EXCEPTION 'Applications for this cohort are closed' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.offerings o WHERE o.id = v_prog.offering_id AND o.intake_opens_at > now()) THEN
    RAISE EXCEPTION 'Applications for this cohort are not open yet' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_uid;
  v_email := lower(trim(COALESCE(NULLIF(v_user.email, ''), p_answers->>'email', '')));
  v_name := trim(COALESCE(NULLIF(v_user.full_name, ''), p_answers->>'name', ''));
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'email' USING ERRCODE = '22023'; END IF;
  IF length(v_name) < 2 THEN RAISE EXCEPTION 'name' USING ERRCODE = '22023'; END IF;

  SELECT a.id, a.status INTO v_app_id, v_status
    FROM public.cohort_applications a
   WHERE a.offering_id = v_prog.offering_id AND a.user_id = v_uid
   ORDER BY public.luca__status_rank(a.status) DESC, a.created_at DESC
   LIMIT 1;

  -- Applied on the form already, not yet linked to this account: do not make a
  -- second row. The existing claim flow links it (never a silent merge here).
  IF v_app_id IS NULL AND EXISTS (
    SELECT 1 FROM public.cohort_applications a
     WHERE a.offering_id = v_prog.offering_id AND a.user_id IS NULL AND lower(a.email) = v_email
  ) THEN
    RAISE EXCEPTION 'You already applied with this email on our form. Sign in with that email and it links to your account' USING ERRCODE = '23505';
  END IF;

  IF v_app_id IS NULL THEN
    INSERT INTO public.cohort_applications (offering_id, user_id, full_name, email, phone, city, occupation, bio, status)
    VALUES (v_prog.offering_id, v_uid, v_name, v_email, v_user.phone, v_user.city, v_user.occupation,
            format('In-app LUCA application. Niche: %s | Handle: %s | Track: %s | Why now: %s', v_niche,
                   COALESCE(NULLIF(v_handle, ''), '-'), v_track, v_why),
            'submitted')
    RETURNING id, status INTO v_app_id, v_status;
  END IF;

  UPDATE public.luca_applications SET cohort_application_id = v_app_id
   WHERE program_id = v_prog.id AND user_id = v_uid;
  RETURN jsonb_build_object('application_id', v_app_id, 'status', v_status, 'demo', false);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_apply(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_apply(text, jsonb) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. Demo programs only: simulated money and decisions for staff walkthroughs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luca_demo_advance(p_slug text, p_step text, p_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prog public.luca_programs;
  v_la public.luca_applications;
BEGIN
  v_prog := public.luca__program(p_slug);
  IF NOT v_prog.is_demo OR NOT public.luca_is_staff(v_prog.id) THEN
    RAISE EXCEPTION 'demo only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_la FROM public.luca_applications WHERE program_id = v_prog.id AND user_id = v_uid;

  IF p_step = 'reset' THEN
    DELETE FROM public.luca_members WHERE program_id = v_prog.id AND user_id = v_uid;
    DELETE FROM public.luca_applications WHERE program_id = v_prog.id AND user_id = v_uid;
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF v_la.id IS NULL THEN RAISE EXCEPTION 'apply first' USING ERRCODE = '22023'; END IF;

  IF p_step = 'pay_app_fee' THEN
    UPDATE public.luca_applications SET demo_status = 'app_fee_paid' WHERE id = v_la.id;
  ELSIF p_step = 'book' THEN
    IF p_at IS NULL OR p_at < now() THEN RAISE EXCEPTION 'pick a future time' USING ERRCODE = '22023'; END IF;
    UPDATE public.luca_applications SET demo_status = 'interview_scheduled', demo_interview_at = p_at WHERE id = v_la.id;
  ELSIF p_step = 'decide' THEN
    UPDATE public.luca_applications
       SET demo_status = 'accepted', demo_accepted_at = now(),
           demo_interview_at = COALESCE(demo_interview_at, now() - interval '1 day')
     WHERE id = v_la.id;
  ELSIF p_step = 'pay_deposit' THEN
    UPDATE public.luca_applications SET demo_status = 'confirmation_paid', demo_confirmed_at = now() WHERE id = v_la.id;
  ELSIF p_step = 'pay_balance' THEN
    UPDATE public.luca_applications SET demo_status = 'balance_paid' WHERE id = v_la.id;
  ELSE
    RAISE EXCEPTION 'unknown step' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_demo_advance(text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_demo_advance(text, text, timestamptz) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. Setup, profile, preferences, contract
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luca_setup(p_slug text, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog public.luca_programs; v_member uuid; v_setup jsonb;
BEGIN
  IF p_key NOT IN ('whatsapp','calendar','drive') THEN RAISE EXCEPTION 'unknown setup step' USING ERRCODE = '22023'; END IF;
  v_prog := public.luca__program(p_slug);
  v_member := public.luca__require_member(v_prog.id);
  UPDATE public.luca_members SET setup = setup || jsonb_build_object(p_key, true)
   WHERE id = v_member RETURNING setup INTO v_setup;
  PERFORM public.luca__check_setup(v_member);
  RETURN v_setup;
END;
$$;
REVOKE ALL ON FUNCTION public.luca_setup(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_setup(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_update_me(p_slug text, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog public.luca_programs; v_member uuid; v_prefs jsonb := '{}'::jsonb; k text;
BEGIN
  v_prog := public.luca__program(p_slug);
  v_member := public.luca__require_member(v_prog.id);
  IF p_patch ? 'niche' THEN
    IF length(trim(p_patch->>'niche')) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'niche' USING ERRCODE = '22023'; END IF;
    UPDATE public.luca_members SET niche = trim(p_patch->>'niche') WHERE id = v_member;
  END IF;
  IF p_patch ? 'handle' THEN
    IF length(trim(p_patch->>'handle')) > 80 THEN RAISE EXCEPTION 'handle' USING ERRCODE = '22023'; END IF;
    UPDATE public.luca_members SET handle = NULLIF(trim(p_patch->>'handle'), '') WHERE id = v_member;
  END IF;
  IF p_patch ? 'revealed' THEN
    UPDATE public.luca_members SET revealed_at = COALESCE(revealed_at, now()) WHERE id = v_member;
  END IF;
  IF jsonb_typeof(p_patch->'prefs') = 'object' THEN
    FOR k IN SELECT jsonb_object_keys(p_patch->'prefs') LOOP
      IF k IN ('remind_day_before','remind_10_min','remind_deadline','remind_sprint','remind_nudge','remind_passed')
         AND jsonb_typeof(p_patch->'prefs'->k) = 'boolean' THEN
        v_prefs := v_prefs || jsonb_build_object(k, p_patch->'prefs'->k);
      END IF;
    END LOOP;
    UPDATE public.luca_members SET prefs = prefs || v_prefs WHERE id = v_member;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_update_me(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_update_me(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_rotate_cal_token(p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog public.luca_programs; v_member uuid; v_tok uuid;
BEGIN
  v_prog := public.luca__program(p_slug);
  v_member := public.luca__require_member(v_prog.id);
  UPDATE public.luca_members SET cal_token = gen_random_uuid() WHERE id = v_member RETURNING cal_token INTO v_tok;
  RETURN v_tok;
END;
$$;
REVOKE ALL ON FUNCTION public.luca_rotate_cal_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_rotate_cal_token(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_sign_contract(p_slug text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog public.luca_programs; v_member uuid;
BEGIN
  IF length(trim(COALESCE(p_name, ''))) NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'name' USING ERRCODE = '22023'; END IF;
  v_prog := public.luca__program(p_slug);
  v_member := public.luca__require_member(v_prog.id);
  UPDATE public.luca_members
     SET contract_name = trim(p_name), contract_signed_at = COALESCE(contract_signed_at, now())
   WHERE id = v_member;
  PERFORM public.luca__award(v_member, 'contract', 'contract', true, 0);
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_sign_contract(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_sign_contract(text, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 5. Sessions: join (marks attendance, releases the Zoom link), recordings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luca_join_session(p_session uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.luca_sessions;
  v_prog public.luca_programs;
  v_member uuid;
  v_awarded integer := 0;
  v_new boolean := false;
BEGIN
  SELECT * INTO v_s FROM public.luca_sessions WHERE id = p_session;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_prog FROM public.luca_programs WHERE id = v_s.program_id;
  IF NOT public.luca__visible(v_prog) THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF now() < v_s.starts_at - interval '15 minutes' THEN
    RAISE EXCEPTION 'join opens 15 minutes before the start' USING ERRCODE = '22023';
  END IF;
  IF now() > v_s.ends_at THEN
    RAISE EXCEPTION 'this session has ended' USING ERRCODE = '22023';
  END IF;

  -- Mentors on a real program get the link without being marked present.
  IF NOT v_prog.is_demo AND public.luca_is_staff(v_prog.id)
     AND public.luca__access(v_prog.id, auth.uid()) <> 'learner' THEN
    RETURN jsonb_build_object('zoom_url', v_s.zoom_url, 'awarded', 0, 'present', false);
  END IF;

  v_member := public.luca__require_member(v_prog.id);
  INSERT INTO public.luca_attendance (session_id, member_id) VALUES (v_s.id, v_member)
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_new;
  IF v_new THEN
    v_awarded := public.luca__award(v_member, 'attend', 'attend:' || v_s.id, true, NULL, 'Showed up: ' || v_s.title);
  END IF;
  RETURN jsonb_build_object('zoom_url', v_s.zoom_url, 'awarded', v_awarded, 'present', true);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_join_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_join_session(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_rec_progress(p_session uuid, p_seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog_id uuid; v_member uuid;
BEGIN
  SELECT program_id INTO v_prog_id FROM public.luca_sessions WHERE id = p_session;
  IF v_prog_id IS NULL THEN RETURN; END IF;
  v_member := public.luca__require_member(v_prog_id);
  INSERT INTO public.luca_rec_progress (session_id, member_id, seconds, updated_at)
  VALUES (p_session, v_member, GREATEST(0, LEAST(COALESCE(p_seconds, 0), 86400)), now())
  ON CONFLICT (session_id, member_id) DO UPDATE
    SET seconds = GREATEST(public.luca_rec_progress.seconds, EXCLUDED.seconds), updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.luca_rec_progress(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_rec_progress(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_notes(p_session uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog_id uuid; v_member uuid;
BEGIN
  SELECT program_id INTO v_prog_id FROM public.luca_sessions WHERE id = p_session;
  IF v_prog_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  v_member := public.luca__require_member(v_prog_id);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', n.id, 'at_sec', n.at_sec, 'body', n.body) ORDER BY n.at_sec, n.created_at)
      FROM public.luca_rec_notes n WHERE n.session_id = p_session AND n.member_id = v_member), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_notes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_notes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_note_add(p_session uuid, p_at_sec integer, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog_id uuid; v_member uuid; v_id uuid;
BEGIN
  IF length(trim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'note' USING ERRCODE = '22023'; END IF;
  SELECT program_id INTO v_prog_id FROM public.luca_sessions WHERE id = p_session;
  IF v_prog_id IS NULL THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  v_member := public.luca__require_member(v_prog_id);
  IF (SELECT count(*) FROM public.luca_rec_notes WHERE member_id = v_member AND session_id = p_session) >= 200 THEN
    RAISE EXCEPTION 'too many notes on this recording' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.luca_rec_notes (session_id, member_id, at_sec, body)
  VALUES (p_session, v_member, GREATEST(0, LEAST(COALESCE(p_at_sec, 0), 86400)), trim(p_body))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_note_add(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_note_add(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_note_delete(p_note uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.luca_rec_notes n
   USING public.luca_members m
   WHERE n.id = p_note AND m.id = n.member_id AND m.user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.luca_note_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_note_delete(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 6. Work: submit links, send a fix
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luca_submit(p_assignment uuid, p_links jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.luca_assignments;
  v_prog public.luca_programs;
  v_member uuid;
  v_mem public.luca_members;
  v_part jsonb;
  v_link jsonb;
  v_clean jsonb := '[]'::jsonb;
  i integer;
  v_on_time boolean;
  v_id uuid;
  v_awarded integer := 0;
BEGIN
  SELECT * INTO v_a FROM public.luca_assignments WHERE id = p_assignment;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_prog FROM public.luca_programs WHERE id = v_a.program_id;
  IF NOT public.luca__visible(v_prog) THEN RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'P0002'; END IF;
  v_member := public.luca__require_member(v_prog.id);
  SELECT * INTO v_mem FROM public.luca_members WHERE id = v_member;

  IF jsonb_typeof(p_links) <> 'array' OR jsonb_array_length(p_links) <> jsonb_array_length(v_a.parts) THEN
    RAISE EXCEPTION 'every part needs a link' USING ERRCODE = '22023';
  END IF;
  FOR i IN 0 .. jsonb_array_length(v_a.parts) - 1 LOOP
    v_part := v_a.parts->i;
    v_link := p_links->i;
    IF v_part->>'k' = 'sign' THEN
      IF v_mem.contract_signed_at IS NULL THEN RAISE EXCEPTION 'sign the contract first' USING ERRCODE = '22023'; END IF;
      v_clean := v_clean || jsonb_build_array(jsonb_build_object('kind', 'sign', 'url', NULL, 'label', v_part->>'label'));
    ELSE
      IF NOT public.luca__valid_url(v_link->>'url') THEN RAISE EXCEPTION 'link %', i + 1 USING ERRCODE = '22023'; END IF;
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'kind', COALESCE(v_part->>'k', 'link'), 'url', v_link->>'url', 'label', v_part->>'label',
        'title', NULLIF(left(trim(COALESCE(v_link->>'title', '')), 140), '')));
    END IF;
  END LOOP;

  v_on_time := now() <= v_a.due_at;
  INSERT INTO public.luca_submissions (assignment_id, member_id, links, on_time)
  VALUES (v_a.id, v_member, v_clean, v_on_time)
  ON CONFLICT (assignment_id, member_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'already submitted' USING ERRCODE = '23505'; END IF;

  IF v_on_time THEN
    v_awarded := public.luca__award(v_member, 'submit_on_time', 'submit:' || v_a.id, true, v_a.coins,
                   'Week ' || v_a.week_n || ' in on time');
  ELSE
    PERFORM public.luca__award(v_member, 'late_submit', 'late:' || v_a.id, true, 0);
  END IF;
  RETURN jsonb_build_object('id', v_id, 'on_time', v_on_time, 'awarded', v_awarded);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_submit(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_submit(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_submit_fix(p_assignment uuid, p_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog_id uuid; v_member uuid; v_id uuid;
BEGIN
  IF NOT public.luca__valid_url(p_url) THEN RAISE EXCEPTION 'link' USING ERRCODE = '22023'; END IF;
  SELECT program_id INTO v_prog_id FROM public.luca_assignments WHERE id = p_assignment;
  IF v_prog_id IS NULL THEN RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'P0002'; END IF;
  v_member := public.luca__require_member(v_prog_id);
  UPDATE public.luca_submissions
     SET fix_url = p_url, fix_submitted_at = now(), verdict = 'pending', was_fix = true
   WHERE assignment_id = p_assignment AND member_id = v_member AND verdict = 'fix'
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'no fix was asked for' USING ERRCODE = '22023'; END IF;
  PERFORM public.luca__award(v_member, 'fix_sent', 'fix:' || p_assignment, true, 0);
  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_submit_fix(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_submit_fix(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 7. Pre-watch: check one answer, then complete with a summary link
-- ---------------------------------------------------------------------------
-- A week's pre-watch is open from a week before it starts (people do it on
-- weekdays ahead of the Saturday review) until forever after.
CREATE OR REPLACE FUNCTION public.luca__prewatch_open(p_program uuid, p_week integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.luca_weeks w
     WHERE w.program_id = p_program AND w.n = p_week AND w.prewatch <> '{}'::jsonb
       AND (w.starts_on IS NULL OR w.starts_on <= public.luca__local_day(p_program) + 7)
  );
$$;
REVOKE ALL ON FUNCTION public.luca__prewatch_open(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Check one answer. The FIRST answer to each question is recorded before the
-- right one is revealed, so answers cannot be harvested and then replayed.
CREATE OR REPLACE FUNCTION public.luca_prewatch_check(p_slug text, p_week integer, p_q integer, p_choice integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog public.luca_programs;
  v_member uuid;
  v_quiz jsonb;
  v_answer integer;
  v_answers integer[];
  v_mine integer;
BEGIN
  v_prog := public.luca__program(p_slug);
  v_member := public.luca__require_member(v_prog.id);
  IF NOT public.luca__prewatch_open(v_prog.id, p_week) THEN
    RAISE EXCEPTION 'this pre-watch is not open yet' USING ERRCODE = '22023';
  END IF;
  SELECT quiz INTO v_quiz FROM public.luca_weeks WHERE program_id = v_prog.id AND n = p_week;
  IF v_quiz IS NULL OR p_q < 0 OR p_q >= jsonb_array_length(v_quiz) THEN
    RAISE EXCEPTION 'question not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_choice IS NULL OR p_choice < 0 OR p_choice >= jsonb_array_length(v_quiz->p_q->'options') THEN
    RAISE EXCEPTION 'choice' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.luca_prewatch (member_id, week_n, quiz_answers)
  VALUES (v_member, p_week, array_fill(-1, ARRAY[jsonb_array_length(v_quiz)]))
  ON CONFLICT (member_id, week_n) DO NOTHING;
  SELECT quiz_answers INTO v_answers FROM public.luca_prewatch WHERE member_id = v_member AND week_n = p_week FOR UPDATE;
  IF COALESCE(array_length(v_answers, 1), 0) < jsonb_array_length(v_quiz) THEN
    v_answers := COALESCE(v_answers, '{}') || array_fill(-1, ARRAY[jsonb_array_length(v_quiz) - COALESCE(array_length(v_answers, 1), 0)]);
  END IF;
  v_mine := v_answers[p_q + 1];
  IF v_mine IS NULL OR v_mine < 0 THEN
    v_answers[p_q + 1] := p_choice;
    v_mine := p_choice;
    UPDATE public.luca_prewatch SET quiz_answers = v_answers WHERE member_id = v_member AND week_n = p_week;
  END IF;
  v_answer := (v_quiz->p_q->>'answer')::integer;
  RETURN jsonb_build_object('correct', v_answer = v_mine, 'answer', v_answer, 'chosen', v_mine);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_prewatch_check(text, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_prewatch_check(text, integer, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_prewatch_complete(p_slug text, p_week integer, p_answers integer[], p_summary_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog public.luca_programs;
  v_member uuid;
  v_quiz jsonb;
  v_score integer := 0;
  v_recorded integer[];
  i integer;
  v_awarded integer;
BEGIN
  IF NOT public.luca__valid_url(p_summary_url) THEN RAISE EXCEPTION 'summary link' USING ERRCODE = '22023'; END IF;
  v_prog := public.luca__program(p_slug);
  v_member := public.luca__require_member(v_prog.id);
  IF NOT public.luca__prewatch_open(v_prog.id, p_week) THEN
    RAISE EXCEPTION 'this pre-watch is not open yet' USING ERRCODE = '22023';
  END IF;
  SELECT quiz INTO v_quiz FROM public.luca_weeks WHERE program_id = v_prog.id AND n = p_week;
  SELECT quiz_answers INTO v_recorded FROM public.luca_prewatch WHERE member_id = v_member AND week_n = p_week;
  IF jsonb_array_length(COALESCE(v_quiz, '[]'::jsonb)) > 0 THEN
    FOR i IN 0 .. jsonb_array_length(v_quiz) - 1 LOOP
      IF COALESCE(v_recorded[i + 1], -1) < 0 THEN
        RAISE EXCEPTION 'answer every question' USING ERRCODE = '22023';
      END IF;
      IF (v_quiz->i->>'answer')::integer = v_recorded[i + 1] THEN v_score := v_score + 1; END IF;
    END LOOP;
  END IF;

  INSERT INTO public.luca_prewatch (member_id, week_n, quiz_answers, quiz_score, summary_url, completed_at)
  VALUES (v_member, p_week, COALESCE(v_recorded, '{}'), v_score, p_summary_url, now())
  ON CONFLICT (member_id, week_n) DO UPDATE
    SET quiz_score = EXCLUDED.quiz_score,
        summary_url = EXCLUDED.summary_url,
        completed_at = COALESCE(public.luca_prewatch.completed_at, EXCLUDED.completed_at);

  v_awarded := public.luca__award(v_member, 'prewatch', 'pw:' || p_week, true);
  IF p_week = 0 THEN
    UPDATE public.luca_members SET setup = setup || '{"pw0":true}'::jsonb WHERE id = v_member;
    PERFORM public.luca__check_setup(v_member);
  END IF;
  RETURN jsonb_build_object('score', v_score, 'of', jsonb_array_length(COALESCE(v_quiz, '[]'::jsonb)), 'awarded', v_awarded);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_prewatch_complete(text, integer, integer[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_prewatch_complete(text, integer, integer[], text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 8. The Sprint: one entry per day, today only
--    Track A posts a link every day. Track B posts 3–4 times a week and logs
--    the other days (a short line on what they did).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luca_sprint_log(p_slug text, p_kind text, p_url text, p_log text, p_title text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog public.luca_programs;
  v_member uuid;
  v_mem public.luca_members;
  v_start date;
  v_days integer;
  v_day integer;
  v_id uuid;
  v_awarded integer;
BEGIN
  v_prog := public.luca__program(p_slug);
  IF NOT COALESCE((v_prog.features->>'sprint')::boolean, true) THEN RAISE EXCEPTION 'no sprint' USING ERRCODE = '22023'; END IF;
  v_member := public.luca__require_member(v_prog.id);
  SELECT * INTO v_mem FROM public.luca_members WHERE id = v_member;
  v_start := NULLIF(v_prog.sprint->>'starts_on', '')::date;
  v_days := COALESCE((v_prog.sprint->>'days')::integer, 21);
  IF v_start IS NULL THEN RAISE EXCEPTION 'the sprint has no start date yet' USING ERRCODE = '22023'; END IF;
  v_day := public.luca__local_day(v_prog.id) - v_start + 1;
  IF v_day < 1 OR v_day > v_days THEN RAISE EXCEPTION 'the sprint is not running today' USING ERRCODE = '22023'; END IF;

  IF p_kind = 'post' THEN
    IF NOT public.luca__valid_url(p_url) THEN RAISE EXCEPTION 'link' USING ERRCODE = '22023'; END IF;
  ELSIF p_kind = 'log' THEN
    IF v_mem.track <> 'B' THEN RAISE EXCEPTION 'Track A posts every day' USING ERRCODE = '22023'; END IF;
    IF length(trim(COALESCE(p_log, ''))) NOT BETWEEN 3 AND 600 THEN RAISE EXCEPTION 'log' USING ERRCODE = '22023'; END IF;
  ELSE
    RAISE EXCEPTION 'kind' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.luca_sprint_posts (program_id, member_id, day_n, kind, url, log, title)
  VALUES (v_prog.id, v_member, v_day, p_kind,
          CASE WHEN p_kind = 'post' THEN p_url END,
          CASE WHEN p_kind = 'log' THEN trim(p_log) END,
          NULLIF(left(trim(COALESCE(p_title, '')), 140), ''))
  ON CONFLICT (member_id, day_n) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'today is already in' USING ERRCODE = '23505'; END IF;

  v_awarded := public.luca__award(v_member,
                 CASE WHEN p_kind = 'post' THEN 'sprint_post' ELSE 'sprint_log' END,
                 'sprint:' || v_day, true, NULL,
                 CASE WHEN p_kind = 'post' THEN 'Sprint day ' || v_day || ' published' ELSE 'Sprint day ' || v_day || ' logged' END);
  RETURN jsonb_build_object('id', v_id, 'day', v_day, 'awarded', v_awarded);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_sprint_log(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_sprint_log(text, text, text, text, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 9. The Clan: feedback (+coins) and nudges (a notification, once a day)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luca_feedback(p_slug text, p_to uuid, p_ref text, p_chips text[], p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog public.luca_programs;
  v_member uuid;
  v_me public.luca_members;
  v_to public.luca_members;
  v_ok boolean := false;
  v_ref_id uuid;
  v_ref text;
  v_parts text[];
  v_idx integer;
  v_awarded integer;
  v_chips text[];
BEGIN
  v_prog := public.luca__program(p_slug);
  v_member := public.luca__require_member(v_prog.id);
  SELECT * INTO v_me FROM public.luca_members WHERE id = v_member;
  SELECT * INTO v_to FROM public.luca_members WHERE id = p_to AND program_id = v_prog.id;
  IF NOT FOUND OR v_to.id = v_member THEN RAISE EXCEPTION 'member not found' USING ERRCODE = 'P0002'; END IF;

  SELECT array_agg(left(c, 40)) INTO v_chips FROM unnest(COALESCE(p_chips, '{}')) c WHERE length(trim(c)) > 0;
  IF COALESCE(array_length(v_chips, 1), 0) = 0 AND length(trim(COALESCE(p_body, ''))) = 0 THEN
    RAISE EXCEPTION 'say something' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(array_length(v_chips, 1), 0) > 8 OR length(COALESCE(p_body, '')) > 500 THEN
    RAISE EXCEPTION 'too long' USING ERRCODE = '22023';
  END IF;

  -- Feedback is for your Clan, once the Clans are out.
  IF v_me.clan_id IS NULL OR v_to.clan_id IS DISTINCT FROM v_me.clan_id OR NOT public.luca__clans_open(v_prog.id) THEN
    RAISE EXCEPTION 'feedback is for people in your Clan' USING ERRCODE = '42501';
  END IF;

  -- The post must really be theirs. Refs are rebuilt from parsed parts, so
  -- one post has exactly one ref: sprint:<uuid> or sub:<uuid>:<part index>.
  v_parts := string_to_array(COALESCE(p_ref, ''), ':');
  BEGIN
    IF v_parts[1] = 'sprint' AND array_length(v_parts, 1) = 2 THEN
      v_ref_id := v_parts[2]::uuid;
      v_ok := EXISTS (SELECT 1 FROM public.luca_sprint_posts
                       WHERE id = v_ref_id AND member_id = p_to AND kind = 'post' AND url IS NOT NULL);
      v_ref := 'sprint:' || v_ref_id;
    ELSIF v_parts[1] = 'sub' AND array_length(v_parts, 1) = 3 AND v_parts[3] ~ '^[0-9]{1,2}$' THEN
      v_ref_id := v_parts[2]::uuid;
      v_idx := v_parts[3]::integer;
      v_ok := EXISTS (SELECT 1 FROM public.luca_submissions s
                       WHERE s.id = v_ref_id AND s.member_id = p_to
                         AND v_idx < jsonb_array_length(s.links)
                         AND s.links->v_idx->>'kind' IN ('post','profile'));
      v_ref := 'sub:' || v_ref_id || ':' || v_idx;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN v_ok := false;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'post not found' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.luca_feedback (program_id, from_member, to_member, post_ref, chips, body)
  VALUES (v_prog.id, v_member, p_to, v_ref, COALESCE(v_chips, '{}'), NULLIF(trim(COALESCE(p_body, '')), ''))
  ON CONFLICT (from_member, to_member, post_ref) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'already sent' USING ERRCODE = '23505'; END IF;

  v_awarded := public.luca__award(v_member, 'feedback', 'fb:' || p_to || ':' || v_ref, true, NULL,
                 'Feedback for ' || split_part(v_to.display_name, ' ', 1));
  PERFORM public.luca__notify(p_to, 'luca_feedback',
    split_part(v_me.display_name, ' ', 1) || ' left feedback on your post',
    COALESCE(NULLIF(trim(COALESCE(p_body, '')), ''), array_to_string(v_chips, ' · ')),
    '/luca/' || v_prog.slug || '/clan');
  RETURN jsonb_build_object('awarded', v_awarded);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_feedback(text, uuid, text, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_feedback(text, uuid, text, text[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_nudge(p_slug text, p_to uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog public.luca_programs;
  v_member uuid;
  v_me public.luca_members;
  v_to public.luca_members;
BEGIN
  v_prog := public.luca__program(p_slug);
  v_member := public.luca__require_member(v_prog.id);
  SELECT * INTO v_me FROM public.luca_members WHERE id = v_member;
  SELECT * INTO v_to FROM public.luca_members WHERE id = p_to AND program_id = v_prog.id;
  IF NOT FOUND OR v_to.id = v_member OR v_to.clan_id IS DISTINCT FROM v_me.clan_id OR v_me.clan_id IS NULL
     OR NOT public.luca__clans_open(v_prog.id) THEN
    RAISE EXCEPTION 'you can nudge people in your Clan' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.luca_nudges (program_id, from_member, to_member, ist_day)
  VALUES (v_prog.id, v_member, p_to, public.luca__local_day(v_prog.id))
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('sent', false); END IF;
  PERFORM public.luca__notify(p_to, 'luca_nudge',
    split_part(v_me.display_name, ' ', 1) || ' nudged you',
    'Your Clan is moving. Open ' || COALESCE(NULLIF(v_prog.short_name, ''), 'the cohort') || ' and do one thing today.',
    '/luca/' || v_prog.slug || '/today');
  RETURN jsonb_build_object('sent', true);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_nudge(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_nudge(text, uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 10. Mentor desk (staff of the program: admins + linked mentors)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luca__require_staff(p_program uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_mentor uuid;
BEGIN
  IF NOT public.luca_is_staff(p_program) THEN
    RAISE EXCEPTION 'mentors only' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_mentor FROM public.luca_mentors WHERE program_id = p_program AND user_id = auth.uid() LIMIT 1;
  RETURN v_mentor;
END;
$$;
REVOKE ALL ON FUNCTION public.luca__require_staff(uuid) FROM PUBLIC, anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.luca_review(p_submission uuid, p_verdict text, p_notes text[], p_fix_due timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.luca_submissions;
  v_a public.luca_assignments;
  v_prog public.luca_programs;
  v_mentor uuid;
  v_notes text[];
  v_who text;
BEGIN
  IF p_verdict NOT IN ('ship','fix','hold') THEN RAISE EXCEPTION 'verdict' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_s FROM public.luca_submissions WHERE id = p_submission;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_a FROM public.luca_assignments WHERE id = v_s.assignment_id;
  SELECT * INTO v_prog FROM public.luca_programs WHERE id = v_a.program_id;
  v_mentor := public.luca__require_staff(v_prog.id);

  SELECT array_agg(left(trim(n), 400)) INTO v_notes FROM unnest(COALESCE(p_notes, '{}')) n WHERE length(trim(n)) > 0;
  IF COALESCE(array_length(v_notes, 1), 0) > 10 THEN RAISE EXCEPTION 'at most 10 notes' USING ERRCODE = '22023'; END IF;

  UPDATE public.luca_submissions
     SET verdict = p_verdict, notes = COALESCE(v_notes, '{}'),
         reviewed_by = v_mentor, reviewed_by_user = auth.uid(), reviewed_at = now(),
         fix_due_at = CASE WHEN p_verdict = 'fix' THEN p_fix_due ELSE fix_due_at END
   WHERE id = v_s.id;

  IF p_verdict = 'ship' THEN
    PERFORM public.luca__award(v_s.member_id, 'ship', 'ship:' || v_a.id, false, NULL,
      'Ship: Week ' || v_a.week_n);
  END IF;
  SELECT split_part(name, ' ', 1) INTO v_who FROM public.luca_mentors WHERE id = v_mentor;
  PERFORM public.luca__notify(v_s.member_id, 'luca_verdict',
    COALESCE(v_who, 'Your mentor') || ' called it: ' || initcap(p_verdict),
    'Week ' || v_a.week_n || ' · ' || v_a.title,
    '/luca/' || v_prog.slug || '/assign/' || v_a.id);
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_review(uuid, text, text[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_review(uuid, text, text[], timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_sprint_verdict(p_post uuid, p_verdict text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_p public.luca_sprint_posts; v_mentor uuid; v_slug text;
BEGIN
  IF p_verdict NOT IN ('ship','fix','pending') THEN RAISE EXCEPTION 'verdict' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_p FROM public.luca_sprint_posts WHERE id = p_post;
  IF NOT FOUND THEN RAISE EXCEPTION 'post not found' USING ERRCODE = 'P0002'; END IF;
  v_mentor := public.luca__require_staff(v_p.program_id);
  UPDATE public.luca_sprint_posts
     SET verdict = p_verdict, verdict_note = NULLIF(left(trim(COALESCE(p_note, '')), 400), ''),
         reviewed_by = v_mentor, reviewed_at = now()
   WHERE id = p_post;
  IF p_verdict <> 'pending' THEN
    SELECT slug INTO v_slug FROM public.luca_programs WHERE id = v_p.program_id;
    PERFORM public.luca__notify(v_p.member_id, 'luca_verdict',
      'Sprint day ' || v_p.day_n || ': ' || initcap(p_verdict),
      COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), 'Your mentor called today''s post.'),
      '/luca/' || v_slug || '/sprint');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_sprint_verdict(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_sprint_verdict(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_hotseat_set(p_session uuid, p_members uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_s public.luca_sessions; i integer;
BEGIN
  SELECT * INTO v_s FROM public.luca_sessions WHERE id = p_session;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.luca__require_staff(v_s.program_id);
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_members, '{}')) x
              WHERE NOT EXISTS (SELECT 1 FROM public.luca_members m WHERE m.id = x AND m.program_id = v_s.program_id)) THEN
    RAISE EXCEPTION 'member not in this cohort' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.luca_hotseat WHERE session_id = p_session AND NOT (member_id = ANY (COALESCE(p_members, '{}')));
  FOR i IN 1 .. COALESCE(array_length(p_members, 1), 0) LOOP
    INSERT INTO public.luca_hotseat (session_id, member_id, position) VALUES (p_session, p_members[i], i)
    ON CONFLICT (session_id, member_id) DO UPDATE SET position = EXCLUDED.position;
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_hotseat_set(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_hotseat_set(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.luca_hotseat_mark(p_session uuid, p_member uuid, p_rec_at_sec integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog uuid;
BEGIN
  SELECT program_id INTO v_prog FROM public.luca_sessions WHERE id = p_session;
  IF v_prog IS NULL THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.luca__require_staff(v_prog);
  UPDATE public.luca_hotseat SET rec_at_sec = p_rec_at_sec WHERE session_id = p_session AND member_id = p_member;
  RETURN jsonb_build_object('ok', FOUND);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_hotseat_mark(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_hotseat_mark(uuid, uuid, integer) TO authenticated;

-- Manual awards (Demo Day completed, community posts, corrections). Admins only.
CREATE OR REPLACE FUNCTION public.luca_award_manual(p_member uuid, p_rule text, p_amount integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_prog uuid; v_awarded integer; v_ref text;
BEGIN
  SELECT program_id INTO v_prog FROM public.luca_members WHERE id = p_member;
  IF v_prog IS NULL THEN RAISE EXCEPTION 'member not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE = '42501'; END IF;
  IF p_amount IS NOT NULL AND (p_amount = 0 OR abs(p_amount) > 5000) THEN
    RAISE EXCEPTION 'amount' USING ERRCODE = '22023';
  END IF;
  -- One-off rules can only ever be awarded once; everything else is per action.
  v_ref := CASE WHEN p_rule IN ('demo_day','setup','joined') THEN p_rule
                ELSE 'manual:' || gen_random_uuid() END;
  v_awarded := public.luca__award(p_member, COALESCE(NULLIF(p_rule, ''), 'manual'), v_ref, false, p_amount,
                 COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'Awarded by your mentor'));
  RETURN jsonb_build_object('awarded', v_awarded);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_award_manual(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_award_manual(uuid, text, integer, text) TO authenticated;

-- Form Clans: balance unassigned members across named Clans (admins only).
CREATE OR REPLACE FUNCTION public.luca_form_clans(p_slug text, p_names text[], p_size integer, p_reset boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog public.luca_programs;
  v_n integer;
  v_clans integer;
  v_ids uuid[];
  v_name text;
  i integer := 0;
  r record;
BEGIN
  v_prog := public.luca__program(p_slug);
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE = '42501'; END IF;
  IF p_size IS NULL OR p_size < 2 OR p_size > 20 THEN RAISE EXCEPTION 'size' USING ERRCODE = '22023'; END IF;
  IF p_reset THEN
    UPDATE public.luca_members SET clan_id = NULL WHERE program_id = v_prog.id AND NOT is_ghost;
  END IF;
  SELECT count(*) INTO v_n FROM public.luca_members WHERE program_id = v_prog.id AND clan_id IS NULL;
  IF v_n = 0 THEN RETURN jsonb_build_object('assigned', 0); END IF;

  -- Use existing Clans first; create only as many new ones as are missing.
  v_clans := GREATEST(1, ceil(
    (v_n + (SELECT count(*) FROM public.luca_members WHERE program_id = v_prog.id AND clan_id IS NOT NULL))::numeric
    / p_size)::integer);
  i := 0;
  WHILE (SELECT count(*) FROM public.luca_clans WHERE program_id = v_prog.id) < v_clans AND i < 200 LOOP
    i := i + 1;
    v_name := COALESCE(NULLIF(trim(p_names[i]), ''), 'Clan ' || i);
    INSERT INTO public.luca_clans (program_id, name, sort) VALUES (v_prog.id, v_name, i)
    ON CONFLICT (program_id, name) DO NOTHING;
  END LOOP;
  SELECT array_agg(id ORDER BY sort, name) INTO v_ids FROM public.luca_clans WHERE program_id = v_prog.id;

  -- Fill the smallest Clan each time; Track B and Track A spread evenly.
  i := 0;
  FOR r IN SELECT id FROM public.luca_members
            WHERE program_id = v_prog.id AND clan_id IS NULL
            ORDER BY track, random() LOOP
    UPDATE public.luca_members SET clan_id = (
      SELECT c.id FROM public.luca_clans c
       WHERE c.program_id = v_prog.id
       ORDER BY (SELECT count(*) FROM public.luca_members m WHERE m.clan_id = c.id), c.sort
       LIMIT 1)
     WHERE id = r.id;
    i := i + 1;
  END LOOP;
  RETURN jsonb_build_object('assigned', i, 'clans', array_length(v_ids, 1));
END;
$$;
REVOKE ALL ON FUNCTION public.luca_form_clans(text, text[], integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_form_clans(text, text[], integer, boolean) TO authenticated;

-- Calendar feed lookup for the luca-calendar edge function (service role only).
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
