-- Read-only production verification for the real App Review Demo Student.
--
-- This emulates the authenticated JWT claims inside one READ ONLY transaction.
-- It must return the expected manifest and finish with ROLLBACK. No row is
-- inserted, updated, or deleted.

BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT set_config(
  'request.jwt.claim.sub',
  'e35895f3-a13b-4cda-ba2d-703d4874cda9',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"e35895f3-a13b-4cda-ba2d-703d4874cda9","role":"authenticated"}',
  true
);

SET LOCAL ROLE authenticated;

DO $verify_member$
DECLARE
  v_room_count          integer;
  v_slug                text;
  v_batch               uuid;
  v_role                text;
  v_phase               text;
  v_total_weeks         integer;
  v_current_week        integer;
  v_envelope            jsonb;
  v_feed                jsonb;
  v_resources           jsonb;
  v_announcement_count  integer;
  v_roster_count        integer;
  v_direct_session_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_room_count
  FROM public.get_my_cohort_rooms()
  WHERE offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee';

  SELECT room_slug, batch_id, role, phase, total_weeks, current_week
    INTO v_slug, v_batch, v_role, v_phase, v_total_weeks, v_current_week
  FROM public.get_my_cohort_rooms()
  WHERE offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
  LIMIT 1;

  IF v_room_count <> 1
     OR v_slug IS DISTINCT FROM 'creator-academy-edition-2'
     OR v_batch IS DISTINCT FROM '1a1908de-fb07-32de-fba0-f850eff82dc6'::uuid
     OR v_role IS DISTINCT FROM 'member'
     OR v_phase IS DISTINCT FROM 'live'
     OR v_total_weeks IS DISTINCT FROM 2
     OR v_current_week IS DISTINCT FROM 1
  THEN
    RAISE EXCEPTION
      'Member room summary mismatch: count %, slug %, batch %, role %, phase %, weeks %, current %',
      v_room_count, v_slug, v_batch, v_role, v_phase,
      v_total_weeks, v_current_week;
  END IF;

  v_envelope := public.get_cohort_room(
    '449056b9-9269-4bc5-ba8b-4c079c2104ee'
  );

  IF v_envelope ->> 'access' IS DISTINCT FROM 'member'
     OR v_envelope ->> 'batch_id' IS DISTINCT FROM '1a1908de-fb07-32de-fba0-f850eff82dc6'
     OR jsonb_array_length(COALESCE(v_envelope -> 'sessions', '[]'::jsonb)) <> 2
     OR jsonb_array_length(COALESCE(v_envelope -> 'announcements', '[]'::jsonb)) <> 1
  THEN
    RAISE EXCEPTION 'Member room envelope mismatch: %', v_envelope;
  END IF;

  SELECT count(*)::integer
    INTO v_announcement_count
  FROM public.get_room_announcements(
    '449056b9-9269-4bc5-ba8b-4c079c2104ee', 20, 0
  )
  WHERE id = '6ba0eff3-dfec-b547-f22a-b100440b5564';

  IF v_announcement_count <> 1 THEN
    RAISE EXCEPTION 'Member announcement projection mismatch';
  END IF;

  v_feed := public.get_room_feed(
    '449056b9-9269-4bc5-ba8b-4c079c2104ee',
    'all',
    NULL,
    NULL,
    NULL,
    12
  );

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_feed -> 'posts', '[]'::jsonb)) p
    WHERE p ->> 'id' = '8fce7580-e9d9-34ae-5230-e8c3d14eccb2'
  ) THEN
    RAISE EXCEPTION 'Member feed does not contain the pilot post: %', v_feed;
  END IF;

  v_resources := public.get_room_resources(
    '449056b9-9269-4bc5-ba8b-4c079c2104ee',
    NULL
  );

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_resources -> 'resources', '[]'::jsonb)) r
    WHERE r ->> 'id' = '1ca990b0-4e6b-8c19-a331-89a4d5ce7d8f'
  ) THEN
    RAISE EXCEPTION 'Member resources do not contain the pilot resource: %',
      v_resources;
  END IF;

  SELECT count(*)::integer
    INTO v_roster_count
  FROM public.get_room_roster(
    '449056b9-9269-4bc5-ba8b-4c079c2104ee'
  )
  WHERE user_id IN (
    'e35895f3-a13b-4cda-ba2d-703d4874cda9',
    '614e5085-e98c-48f0-86dd-9df5f3147b39'
  );

  IF v_roster_count <> 2 THEN
    RAISE EXCEPTION 'Member roster does not contain member + host';
  END IF;

  -- This is deliberately a direct RLS table read, not only a SECURITY DEFINER
  -- RPC. It proves the hardened live_sessions policy admits the exact pilot
  -- batch to the member identity.
  SELECT count(*)::integer
    INTO v_direct_session_count
  FROM public.live_sessions
  WHERE id IN (
    '881cd194-4fcb-7366-d5c3-4178c6bd5af8',
    'f8899583-f243-5fd6-21f8-e9eb55cd5fa2'
  );

  IF v_direct_session_count <> 2 THEN
    RAISE EXCEPTION 'Direct member live_sessions RLS returned % rows, expected 2',
      v_direct_session_count;
  END IF;
END
$verify_member$;

SELECT jsonb_build_object(
  'member_rls', 'pass',
  'user_id', 'e35895f3-a13b-4cda-ba2d-703d4874cda9',
  'offering_id', '449056b9-9269-4bc5-ba8b-4c079c2104ee',
  'room_slug', 'creator-academy-edition-2',
  'batch_id', '1a1908de-fb07-32de-fba0-f850eff82dc6',
  'weeks', 2,
  'sessions', 2,
  'announcements', 1,
  'resources', 1,
  'posts', 1,
  'roster_rows', 2
) AS pilot_member_rls_manifest;

ROLLBACK;
