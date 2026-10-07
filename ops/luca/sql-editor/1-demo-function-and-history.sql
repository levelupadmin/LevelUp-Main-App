-- LUCA · step 1 of 2 · run in the Supabase SQL editor (project ivkvluezuiojovpotlyb)
-- The demo day switcher (staff + demo programs only), then the migration
-- history rows so a later `supabase db push` treats all three LUCA files as applied.
-- Safe to run more than once.
CREATE OR REPLACE FUNCTION public.luca_demo_scenario(p_slug text, p_stage text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prog public.luca_programs;
  v_demo jsonb;
  v_order text[] := ARRAY['browse','applied','decision','prestart','orientation','week1','week5','sprint','demo','alumni'];
  v_ord integer;
  v_target timestamptz;
  v_old numeric;
  v_new numeric;
  v_delta interval;
  v_off interval;
  v_tz text;
  v_day_shift integer;
  v_today date;
  v_user public.users;
  v_name text;
  v_member uuid;
  v_hook uuid;
  v_aid jsonb; v_sid jsonb; v_gid jsonb;
  v_coins integer; v_rank integer; v_streak integer;
  v_done text[]; v_pw_max integer; v_sprint_done integer;
  v_sum integer;
  v_unit integer; v_val integer; v_rnd numeric;
  v_slots uuid[] := ARRAY[]::uuid[];
  v_ghosts uuid[];
  v_want text[] := ARRAY['aarav','meher','kabir','riya','tanvi'];
  v_want_off integer[] := ARRAY[-2,-5,3,7,12];
  v_n integer;
  v_t integer; v_d integer;
  i integer; k text; v_a record; v_s record;
  v_sprint_start date;
  v_links jsonb; v_part jsonb;
  v_review jsonb;
BEGIN
  v_prog := public.luca__program(p_slug);
  IF NOT v_prog.is_demo OR NOT public.luca_is_staff(v_prog.id) THEN
    RAISE EXCEPTION 'demo only' USING ERRCODE = '42501';
  END IF;
  v_ord := array_position(v_order, p_stage);
  IF v_ord IS NULL THEN RAISE EXCEPTION 'unknown stage' USING ERRCODE = '22023'; END IF;
  v_demo := v_prog.content->'demo';
  v_target := (v_demo->'stops'->>p_stage)::timestamptz;
  v_old := COALESCE((v_demo->>'offset_secs')::numeric, 0);
  v_new := extract(epoch FROM (now() - v_target));
  v_delta := make_interval(secs => v_new - v_old);
  v_off := make_interval(secs => v_new);
  v_tz := v_prog.timezone;
  v_day_shift := public.luca__local_day(v_prog.id, now()) - (v_target AT TIME ZONE v_tz)::date;
  v_aid := v_demo->'assignment_ids';
  v_sid := v_demo->'session_ids';
  v_gid := v_demo->'ghost_ids';
  UPDATE public.luca_programs p SET
    starts_at = p.starts_at + v_delta,
    demo_day_at = p.demo_day_at + v_delta,
    ends_at = p.ends_at + v_delta,
    sprint = CASE WHEN NULLIF(v_demo->'canon'->>'sprint_start', '') IS NULL THEN p.sprint
                  ELSE jsonb_set(p.sprint, '{starts_on}', to_jsonb((v_demo->'canon'->>'sprint_start')::date + v_day_shift)) END,
    clan_config = CASE WHEN NULLIF(p.clan_config->>'reveal_at', '') IS NULL THEN p.clan_config
                       ELSE jsonb_set(p.clan_config, '{reveal_at}', to_jsonb((p.clan_config->>'reveal_at')::timestamptz + v_delta)) END,
    content = jsonb_set(
      jsonb_set(p.content, '{demo,offset_secs}', to_jsonb(v_new)),
      '{breaks}', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'start', (b->>'start')::timestamptz + v_delta,
          'end', (b->>'end')::timestamptz + v_delta,
          'label', b->>'label'))
        FROM jsonb_array_elements(p.content->'breaks') b), '[]'::jsonb))
  WHERE p.id = v_prog.id;
  UPDATE public.luca_weeks w SET starts_on = (v_demo->'canon'->'week_starts'->>w.n::text)::date + v_day_shift
   WHERE w.program_id = v_prog.id AND (v_demo->'canon'->'week_starts'->>w.n::text) IS NOT NULL;
  UPDATE public.luca_sessions SET starts_at = starts_at + v_delta, ends_at = ends_at + v_delta WHERE program_id = v_prog.id;
  UPDATE public.luca_assignments SET due_at = due_at + v_delta WHERE program_id = v_prog.id;
  UPDATE public.luca_coin_ledger SET created_at = created_at + v_delta WHERE program_id = v_prog.id;
  UPDATE public.luca_submissions s SET submitted_at = s.submitted_at + v_delta,
         reviewed_at = s.reviewed_at + v_delta, fix_due_at = s.fix_due_at + v_delta,
         fix_submitted_at = s.fix_submitted_at + v_delta
    FROM public.luca_assignments a WHERE a.id = s.assignment_id AND a.program_id = v_prog.id;
  UPDATE public.luca_sprint_posts SET posted_at = posted_at + v_delta, reviewed_at = reviewed_at + v_delta WHERE program_id = v_prog.id;
  UPDATE public.luca_prewatch pw SET completed_at = pw.completed_at + v_delta
    FROM public.luca_members m WHERE m.id = pw.member_id AND m.program_id = v_prog.id;
  UPDATE public.luca_attendance at SET joined_at = at.joined_at + v_delta
    FROM public.luca_sessions s WHERE s.id = at.session_id AND s.program_id = v_prog.id;
  UPDATE public.luca_demo_slots d SET at = d.at + v_delta
    FROM public.luca_sessions s WHERE s.id = d.session_id AND s.program_id = v_prog.id;
  UPDATE public.luca_announcements SET created_at = created_at + v_delta WHERE program_id = v_prog.id;
  UPDATE public.luca_applications SET demo_interview_at = demo_interview_at + v_delta,
         demo_accepted_at = demo_accepted_at + v_delta, demo_confirmed_at = demo_confirmed_at + v_delta
   WHERE program_id = v_prog.id;
  DELETE FROM public.luca_nudges WHERE program_id = v_prog.id;
  DELETE FROM public.luca_feedback WHERE program_id = v_prog.id;
  SELECT * INTO v_prog FROM public.luca_programs WHERE id = v_prog.id;
  v_today := public.luca__local_day(v_prog.id);
  v_sprint_start := COALESCE(NULLIF(v_prog.sprint->>'starts_on', '')::date, v_today);
  DELETE FROM public.luca_members WHERE program_id = v_prog.id AND user_id = v_uid;
  DELETE FROM public.luca_applications WHERE program_id = v_prog.id AND user_id = v_uid;
  IF p_stage = 'browse' THEN
    RETURN jsonb_build_object('stage', p_stage, 'now', now());
  END IF;
  INSERT INTO public.luca_applications (program_id, user_id, answers, demo_status, demo_interview_at, demo_accepted_at, demo_confirmed_at)
  VALUES (v_prog.id, v_uid,
    jsonb_build_object('niche', v_demo->'me'->>'niche', 'handle', v_demo->'me'->>'handle',
                       'track', v_demo->'me'->>'track', 'why', v_demo->'me'->>'why', 'hours', true),
    CASE p_stage WHEN 'applied' THEN 'interview_scheduled' WHEN 'decision' THEN 'accepted' ELSE 'balance_paid' END,
    (v_demo->>'interview_at')::timestamptz + v_off,
    CASE WHEN v_ord >= 3 THEN now() - interval '1 hour' END,
    CASE WHEN v_ord >= 4 THEN '2026-10-08T10:20:00+05:30'::timestamptz + v_off END);
  IF p_stage IN ('applied','decision') THEN
    RETURN jsonb_build_object('stage', p_stage, 'now', now());
  END IF;
  v_coins := CASE p_stage WHEN 'prestart' THEN 200 WHEN 'orientation' THEN 400 WHEN 'week1' THEN 1250
               WHEN 'week5' THEN 3420 WHEN 'sprint' THEN 6980 WHEN 'demo' THEN 9850 ELSE 10350 END;
  v_rank := CASE p_stage WHEN 'prestart' THEN NULL WHEN 'orientation' THEN 22 WHEN 'week1' THEN 14
               WHEN 'week5' THEN 9 WHEN 'sprint' THEN 6 ELSE 4 END;
  v_streak := CASE p_stage WHEN 'prestart' THEN 0 WHEN 'orientation' THEN 1 WHEN 'week1' THEN 4
               WHEN 'week5' THEN 6 WHEN 'sprint' THEN 8 WHEN 'demo' THEN 21 ELSE 0 END;
  v_done := CASE p_stage WHEN 'week1' THEN ARRAY['a0'] WHEN 'week5' THEN ARRAY['a0','a1','a2','a3','a4']
               WHEN 'sprint' THEN ARRAY['a0','a1','a2','a3','a4','a5','a6','a7','a8','a9']
               WHEN 'demo' THEN ARRAY['a0','a1','a2','a3','a4','a5','a6','a7','a8','a9','a12']
               WHEN 'alumni' THEN ARRAY['a0','a1','a2','a3','a4','a5','a6','a7','a8','a9','a12']
               ELSE ARRAY[]::text[] END;
  v_pw_max := CASE p_stage WHEN 'prestart' THEN -1 WHEN 'orientation' THEN 0 WHEN 'week1' THEN 1
               WHEN 'week5' THEN 4 ELSE 9 END;
  v_sprint_done := CASE p_stage WHEN 'sprint' THEN 8 WHEN 'demo' THEN 21 WHEN 'alumni' THEN 21 ELSE 0 END;
  SELECT * INTO v_user FROM public.users WHERE id = v_uid;
  v_name := COALESCE(NULLIF(trim(v_user.full_name), ''), 'Diya Menon');
  v_hook := (SELECT id FROM public.luca_clans WHERE program_id = v_prog.id AND name = 'Hookline');
  INSERT INTO public.luca_members (program_id, user_id, display_name, initials, photo_url, niche, handle, track,
    clan_id, coins, streak, streak_day, setup, contract_name, contract_signed_at, revealed_at)
  VALUES (v_prog.id, v_uid, v_name,
    upper(left(regexp_replace((SELECT string_agg(left(w, 1), '') FROM unnest(string_to_array(v_name, ' ')) w WHERE w <> ''), '[^[:alnum:]]', '', 'g'), 2)),
    v_user.avatar_url, v_demo->'me'->>'niche', v_demo->'me'->>'handle', 'A',
    CASE WHEN v_ord >= 5 THEN v_hook END,
    v_coins, v_streak, CASE WHEN v_streak > 0 THEN v_today - 1 END,
    CASE WHEN v_ord >= 5 THEN '{"seat":true,"whatsapp":true,"calendar":true,"drive":true,"pw0":true}'::jsonb
         ELSE '{"seat":true}'::jsonb END,
    CASE WHEN v_ord >= 8 THEN v_name END,
    CASE WHEN v_ord >= 8 THEN '2027-01-03T12:00:00+05:30'::timestamptz + v_off END,
    CASE WHEN v_ord >= 6 THEN now() - interval '30 days' END)
  RETURNING id INTO v_member;
  INSERT INTO public.luca_coin_ledger (program_id, member_id, amount, rule, reason, ref_key, created_at)
  SELECT v_prog.id, v_member, x.amount, x.rule, x.reason, x.ref, x.at + v_off
    FROM (VALUES
      (0, 200, 'joined', 'Join the cohort', 'joined', '2026-10-08T10:20:00+05:30'::timestamptz),
      (4, 100, 'setup', 'Setup complete', 'setup', '2026-10-21T19:40:00+05:30'),
      (4, 50, 'prewatch', 'Pre-watch: Program OS', 'pw:0', '2026-10-22T21:05:00+05:30'),
      (5, 100, 'attend', 'Showed up: Orientation', 'attend:' || (v_sid->>'s01'), '2026-10-24T18:02:00+05:30'),
      (5, 150, 'submit_on_time', 'Week 0 in on time', 'submit:' || (v_aid->>'a0'), '2026-10-30T22:41:00+05:30'),
      (5, 100, 'ship', 'Sai said Ship: Week 0', 'ship:' || (v_aid->>'a0'), '2026-10-31T19:12:00+05:30'),
      (5, 25, 'feedback', 'Feedback for Aarav', 'demo:fb1', '2026-11-02T13:10:00+05:30'),
      (6, 150, 'submit_on_time', 'Week 4 in on time', 'submit:' || (v_aid->>'a4'), '2026-12-04T21:58:00+05:30'),
      (6, 100, 'attend', 'Class: The Script Engine', 'attend:' || (v_sid->>'s10'), '2026-11-29T15:01:00+05:30'),
      (6, 25, 'feedback', 'Feedback for Meher', 'demo:fb2', '2026-11-30T09:15:00+05:30'),
      (7, 250, 'sprint_post', 'Sprint day 7 published', 'sprint:7', '2027-01-15T20:05:00+05:30'),
      (7, 300, 'streak_bonus', 'Streak bonus, 7 days', 'demo:streak7', '2027-01-15T20:05:00+05:30'),
      (7, 250, 'sprint_post', 'Sprint day 8 published', 'sprint:8', '2027-01-16T19:32:00+05:30'),
      (8, 250, 'sprint_post', 'Sprint day 21 published', 'sprint:21', '2027-01-29T18:44:00+05:30'),
      (8, 300, 'streak_bonus', 'Streak bonus, 21 days', 'demo:streak21', '2027-01-29T18:44:00+05:30'),
      (9, 500, 'demo_day', 'Demo Day completed', 'demo_day', '2027-01-30T20:31:00+05:30')
    ) AS x(min_ord, amount, rule, reason, ref, at)
   WHERE v_ord >= x.min_ord + 1 OR (x.min_ord = 0);
  SELECT COALESCE(sum(amount), 0) INTO v_sum FROM public.luca_coin_ledger WHERE member_id = v_member;
  IF v_coins - v_sum > 0 THEN
    INSERT INTO public.luca_coin_ledger (program_id, member_id, amount, rule, reason, ref_key, created_at)
    VALUES (v_prog.id, v_member, v_coins - v_sum, 'manual', 'Earlier activity', 'demo:earlier',
            GREATEST(v_prog.starts_at, now() - interval '20 days'));
  END IF;
  FOREACH k IN ARRAY v_done LOOP
    SELECT * INTO v_a FROM public.luca_assignments WHERE id = (v_aid->>k)::uuid;
    v_links := '[]'::jsonb;
    FOR v_part IN SELECT value FROM jsonb_array_elements(v_a.parts) LOOP
      v_links := v_links || jsonb_build_array(jsonb_build_object(
        'kind', v_part->>'k', 'label', v_part->>'label',
        'url', CASE v_part->>'k'
                 WHEN 'sign' THEN NULL
                 WHEN 'doc' THEN 'https://docs.google.com/document/d/1Hq8xVb2kLmN0pR4sT6uW8yZ/edit'
                 WHEN 'sheet' THEN 'https://docs.google.com/spreadsheets/d/1Cx7aB3dE5fG7hJ9kL1mN3pQ/edit'
                 WHEN 'drive' THEN 'https://drive.google.com/drive/folders/1Vn2c4E6g8I0k2M4o6Q8s0U2'
                 WHEN 'voice' THEN 'https://drive.google.com/file/d/1Rk3d5F7h9J1l3N5p7R9t1V3/view'
                 WHEN 'profile' THEN 'https://www.instagram.com/diya.firstsalary/'
                 ELSE 'https://www.instagram.com/reel/DCq7Lm2sHk9/' END));
    END LOOP;
    v_review := v_demo->'reviews'->k;
    IF v_ord <= 7 AND k = 'a4' THEN
      INSERT INTO public.luca_submissions (assignment_id, member_id, links, submitted_at, on_time, verdict)
      VALUES (v_a.id, v_member, v_links, v_a.due_at - interval '2 hours', true, 'pending');
    ELSIF v_ord <= 7 AND v_review IS NOT NULL THEN
      INSERT INTO public.luca_submissions (assignment_id, member_id, links, submitted_at, on_time, verdict, notes,
             reviewed_by, reviewed_at, fix_due_at)
      VALUES (v_a.id, v_member, v_links, v_a.due_at - interval '1 day 2 hours', true, v_review->>'v',
              ARRAY(SELECT jsonb_array_elements_text(v_review->'notes')),
              (v_demo->'mentor_ids'->>(v_review->>'by'))::uuid, v_a.due_at + interval '19 hours',
              CASE WHEN v_review->>'v' = 'fix' THEN (v_review->>'fix_due')::timestamptz + v_off END);
    ELSE
      INSERT INTO public.luca_submissions (assignment_id, member_id, links, submitted_at, on_time, verdict, notes,
             reviewed_by, reviewed_at, was_fix)
      VALUES (v_a.id, v_member, v_links, v_a.due_at - interval '1 day 2 hours', true, 'ship',
              CASE WHEN k = 'a3' THEN ARRAY['Fixed. The hook is in the first line now. Ship it.']
                   WHEN v_review IS NOT NULL THEN ARRAY(SELECT jsonb_array_elements_text(v_review->'notes'))
                   ELSE ARRAY['Clear and specific. This is ready.', 'The hook lands in the first second. Keep doing that.'] END,
              (v_demo->'mentor_ids'->>COALESCE(v_review->>'by', 'sai'))::uuid, v_a.due_at + interval '19 hours',
              k = 'a3');
    END IF;
  END LOOP;
  IF v_pw_max >= 0 THEN
    INSERT INTO public.luca_prewatch (member_id, week_n, quiz_answers, quiz_score, summary_url, completed_at)
    SELECT v_member, w.n, '{}', 5, 'https://www.loom.com/share/7f3a9c1e2b4d6f8a',
           (w.starts_on::timestamp AT TIME ZONE v_tz) - interval '1 day'
      FROM public.luca_weeks w
     WHERE w.program_id = v_prog.id AND w.n <= v_pw_max AND w.prewatch <> '{}'::jsonb;
  END IF;
  INSERT INTO public.luca_attendance (session_id, member_id, joined_at)
  SELECT s.id, v_member, s.starts_at + interval '2 minutes'
    FROM public.luca_sessions s WHERE s.program_id = v_prog.id AND s.ends_at < now();
  FOR v_d IN 1 .. v_sprint_done LOOP
    INSERT INTO public.luca_sprint_posts (program_id, member_id, day_n, kind, url, title, posted_at, verdict, verdict_note)
    VALUES (v_prog.id, v_member, v_d, 'post', 'https://www.instagram.com/reel/DCq7Lm2sHk9/',
            v_demo->'sprint_titles'->>(v_d - 1),
            ((v_sprint_start + v_d - 1)::timestamp AT TIME ZONE v_tz) + interval '19 hours 30 minutes',
            'ship', CASE WHEN v_d % 4 = 0 THEN 'Hook in the first second. More of this.' END);
  END LOOP;
  INSERT INTO public.luca_rec_progress (session_id, member_id, seconds)
  SELECT s.id, v_member, x.secs
    FROM (VALUES ('s03', 116 * 60), ('s07', 121 * 60), ('s10', (0.42 * 162 * 60)::integer), ('s08', 174 * 60)) AS x(k, secs)
    JOIN public.luca_sessions s ON s.id = (v_sid->>x.k)::uuid
   WHERE s.ends_at < now();
  DELETE FROM public.luca_hotseat h USING public.luca_sessions s
   WHERE s.id = h.session_id AND s.program_id = v_prog.id;
  INSERT INTO public.luca_hotseat (session_id, member_id, position, rec_at_sec) VALUES
    ((v_sid->>'s03')::uuid, v_member, 3, 2530),
    ((v_sid->>'s07')::uuid, v_member, 2, 1120);
  INSERT INTO public.luca_hotseat (session_id, member_id, position)
  SELECT (v_sid->>'s11')::uuid, x.id, x.pos FROM (VALUES
    ((v_gid->>'aarav')::uuid, 1), ((v_gid->>'o0')::uuid, 2), ((v_gid->>'o1')::uuid, 3), (v_member, 4),
    ((v_gid->>'meher')::uuid, 5), ((v_gid->>'o2')::uuid, 6), ((v_gid->>'o3')::uuid, 7), ((v_gid->>'kabir')::uuid, 8)) AS x(id, pos);
  DELETE FROM public.luca_demo_slots d USING public.luca_sessions s
   WHERE s.id = d.session_id AND s.program_id = v_prog.id;
  INSERT INTO public.luca_demo_slots (session_id, member_id, slot_n, at)
  SELECT s.id, v_member, 9, s.starts_at + interval '72 minutes' FROM public.luca_sessions s WHERE s.id = (v_sid->>'s27')::uuid;
  DELETE FROM public.luca_coin_ledger l USING public.luca_members m WHERE m.id = l.member_id AND m.program_id = v_prog.id AND m.is_ghost;
  DELETE FROM public.luca_submissions s USING public.luca_members m WHERE m.id = s.member_id AND m.program_id = v_prog.id AND m.is_ghost;
  DELETE FROM public.luca_prewatch p USING public.luca_members m WHERE m.id = p.member_id AND m.program_id = v_prog.id AND m.is_ghost;
  DELETE FROM public.luca_sprint_posts p USING public.luca_members m WHERE m.id = p.member_id AND m.program_id = v_prog.id AND m.is_ghost;
  DELETE FROM public.luca_attendance a USING public.luca_members m WHERE m.id = a.member_id AND m.program_id = v_prog.id AND m.is_ghost;
  SELECT array_agg(id ORDER BY display_name) INTO v_ghosts FROM public.luca_members WHERE program_id = v_prog.id AND is_ghost;
  v_n := COALESCE(array_length(v_ghosts, 1), 0) + 1;
  IF v_rank IS NULL THEN
    UPDATE public.luca_members SET coins = 200 WHERE program_id = v_prog.id AND is_ghost;
  ELSE
    v_slots := array_fill(NULL::uuid, ARRAY[v_n]);
    v_slots[v_rank] := v_member;
    FOR i IN 1 .. 5 LOOP
      v_t := GREATEST(1, LEAST(v_n, v_rank + v_want_off[i]));
      v_d := 0;
      CONTINUE WHEN (v_gid->>v_want[i]) IS NULL OR v_n < 2;
      WHILE (v_slots[v_t + v_d] IS NOT NULL OR v_t + v_d < 1 OR v_t + v_d > v_n) AND abs(v_d) <= v_n LOOP
        v_d := CASE WHEN v_d <= 0 THEN -v_d + 1 ELSE -v_d END;
      END LOOP;
      CONTINUE WHEN abs(v_d) > v_n;
      v_slots[v_t + v_d] := (v_gid->>v_want[i])::uuid;
    END LOOP;
    i := 1;
    FOR v_s IN SELECT id FROM public.luca_members
                WHERE program_id = v_prog.id AND is_ghost AND NOT (id = ANY (array_remove(v_slots, NULL)))
                ORDER BY display_name LOOP
      WHILE i <= v_n AND v_slots[i] IS NOT NULL LOOP i := i + 1; END LOOP;
      EXIT WHEN i > v_n;
      v_slots[i] := v_s.id;
    END LOOP;
    v_unit := GREATEST(10, (round(v_coins * 0.035 / 10) * 10)::integer);
    v_val := v_coins + v_unit;
    FOR i IN REVERSE v_rank - 1 .. 1 LOOP
      UPDATE public.luca_members SET coins = v_val WHERE id = v_slots[i];
      v_rnd := (abs(hashtext(p_stage || ':up:' || i)) % 1000) / 1000.0;
      v_val := v_val + (round(v_unit * (0.4 + v_rnd * 1.4) / 10) * 10)::integer;
    END LOOP;
    v_val := v_coins;
    FOR i IN v_rank + 1 .. v_n LOOP
      v_rnd := (abs(hashtext(p_stage || ':dn:' || i)) % 1000) / 1000.0;
      v_val := GREATEST(v_val - (round(v_unit * (0.3 + v_rnd * 0.9) / 10) * 10)::integer,
                        200 + (round(v_rnd * 60 / 10) * 10)::integer);
      UPDATE public.luca_members SET coins = v_val WHERE id = v_slots[i];
    END LOOP;
    INSERT INTO public.luca_coin_ledger (program_id, member_id, amount, rule, reason, ref_key, created_at)
    SELECT v_prog.id, m.id, 80 + (abs(hashtext(m.id::text || p_stage)) % 52) * 10, 'manual', 'This week', 'demo:week', now() - interval '1 hour'
      FROM public.luca_members m WHERE m.program_id = v_prog.id AND m.is_ghost;
  END IF;
  IF p_stage = 'orientation' THEN
    INSERT INTO public.luca_attendance (session_id, member_id)
    SELECT (v_sid->>'s01')::uuid, (v_gid->>x)::uuid FROM unnest(ARRAY['aarav','meher','kabir','riya']) x;
  ELSIF p_stage = 'week1' THEN
    INSERT INTO public.luca_submissions (assignment_id, member_id, links, submitted_at, on_time)
    SELECT (v_aid->>'a1')::uuid, (v_gid->>x.k)::uuid,
           jsonb_build_array(
             jsonb_build_object('kind', 'doc', 'label', 'Positioning doc', 'url', 'https://docs.google.com/document/d/1Hq8xVb2kLmN0pR4sT6uW8yZ/edit'),
             jsonb_build_object('kind', 'post', 'label', 'Commit post', 'title', x.t, 'url', 'https://www.instagram.com/reel/DCq7Lm2sHk9/')),
           now() - x.ago, true
      FROM (VALUES ('meher', 'My ₹300 skincare shelf, honestly', interval '3 hours'),
                   ('aarav', 'I sit 10 hours a day. Here''s my plan.', interval '5 hours')) AS x(k, t, ago);
  ELSIF p_stage = 'week5' THEN
    INSERT INTO public.luca_prewatch (member_id, week_n, quiz_score, summary_url, completed_at)
    SELECT (v_gid->>x)::uuid, 5, 4, 'https://www.loom.com/share/7f3a9c1e2b4d6f8a', now() - interval '2 hours'
      FROM unnest(ARRAY['aarav','meher','tanvi']) x;
    INSERT INTO public.luca_submissions (assignment_id, member_id, links, submitted_at, on_time)
    SELECT (v_aid->>'a1')::uuid, (v_gid->>x.k)::uuid,
           jsonb_build_array(
             jsonb_build_object('kind', 'doc', 'label', 'Positioning doc', 'url', 'https://docs.google.com/document/d/1Hq8xVb2kLmN0pR4sT6uW8yZ/edit'),
             jsonb_build_object('kind', 'post', 'label', 'Post', 'title', x.t, 'url', 'https://www.instagram.com/reel/DCq7Lm2sHk9/')),
           now() - x.ago, true
      FROM (VALUES ('meher', 'Sunscreen under ₹300, tested', interval '4 hours'),
                   ('aarav', 'Desk stretches you can do in a meeting', interval '1 day'),
                   ('riya', 'Goa on ₹6,000', interval '2 days')) AS x(k, t, ago);
  ELSIF v_ord >= 8 THEN
    FOR k IN SELECT unnest(v_want) LOOP
      FOR v_d IN 1 .. CASE WHEN p_stage = 'sprint' THEN 9 ELSE 21 END LOOP
        CONTINUE WHEN (k = 'kabir' AND v_d = 3) OR (k = 'riya' AND v_d = 6);
        INSERT INTO public.luca_sprint_posts (program_id, member_id, day_n, kind, url, title, posted_at, verdict)
        VALUES (v_prog.id, (v_gid->>k)::uuid, v_d, 'post', 'https://www.instagram.com/reel/DCq7Lm2sHk9/',
                CASE WHEN p_stage = 'sprint' AND v_d = 9 THEN
                       CASE k WHEN 'tanvi' THEN 'Your first UX portfolio, in 3 slides'
                              WHEN 'kabir' THEN 'Cold emails that got replies'
                              WHEN 'meher' THEN 'Retinol, in 40 seconds' END END,
                CASE WHEN p_stage = 'sprint' AND v_d = 9 THEN now() - ((abs(hashtext(k)) % 5 + 1) || ' hours')::interval
                     ELSE ((v_sprint_start + v_d - 1)::timestamp AT TIME ZONE v_tz) + interval '20 hours' END,
                CASE WHEN p_stage = 'sprint' AND v_d = 9 THEN 'pending' ELSE 'ship' END);
      END LOOP;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('stage', p_stage, 'now', now(), 'member_id', v_member);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_demo_scenario(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.luca_demo_scenario(text, text) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261007100000', 'luca_core', '{}'),
       ('20261007100100', 'luca_rpcs', '{}'),
       ('20261007100200', 'luca_demo', '{}')
ON CONFLICT (version) DO NOTHING;
