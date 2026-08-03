-- Creator Academy Edition 2 production pilot seed.
--
-- Preconditions:
--   * Run only after the integrated cohort migrations and post-push guarded-DDL
--     checks are green.
--   * The offering and two existing production identities are deliberately
--     prerequisites. This script never creates or changes an auth identity.
--
-- Re-running this file is safe: every owned row has a deterministic UUID and
-- conflicting natural identities abort the transaction before any write.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF to_regclass('public.cohort_room_configs') IS NULL
     OR to_regclass('public.cohort_room_members') IS NULL
     OR to_regclass('public.cohort_announcements') IS NULL
     OR to_regclass('public.cohort_resources') IS NULL
     OR to_regclass('public.cohort_room_posts') IS NULL
  THEN
    RAISE EXCEPTION 'Room migrations are not fully applied';
  END IF;

  IF to_regprocedure('public.cohort_room_resolve_user(uuid)') IS NULL
     OR to_regprocedure('public.get_my_cohort_rooms()') IS NULL
     OR to_regprocedure('public.get_cohort_room(uuid)') IS NULL
     OR to_regprocedure('public.get_room_feed(uuid,text,uuid,timestamp with time zone,uuid,integer)') IS NULL
     OR to_regprocedure('public.get_room_resources(uuid,uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'Room RPC contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cohort_batches'::regclass
      AND conname = 'cohort_batches_id_offering_key'
      AND convalidated
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cohort_room_configs'::regclass
      AND conname = 'room_config_batch_belongs_to_offering'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'Guarded batch/config constraints did not land';
  END IF;

  IF to_regclass('public.notifications_room_unread_uniq') IS NULL THEN
    RAISE EXCEPTION 'notifications_room_unread_uniq did not land';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.cohort_batch_members'::regclass
      AND tgname = 'room_resolve_on_batch_member'
      AND tgenabled <> 'D'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.enrolments'::regclass
      AND tgname = 'room_resolve_on_enrolment_insert'
      AND tgenabled <> 'D'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.enrolments'::regclass
      AND tgname = 'room_resolve_on_enrolment_status'
      AND tgenabled <> 'D'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.cohort_applications'::regclass
      AND tgname = 'room_resolve_on_application_status'
      AND tgenabled <> 'D'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.cohort_announcements'::regclass
      AND tgname = 'cohort_announcement_notify'
      AND tgenabled <> 'D'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'A required room trigger did not land';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.offerings
    WHERE id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND slug = 'creator-academy-edition-2'
      AND title = 'Creator Academy Edition 2'
  ) THEN
    RAISE EXCEPTION 'Creator Academy Edition 2 offering identity changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN auth.users a ON a.id = u.id
    WHERE u.id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
      AND u.role = 'student'
      AND u.deleted_at IS NULL
      AND a.deleted_at IS NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN auth.users a ON a.id = u.id
    WHERE u.id = '614e5085-e98c-48f0-86dd-9df5f3147b39'
      AND u.role IN ('owner', 'admin', 'superadmin')
      AND u.deleted_at IS NULL
      AND a.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Pilot member or host is no longer usable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
      AND slug <> 'creator-academy-edition-2-room'
  ) OR EXISTS (
    SELECT 1 FROM public.courses
    WHERE slug = 'creator-academy-edition-2-room'
      AND id <> '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) THEN
    RAISE EXCEPTION 'Pilot course identity collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cohort_batches
    WHERE id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND (
        offering_id <> '449056b9-9269-4bc5-ba8b-4c079c2104ee'
        OR name <> 'Creator Academy Edition 2 - Pilot'
      )
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_batches
    WHERE offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND name = 'Creator Academy Edition 2 - Pilot'
      AND id <> '1a1908de-fb07-32de-fba0-f850eff82dc6'
  ) THEN
    RAISE EXCEPTION 'Pilot batch identity collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cohort_room_configs
    WHERE id = '155e49eb-66c9-894d-8613-6e5e19644e87'
      AND (
        offering_id <> '449056b9-9269-4bc5-ba8b-4c079c2104ee'
        OR batch_id IS DISTINCT FROM '1a1908de-fb07-32de-fba0-f850eff82dc6'::uuid
        OR slug <> 'creator-academy-edition-2'
      )
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_room_configs
    WHERE slug = 'creator-academy-edition-2'
      AND id <> '155e49eb-66c9-894d-8613-6e5e19644e87'
  ) THEN
    RAISE EXCEPTION 'Pilot room identity collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.enrolments
    WHERE id = 'f2c2f34a-2a51-1cb2-78ec-57c443a7419a'
      AND (
        user_id <> 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
        OR offering_id <> '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      )
  ) OR EXISTS (
    SELECT 1 FROM public.enrolments
    WHERE user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND status = 'active'
      AND id <> 'f2c2f34a-2a51-1cb2-78ec-57c443a7419a'
  ) THEN
    RAISE EXCEPTION 'Pilot enrolment collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cohort_batch_members
    WHERE batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND enrolment_id = 'f2c2f34a-2a51-1cb2-78ec-57c443a7419a'
      AND id <> '32360ea7-14fc-f095-8f62-1797cd6caf02'
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_room_members
    WHERE user_id = '614e5085-e98c-48f0-86dd-9df5f3147b39'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND id <> '74f5fdc9-7312-fee8-855b-b447bf4ee9be'
  ) THEN
    RAISE EXCEPTION 'Pilot roster identity collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cohort_weeks
    WHERE id = 'fba6fb94-3bd0-c264-2c99-fac42e36fc7f'
      AND cohort_batch_id <> '1a1908de-fb07-32de-fba0-f850eff82dc6'
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_weeks
    WHERE id = 'e2630f68-5a39-67a1-281e-8e481f660c87'
      AND cohort_batch_id <> '1a1908de-fb07-32de-fba0-f850eff82dc6'
  ) OR EXISTS (
    SELECT 1 FROM public.live_sessions
    WHERE id = '881cd194-4fcb-7366-d5c3-4178c6bd5af8'
      AND week_id IS DISTINCT FROM 'fba6fb94-3bd0-c264-2c99-fac42e36fc7f'::uuid
  ) OR EXISTS (
    SELECT 1 FROM public.live_sessions
    WHERE id = 'f8899583-f243-5fd6-21f8-e9eb55cd5fa2'
      AND week_id IS DISTINCT FROM 'e2630f68-5a39-67a1-281e-8e481f660c87'::uuid
  ) THEN
    RAISE EXCEPTION 'Pilot schedule identity collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cohort_announcements
    WHERE id = '6ba0eff3-dfec-b547-f22a-b100440b5564'
      AND offering_id <> '449056b9-9269-4bc5-ba8b-4c079c2104ee'
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_resources
    WHERE id = '1ca990b0-4e6b-8c19-a331-89a4d5ce7d8f'
      AND offering_id <> '449056b9-9269-4bc5-ba8b-4c079c2104ee'
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_room_posts
    WHERE id = '8fce7580-e9d9-34ae-5230-e8c3d14eccb2'
      AND offering_id <> '449056b9-9269-4bc5-ba8b-4c079c2104ee'
  ) THEN
    RAISE EXCEPTION 'Pilot content identity collision';
  END IF;
END
$guard$;

INSERT INTO public.courses (
  id, title, slug, subtitle, description,
  instructor_display_name, level, status, product_tier,
  primary_offering_id, show_on_browse
) VALUES (
  '75c1bdd7-b726-8356-8bbd-b153e22fb980',
  'Creator Academy Edition 2 - Cohort room',
  'creator-academy-edition-2-room',
  'Private room infrastructure',
  'Hidden course record used to scope Creator Academy Edition 2 live sessions.',
  'LevelUp',
  'intermediate',
  'draft',
  'live_cohort',
  '449056b9-9269-4bc5-ba8b-4c079c2104ee',
  false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.offering_courses (offering_id, course_id)
VALUES (
  '449056b9-9269-4bc5-ba8b-4c079c2104ee',
  '75c1bdd7-b726-8356-8bbd-b153e22fb980'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.cohort_batches (
  id, offering_id, name, max_students
) VALUES (
  '1a1908de-fb07-32de-fba0-f850eff82dc6',
  '449056b9-9269-4bc5-ba8b-4c079c2104ee',
  'Creator Academy Edition 2 - Pilot',
  30
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohort_room_configs (
  id, offering_id, batch_id, slug, phase, theme, vocab, modules
) VALUES (
  '155e49eb-66c9-894d-8613-6e5e19644e87',
  '449056b9-9269-4bc5-ba8b-4c079c2104ee',
  '1a1908de-fb07-32de-fba0-f850eff82dc6',
  'creator-academy-edition-2',
  'live',
  '{
    "accent_h": 40,
    "accent_s": 60,
    "accent_l": 87,
    "accent_text_l": 87,
    "wordmark_text": "Creator Academy",
    "monogram": "CA2",
    "texture": "grain",
    "tagline": "Make the work. Build the practice."
  }'::jsonb,
  '{
    "member_noun": "creator",
    "session_noun": "session",
    "feedback_session": "critique",
    "submission_noun": "work",
    "work_verb": "make",
    "recordings_label": "Screenings",
    "finale_label": "Demo Day",
    "tab_assignments": "Work",
    "niche_channels": [
      {"key": "shoot_room", "label": "Shoot room"},
      {"key": "edit_room", "label": "Edit room"}
    ]
  }'::jsonb,
  '{
    "weeks": true,
    "sessions": true,
    "recordings": true,
    "assignments": true,
    "peer_review": true,
    "announcements": true,
    "feed": true,
    "resources": true,
    "roster": true,
    "leaderboard": false,
    "demo_day": false,
    "certificates": true
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.enrolments (
  id, user_id, offering_id, status, starts_at,
  granted_by, source, total_paid_inr, balance_due_inr, edition_label
) VALUES (
  'f2c2f34a-2a51-1cb2-78ec-57c443a7419a',
  'e35895f3-a13b-4cda-ba2d-703d4874cda9',
  '449056b9-9269-4bc5-ba8b-4c079c2104ee',
  'active',
  now(),
  '614e5085-e98c-48f0-86dd-9df5f3147b39',
  'admin_grant',
  0,
  0,
  'Creator Academy Edition 2'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohort_batch_members (
  id, batch_id, enrolment_id
) VALUES (
  '32360ea7-14fc-f095-8f62-1797cd6caf02',
  '1a1908de-fb07-32de-fba0-f850eff82dc6',
  'f2c2f34a-2a51-1cb2-78ec-57c443a7419a'
)
ON CONFLICT (id) DO NOTHING;

-- Explicit self-heal even if a money-path trigger swallowed a transient error.
SELECT public.cohort_room_resolve_user(
  'e35895f3-a13b-4cda-ba2d-703d4874cda9'
);

INSERT INTO public.cohort_room_members (
  id, user_id, offering_id, batch_id, role, source, status
) VALUES (
  '74f5fdc9-7312-fee8-855b-b447bf4ee9be',
  '614e5085-e98c-48f0-86dd-9df5f3147b39',
  '449056b9-9269-4bc5-ba8b-4c079c2104ee',
  '1a1908de-fb07-32de-fba0-f850eff82dc6',
  'host',
  'manual',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohort_weeks (
  id, cohort_batch_id, week_number, theme, description,
  starts_on, ends_on, assignment_prompt, assignment_due_at,
  feedback_session_at, status, sort_order
) VALUES
(
  'fba6fb94-3bd0-c264-2c99-fac42e36fc7f',
  '1a1908de-fb07-32de-fba0-f850eff82dc6',
  1,
  'Finding the story',
  'Choose one clear idea and shape it into a project you can finish.',
  DATE '2026-08-03',
  DATE '2026-08-09',
  'Post a one-paragraph project brief: audience, promise, format, and the first thing you will make.',
  TIMESTAMPTZ '2026-08-07 18:00:00+05:30',
  TIMESTAMPTZ '2026-08-08 11:00:00+05:30',
  'active',
  1
),
(
  'e2630f68-5a39-67a1-281e-8e481f660c87',
  '1a1908de-fb07-32de-fba0-f850eff82dc6',
  2,
  'Building the system',
  'Turn the idea into a repeatable publishing workflow.',
  DATE '2026-08-10',
  DATE '2026-08-16',
  'Share a seven-day production plan with owners, deadlines, and one measurable output.',
  TIMESTAMPTZ '2026-08-14 18:00:00+05:30',
  TIMESTAMPTZ '2026-08-15 11:00:00+05:30',
  'upcoming',
  2
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.live_sessions (
  id, course_id, week_id, title, description,
  scheduled_at, duration_minutes, status, session_type
) VALUES
(
  '881cd194-4fcb-7366-d5c3-4178c6bd5af8',
  '75c1bdd7-b726-8356-8bbd-b153e22fb980',
  'fba6fb94-3bd0-c264-2c99-fac42e36fc7f',
  'Week 1 critique',
  'Pilot critique session for the first project brief.',
  TIMESTAMPTZ '2026-08-08 11:00:00+05:30',
  75,
  'scheduled',
  'critique'
),
(
  'f8899583-f243-5fd6-21f8-e9eb55cd5fa2',
  '75c1bdd7-b726-8356-8bbd-b153e22fb980',
  'e2630f68-5a39-67a1-281e-8e481f660c87',
  'Week 2 studio',
  'Pilot working session for building the publishing system.',
  TIMESTAMPTZ '2026-08-12 18:30:00+05:30',
  75,
  'scheduled',
  'live'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohort_announcements (
  id, offering_id, batch_id, author_id,
  title, body, is_pinned
) VALUES (
  '6ba0eff3-dfec-b547-f22a-b100440b5564',
  '449056b9-9269-4bc5-ba8b-4c079c2104ee',
  '1a1908de-fb07-32de-fba0-f850eff82dc6',
  '614e5085-e98c-48f0-86dd-9df5f3147b39',
  'Welcome to the room',
  'Your pilot room is live. Start with Week 1, then introduce yourself in the Feed.',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohort_resources (
  id, offering_id, batch_id, cohort_week_id,
  title, kind, url, added_by, sort_order
) VALUES (
  '1ca990b0-4e6b-8c19-a331-89a4d5ce7d8f',
  '449056b9-9269-4bc5-ba8b-4c079c2104ee',
  '1a1908de-fb07-32de-fba0-f850eff82dc6',
  'fba6fb94-3bd0-c264-2c99-fac42e36fc7f',
  'Your LevelUp learning library',
  'link',
  'https://app.leveluplearning.in/learn',
  '614e5085-e98c-48f0-86dd-9df5f3147b39',
  1
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohort_room_posts (
  id, offering_id, batch_id, author_id,
  kind, body, media, channel_key
) VALUES (
  '8fce7580-e9d9-34ae-5230-e8c3d14eccb2',
  '449056b9-9269-4bc5-ba8b-4c079c2104ee',
  '1a1908de-fb07-32de-fba0-f850eff82dc6',
  '614e5085-e98c-48f0-86dd-9df5f3147b39',
  'post',
  'Welcome to the Creator Academy room. Introduce yourself with the one project you want to finish this edition.',
  '[]'::jsonb,
  'general'
)
ON CONFLICT (id) DO NOTHING;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
      AND slug = 'creator-academy-edition-2-room'
      AND title = 'Creator Academy Edition 2 - Cohort room'
      AND status = 'draft'
      AND primary_offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND show_on_browse = false
  ) OR NOT EXISTS (
    SELECT 1 FROM public.offering_courses
    WHERE offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cohort_batches
    WHERE id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND name = 'Creator Academy Edition 2 - Pilot'
      AND max_students = 30
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cohort_room_configs
    WHERE id = '155e49eb-66c9-894d-8613-6e5e19644e87'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND slug = 'creator-academy-edition-2'
      AND phase = 'live'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.enrolments
    WHERE id = 'f2c2f34a-2a51-1cb2-78ec-57c443a7419a'
      AND user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND status = 'active'
      AND granted_by = '614e5085-e98c-48f0-86dd-9df5f3147b39'
      AND source = 'admin_grant'
      AND total_paid_inr = 0
      AND balance_due_inr = 0
      AND edition_label = 'Creator Academy Edition 2'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cohort_batch_members
    WHERE id = '32360ea7-14fc-f095-8f62-1797cd6caf02'
      AND batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND enrolment_id = 'f2c2f34a-2a51-1cb2-78ec-57c443a7419a'
  ) THEN
    RAISE EXCEPTION 'Pilot infrastructure manifest differs from the seed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cohort_room_members
    WHERE user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND role = 'member'
      AND source = 'derived'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Derived pilot membership was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cohort_room_members
    WHERE id = '74f5fdc9-7312-fee8-855b-b447bf4ee9be'
      AND role = 'host'
      AND source = 'manual'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Pilot host membership was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cohort_weeks
    WHERE id = 'fba6fb94-3bd0-c264-2c99-fac42e36fc7f'
      AND cohort_batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND week_number = 1
      AND starts_on = DATE '2026-08-03'
      AND ends_on = DATE '2026-08-09'
      AND status = 'active'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cohort_weeks
    WHERE id = 'e2630f68-5a39-67a1-281e-8e481f660c87'
      AND cohort_batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND week_number = 2
      AND starts_on = DATE '2026-08-10'
      AND ends_on = DATE '2026-08-16'
      AND status = 'upcoming'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.live_sessions
    WHERE id = '881cd194-4fcb-7366-d5c3-4178c6bd5af8'
      AND course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
      AND week_id = 'fba6fb94-3bd0-c264-2c99-fac42e36fc7f'
      AND scheduled_at = TIMESTAMPTZ '2026-08-08 11:00:00+05:30'
      AND status = 'scheduled'
      AND zoom_link IS NULL
      AND recording_url IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.live_sessions
    WHERE id = 'f8899583-f243-5fd6-21f8-e9eb55cd5fa2'
      AND course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
      AND week_id = 'e2630f68-5a39-67a1-281e-8e481f660c87'
      AND scheduled_at = TIMESTAMPTZ '2026-08-12 18:30:00+05:30'
      AND status = 'scheduled'
      AND zoom_link IS NULL
      AND recording_url IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cohort_announcements
    WHERE id = '6ba0eff3-dfec-b547-f22a-b100440b5564'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND author_id = '614e5085-e98c-48f0-86dd-9df5f3147b39'
      AND title = 'Welcome to the room'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cohort_resources
    WHERE id = '1ca990b0-4e6b-8c19-a331-89a4d5ce7d8f'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND cohort_week_id = 'fba6fb94-3bd0-c264-2c99-fac42e36fc7f'
      AND added_by = '614e5085-e98c-48f0-86dd-9df5f3147b39'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cohort_room_posts
    WHERE id = '8fce7580-e9d9-34ae-5230-e8c3d14eccb2'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND author_id = '614e5085-e98c-48f0-86dd-9df5f3147b39'
      AND kind = 'post'
      AND channel_key = 'general'
  ) THEN
    RAISE EXCEPTION 'Pilot schedule or content differs from the seed';
  END IF;

  IF (SELECT count(*) FROM public.cohort_weeks
      WHERE cohort_batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6') <> 2
     OR (SELECT count(*) FROM public.live_sessions
         WHERE id IN (
           '881cd194-4fcb-7366-d5c3-4178c6bd5af8',
           'f8899583-f243-5fd6-21f8-e9eb55cd5fa2'
         )) <> 2
     OR (SELECT count(*) FROM public.cohort_announcements
         WHERE id = '6ba0eff3-dfec-b547-f22a-b100440b5564') <> 1
     OR (SELECT count(*) FROM public.cohort_resources
         WHERE id = '1ca990b0-4e6b-8c19-a331-89a4d5ce7d8f') <> 1
     OR (SELECT count(*) FROM public.cohort_room_posts
         WHERE id = '8fce7580-e9d9-34ae-5230-e8c3d14eccb2') <> 1
  THEN
    RAISE EXCEPTION 'Pilot content manifest is incomplete';
  END IF;

  IF (SELECT count(*) FROM public.notifications
      WHERE user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
        AND type = 'room_announcement'
        AND link_url = '/cohort/449056b9-9269-4bc5-ba8b-4c079c2104ee?announcement=6ba0eff3-dfec-b547-f22a-b100440b5564') <> 1
  THEN
    RAISE EXCEPTION 'Pilot announcement notification did not fan out exactly once';
  END IF;
END
$verify$;

COMMIT;

SELECT jsonb_build_object(
  'offering_id', '449056b9-9269-4bc5-ba8b-4c079c2104ee',
  'batch_id', '1a1908de-fb07-32de-fba0-f850eff82dc6',
  'room_slug', 'creator-academy-edition-2',
  'member_user_id', 'e35895f3-a13b-4cda-ba2d-703d4874cda9',
  'derived_room_member_id', (
    SELECT id FROM public.cohort_room_members
    WHERE user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND source = 'derived'
  )
) AS pilot_manifest;
