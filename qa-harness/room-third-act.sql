-- R4 third-act regression world. LOCAL/SHADOW ONLY; the runner refuses prod.
-- All fixtures and mutations roll back.
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL client_min_messages = notice;

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data) VALUES
  ('f4f40000-0000-4000-8000-000000000031', 'r4-member-a@example.invalid', 'authenticated', 'authenticated', '{"full_name":"R4 Member A"}'::jsonb),
  ('f4f40000-0000-4000-8000-000000000032', 'r4-member-b@example.invalid', 'authenticated', 'authenticated', '{"full_name":"R4 Member B"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, full_name, role) VALUES
  ('f4f40000-0000-4000-8000-000000000031', 'R4 Member A', 'student'),
  ('f4f40000-0000-4000-8000-000000000032', 'R4 Member B', 'student')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.courses (id, title, slug) VALUES
  ('f4f40000-0000-4000-8000-000000000010', 'R4 fixture course', 'r4-fixture-course');

INSERT INTO public.offerings (id, title, slug, type, price_inr, status) VALUES
  ('f4f40000-0000-4000-8000-000000000001', 'R4 fixture offering',
   'r4-fixture-offering', 'onetime', 1, 'active');

INSERT INTO public.cohort_batches (id, offering_id, name) VALUES
  ('f4f40000-0000-4000-8000-000000000002',
   'f4f40000-0000-4000-8000-000000000001', 'R4 Batch');

INSERT INTO public.cohort_room_configs
  (id, offering_id, batch_id, slug, phase, modules) VALUES
  ('f4f40000-0000-4000-8000-000000000003',
   'f4f40000-0000-4000-8000-000000000001', NULL,
   'r4-fixture-room', 'wrap', '{}'::jsonb);

INSERT INTO public.enrolments (id, user_id, offering_id, status, source) VALUES
  ('f4f40000-0000-4000-8000-000000000041',
   'f4f40000-0000-4000-8000-000000000031',
   'f4f40000-0000-4000-8000-000000000001', 'active', 'admin_grant'),
  ('f4f40000-0000-4000-8000-000000000042',
   'f4f40000-0000-4000-8000-000000000032',
   'f4f40000-0000-4000-8000-000000000001', 'active', 'admin_grant');

INSERT INTO public.cohort_batch_members (batch_id, enrolment_id) VALUES
  ('f4f40000-0000-4000-8000-000000000002', 'f4f40000-0000-4000-8000-000000000041'),
  ('f4f40000-0000-4000-8000-000000000002', 'f4f40000-0000-4000-8000-000000000042');

INSERT INTO public.cohort_weeks
  (id, cohort_batch_id, week_number, theme, starts_on, ends_on, status) VALUES
  ('f4f40000-0000-4000-8000-000000000004',
   'f4f40000-0000-4000-8000-000000000002', 1, 'The finale',
   current_date, current_date + 6, 'active');

INSERT INTO public.live_sessions
  (id, course_id, week_id, title, scheduled_at, duration_minutes, session_type, status)
VALUES
  ('f4f40000-0000-4000-8000-000000000005',
   'f4f40000-0000-4000-8000-000000000010',
   'f4f40000-0000-4000-8000-000000000004', 'Demo Day',
   now() + interval '1 hour', 60, 'demo_day', 'scheduled');

INSERT INTO public.cohort_week_submissions
  (id, cohort_week_id, user_id, text_content, status) VALUES
  ('f4f40000-0000-4000-8000-000000000020',
   'f4f40000-0000-4000-8000-000000000004',
   'f4f40000-0000-4000-8000-000000000031', 'Revise me', 'needs_revision'),
  ('f4f40000-0000-4000-8000-000000000021',
   'f4f40000-0000-4000-8000-000000000004',
   'f4f40000-0000-4000-8000-000000000032', 'Already submitted', 'submitted');

CREATE FUNCTION pg_temp._r4_become(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'fixture impersonation failed';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp._r4_become('f4f40000-0000-4000-8000-000000000031');

INSERT INTO public.cohort_demo_entries
  (id, offering_id, batch_id, user_id, title, description, work_url, file_urls)
VALUES
  ('f4f40000-0000-4000-8000-000000000011',
   'f4f40000-0000-4000-8000-000000000001',
   'f4f40000-0000-4000-8000-000000000002',
   'f4f40000-0000-4000-8000-000000000031',
   'R4 demo', 'It landed.', 'https://example.invalid/demo',
   ARRAY['f4f40000-0000-4000-8000-000000000031/demo/file.pdf']);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cohort_demo_entries
     WHERE id = 'f4f40000-0000-4000-8000-000000000011'
  ) THEN
    RAISE EXCEPTION 'FAIL R4.1 — wrap-phase entry did not land';
  END IF;
  RAISE NOTICE 'PASS R4.1 — a member can submit one entry during wrap before the event ends.';
END $$;

RESET ROLE;
UPDATE public.cohort_room_configs SET phase = 'live'
 WHERE id = 'f4f40000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp._r4_become('f4f40000-0000-4000-8000-000000000032');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.cohort_demo_entries
      (offering_id, batch_id, user_id, title, work_url)
    VALUES
      ('f4f40000-0000-4000-8000-000000000001',
       'f4f40000-0000-4000-8000-000000000002',
       'f4f40000-0000-4000-8000-000000000032',
       'Too early', 'https://example.invalid/early');
    RAISE EXCEPTION 'FAIL R4.2 — live-phase demo write was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS R4.2 — Demo Day writes are refused outside wrap.';
  END;
END $$;

RESET ROLE;
UPDATE public.cohort_room_configs SET phase = 'wrap'
 WHERE id = 'f4f40000-0000-4000-8000-000000000003';
UPDATE public.live_sessions
   SET scheduled_at = now() - interval '2 hours', duration_minutes = 60
 WHERE id = 'f4f40000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT pg_temp._r4_become('f4f40000-0000-4000-8000-000000000031');

DO $$
BEGIN
  BEGIN
    UPDATE public.cohort_demo_entries SET title = 'Too late'
     WHERE id = 'f4f40000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'FAIL R4.3 — post-event edit was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS R4.3 — entries become read-only at event end.';
  END;
END $$;

RESET ROLE;
UPDATE public.cohort_room_configs SET phase = 'alumni'
 WHERE id = 'f4f40000-0000-4000-8000-000000000003';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cohort_room_configs
     WHERE id = 'f4f40000-0000-4000-8000-000000000003'
       AND alumni_since IS NOT NULL
  ) OR (
    SELECT count(*) FROM public.cohort_room_members
     WHERE offering_id = 'f4f40000-0000-4000-8000-000000000001'
       AND role = 'alumni' AND status = 'active'
  ) <> 2 THEN
    RAISE EXCEPTION 'FAIL R4.4 — alumni stamp/role flip did not complete';
  END IF;
  RAISE NOTICE 'PASS R4.4 — alumni flip stamps time and renames derived members without deletion.';
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp._r4_become('f4f40000-0000-4000-8000-000000000031');
UPDATE public.cohort_week_submissions
   SET text_content = 'Revision landed', status = 'submitted'
 WHERE id = 'f4f40000-0000-4000-8000-000000000020';

SELECT pg_temp._r4_become('f4f40000-0000-4000-8000-000000000032');
DO $$
BEGIN
  BEGIN
    UPDATE public.cohort_week_submissions SET text_content = 'Not a revision'
     WHERE id = 'f4f40000-0000-4000-8000-000000000021';
    RAISE EXCEPTION 'FAIL R4.5 — ordinary alumni submission stayed writable';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS R4.5 — only needs_revision remains writable during alumni grace.';
  END;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.cohort_week_submissions SET status = 'needs_revision'
 WHERE id = 'f4f40000-0000-4000-8000-000000000020';
UPDATE public.cohort_room_configs SET alumni_since = now() - interval '15 days'
 WHERE id = 'f4f40000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp._r4_become('f4f40000-0000-4000-8000-000000000031');
DO $$
BEGIN
  BEGIN
    UPDATE public.cohort_week_submissions SET text_content = 'Past grace'
     WHERE id = 'f4f40000-0000-4000-8000-000000000020';
    RAISE EXCEPTION 'FAIL R4.6 — revision stayed writable after day 14';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS R4.6 — revision writes close after the fixed fourteen-day grace.';
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.cohort_demo_entries
       WHERE offering_id = 'f4f40000-0000-4000-8000-000000000001') <> 1
     OR (SELECT count(*) FROM public.cohort_week_submissions
          WHERE cohort_week_id = 'f4f40000-0000-4000-8000-000000000004') <> 2
     OR NOT EXISTS (
       SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'cohort_demo_files_member_read'
     ) THEN
    RAISE EXCEPTION 'FAIL R4.7 — preservation/storage policy invariant failed';
  END IF;
  RAISE NOTICE 'PASS R4.7 — the flip deletes nothing and the demo-file member read policy exists.';
END $$;

ROLLBACK;
