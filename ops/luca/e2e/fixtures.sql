-- ============================================================================
-- LUCA end-to-end kit: a REAL (non-demo) cohort plus people, for a scratch
-- database. Load after stubs.sql, the LUCA migrations and the demo seed (the
-- copy is borrowed from the demo). Everything is timed relative to now() so
-- every state is reachable whenever the suite runs:
--   · a session live now, one starting in 12 minutes, one tomorrow, two past
--   · an assignment due in 5 hours, one in 3 days, one already late
--   · Sprint day 9 today; week 4 started two days ago
-- ============================================================================
-- People (ids are fixed so tests and the preview can sign in as them)
INSERT INTO auth.users (id) VALUES
 ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000b3'), ('00000000-0000-0000-0000-0000000000d1'),
 ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000f1');
INSERT INTO public.users (id, email, phone, full_name, role, city) VALUES
 ('00000000-0000-0000-0000-0000000000a1', 'ada.admin@e2e.test',   '+910000000001', 'Ada Admin',     'admin',      'Chennai'),
 ('00000000-0000-0000-0000-0000000000c1', 'mo.mentor@e2e.test',   '+910000000002', 'Mo Mentor',     'instructor', 'Mumbai'),
 ('00000000-0000-0000-0000-0000000000b1', 'lena.one@e2e.test',    '+910000000003', 'Lena One',      'student',    'Pune'),
 ('00000000-0000-0000-0000-0000000000b2', 'lou.two@e2e.test',     '+910000000004', 'Lou Two',       'student',    'Delhi'),
 ('00000000-0000-0000-0000-0000000000b3', 'leo.three@e2e.test',   '+910000000005', 'Leo Three',     'student',    'Kochi'),
 ('00000000-0000-0000-0000-0000000000d1', 'kim.locked@e2e.test',  '+910000000006', 'Kim Locked',    'student',    'Goa'),
 ('00000000-0000-0000-0000-0000000000e1', 'pia.applies@e2e.test', '+910000000007', 'Pia Applicant', 'student',    'Jaipur'),
 ('00000000-0000-0000-0000-0000000000f1', 'oz.outside@e2e.test',  '+910000000008', 'Oz Outsider',   'student',    'Surat');

INSERT INTO public.offerings (id, title, slug, status, payment_mode, price_inr, app_fee_inr, confirmation_amount_inr, balance_deadline_days, calendly_url)
VALUES ('11111111-1111-1111-1111-111111111111', 'LUCA Cohort 03 (e2e)', 'luca-c3-e2e', 'active', 'staged', 45000, 400, 8000, 15, 'https://calendly.com/levelup/interview');

-- The cohort, with the demo's copy, coin values and features.
INSERT INTO public.luca_programs (id, slug, offering_id, is_demo, enabled, name, short_name, cohort_label,
  starts_at, demo_day_at, ends_at, seats, hours_per_week, hero_url, timezone, whatsapp_url, drive_url, support_whatsapp,
  features, coin_rules, content, pricing, sprint, clan_config)
SELECT '22222222-2222-2222-2222-222222222222', 'luca-c3', '11111111-1111-1111-1111-111111111111', false, true,
  d.name, d.short_name, 'Cohort 03',
  (((now() AT TIME ZONE 'Asia/Kolkata')::date - 30)::timestamp + interval '18 hours') AT TIME ZONE 'Asia/Kolkata',
  now() + interval '55 days', now() + interval '70 days', 40, 11, d.hero_url, 'Asia/Kolkata',
  'https://chat.whatsapp.com/e2e', 'https://drive.google.com/drive/folders/e2e', '919000000000',
  d.features, d.coin_rules, d.content - 'demo', jsonb_build_object('emi', true),
  jsonb_build_object('starts_on', (now() AT TIME ZONE 'Asia/Kolkata')::date - 8, 'days', 21, 'track_b_posts_per_week', 3),
  '{"names":[],"size":4,"reveal_at":null}'::jsonb
FROM public.luca_programs d WHERE d.slug = 'luca-demo';

INSERT INTO public.luca_mentors (id, program_id, name, angle, user_id, sort) VALUES
 ('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222222', 'Mo Mentor', 'Story and hooks', '00000000-0000-0000-0000-0000000000c1', 1),
 ('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222222', 'Sai Guest', 'Editing', NULL, 2);

-- Weeks 0..12 a week apart (week 4 started two days ago) and a Demo Day week.
INSERT INTO public.luca_weeks (program_id, n, module, phase, starts_on, is_sprint, is_demo_week, prewatch, quiz)
SELECT '22222222-2222-2222-2222-222222222222', n, 'Module ' || n, LEAST(4, 1 + n / 4),
  (now() AT TIME ZONE 'Asia/Kolkata')::date - 30 + 7 * n, n BETWEEN 10 AND 12, n = 13,
  CASE WHEN n IN (0, 4, 9) THEN jsonb_build_object('title', 'Pre-watch ' || n, 'video_url', 'https://youtu.be/dQw4w9WgXcQ', 'minutes', 12) ELSE '{}'::jsonb END,
  CASE WHEN n = 0 THEN '[{"q":"What protects your hot seat?","options":["Nothing","The pre-watch"],"answer":1}]'::jsonb
       WHEN n = 4 THEN '[{"q":"Shot division is","options":["Planning shots","Picking music","Cutting reels"],"answer":0},{"q":"First on a phone","options":["A lens","Light"],"answer":1}]'::jsonb
       WHEN n = 9 THEN '[{"q":"Sprint length","options":["7","21"],"answer":1}]'::jsonb
       ELSE '[]'::jsonb END
FROM generate_series(0, 13) n;

INSERT INTO public.luca_sessions (id, program_id, week_n, kind, title, starts_at, ends_at, mentor_ids, prep, zoom_url, recording_url, recording_minutes, chapters, files) VALUES
 ('44444444-4444-4444-4444-444444444400', '22222222-2222-2222-2222-222222222222', 0, 'orientation', 'Orientation',
   now() - interval '30 days', now() - interval '30 days' + interval '150 minutes', ARRAY['33333333-3333-3333-3333-333333333331']::uuid[], '{}', 'https://zoom.us/j/100',
   'https://youtu.be/dQw4w9WgXcQ', 150, '[{"at_sec":0,"title":"Welcome"},{"at_sec":1200,"title":"How it works"}]', '[{"badge":"PDF","title":"Slides","sub":"Orientation","url":"https://example.com/s.pdf"}]'),
 ('44444444-4444-4444-4444-444444444403', '22222222-2222-2222-2222-222222222222', 3, 'class', 'Hooks that hold',
   now() - interval '3 days', now() - interval '3 days' + interval '2 hours', ARRAY['33333333-3333-3333-3333-333333333331']::uuid[], '{}', 'https://zoom.us/j/103',
   'https://youtu.be/dQw4w9WgXcQ', 120, '[]', '[]'),
 ('44444444-4444-4444-4444-444444444441', '22222222-2222-2222-2222-222222222222', 4, 'review', 'Review: hooks, live',
   now() - interval '10 minutes', now() + interval '80 minutes', ARRAY['33333333-3333-3333-3333-333333333331']::uuid[], ARRAY['Your script open'], 'https://zoom.us/j/141', NULL, NULL, '[]', '[]'),
 ('44444444-4444-4444-4444-444444444442', '22222222-2222-2222-2222-222222222222', 4, 'class', 'Shot division',
   now() + interval '12 minutes', now() + interval '2 hours', ARRAY['33333333-3333-3333-3333-333333333332']::uuid[], '{}', 'https://zoom.us/j/142', NULL, NULL, '[]', '[]'),
 ('44444444-4444-4444-4444-444444444443', '22222222-2222-2222-2222-222222222222', 4, 'double', 'Shoot and cut, live',
   now() + interval '24 hours', now() + interval '28 hours', ARRAY['33333333-3333-3333-3333-333333333331','33333333-3333-3333-3333-333333333332']::uuid[], '{}', 'https://zoom.us/j/143', NULL, NULL, '[]', '[]'),
 ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 5, 'review', 'Review: first posts',
   now() + interval '6 days', now() + interval '6 days 2 hours', ARRAY['33333333-3333-3333-3333-333333333331']::uuid[], '{}', NULL, NULL, NULL, '[]', '[]');

INSERT INTO public.luca_assignments (id, program_id, week_n, title, brief, due_at, parts, coins, review_session_id) VALUES
 ('55555555-5555-5555-5555-555555555503', '22222222-2222-2222-2222-222222222222', 3, 'Hook scripts', 'Three hooks.', now() - interval '1 day',
   '[{"k":"doc","label":"Your scripts","where":"Google Doc"}]', NULL, NULL),
 ('55555555-5555-5555-5555-555555555504', '22222222-2222-2222-2222-222222222222', 4, 'Shot list + first post', 'Plan, shoot, post.', now() + interval '3 days',
   '[{"k":"doc","label":"Shot list","where":"Google Doc"},{"k":"post","label":"Your post","where":"Instagram or YouTube"}]', NULL, '44444444-4444-4444-4444-444444444444'),
 ('55555555-5555-5555-5555-555555555505', '22222222-2222-2222-2222-222222222222', 4, 'Quick check', NULL, now() + interval '5 hours',
   '[{"k":"doc","label":"A line","where":"Google Doc"}]', 50, NULL),
 ('55555555-5555-5555-5555-555555555509', '22222222-2222-2222-2222-222222222222', 9, 'Sprint contract + profile', NULL, now() + interval '50 days',
   '[{"k":"sign","label":"Sign your Sprint contract","where":"In the app"},{"k":"profile","label":"Your profile","where":"Instagram"}]', NULL, NULL);

INSERT INTO public.luca_clans (id, program_id, name, sort) VALUES
 ('66666666-6666-6666-6666-666666666661', '22222222-2222-2222-2222-222222222222', 'Hookline', 1),
 ('66666666-6666-6666-6666-666666666662', '22222222-2222-2222-2222-222222222222', 'Cutaway', 2);
INSERT INTO public.luca_announcements (program_id, title, body, pinned) VALUES
 ('22222222-2222-2222-2222-222222222222', 'Room change for Saturday', 'Same Zoom link, new start time.', true);
INSERT INTO public.luca_resources (program_id, week_n, title, url, kind) VALUES
 ('22222222-2222-2222-2222-222222222222', 4, 'Shot list template', 'https://docs.google.com/document/d/e2e', 'doc');

-- Seats: Lena paid in full through an application; Lou and Leo hold enrolments;
-- Kim paid the deposit 20 days ago (balance due after 15) so is locked out.
INSERT INTO public.payment_orders (id, user_id, offering_id, status, captured_at) VALUES
 ('77777777-7777-7777-7777-777777777771', '00000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'captured', now() - interval '40 days'),
 ('77777777-7777-7777-7777-777777777772', '00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', 'captured', now() - interval '20 days');
INSERT INTO public.cohort_applications (offering_id, user_id, full_name, email, status, accepted_at, app_fee_payment_id, confirmation_payment_id) VALUES
 ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b1', 'Lena One', 'lena.one@e2e.test', 'balance_paid', now() - interval '42 days', gen_random_uuid(), '77777777-7777-7777-7777-777777777771'),
 ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000d1', 'Kim Locked', 'kim.locked@e2e.test', 'confirmation_paid', now() - interval '22 days', gen_random_uuid(), '77777777-7777-7777-7777-777777777772');
INSERT INTO public.enrolments (user_id, offering_id) VALUES
 ('00000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111'),
 ('00000000-0000-0000-0000-0000000000b3', '11111111-1111-1111-1111-111111111111');

-- The LUCA switch on, as it will be at launch.
UPDATE public.luca_runtime_config SET surface_enabled = true WHERE singleton;
