-- LUCA step 3 of the SQL editor runs. Safe to re-run. Replaces three LUCA functions
-- (luca_desk, luca_calendar_feed, luca_room), adds one (luca_demo_clock) and records
-- the migration. No table changes, nothing deleted.

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
-- 4. luca_room also says the offering's payment_mode. The app opens a payment
--    only on a 'staged' offering (app fee, deposit, balance); on any other mode
--    create-razorpay-order would charge the full price for the fee step.
--
-- Additive and idempotent: CREATE OR REPLACE of four functions, same
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

-- 4. The room envelope, now with pricing.payment_mode.
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
      'calendly_url', o.calendly_url, 'payment_mode', o.payment_mode)
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

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261007100300', 'luca_desk_feed', '{}')
ON CONFLICT (version) DO NOTHING;
