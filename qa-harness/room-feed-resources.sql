-- ============================================================================
-- R3 round 2: feed + resource binder executable regression world.
--
-- SHADOW/LOCAL ONLY. The Node runner refuses the production project. Every row
-- is created inside one transaction and rolled back at the end.
-- ============================================================================
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL client_min_messages = notice;

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data) VALUES
  ('f3f20000-0000-4000-8000-000000000030', 'r3-feed-mentor@example.invalid', 'authenticated', 'authenticated', '{"full_name":"Feed Mentor"}'::jsonb),
  ('f3f20000-0000-4000-8000-000000000031', 'r3-feed-a1@example.invalid',     'authenticated', 'authenticated', '{"full_name":"Feed A1"}'::jsonb),
  ('f3f20000-0000-4000-8000-000000000032', 'r3-feed-a2@example.invalid',     'authenticated', 'authenticated', '{"full_name":"Feed A2"}'::jsonb),
  ('f3f20000-0000-4000-8000-000000000033', 'r3-feed-lobby@example.invalid',  'authenticated', 'authenticated', '{"full_name":"Feed Lobby"}'::jsonb),
  ('f3f20000-0000-4000-8000-000000000034', 'r3-feed-out@example.invalid',    'authenticated', 'authenticated', '{"full_name":"Feed Outsider"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, full_name, role) VALUES
  ('f3f20000-0000-4000-8000-000000000030', 'Feed Mentor', 'student'),
  ('f3f20000-0000-4000-8000-000000000031', 'Feed A1', 'student'),
  ('f3f20000-0000-4000-8000-000000000032', 'Feed A2', 'student'),
  ('f3f20000-0000-4000-8000-000000000033', 'Feed Lobby', 'student'),
  ('f3f20000-0000-4000-8000-000000000034', 'Feed Outsider', 'student')
ON CONFLICT (id) DO NOTHING;

UPDATE public.users u SET full_name = v.name
FROM (VALUES
  ('f3f20000-0000-4000-8000-000000000030'::uuid, 'Feed Mentor'),
  ('f3f20000-0000-4000-8000-000000000031'::uuid, 'Feed A1'),
  ('f3f20000-0000-4000-8000-000000000032'::uuid, 'Feed A2'),
  ('f3f20000-0000-4000-8000-000000000033'::uuid, 'Feed Lobby'),
  ('f3f20000-0000-4000-8000-000000000034'::uuid, 'Feed Outsider')
) v(id, name)
WHERE u.id = v.id;

CREATE FUNCTION pg_temp._r3_feed_become(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), true);
  PERFORM set_config('request.jwt.claims', CASE WHEN p_user IS NULL THEN '' ELSE
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text END, true);
  IF p_user IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'fixture impersonation failed: got %, expected %', auth.uid(), p_user;
  END IF;
END $$;

INSERT INTO public.offerings (id, title, slug, type, price_inr, status) VALUES
  ('f3f20000-0000-4000-8000-000000000001', 'R3 feed fixture',
   'r3-feed-fixture', 'onetime', 1, 'active'),
  ('f3f20000-0000-4000-8000-000000000040', 'R3 foreign fixture',
   'r3-foreign-fixture', 'onetime', 1, 'active');

INSERT INTO public.cohort_batches (id, offering_id, name) VALUES
  ('f3f20000-0000-4000-8000-000000000002', 'f3f20000-0000-4000-8000-000000000001', 'Feed Batch A1'),
  ('f3f20000-0000-4000-8000-000000000003', 'f3f20000-0000-4000-8000-000000000001', 'Feed Batch A2'),
  ('f3f20000-0000-4000-8000-000000000041', 'f3f20000-0000-4000-8000-000000000040', 'Foreign Batch B1');

INSERT INTO public.cohort_room_configs (id, offering_id, batch_id, slug, phase, vocab)
VALUES (
  'f3f20000-0000-4000-8000-000000000006',
  'f3f20000-0000-4000-8000-000000000001',
  NULL,
  'r3-feed-room',
  'live',
  '{"niche_channels":[{"key":"ai_tools","label":"AI Tools"}]}'::jsonb
);

INSERT INTO public.cohort_room_members
  (user_id, offering_id, batch_id, role, source, status) VALUES
  ('f3f20000-0000-4000-8000-000000000030', 'f3f20000-0000-4000-8000-000000000001', NULL, 'mentor', 'manual', 'active'),
  ('f3f20000-0000-4000-8000-000000000031', 'f3f20000-0000-4000-8000-000000000001', 'f3f20000-0000-4000-8000-000000000002', 'member', 'derived', 'active'),
  ('f3f20000-0000-4000-8000-000000000032', 'f3f20000-0000-4000-8000-000000000001', 'f3f20000-0000-4000-8000-000000000003', 'member', 'derived', 'active'),
  ('f3f20000-0000-4000-8000-000000000033', 'f3f20000-0000-4000-8000-000000000001', NULL, 'pre_member', 'derived', 'active');

INSERT INTO public.cohort_weeks
  (id, cohort_batch_id, week_number, theme, starts_on, ends_on, status) VALUES
  ('f3f20000-0000-4000-8000-000000000004', 'f3f20000-0000-4000-8000-000000000002', 1, 'A1 week', current_date, current_date + 6, 'active'),
  ('f3f20000-0000-4000-8000-000000000005', 'f3f20000-0000-4000-8000-000000000003', 1, 'A2_PRIVATE_WEEK_CANARY', current_date, current_date + 6, 'active');

INSERT INTO public.cohort_room_posts
  (id, offering_id, batch_id, author_id, kind, body, channel_key,
   cohort_week_id, created_at, last_activity_at) VALUES
  ('f3f20000-0000-4000-8000-000000000010', 'f3f20000-0000-4000-8000-000000000001', 'f3f20000-0000-4000-8000-000000000002', 'f3f20000-0000-4000-8000-000000000031', 'question', 'A1_FEED_CANARY question', 'general', NULL, transaction_timestamp() + interval '1 second', transaction_timestamp() + interval '1 second'),
  ('f3f20000-0000-4000-8000-000000000011', 'f3f20000-0000-4000-8000-000000000001', 'f3f20000-0000-4000-8000-000000000002', 'f3f20000-0000-4000-8000-000000000031', 'win', 'A1 win', 'general', NULL, transaction_timestamp() + interval '2 seconds', transaction_timestamp() + interval '2 seconds'),
  ('f3f20000-0000-4000-8000-000000000012', 'f3f20000-0000-4000-8000-000000000001', 'f3f20000-0000-4000-8000-000000000002', 'f3f20000-0000-4000-8000-000000000031', 'post', 'A1 this week', 'this_week', 'f3f20000-0000-4000-8000-000000000004', transaction_timestamp() + interval '3 seconds', transaction_timestamp() + interval '3 seconds'),
  ('f3f20000-0000-4000-8000-000000000013', 'f3f20000-0000-4000-8000-000000000001', 'f3f20000-0000-4000-8000-000000000003', 'f3f20000-0000-4000-8000-000000000032', 'post', 'A2_PRIVATE_FEED_CANARY', 'general', NULL, transaction_timestamp() + interval '4 seconds', transaction_timestamp() + interval '4 seconds');

INSERT INTO public.cohort_room_post_replies
  (id, post_id, author_id, body, is_mentor_answer, created_at)
VALUES ('f3f20000-0000-4000-8000-000000000014', 'f3f20000-0000-4000-8000-000000000010',
        'f3f20000-0000-4000-8000-000000000030', 'A1 mentor reply', true,
        transaction_timestamp() + interval '5 seconds');

INSERT INTO public.cohort_resources
  (id, offering_id, batch_id, cohort_week_id, title, kind, url, added_by, sort_order) VALUES
  ('f3f20000-0000-4000-8000-000000000020', 'f3f20000-0000-4000-8000-000000000001', NULL, NULL, 'Pinned for everyone', 'link', 'https://example.invalid/pinned', 'f3f20000-0000-4000-8000-000000000030', 0),
  ('f3f20000-0000-4000-8000-000000000021', 'f3f20000-0000-4000-8000-000000000001', 'f3f20000-0000-4000-8000-000000000002', 'f3f20000-0000-4000-8000-000000000004', 'A1_RESOURCE_CANARY', 'file', 'https://example.invalid/a1.pdf', 'f3f20000-0000-4000-8000-000000000030', 1),
  ('f3f20000-0000-4000-8000-000000000022', 'f3f20000-0000-4000-8000-000000000001', 'f3f20000-0000-4000-8000-000000000003', 'f3f20000-0000-4000-8000-000000000005', 'A2_PRIVATE_RESOURCE_CANARY', 'file', 'https://example.invalid/a2.pdf', 'f3f20000-0000-4000-8000-000000000030', 1);

-- A migrations-only local database may carry the real table/function grants
-- while omitting Supabase's bootstrap schema USAGE. Arm that transport grant
-- inside this rollback-only transaction so the assertions reach the RPCs.
GRANT USAGE ON SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_feed jsonb;
  v_wins jsonb;
  v_page1 jsonb;
  v_page2 jsonb;
  v_cursor jsonb;
  v_resources jsonb;
BEGIN
  PERFORM pg_temp._r3_feed_become('f3f20000-0000-4000-8000-000000000031');

  v_feed := public.get_room_feed(
    'f3f20000-0000-4000-8000-000000000001', 'all', NULL, NULL, NULL, 40);
  IF jsonb_array_length(v_feed -> 'posts') <> 3
     OR v_feed::text NOT LIKE '%A1_FEED_CANARY%'
     OR v_feed::text LIKE '%A2_PRIVATE_FEED_CANARY%'
     OR jsonb_array_length(v_feed -> 'batches') <> 1
     OR v_feed::text NOT LIKE '%ai_tools%'
     OR v_feed::text NOT LIKE '%AI Tools%'
     OR jsonb_path_exists(v_feed, '$.posts[*].email')
     OR jsonb_path_exists(v_feed, '$.posts[*].phone')
     OR jsonb_path_exists(v_feed, '$.posts[*].bio') THEN
    RAISE EXCEPTION 'FAIL F1 — A1 feed scope/projection is wrong: %', v_feed;
  END IF;
  RAISE NOTICE 'PASS F1 — A1 gets three A1 posts, inline replies, safe author fields, one batch context and no A2 canary.';

  v_wins := public.get_room_feed(
    'f3f20000-0000-4000-8000-000000000001', 'wins', NULL, NULL, NULL, 40);
  IF jsonb_array_length(v_wins -> 'posts') <> 1
     OR v_wins #>> '{posts,0,kind}' <> 'win' THEN
    RAISE EXCEPTION 'FAIL F2 — Wins is not a real kind filter: %', v_wins;
  END IF;
  RAISE NOTICE 'PASS F2 — Wins returns only kind=win.';

  v_page1 := public.get_room_feed(
    'f3f20000-0000-4000-8000-000000000001', 'all', NULL, NULL, NULL, 1);
  v_cursor := v_page1 -> 'next_cursor';
  IF COALESCE((v_page1 ->> 'has_more')::boolean, false) IS NOT TRUE
     OR v_cursor IS NULL THEN
    RAISE EXCEPTION 'FAIL F3 — page one has no explicit next cursor: %', v_page1;
  END IF;
  v_page2 := public.get_room_feed(
    'f3f20000-0000-4000-8000-000000000001', 'all', NULL,
    (v_cursor ->> 'activity')::timestamptz, (v_cursor ->> 'id')::uuid, 1);
  IF v_page1 #>> '{posts,0,id}' = v_page2 #>> '{posts,0,id}' THEN
    RAISE EXCEPTION 'FAIL F3 — keyset page repeated the same row';
  END IF;
  RAISE NOTICE 'PASS F3 — keyset pagination advances and carries an explicit terminus cursor.';

  v_resources := public.get_room_resources(
    'f3f20000-0000-4000-8000-000000000001', NULL);
  IF jsonb_array_length(v_resources -> 'resources') <> 2
     OR v_resources #>> '{resources,0,title}' <> 'Pinned for everyone'
     OR v_resources::text NOT LIKE '%A1_RESOURCE_CANARY%'
     OR v_resources::text LIKE '%A2_PRIVATE_RESOURCE_CANARY%'
     OR jsonb_path_exists(v_resources, '$.resources[*].email')
     OR jsonb_path_exists(v_resources, '$.resources[*].phone') THEN
    RAISE EXCEPTION 'FAIL R1 — binder grouping/scope/projection is wrong: %', v_resources;
  END IF;
  RAISE NOTICE 'PASS R1 — the pinned section leads, A1 week resources follow, and A2/contact data stay out.';
END $$;

DO $$
DECLARE
  v_feed jsonb;
BEGIN
  PERFORM pg_temp._r3_feed_become('f3f20000-0000-4000-8000-000000000030');
  v_feed := public.get_room_feed(
    'f3f20000-0000-4000-8000-000000000001', 'all', NULL, NULL, NULL, 40);
  IF jsonb_array_length(v_feed -> 'posts') <> 4
     OR jsonb_array_length(v_feed -> 'batches') <> 2
     OR v_feed::text NOT LIKE '%A2_PRIVATE_FEED_CANARY%' THEN
    RAISE EXCEPTION 'FAIL F4 — offering-wide mentor did not receive both batches: %', v_feed;
  END IF;
  RAISE NOTICE 'PASS F4 — an offering-wide mentor receives both batch contexts and both feeds.';
END $$;

DO $$
DECLARE
  v_denied integer := 0;
  v_user uuid;
BEGIN
  FOREACH v_user IN ARRAY ARRAY[
    'f3f20000-0000-4000-8000-000000000033'::uuid,
    'f3f20000-0000-4000-8000-000000000034'::uuid
  ] LOOP
    PERFORM pg_temp._r3_feed_become(v_user);
    BEGIN
      PERFORM public.get_room_feed(
        'f3f20000-0000-4000-8000-000000000001', 'all', NULL, NULL, NULL, 12);
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := v_denied + 1;
    END;
    BEGIN
      PERFORM public.get_room_resources(
        'f3f20000-0000-4000-8000-000000000001', NULL);
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := v_denied + 1;
    END;
  END LOOP;
  IF v_denied <> 4 THEN
    RAISE EXCEPTION 'FAIL S1 — only % of 4 pre-member/outsider reads were denied', v_denied;
  END IF;
  RAISE NOTICE 'PASS S1 — pre-member and outsider callers are denied both feed and resources.';
END $$;

DO $$
BEGIN
  PERFORM pg_temp._r3_feed_become('f3f20000-0000-4000-8000-000000000031');
  BEGIN
    INSERT INTO public.cohort_resources
      (offering_id, batch_id, cohort_week_id, title, kind, url, added_by)
    VALUES (
      'f3f20000-0000-4000-8000-000000000001',
      'f3f20000-0000-4000-8000-000000000002',
      NULL,
      'member-forged resource', 'link', 'https://example.invalid/member-forge',
      'f3f20000-0000-4000-8000-000000000031'
    );
    RAISE EXCEPTION 'FAIL R2 — a plain member inserted a resource';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS R2 — a plain member cannot insert into the binder.';
  END;

  PERFORM pg_temp._r3_feed_become('f3f20000-0000-4000-8000-000000000030');
  BEGIN
    INSERT INTO public.cohort_resources
      (offering_id, batch_id, cohort_week_id, title, kind, url, added_by)
    VALUES (
      'f3f20000-0000-4000-8000-000000000001',
      'f3f20000-0000-4000-8000-000000000002',
      'f3f20000-0000-4000-8000-000000000005',
      'forged cross-batch week', 'link', 'https://example.invalid/forged',
      'f3f20000-0000-4000-8000-000000000030'
    );
    RAISE EXCEPTION 'FAIL R3 — cross-batch resource week was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS R3 — the table rejects a resource filed under another batch''s week.';
  END;
END $$;

-- Scale the member's feed past six full pages, then walk every keyset cursor.
-- Fixture insertion is done as postgres because client table INSERT is revoked
-- by design; the read itself immediately returns to the authenticated member.
RESET ROLE;

-- RLS already rejects this shape for the mentor. Exercise the trigger as the
-- table owner as well, proving that admin/service/direct SQL cannot attach a
-- foreign offering's batch to an otherwise valid resource row.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.cohort_resources
      (offering_id, batch_id, cohort_week_id, title, kind, url, added_by)
    VALUES (
      'f3f20000-0000-4000-8000-000000000001',
      'f3f20000-0000-4000-8000-000000000041',
      NULL,
      'forged cross-offering batch', 'link', 'https://example.invalid/foreign-batch',
      'f3f20000-0000-4000-8000-000000000030'
    );
    RAISE EXCEPTION 'FAIL R4 — cross-offering resource batch was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS R4 — the table rejects a resource filed under another offering''s batch.';
  END;
END $$;

INSERT INTO public.cohort_room_posts
  (offering_id, batch_id, author_id, kind, body, channel_key,
   created_at, last_activity_at)
SELECT
  'f3f20000-0000-4000-8000-000000000001',
  'f3f20000-0000-4000-8000-000000000002',
  'f3f20000-0000-4000-8000-000000000031',
  'post',
  'scale post ' || n,
  'general',
  transaction_timestamp() + (n || ' milliseconds')::interval,
  transaction_timestamp() + (n || ' milliseconds')::interval
FROM generate_series(1, 240) n;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_page jsonb;
  v_cursor jsonb := NULL;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_pages integer := 0;
  v_started timestamptz := clock_timestamp();
  v_elapsed interval;
BEGIN
  PERFORM pg_temp._r3_feed_become('f3f20000-0000-4000-8000-000000000031');
  LOOP
    v_page := public.get_room_feed(
      'f3f20000-0000-4000-8000-000000000001', 'all', NULL,
      CASE WHEN v_cursor IS NULL THEN NULL ELSE (v_cursor ->> 'activity')::timestamptz END,
      CASE WHEN v_cursor IS NULL THEN NULL ELSE (v_cursor ->> 'id')::uuid END,
      40
    );
    v_pages := v_pages + 1;

    FOR v_id IN SELECT (value ->> 'id')::uuid FROM jsonb_array_elements(v_page -> 'posts') LOOP
      IF v_id = ANY(v_seen) THEN
        RAISE EXCEPTION 'FAIL F5 — keyset walk repeated post %', v_id;
      END IF;
      v_seen := array_append(v_seen, v_id);
    END LOOP;

    v_cursor := v_page -> 'next_cursor';
    -- jsonb_build_object stores SQL NULL as a JSON null token. Treat both
    -- representations as the explicit terminus.
    EXIT WHEN v_cursor IS NULL OR v_cursor = 'null'::jsonb;
    IF v_pages > 20 THEN
      RAISE EXCEPTION 'FAIL F5 — feed never reached its terminus';
    END IF;
  END LOOP;

  v_elapsed := clock_timestamp() - v_started;
  IF cardinality(v_seen) <> 243 OR v_pages <> 7 OR v_elapsed > interval '2 seconds' THEN
    RAISE EXCEPTION
      'FAIL F5 — scale walk expected 243 posts / 7 pages / <2s, got % / % / %',
      cardinality(v_seen), v_pages, v_elapsed;
  END IF;
  RAISE NOTICE
    'PASS F5 — 243 posts walk exactly once across 7 bounded keyset pages and reaches the terminus in %.',
    v_elapsed;
END $$;

RESET ROLE;

DO $$ BEGIN
  IF has_function_privilege('anon',
       'public.get_room_feed(uuid,text,uuid,timestamptz,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.get_room_resources(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL ACL — anon can execute a room round-2 read RPC';
  END IF;
  RAISE NOTICE 'PASS ACL — both read RPCs are authenticated-only.';
END $$;

DO $$ BEGIN
  RAISE NOTICE 'ALL CASES PASSED — feed scope, channel semantics, bounded keyset pagination at scale, safe projections, staff breadth, binder grouping and resource-week integrity are executable.';
END $$;

ROLLBACK;
