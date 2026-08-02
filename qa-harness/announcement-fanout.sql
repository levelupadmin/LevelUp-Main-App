-- ============================================================================
-- qa-harness/announcement-fanout.sql
-- R3-T1's acceptance gate for the announcement fan-out trigger
-- (supabase/migrations/20260801120000_announcement_notify_trigger.sql).
--
-- 🔴 SHADOW PROJECTS ONLY. Never run this against prod (ivkvluezuiojovpotlyb).
--
-- WHY THIS IS A NEW FILE AND NOT A CASE IN THE R0 SUITE
--   qa-harness/cohort-room-access.spec.mjs is R3-T2's acceptance gate this
--   round (`npm run test:room-access`), and two tasks editing one file is how a
--   round loses a diff. This is standalone and touches nothing that suite owns.
--
-- HOW TO RUN IT
--   Paste the whole file into the Supabase SQL editor of the SHADOW project, or
--   POST it as ONE statement batch to the Management API /database/query
--   endpoint the R0 fixtures use. It must run as the project owner: it inserts
--   `auth.users` rows and reads `public.notifications`, and the point of the
--   test is the TRIGGER, not RLS (RLS is R0's suite).
--
--   IT COMMITS NOTHING. The whole script runs inside one transaction that ends
--   in ROLLBACK, so the fixture world exists only for the duration of the run.
--   A failed assertion RAISEs, which aborts the transaction and rolls back too:
--   either way the project is left exactly as it was found.
--
-- READING THE OUTPUT
--   Every case prints `PASS <id> — <what it proves>` as a NOTICE. A failure is
--   an ERROR whose message states what was expected and what was found. No
--   output at all means the batch never reached the first case.
--
-- WHAT IT PROVES, case by case
--   C0  the volume cap's race backstop (the partial unique index) exists
--   C1  1 announcement x N members = N notifications, exactly N
--   C2  the AUTHOR is never notified about their own notice
--   C3  a REVOKED member is notified about nothing
--   C4  a member holding rows in TWO batches is notified ONCE, not twice
--       (the brief's `batch_id NULL` edge case)
--   C5  a repeat post adds NO second unread while one is pending, and the one
--       that survives carries the NEWEST notice
--   C6  a READ notice does not suppress the next one: the badge can come back
--   C7  a batch-scoped notice reaches that batch and NOT the other, and not the
--       offering-level lobby either
--   C7A the cap SURVIVES the room being re-addressed: giving the offering a new
--       slug, and giving one batch its own override config, are ordinary
--       operator actions, and neither may re-arm the cap for a member who is
--       still holding an unread notice
--   C7B retracting a notice takes the matching unread badge out of the inbox,
--       and leaves a badge that has moved on to a LATER notice alone
--   C8  the read RPC's projection carries no email, no phone and no essay
--       (NFR-COPY-1, asserted against the catalogue rather than by eye)
--   C9  room_announcement_targets is reachable by NO client role — the roster
--       enumerator is not an RPC anyone can POST
--   C10 the read RPC, CALLED as a batch-A1 member: own-batch + offering-level
--       rows only, pinned first, with the author's name and room standing on it
--   C11 the read RPC, CALLED as the pre_member lobby: the same offering-level
--       board and not one row of a batch's private one (MEMBER-1)
--   C12 the read RPC, CALLED as a batch-A2 member: A2's own rows ARE returned,
--       so C10's exclusion is a boundary and not an empty function
--   C13 an outsider calling the read RPC gets 42501, never an empty set
--   C14 p_limit is clamped and p_offset pages, so the board cannot be used to
--       ask for the whole table in one call
--
-- WHY C10-C14 IMPERSONATE, AND HOW THAT IS KEPT HONEST
--   get_room_announcements is SECURITY DEFINER and asserts on auth.uid(), so a
--   case that ran as the project owner would prove nothing about scope. Each
--   read case therefore sets the request-JWT GUCs through pg_temp._r3f_become(),
--   which VERIFIES auth.uid() actually moved before returning. Without that
--   verification C13 would pass for the wrong reason: a failed impersonation
--   also raises 42501.
-- ============================================================================

BEGIN;

SET LOCAL client_min_messages = notice;

-- ── The world ───────────────────────────────────────────────────────────────
-- Fixed UUIDs, all sharing the `f3a11` prefix so a stray row is greppable if a
-- run is ever interrupted between the inserts and the ROLLBACK.
--
--   offering  R3F                       room slug 'r3-fanout-room' (C7A renames
--                                       it, and gives batch A2 its own room, on
--                                       purpose: see that case)
--     batch   A1, A2
--     mentorX   mentor, batch NULL   -> offering-wide, and the AUTHOR
--     memberA   member, batch A1
--     memberB   member, batch A2
--     lobbyC    pre_member, batch NULL  -> announcements-READ only (MEMBER-1)
--     bothD     member, batch A1 AND member, batch A2  -> the C4 case
--     revokedE  member, batch A1, status 'revoked'     -> the C3 case
--     outsiderF NO membership row at all               -> the C13 case
--
-- ⚠️ THE public.users ROWS ARE MADE BY THE TRIGGER, NOT BY THE INSERT BELOW.
--   `INSERT INTO auth.users` fires `on_auth_user_created` ->
--   `public.handle_new_user()` (20260530120000), which inserts the
--   `public.users` mirror ITSELF, taking `full_name` from
--   `raw_user_meta_data->>'full_name'` and forcing `role = 'student'`. So the
--   mirror row already exists by the time the second statement runs, its
--   `ON CONFLICT (id) DO NOTHING` is a NO-OP, and any name declared there is
--   silently discarded — which would leave `author_name` empty and quietly
--   defeat C10's author-join assertion. Two things fix it, and both are here on
--   purpose:
--     · `raw_user_meta_data` carries the name, so the trigger writes the right
--       row the way a real signup does;
--     · the UPDATE afterwards REPAIRS the name regardless, so the fixture does
--       not depend on which revision of handle_new_user a shadow project has.
--   `role` is deliberately left alone: it is 'student' for everyone, nothing in
--   this task reads it (the board's wordmark comes from
--   `cohort_room_members.role`, not from the platform role), and `public.users`
--   carries an admin-role guard trigger this file has no business tripping.

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data) VALUES
  ('f3a11000-0000-4000-8000-000000000010', 'r3f-mentor@example.invalid',   'authenticated', 'authenticated', '{"full_name":"Mentor X"}'::jsonb),
  ('f3a11000-0000-4000-8000-000000000011', 'r3f-member-a@example.invalid', 'authenticated', 'authenticated', '{"full_name":"Member A"}'::jsonb),
  ('f3a11000-0000-4000-8000-000000000012', 'r3f-member-b@example.invalid', 'authenticated', 'authenticated', '{"full_name":"Member B"}'::jsonb),
  ('f3a11000-0000-4000-8000-000000000013', 'r3f-lobby-c@example.invalid',  'authenticated', 'authenticated', '{"full_name":"Lobby C"}'::jsonb),
  ('f3a11000-0000-4000-8000-000000000014', 'r3f-both-d@example.invalid',   'authenticated', 'authenticated', '{"full_name":"Both D"}'::jsonb),
  ('f3a11000-0000-4000-8000-000000000015', 'r3f-revoked-e@example.invalid','authenticated', 'authenticated', '{"full_name":"Revoked E"}'::jsonb),
  ('f3a11000-0000-4000-8000-000000000016', 'r3f-outsider-f@example.invalid','authenticated','authenticated', '{"full_name":"Outsider F"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Fallback only — for a project whose auth trigger is absent. Expected to be a
-- no-op on any real Supabase project. `email` is omitted so this can never
-- collide with the mirror row the trigger already wrote from auth.users.
INSERT INTO public.users (id, full_name, role) VALUES
  ('f3a11000-0000-4000-8000-000000000010', 'Mentor X',   'student'),
  ('f3a11000-0000-4000-8000-000000000011', 'Member A',   'student'),
  ('f3a11000-0000-4000-8000-000000000012', 'Member B',   'student'),
  ('f3a11000-0000-4000-8000-000000000013', 'Lobby C',    'student'),
  ('f3a11000-0000-4000-8000-000000000014', 'Both D',     'student'),
  ('f3a11000-0000-4000-8000-000000000015', 'Revoked E',  'student'),
  ('f3a11000-0000-4000-8000-000000000016', 'Outsider F', 'student')
ON CONFLICT (id) DO NOTHING;

-- The repair. `full_name` ONLY: it is the one column C10 reads back, and it is
-- the one column no trigger on public.users guards.
UPDATE public.users u
SET full_name = v.full_name
FROM (VALUES
  ('f3a11000-0000-4000-8000-000000000010'::uuid, 'Mentor X'),
  ('f3a11000-0000-4000-8000-000000000011'::uuid, 'Member A'),
  ('f3a11000-0000-4000-8000-000000000012'::uuid, 'Member B'),
  ('f3a11000-0000-4000-8000-000000000013'::uuid, 'Lobby C'),
  ('f3a11000-0000-4000-8000-000000000014'::uuid, 'Both D'),
  ('f3a11000-0000-4000-8000-000000000015'::uuid, 'Revoked E'),
  ('f3a11000-0000-4000-8000-000000000016'::uuid, 'Outsider F')
) AS v(id, full_name)
WHERE u.id = v.id AND u.full_name IS DISTINCT FROM v.full_name;

DO $$
DECLARE
  v_named integer;
BEGIN
  SELECT count(*) INTO v_named
  FROM public.users u
  WHERE u.id IN (
      'f3a11000-0000-4000-8000-000000000010','f3a11000-0000-4000-8000-000000000011',
      'f3a11000-0000-4000-8000-000000000012','f3a11000-0000-4000-8000-000000000013',
      'f3a11000-0000-4000-8000-000000000014','f3a11000-0000-4000-8000-000000000015',
      'f3a11000-0000-4000-8000-000000000016')
    AND COALESCE(u.full_name, '') <> '';
  IF v_named <> 7 THEN
    RAISE EXCEPTION 'FAIL setup — only % of 7 fixture users carry a name. C10 reads author_name back out of public.users, and an unnamed fixture would make that assertion pass on an empty string.', v_named;
  END IF;
  RAISE NOTICE 'SETUP OK — all 7 fixture users carry the name this file declares, so the author join has something real to resolve.';
END $$;

-- ── Impersonation ───────────────────────────────────────────────────────────
-- C10-C14 must run AS a fixture user: get_room_announcements is SECURITY
-- DEFINER and every branch of its scope hangs off auth.uid(). Setting the
-- request-JWT GUCs is how auth.uid() is moved inside a plain SQL session, and
-- BOTH names are set because auth.uid() has shipped in two shapes (the flat
-- `request.jwt.claim.sub` and the JSON `request.jwt.claims`) and a shadow
-- project may carry either.
--
-- IT VERIFIES ITSELF. A silently-failed impersonation leaves auth.uid() NULL,
-- which raises 42501 — the exact answer C13 is looking for. Checking the move
-- took is what stops C13 passing for the wrong reason.
CREATE FUNCTION pg_temp._r3f_become(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_user IS NULL THEN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);

  IF auth.uid() IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'FAIL setup — impersonation did not take: auth.uid() is %, expected %. Every read case below would answer for the wrong caller, so the run stops here rather than reporting a scope result nobody can trust.',
      COALESCE(auth.uid()::text, '<null>'), p_user;
  END IF;
END $$;

INSERT INTO public.offerings (id, title, slug, type, price_inr, status)
VALUES ('f3a11000-0000-4000-8000-000000000001', 'R3 fan-out fixture', 'r3-fanout-offering',
        'onetime', 1, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohort_batches (id, offering_id, name) VALUES
  ('f3a11000-0000-4000-8000-000000000002', 'f3a11000-0000-4000-8000-000000000001', 'Batch A1'),
  ('f3a11000-0000-4000-8000-000000000003', 'f3a11000-0000-4000-8000-000000000001', 'Batch A2')
ON CONFLICT (id) DO NOTHING;

-- One offering-level config row. It gives the room a slug and a phase; it does
-- NOT decide the notification link, and C7A is the case that proves it. The
-- cap's key is the offering's own canonical address,
-- '/cohort/f3a11000-0000-4000-8000-000000000001' (§1 of the migration), which is
-- what lets every assertion below hard-code one string across a config change.
INSERT INTO public.cohort_room_configs (id, offering_id, batch_id, slug, phase)
VALUES ('f3a11000-0000-4000-8000-000000000004', 'f3a11000-0000-4000-8000-000000000001',
        NULL, 'r3-fanout-room', 'live')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohort_room_members (user_id, offering_id, batch_id, role, source, status) VALUES
  ('f3a11000-0000-4000-8000-000000000010', 'f3a11000-0000-4000-8000-000000000001', NULL,                                   'mentor',     'manual',  'active'),
  ('f3a11000-0000-4000-8000-000000000011', 'f3a11000-0000-4000-8000-000000000001', 'f3a11000-0000-4000-8000-000000000002', 'member',     'derived', 'active'),
  ('f3a11000-0000-4000-8000-000000000012', 'f3a11000-0000-4000-8000-000000000001', 'f3a11000-0000-4000-8000-000000000003', 'member',     'derived', 'active'),
  ('f3a11000-0000-4000-8000-000000000013', 'f3a11000-0000-4000-8000-000000000001', NULL,                                   'pre_member', 'derived', 'active'),
  ('f3a11000-0000-4000-8000-000000000014', 'f3a11000-0000-4000-8000-000000000001', 'f3a11000-0000-4000-8000-000000000002', 'member',     'derived', 'active'),
  ('f3a11000-0000-4000-8000-000000000014', 'f3a11000-0000-4000-8000-000000000001', 'f3a11000-0000-4000-8000-000000000003', 'member',     'derived', 'active'),
  ('f3a11000-0000-4000-8000-000000000015', 'f3a11000-0000-4000-8000-000000000001', 'f3a11000-0000-4000-8000-000000000002', 'member',     'derived', 'revoked');


----------------------------------------------------------------------
-- C0. The volume cap's race backstop is in place.
--     §1 of the migration DEGRADES to a WARNING if it cannot take its lock, so
--     "the migration applied" does not imply "the index landed". This is the
--     only case that can tell the difference, and it runs first because C5's
--     result is weaker without it (the NOT EXISTS arm still caps serial posts;
--     only the concurrent arm is lost).
----------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.notifications_room_unread_uniq') IS NULL THEN
    RAISE EXCEPTION 'FAIL C0 — notifications_room_unread_uniq is ABSENT. Section 1 of 20260801120000 degraded to a WARNING on this project: two simultaneous posts can leave one member two unread notices for one room. Re-run that DO block by hand while public.notifications is quiet.';
  END IF;
  RAISE NOTICE 'PASS C0 — the partial unique index notifications_room_unread_uniq exists, so the volume cap holds under concurrent posts and not only serial ones.';
END $$;


----------------------------------------------------------------------
-- C1-C4. ONE offering-wide announcement.
----------------------------------------------------------------------
INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
VALUES ('f3a11000-0000-4000-8000-0000000000a1', 'f3a11000-0000-4000-8000-000000000001',
        NULL, 'f3a11000-0000-4000-8000-000000000010',
        'First notice', 'Week one starts on Monday.');

DO $$
DECLARE
  v_total  integer;
  v_author integer;
  v_revoke integer;
  v_both   integer;
  v_wrong  integer;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.notifications n
  WHERE n.type = 'room_announcement' AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001';

  -- memberA + memberB + lobbyC + bothD. The author and the revoked member are
  -- the two the predicate must leave out.
  IF v_total <> 4 THEN
    RAISE EXCEPTION 'FAIL C1 — expected 4 notifications for 4 eligible members, found %', v_total;
  END IF;

  SELECT count(*) INTO v_wrong
  FROM public.notifications n
  WHERE n.type = 'room_announcement' AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001'
    AND (n.is_read <> false OR n.title <> 'First notice');
  IF v_wrong <> 0 THEN
    RAISE EXCEPTION 'FAIL C1 — % of the fan-out rows are not an unread copy of the notice', v_wrong;
  END IF;
  RAISE NOTICE 'PASS C1 — one announcement produced exactly one unread notification per eligible member (4 of 4), each carrying the notice title and the room link.';

  SELECT count(*) INTO v_author FROM public.notifications n
  WHERE n.user_id = 'f3a11000-0000-4000-8000-000000000010' AND n.type = 'room_announcement';
  IF v_author <> 0 THEN
    RAISE EXCEPTION 'FAIL C2 — the author was notified about their own announcement (% rows)', v_author;
  END IF;
  RAISE NOTICE 'PASS C2 — the author is not notified about their own notice.';

  SELECT count(*) INTO v_revoke FROM public.notifications n
  WHERE n.user_id = 'f3a11000-0000-4000-8000-000000000015' AND n.type = 'room_announcement';
  IF v_revoke <> 0 THEN
    RAISE EXCEPTION 'FAIL C3 — a REVOKED member was notified (% rows). The predicate must match status = active only.', v_revoke;
  END IF;
  RAISE NOTICE 'PASS C3 — a revoked member is notified about nothing, matching every read policy in R0.';

  -- THE BRIEF'S EDGE CASE. bothD holds a membership row in EACH batch, so a
  -- join without DISTINCT ON fans out twice for one offering-wide notice.
  SELECT count(*) INTO v_both FROM public.notifications n
  WHERE n.user_id = 'f3a11000-0000-4000-8000-000000000014' AND n.type = 'room_announcement';
  IF v_both <> 1 THEN
    RAISE EXCEPTION 'FAIL C4 — a member sitting in TWO batches of one offering got % notifications for a single batch_id NULL announcement; expected exactly 1', v_both;
  END IF;
  RAISE NOTICE 'PASS C4 — an announcement with batch_id NULL spanning two batches notifies a member of both EXACTLY ONCE, not once per batch.';
END $$;


----------------------------------------------------------------------
-- C5. THE VOLUME CAP. Two more posts in the same hour.
----------------------------------------------------------------------
INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
VALUES ('f3a11000-0000-4000-8000-0000000000a2', 'f3a11000-0000-4000-8000-000000000001',
        NULL, 'f3a11000-0000-4000-8000-000000000010',
        'Second notice', 'Bring your own footage.');

INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
VALUES ('f3a11000-0000-4000-8000-0000000000a3', 'f3a11000-0000-4000-8000-000000000001',
        NULL, 'f3a11000-0000-4000-8000-000000000010',
        'Third notice', 'Zoom link moves on Friday.');

DO $$
DECLARE
  v_unread integer;
  v_stale  integer;
BEGIN
  SELECT count(*) INTO v_unread
  FROM public.notifications n
  WHERE n.type = 'room_announcement' AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001'
    AND n.is_read = false;
  IF v_unread <> 4 THEN
    RAISE EXCEPTION 'FAIL C5 — three posts in one hour left % unread notifications for 4 members; expected 4 (one each)', v_unread;
  END IF;

  SELECT count(*) INTO v_stale
  FROM public.notifications n
  WHERE n.type = 'room_announcement' AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001'
    AND n.is_read = false AND n.title <> 'Third notice';
  IF v_stale <> 0 THEN
    RAISE EXCEPTION 'FAIL C5 — % capped rows still show an older notice; the surviving unread row must carry the NEWEST one', v_stale;
  END IF;
  RAISE NOTICE 'PASS C5 — three announcements in one hour produce ONE unread badge per member, and it shows the newest notice. A repeat post adds no second unread while one is pending.';
END $$;


----------------------------------------------------------------------
-- C6. A READ notice does not suppress the next one.
--     The cap is on UNREAD rows, not on rows: once a member has been to the
--     room, the next notice is a new event and earns a new badge. Without this
--     case, a cap that silently swallowed every announcement after the first
--     would pass C5 and look correct.
----------------------------------------------------------------------
UPDATE public.notifications
SET is_read = true
WHERE type = 'room_announcement' AND link = '/cohort/f3a11000-0000-4000-8000-000000000001';

INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
VALUES ('f3a11000-0000-4000-8000-0000000000a4', 'f3a11000-0000-4000-8000-000000000001',
        NULL, 'f3a11000-0000-4000-8000-000000000010',
        'Fourth notice', 'Feedback session added.');

DO $$
DECLARE
  v_unread integer;
  v_total  integer;
BEGIN
  SELECT count(*) INTO v_unread FROM public.notifications n
  WHERE n.type = 'room_announcement' AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001' AND n.is_read = false;
  SELECT count(*) INTO v_total FROM public.notifications n
  WHERE n.type = 'room_announcement' AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001';

  IF v_unread <> 4 THEN
    RAISE EXCEPTION 'FAIL C6 — after every notice was read, the next announcement produced % unread rows; expected 4', v_unread;
  END IF;
  IF v_total <> 8 THEN
    RAISE EXCEPTION 'FAIL C6 — expected 8 rows total (4 read + 4 new unread), found %', v_total;
  END IF;
  RAISE NOTICE 'PASS C6 — the cap is on UNREAD rows, not on rows: once read, the next announcement earns a fresh badge.';
END $$;


----------------------------------------------------------------------
-- C7. A BATCH-SCOPED notice does not cross the batch line.
--     Everything is marked read first so the new rows are unambiguous.
--     Expected recipients: memberB (batch A2) and bothD (holds an A2 row).
--     NOT memberA (batch A1) and NOT lobbyC, whose lobby grant is
--     offering-LEVEL only (R-1 contract note 4). The offering-wide mentor is
--     still excluded as the author.
----------------------------------------------------------------------
UPDATE public.notifications
SET is_read = true
WHERE type = 'room_announcement' AND link = '/cohort/f3a11000-0000-4000-8000-000000000001';

INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
VALUES ('f3a11000-0000-4000-8000-0000000000a5', 'f3a11000-0000-4000-8000-000000000001',
        'f3a11000-0000-4000-8000-000000000003', 'f3a11000-0000-4000-8000-000000000010',
        'A2 only', 'Batch A2 screening moved.');

DO $$
DECLARE
  v_recipients uuid[];
BEGIN
  SELECT COALESCE(array_agg(n.user_id ORDER BY n.user_id), ARRAY[]::uuid[]) INTO v_recipients
  FROM public.notifications n
  WHERE n.type = 'room_announcement' AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001' AND n.is_read = false;

  IF v_recipients <> ARRAY[
       'f3a11000-0000-4000-8000-000000000012'::uuid,   -- memberB, batch A2
       'f3a11000-0000-4000-8000-000000000014'::uuid    -- bothD, holds an A2 row
     ] THEN
    RAISE EXCEPTION 'FAIL C7 — a batch-scoped announcement reached %, expected exactly batch A2''s two members', v_recipients;
  END IF;
  RAISE NOTICE 'PASS C7 — a batch-scoped notice reaches that batch only: the other batch is not notified, and the pre_member lobby (offering-level grant) is not notified either.';
END $$;


----------------------------------------------------------------------
-- C7A. THE CAP SURVIVES THE ROOM BEING RE-ADDRESSED.
--      A uniqueness key that changes while a row is unread is not a uniqueness
--      key. Two ordinary operator actions used to change it, and neither has a
--      writer anywhere in `src/pages/admin` or `supabase/functions`, so both
--      are done by hand — mid-rollout, while notices are unread:
--        (a) renaming the room, or creating its FIRST config row at all, which
--            flipped every member's key from /cohort/<uuid> to /room/<slug>;
--        (b) giving ONE batch its own override config, which flipped that
--            batch's members from the offering slug to the batch slug (R0
--            supports this by design: the same `ORDER BY (cfg.batch_id IS NOT
--            NULL) DESC` precedence appears in get_cohort_room and
--            get_my_cohort_rooms).
--      Under a slug-derived key, the next post after either change matched no
--      existing unread row, the INSERT arm fired, and every member holding the
--      first notice took a SECOND badge for the same room — "three posts, three
--      badges", caused by a config edit rather than by a post. This case does
--      BOTH mutations between two posts and asserts the badge count did not
--      move. It is the regression test for §1's choice of key, so a future
--      revision that "tidies" the link back to /room/:slug fails here.
----------------------------------------------------------------------
UPDATE public.notifications
SET is_read = true
WHERE type = 'room_announcement' AND link = '/cohort/f3a11000-0000-4000-8000-000000000001';

INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
VALUES ('f3a11000-0000-4000-8000-0000000000b1', 'f3a11000-0000-4000-8000-000000000001',
        NULL, 'f3a11000-0000-4000-8000-000000000010',
        'Before the rename', 'The room is about to be re-addressed.');

-- (a) the offering-level room is renamed …
UPDATE public.cohort_room_configs
SET slug = 'r3-fanout-room-renamed'
WHERE id = 'f3a11000-0000-4000-8000-000000000004';

-- … and (b) batch A2 is given its own room, which is where memberB and bothD
-- would resolve from this point on.
INSERT INTO public.cohort_room_configs (id, offering_id, batch_id, slug, phase)
VALUES ('f3a11000-0000-4000-8000-000000000005', 'f3a11000-0000-4000-8000-000000000001',
        'f3a11000-0000-4000-8000-000000000003', 'r3-fanout-batch-a2', 'live')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
VALUES ('f3a11000-0000-4000-8000-0000000000b2', 'f3a11000-0000-4000-8000-000000000001',
        NULL, 'f3a11000-0000-4000-8000-000000000010',
        'After the rename', 'Two config changes later.');

DO $$
DECLARE
  v_unread integer;
  v_worst  integer;
  v_stale  integer;
BEGIN
  SELECT count(*) INTO v_unread FROM public.notifications n
  WHERE n.type = 'room_announcement'
    AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001'
    AND n.is_read = false;

  SELECT COALESCE(max(c), 0) INTO v_worst FROM (
    SELECT count(*) AS c FROM public.notifications n
    WHERE n.type = 'room_announcement' AND n.is_read = false
    GROUP BY n.user_id
  ) per_user;

  IF v_unread <> 4 OR v_worst > 1 THEN
    RAISE EXCEPTION 'FAIL C7A — after the room was renamed and a batch override config was added, two posts left % unread rows (worst member holds %); expected 4, one each. The cap is keyed on something that an operator can change while a notice is unread.', v_unread, v_worst;
  END IF;

  SELECT count(*) INTO v_stale FROM public.notifications n
  WHERE n.type = 'room_announcement'
    AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001'
    AND n.is_read = false AND n.title <> 'After the rename';
  IF v_stale <> 0 THEN
    RAISE EXCEPTION 'FAIL C7A — % surviving rows still show the pre-rename notice; the refresh arm must have matched them.', v_stale;
  END IF;
  RAISE NOTICE 'PASS C7A — renaming the room and adding a batch-level override config do not re-arm the volume cap: the second post still refreshes the one unread badge instead of adding a second.';
END $$;


----------------------------------------------------------------------
-- C7B. RETRACTION TAKES THE BADGE WITH IT.
--      R3-T1 puts R0's `ann_host_retract` lever in the room's UI, and a
--      retraction that left the fan-out alone would leave the mistake's TITLE
--      sitting in every member's inbox, pointing at a board that no longer
--      shows it — most of what retraction is for, undone. The second half of
--      the case is the one that stops the cleanup being too greedy: a badge
--      that has already been refreshed to a LATER notice is somebody else's
--      news and must survive.
----------------------------------------------------------------------
DO $$
DECLARE
  v_after_retract integer;
  v_survivors     integer;
BEGIN
  -- The four unread badges currently carry 'After the rename' (b2), and b1 is
  -- STILL LIVE on the board. Retracting b2 must RE-POINT those badges at b1, not
  -- delete them.
  --
  -- THIS CASE USED TO ASSERT THE OPPOSITE — that zero badges survive — and it
  -- passed, which is how the defect stayed invisible. The refresh arm collapses
  -- N notices onto ONE badge, so that badge also stands for b1; deleting it left
  -- b1 live, unseen, and with no delivery record. Retracting what you just
  -- posted is the most likely retraction there is.
  UPDATE public.cohort_announcements
  SET deleted_at = now()
  WHERE id = 'f3a11000-0000-4000-8000-0000000000b2';

  SELECT count(*) INTO v_after_retract FROM public.notifications n
  WHERE n.type = 'room_announcement'
    AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001'
    AND n.is_read = false
    AND n.title = 'Before the rename'
    AND n.link_url = 'cohort_announcement:f3a11000-0000-4000-8000-0000000000b1';
  IF v_after_retract <> 4 THEN
    RAISE EXCEPTION 'FAIL C7B — retracting the newest notice should have re-pointed all 4 badges at the still-live older notice; % carry it.', v_after_retract;
  END IF;

  -- Now a fresh notice, and a retraction of an OLDER one. The badge has moved
  -- on, so nothing should be deleted.
  INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
  VALUES ('f3a11000-0000-4000-8000-0000000000b3', 'f3a11000-0000-4000-8000-000000000001',
          NULL, 'f3a11000-0000-4000-8000-000000000010',
          'Still current', 'This one stays.');

  UPDATE public.cohort_announcements
  SET deleted_at = now()
  WHERE id = 'f3a11000-0000-4000-8000-0000000000b1';   -- 'Before the rename'

  SELECT count(*) INTO v_survivors FROM public.notifications n
  WHERE n.type = 'room_announcement'
    AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001'
    AND n.is_read = false AND n.title = 'Still current';
  IF v_survivors <> 4 THEN
    RAISE EXCEPTION 'FAIL C7B — retracting an OLDER notice removed badges that had already moved on to a later one: % of 4 survived.', v_survivors;
  END IF;

  -- Housekeeping, and it is load-bearing rather than tidy: C10-C14 pin the
  -- EXACT id list the board returns, so this case's three fixture notices must
  -- leave it. Retracting b3 is also the third arm of the same behaviour (the
  -- board stops showing a retracted row), which C10's id list then asserts for
  -- free.
  UPDATE public.cohort_announcements
  SET deleted_at = now()
  WHERE id = 'f3a11000-0000-4000-8000-0000000000b3';

  RAISE NOTICE 'PASS C7B — a retraction re-points the badges it was showing at the newest surviving notice, and leaves badges carrying a later notice alone.';
END $$;


----------------------------------------------------------------------
-- C7C. TWO NOTICES THAT READ THE SAME ARE STILL TWO NOTICES.
--      The retract arm used to identify a badge by (link, title, body-prefix),
--      which is a DESCRIPTION, not an identity. `title` collapses every untitled
--      notice onto one literal and `body` is compared on its first 140
--      characters only, so two notices from the same template were the same row
--      to the cleanup. Retracting the older one took the newer one's badge.
----------------------------------------------------------------------
DO $$
DECLARE
  v_kept integer;
  v_pref text := repeat('Same opening paragraph. ', 8);   -- >140 chars shared
BEGIN
  INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
  VALUES ('f3a11000-0000-4000-8000-0000000000c1', 'f3a11000-0000-4000-8000-000000000001',
          NULL, 'f3a11000-0000-4000-8000-000000000010',
          'Weekly note', v_pref || 'FIRST tail.');

  INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
  VALUES ('f3a11000-0000-4000-8000-0000000000c2', 'f3a11000-0000-4000-8000-000000000001',
          NULL, 'f3a11000-0000-4000-8000-000000000010',
          'Weekly note', v_pref || 'SECOND tail.');

  -- Badges now show c2. Retract c1 — identical title, identical 140-char prefix.
  UPDATE public.cohort_announcements SET deleted_at = now()
   WHERE id = 'f3a11000-0000-4000-8000-0000000000c1';

  SELECT count(*) INTO v_kept FROM public.notifications n
  WHERE n.type = 'room_announcement'
    AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001'
    AND n.is_read = false
    AND n.link_url = 'cohort_announcement:f3a11000-0000-4000-8000-0000000000c2';
  IF v_kept <> 4 THEN
    RAISE EXCEPTION 'FAIL C7C — retracting a notice with the same title and the same 140-char body prefix took the LIVE notice''s badges: % of 4 survived.', v_kept;
  END IF;

  UPDATE public.cohort_announcements SET deleted_at = now()
   WHERE id = 'f3a11000-0000-4000-8000-0000000000c2';

  RAISE NOTICE 'PASS C7C — a badge is identified by which notice it shows, not by what that notice says, so same-title same-prefix notices no longer collide.';
END $$;


----------------------------------------------------------------------
-- C7D. RETRACTING ONE BATCH'S NOTICE DOES NOT REACH INTO THE OTHER'S INBOX.
--      The badge key `/cohort/<offering>` is deliberately OFFERING-level, so
--      batch A1 and batch A2 share it. The retract arm therefore has to be
--      scoped by the recipient set the way the refresh and insert arms are —
--      an earlier revision was not, and a batch-scoped retraction cleared
--      badges for members who never received that notice at all.
----------------------------------------------------------------------
DO $$
DECLARE
  v_a2_kept integer;
BEGIN
  INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
  VALUES ('f3a11000-0000-4000-8000-0000000000d1', 'f3a11000-0000-4000-8000-000000000001',
          'f3a11000-0000-4000-8000-000000000002', 'f3a11000-0000-4000-8000-000000000010',
          'Templated notice', 'Identical wording in both batches.');

  INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body)
  VALUES ('f3a11000-0000-4000-8000-0000000000d2', 'f3a11000-0000-4000-8000-000000000001',
          'f3a11000-0000-4000-8000-000000000003', 'f3a11000-0000-4000-8000-000000000010',
          'Templated notice', 'Identical wording in both batches.');

  -- Retract batch A1's copy only.
  UPDATE public.cohort_announcements SET deleted_at = now()
   WHERE id = 'f3a11000-0000-4000-8000-0000000000d1';

  SELECT count(*) INTO v_a2_kept FROM public.notifications n
  WHERE n.type = 'room_announcement'
    AND n.link = '/cohort/f3a11000-0000-4000-8000-000000000001'
    AND n.is_read = false
    AND n.link_url = 'cohort_announcement:f3a11000-0000-4000-8000-0000000000d2';
  IF v_a2_kept < 1 THEN
    RAISE EXCEPTION 'FAIL C7D — retracting batch A1''s notice cleared batch A2''s badges: % still point at A2''s own live notice.', v_a2_kept;
  END IF;

  UPDATE public.cohort_announcements SET deleted_at = now()
   WHERE id = 'f3a11000-0000-4000-8000-0000000000d2';

  RAISE NOTICE 'PASS C7D — the retract arm is scoped by recipient, so one batch''s retraction leaves the other batch''s inbox alone.';
END $$;


----------------------------------------------------------------------
-- C7E. THE PLATFORM BROADCAST TOOL IS NOT CAUGHT BY THE NEW UNIQUE INDEX.
--      `notifications_room_unread_uniq` is partial on `type =
--      'room_announcement'`, so AdminAnnouncements — which writes
--      `admin_announcement` rows client-side in batches, one per recipient —
--      must be able to send the SAME link to the SAME user twice without a
--      23505. This is the Tier-1 insurance case: the index lives on a shared
--      shipped table and the room is not its only writer.
----------------------------------------------------------------------
DO $$
DECLARE
  v_landed integer;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
  VALUES ('f3a11000-0000-4000-8000-000000000011', 'admin_announcement',
          'Platform notice one', 'body', '/same-link', false),
         ('f3a11000-0000-4000-8000-000000000011', 'admin_announcement',
          'Platform notice two', 'body', '/same-link', false);

  SELECT count(*) INTO v_landed FROM public.notifications
   WHERE user_id = 'f3a11000-0000-4000-8000-000000000011'
     AND type = 'admin_announcement' AND link = '/same-link';
  IF v_landed <> 2 THEN
    RAISE EXCEPTION 'FAIL C7E — the partial index caught the platform broadcast tool: % of 2 admin_announcement rows landed.', v_landed;
  END IF;

  RAISE NOTICE 'PASS C7E — two unread admin_announcement rows share one link with no 23505, so the room index cannot break the platform broadcast tool.';
END $$;


----------------------------------------------------------------------
-- C8. NFR-COPY-1, asserted against the catalogue.
--     get_room_announcements is the one new client-facing projection in this
--     task. Its RETURNS TABLE is the whole contract, so the check is on the
--     declared result type rather than on a sampled row: a row-level check
--     passes for free whenever the fixture happens to have a NULL there.
----------------------------------------------------------------------
DO $$
DECLARE
  v_result text;
BEGIN
  SELECT pg_get_function_result(p.oid) INTO v_result
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_room_announcements';

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'FAIL C8 — public.get_room_announcements does not exist on this project';
  END IF;
  IF v_result ~* '(email|phone|\mbio\M|tally)' THEN
    RAISE EXCEPTION 'FAIL C8 — the noticeboard projection declares a forbidden column: %', v_result;
  END IF;
  IF v_result !~ 'author_name' OR v_result !~ 'author_role' THEN
    RAISE EXCEPTION 'FAIL C8 — the projection is missing the author columns the board renders: %', v_result;
  END IF;
  RAISE NOTICE 'PASS C8 — get_room_announcements returns author_name and author_role and declares no email, phone, bio or tally column (NFR-COPY-1).';
END $$;


----------------------------------------------------------------------
-- C9. THE ROSTER ENUMERATOR IS NOT AN RPC.
--     room_announcement_targets is SECURITY DEFINER, its whole scope arrives in
--     its arguments, and it asserts nothing — 20260729100200's file header calls
--     that class out by name and forbids it being client-reachable. The trap is
--     that `REVOKE ... FROM PUBLIC` does NOT achieve that on a hosted project:
--     Supabase's `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO
--     postgres, anon, authenticated, service_role` attaches EXECUTE directly to
--     those roles, and CREATE OR REPLACE preserves it. So this is checked with
--     has_function_privilege, which sees the direct grant AND the PUBLIC one,
--     rather than by reading the migration and believing it.
----------------------------------------------------------------------
DO $$
DECLARE
  v_role   text;
  v_leaky  text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      RAISE EXCEPTION 'FAIL C9 — role % does not exist on this project, so the grant check could not run. A security check that cannot run is not a pass: run this file against a Supabase shadow project.', v_role;
    END IF;
    IF has_function_privilege(v_role,
         'public.room_announcement_targets(uuid, uuid, uuid)', 'EXECUTE') THEN
      v_leaky := v_leaky || v_role;
    END IF;
  END LOOP;

  IF array_length(v_leaky, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL C9 — room_announcement_targets is EXECUTABLE by %. Any caller holding that role can POST /rest/v1/rpc/room_announcement_targets with any offering id and read back every active member of that cohort, with no access assert and no batch scoping. Add: REVOKE EXECUTE ON FUNCTION public.room_announcement_targets(uuid, uuid, uuid) FROM anon, authenticated;', v_leaky;
  END IF;
  RAISE NOTICE 'PASS C9 — room_announcement_targets is reachable by neither anon nor authenticated, so the roster enumerator behind the fan-out is not an RPC anyone can call.';
END $$;


----------------------------------------------------------------------
-- C10-C14 read the BOARD. Two more notices first, and they are shaped to make
-- the ordering assertion mean something:
--   a6  PINNED, and stamped two days OLD
--   a7  unpinned, and stamped an hour into the FUTURE
-- so `pinned first, then newest first` is the only ordering that puts them in
-- the order asserted below. Every other fixture row shares one created_at
-- (`now()` is the transaction's start time), which is exactly why the
-- assertions below pin the FIRST TWO ids and the visible SET, and never a full
-- ordering over rows that legitimately tie.
--
-- These two inserts fire the trigger twice more. No case after this point
-- counts notifications, so that is harmless — but a new counting case must go
-- ABOVE this line, not below it.
----------------------------------------------------------------------
INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body, is_pinned, created_at)
VALUES ('f3a11000-0000-4000-8000-0000000000a6', 'f3a11000-0000-4000-8000-000000000001',
        NULL, 'f3a11000-0000-4000-8000-000000000010',
        'Read this first', 'House rules for the season.', true, now() - interval '2 days');

INSERT INTO public.cohort_announcements (id, offering_id, batch_id, author_id, title, body, is_pinned, created_at)
VALUES ('f3a11000-0000-4000-8000-0000000000a7', 'f3a11000-0000-4000-8000-000000000001',
        NULL, 'f3a11000-0000-4000-8000-000000000010',
        'Newest notice', 'Kit list is up.', false, now() + interval '1 hour');


----------------------------------------------------------------------
-- C10. THE BOARD, READ AS A BATCH-A1 MEMBER.
--      This is the one case that executes get_room_announcements rather than
--      reading its catalogue entry, and it covers four things at once: the
--      scope predicate (§4 restates get_cohort_room's by hand, so a drift there
--      would hand batch A1 batch A2's private noticeboard), the pinned-first
--      order, the author join, and the room standing that draws the wordmark.
----------------------------------------------------------------------
DO $$
DECLARE
  v_ids   uuid[];
  v_first uuid[];
  v_name  text;
  v_role  text;
BEGIN
  PERFORM pg_temp._r3f_become('f3a11000-0000-4000-8000-000000000011');  -- memberA, batch A1

  SELECT array_agg(a.id ORDER BY a.id) INTO v_ids
  FROM public.get_room_announcements('f3a11000-0000-4000-8000-000000000001'::uuid, 50, 0) a;

  IF v_ids IS DISTINCT FROM ARRAY[
       'f3a11000-0000-4000-8000-0000000000a1'::uuid,
       'f3a11000-0000-4000-8000-0000000000a2'::uuid,
       'f3a11000-0000-4000-8000-0000000000a3'::uuid,
       'f3a11000-0000-4000-8000-0000000000a4'::uuid,
       'f3a11000-0000-4000-8000-0000000000a6'::uuid,
       'f3a11000-0000-4000-8000-0000000000a7'::uuid
     ] THEN
    RAISE EXCEPTION 'FAIL C10 — a batch-A1 member reads % from the board. Expected the six offering-level notices and NOT a5, which is batch A2''s.', v_ids;
  END IF;

  -- WITH ORDINALITY rather than a bare LIMIT 2: it reads the function's OWN
  -- output position, so this assertion is about the RPC's ORDER BY and not
  -- about whether a Function Scan happens to preserve row order.
  SELECT array_agg(a.id ORDER BY a.ordinality) INTO v_first
  FROM public.get_room_announcements('f3a11000-0000-4000-8000-000000000001'::uuid, 50, 0)
       WITH ORDINALITY AS a
  WHERE a.ordinality <= 2;
  IF v_first IS DISTINCT FROM ARRAY[
       'f3a11000-0000-4000-8000-0000000000a6'::uuid,   -- pinned, and two days old
       'f3a11000-0000-4000-8000-0000000000a7'::uuid    -- unpinned, and the newest
     ] THEN
    RAISE EXCEPTION 'FAIL C10 — the board came back in the order %, so it is not pinned-first-then-newest: an OLD pinned notice must outrank the newest unpinned one.', v_first;
  END IF;

  SELECT a.author_name, a.author_role INTO v_name, v_role
  FROM public.get_room_announcements('f3a11000-0000-4000-8000-000000000001'::uuid, 50, 0) a
  WHERE a.id = 'f3a11000-0000-4000-8000-0000000000a6';
  IF v_name IS DISTINCT FROM 'Mentor X' OR v_role IS DISTINCT FROM 'mentor' THEN
    RAISE EXCEPTION 'FAIL C10 — the author resolved to (%, %), expected (Mentor X, mentor). The byline and the role wordmark both hang off this join.', COALESCE(v_name, '<null>'), COALESCE(v_role, '<null>');
  END IF;

  PERFORM pg_temp._r3f_become(NULL::uuid);
  RAISE NOTICE 'PASS C10 — a batch-A1 member reads the offering-level board and none of batch A2''s, pinned notices outrank newer unpinned ones, and every row carries the author''s name and their standing IN THIS ROOM.';
END $$;


----------------------------------------------------------------------
-- C11. THE LOBBY READS THE BOARD, AND ONLY THE OFFERING-LEVEL ONE.
--      MEMBER-1 gives a pre_member an announcements-READ grant and nothing
--      else, and this is the tier whose whole whitelist IS the noticeboard —
--      so a board that raised for them would be the single worst regression in
--      this task. It is also the tier that must not reach a batch's private
--      board, which is the R0 leak that was found and closed once already.
----------------------------------------------------------------------
DO $$
DECLARE
  v_ids uuid[];
BEGIN
  PERFORM pg_temp._r3f_become('f3a11000-0000-4000-8000-000000000013');  -- lobbyC, pre_member

  SELECT array_agg(a.id ORDER BY a.id) INTO v_ids
  FROM public.get_room_announcements('f3a11000-0000-4000-8000-000000000001'::uuid, 50, 0) a;

  IF v_ids IS DISTINCT FROM ARRAY[
       'f3a11000-0000-4000-8000-0000000000a1'::uuid,
       'f3a11000-0000-4000-8000-0000000000a2'::uuid,
       'f3a11000-0000-4000-8000-0000000000a3'::uuid,
       'f3a11000-0000-4000-8000-0000000000a4'::uuid,
       'f3a11000-0000-4000-8000-0000000000a6'::uuid,
       'f3a11000-0000-4000-8000-0000000000a7'::uuid
     ] THEN
    RAISE EXCEPTION 'FAIL C11 — the pre_member lobby reads % from the board. Expected the six offering-level notices, and never a5 (batch A2''s private one).', v_ids;
  END IF;

  PERFORM pg_temp._r3f_become(NULL::uuid);
  RAISE NOTICE 'PASS C11 — the pre_member lobby reads the offering-level board successfully (MEMBER-1''s announcements grant) and reaches no batch''s private notices.';
END $$;


----------------------------------------------------------------------
-- C12. C10's EXCLUSION IS A BOUNDARY, NOT AN EMPTY FUNCTION.
--      Without this, a §4 that returned offering-level rows and dropped every
--      batch-scoped row for everyone would pass C10 and C11 both.
----------------------------------------------------------------------
DO $$
DECLARE
  v_has_a5 boolean;
BEGIN
  PERFORM pg_temp._r3f_become('f3a11000-0000-4000-8000-000000000012');  -- memberB, batch A2

  SELECT EXISTS (
    SELECT 1 FROM public.get_room_announcements('f3a11000-0000-4000-8000-000000000001'::uuid, 50, 0) a
    WHERE a.id = 'f3a11000-0000-4000-8000-0000000000a5'
  ) INTO v_has_a5;

  IF NOT v_has_a5 THEN
    RAISE EXCEPTION 'FAIL C12 — batch A2''s own member cannot see batch A2''s notice. The scope predicate is dropping batch-scoped rows for everyone, which makes C10''s and C11''s exclusions vacuous.';
  END IF;

  PERFORM pg_temp._r3f_become(NULL::uuid);
  RAISE NOTICE 'PASS C12 — a batch-scoped notice IS returned to its own batch, so the exclusions C10 and C11 assert are a real boundary.';
END $$;


----------------------------------------------------------------------
-- C13. AN OUTSIDER GETS A RAISE, NOT AN EMPTY BOARD.
--      05-ACCESS-SECURITY §5.4 invariant #6, and the rule
--      src/hooks/useCohortRooms.ts is built on: `denied` and `empty` must stay
--      different answers, because a UI that reads one as the other tells a
--      student their cohort is quiet when it is actually refusing them.
----------------------------------------------------------------------
DO $$
DECLARE
  v_state text;
  v_rows  integer;
BEGIN
  PERFORM pg_temp._r3f_become('f3a11000-0000-4000-8000-000000000016');  -- outsiderF, no membership

  -- The verdict is RECORDED here and JUDGED below, deliberately. Raising the
  -- FAIL inside the block would hand it straight to this block's own `WHEN
  -- OTHERS`, which would swallow the real finding and report it as SQLSTATE
  -- P0001.
  BEGIN
    SELECT count(*) INTO v_rows
    FROM public.get_room_announcements('f3a11000-0000-4000-8000-000000000001'::uuid, 50, 0) a;
    v_state := 'no raise';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_state := '42501';
    WHEN query_canceled OR admin_shutdown OR crash_shutdown OR cannot_connect_now THEN
      -- The operator's, not ours to absorb. Named because WHEN OTHERS does not
      -- trap 57014 (the R0 lesson, 20260729100000 contract note 10).
      RAISE;
    WHEN OTHERS THEN
      v_state := SQLSTATE;
  END;

  IF v_state = 'no raise' THEN
    RAISE EXCEPTION 'FAIL C13 — a user with no membership row read the board and got % rows instead of a raise. An empty set here is indistinguishable from a quiet cohort.', v_rows;
  END IF;

  IF v_state <> '42501' THEN
    RAISE EXCEPTION 'FAIL C13 — an outsider''s read failed with SQLSTATE % instead of 42501. The client maps 42501 and nothing else to "denied" (ROOM_DENIED_PGCODE, src/hooks/useCohortRooms.ts), so any other code renders as a transport error with a Try again button.', v_state;
  END IF;

  PERFORM pg_temp._r3f_become(NULL::uuid);
  RAISE NOTICE 'PASS C13 — a caller with no membership row is REFUSED with 42501 rather than handed an empty board.';
END $$;


----------------------------------------------------------------------
-- C14. p_limit IS CLAMPED AND p_offset PAGES.
--      §4 exists partly to lift the envelope's hard LIMIT 10, so the paging
--      arguments are part of its contract — and a client asking for a million
--      rows must get a hundred rather than a table scan.
----------------------------------------------------------------------
DO $$
DECLARE
  v_all   integer;
  v_one   uuid[];
  v_zero  integer;
  v_page  uuid[];
BEGIN
  PERFORM pg_temp._r3f_become('f3a11000-0000-4000-8000-000000000011');  -- memberA

  SELECT count(*) INTO v_all
  FROM public.get_room_announcements('f3a11000-0000-4000-8000-000000000001'::uuid, 1000000, 0) a;
  IF v_all <> 6 THEN
    RAISE EXCEPTION 'FAIL C14 — a request for a million rows returned %, expected the 6 this caller can see (the clamp is LEAST(..., 100), so it must cap without erroring)', v_all;
  END IF;

  SELECT array_agg(a.id) INTO v_one
  FROM public.get_room_announcements('f3a11000-0000-4000-8000-000000000001'::uuid, 1, 0) a;
  IF v_one IS DISTINCT FROM ARRAY['f3a11000-0000-4000-8000-0000000000a6'::uuid] THEN
    RAISE EXCEPTION 'FAIL C14 — p_limit 1 returned %, expected only the pinned notice', v_one;
  END IF;

  -- GREATEST(..., 1): a zero limit is a client bug, not a request for nothing.
  SELECT count(*) INTO v_zero
  FROM public.get_room_announcements('f3a11000-0000-4000-8000-000000000001'::uuid, 0, 0) a;
  IF v_zero <> 1 THEN
    RAISE EXCEPTION 'FAIL C14 — p_limit 0 returned % rows, expected 1 (clamped up)', v_zero;
  END IF;

  SELECT array_agg(a.id) INTO v_page
  FROM public.get_room_announcements('f3a11000-0000-4000-8000-000000000001'::uuid, 1, 1) a;
  IF v_page IS DISTINCT FROM ARRAY['f3a11000-0000-4000-8000-0000000000a7'::uuid] THEN
    RAISE EXCEPTION 'FAIL C14 — page 2 of 1 returned %, expected the newest unpinned notice', v_page;
  END IF;

  PERFORM pg_temp._r3f_become(NULL::uuid);
  RAISE NOTICE 'PASS C14 — p_limit is clamped at both ends and p_offset pages, so the board reads past the envelope''s ten rows without becoming a way to ask for the whole table.';
END $$;


DO $$
BEGIN
  RAISE NOTICE 'ALL CASES PASSED — the announcement fan-out is correct, capped, batch-scoped and free of applicant copy; the board read is scoped, ordered, paged and refused to outsiders; and the roster enumerator behind the fan-out is reachable by no client role. Rolling the fixture world back now.';
END $$;

ROLLBACK;
