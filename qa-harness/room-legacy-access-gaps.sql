-- Compatibility and revocation controls for 20260803160000.
-- LOCAL/SHADOW ONLY: the guarded runner refuses production. Every fixture and
-- mutation is enclosed in this transaction and rolled back.
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL client_min_messages = notice;

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data) VALUES
  ('f4f40000-0000-4000-8000-000000000061',
   'legacy-room-member@example.invalid', 'authenticated', 'authenticated',
   '{"full_name":"Legacy Room Member"}'::jsonb),
  ('f4f40000-0000-4000-8000-000000000071',
   'legacy-course-only@example.invalid', 'authenticated', 'authenticated',
   '{"full_name":"Legacy Course-only Member"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, full_name, role) VALUES
  ('f4f40000-0000-4000-8000-000000000061', 'Legacy Room Member', 'student'),
  ('f4f40000-0000-4000-8000-000000000071', 'Legacy Course-only Member', 'student')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.courses (id, title, slug) VALUES
  ('f4f40000-0000-4000-8000-000000000062',
   'Legacy room-access fixture course', 'legacy-room-access-fixture-course');

INSERT INTO public.offerings (id, title, slug, type, price_inr, status) VALUES
  ('f4f40000-0000-4000-8000-000000000063',
   'Legacy room-access fixture offering', 'legacy-room-access-fixture-offering',
   'onetime', 1, 'active');

INSERT INTO public.offering_courses (offering_id, course_id) VALUES
  ('f4f40000-0000-4000-8000-000000000063',
   'f4f40000-0000-4000-8000-000000000062');

INSERT INTO public.cohort_batches (id, offering_id, name) VALUES
  ('f4f40000-0000-4000-8000-000000000064',
   'f4f40000-0000-4000-8000-000000000063', 'Legacy no-room batch'),
  ('f4f40000-0000-4000-8000-000000000069',
   'f4f40000-0000-4000-8000-000000000063', 'Configured sibling batch');

INSERT INTO public.enrolments (id, user_id, offering_id, status, source) VALUES
  ('f4f40000-0000-4000-8000-000000000065',
   'f4f40000-0000-4000-8000-000000000061',
   'f4f40000-0000-4000-8000-000000000063', 'active', 'admin_grant'),
  ('f4f40000-0000-4000-8000-000000000072',
   'f4f40000-0000-4000-8000-000000000071',
   'f4f40000-0000-4000-8000-000000000063', 'active', 'admin_grant');

INSERT INTO public.cohort_batch_members (batch_id, enrolment_id) VALUES
  ('f4f40000-0000-4000-8000-000000000064',
   'f4f40000-0000-4000-8000-000000000065');

-- Insert this only after both enrolments. The unrostered course-only user has
-- no membership row, and a sibling-batch override is not an effective config
-- for the session's batch. Their access therefore proves the fallback instead
-- of accidentally passing through cohort_room_can_access().
INSERT INTO public.cohort_room_configs
  (id, offering_id, batch_id, slug, phase, modules) VALUES
  ('f4f40000-0000-4000-8000-000000000070',
   'f4f40000-0000-4000-8000-000000000063',
   'f4f40000-0000-4000-8000-000000000069',
   'legacy-configured-sibling', 'live', '{}'::jsonb);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.cohort_room_members
    WHERE user_id = 'f4f40000-0000-4000-8000-000000000071'
  ) THEN
    RAISE EXCEPTION 'fixture invalid — course-only user unexpectedly has a room membership';
  END IF;
END $$;

INSERT INTO public.cohort_weeks
  (id, cohort_batch_id, week_number, theme, starts_on, ends_on, status) VALUES
  ('f4f40000-0000-4000-8000-000000000066',
   'f4f40000-0000-4000-8000-000000000064', 1,
   'Legacy week without room config', current_date, current_date + 6, 'active');

-- One workshop-style row with no week, and one cohort row whose exact batch has
-- no effective room config (only its sibling does). Both must retain the April
-- course-access behavior.
INSERT INTO public.live_sessions
  (id, course_id, week_id, title, scheduled_at, duration_minutes, zoom_link, status)
VALUES
  ('f4f40000-0000-4000-8000-000000000067',
   'f4f40000-0000-4000-8000-000000000062', NULL,
   'Legacy batchless workshop', now() + interval '30 minutes', 60,
   'https://example.invalid/legacy-batchless-link', 'scheduled'),
  ('f4f40000-0000-4000-8000-000000000068',
   'f4f40000-0000-4000-8000-000000000062',
   'f4f40000-0000-4000-8000-000000000066',
   'Legacy cohort without effective room config', now() + interval '30 minutes', 60,
   'https://example.invalid/legacy-no-room-link', 'scheduled');

CREATE FUNCTION pg_temp._legacy_become(p_user uuid) RETURNS void
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
SELECT pg_temp._legacy_become('f4f40000-0000-4000-8000-000000000071');

DO $$
DECLARE
  session_count integer;
BEGIN
  SELECT count(*) INTO session_count
  FROM public.live_sessions
  WHERE course_id = 'f4f40000-0000-4000-8000-000000000062';

  IF session_count <> 2 THEN
    RAISE EXCEPTION 'FAIL LEGACY.1 — active course-only member read % sessions',
      session_count;
  END IF;
  RAISE NOTICE 'PASS LEGACY.1 — a course-only member with no room membership still reads batchless and no-effective-room sessions, even when a sibling batch has an override.';
END $$;

DO $$
BEGIN
  IF public.get_live_session_zoom_link('f4f40000-0000-4000-8000-000000000067')
       IS DISTINCT FROM 'https://example.invalid/legacy-batchless-link'
     OR public.get_live_session_zoom_link('f4f40000-0000-4000-8000-000000000068')
       IS DISTINCT FROM 'https://example.invalid/legacy-no-room-link' THEN
    RAISE EXCEPTION 'FAIL LEGACY.2 — compatibility fallback withheld an in-window legacy link';
  END IF;
  RAISE NOTICE 'PASS LEGACY.2 — the unchanged link RPC contract serves both in-window legacy shapes.';
END $$;

SELECT pg_temp._legacy_become('f4f40000-0000-4000-8000-000000000061');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.cohort_weeks
      WHERE id = 'f4f40000-0000-4000-8000-000000000066') <> 1 THEN
    RAISE EXCEPTION 'FAIL LEGACY.3 — active rostered member lost their curriculum week';
  END IF;
  RAISE NOTICE 'PASS LEGACY.3 — the active rostered member still reads their historical curriculum week.';
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.enrolments
SET status = 'revoked', revoked_at = now()
WHERE id IN (
  'f4f40000-0000-4000-8000-000000000065',
  'f4f40000-0000-4000-8000-000000000072'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp._legacy_become('f4f40000-0000-4000-8000-000000000071');

DO $$
DECLARE
  session_count integer;
BEGIN
  SELECT count(*) INTO session_count
  FROM public.live_sessions
  WHERE course_id = 'f4f40000-0000-4000-8000-000000000062';

  IF session_count <> 0 THEN
    RAISE EXCEPTION 'FAIL LEGACY.4 — revoked course-only member read % sessions',
      session_count;
  END IF;
  IF public.get_live_session_zoom_link('f4f40000-0000-4000-8000-000000000067') IS NOT NULL
     OR public.get_live_session_zoom_link('f4f40000-0000-4000-8000-000000000068') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL LEGACY.4 — revoked course-only member retained a legacy join link';
  END IF;
  RAISE NOTICE 'PASS LEGACY.4 — revocation closes both legacy session rows and link paths.';
END $$;

SELECT pg_temp._legacy_become('f4f40000-0000-4000-8000-000000000061');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.cohort_weeks
      WHERE id = 'f4f40000-0000-4000-8000-000000000066') <> 0 THEN
    RAISE EXCEPTION 'FAIL LEGACY.5 — revoked rostered member retained the historical curriculum week';
  END IF;
  RAISE NOTICE 'PASS LEGACY.5 — revocation closes the historical curriculum row while retaining the roster for audit history.';
END $$;

RESET ROLE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'live_sessions'
      AND policyname IN ('live_sessions_read', 'live_sessions_student_read')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'live_sessions'
      AND policyname = 'live_sessions_cohort_or_legacy_read'
  ) OR has_function_privilege('anon',
       'public.get_live_session_zoom_link(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL LEGACY.6 — policy/grant certificate no longer matches the hardened contract';
  END IF;
  RAISE NOTICE 'PASS LEGACY.6 — legacy policies are retired and anon cannot execute the link RPC.';
END $$;

ROLLBACK;
