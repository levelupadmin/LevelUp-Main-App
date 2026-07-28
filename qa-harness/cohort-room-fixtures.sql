-- ============================================================================
-- qa-harness/cohort-room-fixtures.sql
-- Fixture world for the R0 adversarial access suite (cohort-room-access.spec.mjs).
--
-- 🔴 SHADOW PROJECTS ONLY. Never run this against prod (ivkvluezuiojovpotlyb).
-- The runner refuses the prod ref; this file has no way to check, so the rule
-- lives with the runner and with you.
--
-- CONTRACT WITH THE RUNNER
--   1. The runner creates the nine fixture auth users FIRST (Auth admin API,
--      emails below). Every id in this file is resolved from auth.users by
--      email via _room_qa_uid() — nothing is hard-coded, nothing is guessed.
--   2. This file is applied as ONE statement batch (Supabase Management API
--      /database/query) running as the project owner, so it bypasses RLS. That
--      is deliberate: fixtures are the world, the suite is the attack.
--   3. It is idempotent. It tears its own world down before rebuilding it.
--
-- THE SHAPE (05-ACCESS-SECURITY.md §7 — the authority)
--   offering A ─┬─ batch A1  content tagged LEAK_CANARY_A1   member_A1, (pre_member_A1)
--               └─ batch A2  content tagged LEAK_CANARY_A2   member_A2
--               └─ course A  via offering_courses            (live_sessions live here)
--   offering B ─── batch B1  content tagged LEAK_CANARY_B1   member_B
--               └─ course B  via offering_courses
--   mentor_A spans offering A (manual grant, batch_id NULL).
--   accepted_A has NO membership row at all, by design.
--
--   TWO LOBBY OCCUPANTS, NOT ONE — and the second exists because the first
--   cannot prove what the suite was claiming with it (GAP-4):
--     pre_member_A1    application stamped confirmation_paid, NO enrolments row
--     staged_lobby_A1  the SAME `pre_member` room tier, reached the way the
--                      staged payment path actually reaches it: an ACTIVE
--                      enrolment that still owes a balance (R-1 contract note
--                      3, resolver branch (b)).
--   Every April-era policy on live_sessions asks "is there an active enrolment
--   for this offering?" — a question the first actor answers NO to for reasons
--   that have nothing to do with being a pre_member, and the second answers
--   YES to while holding the identical room row. A fixture with only the first
--   makes "a pre_member reads zero rows from live_sessions" pass for free,
--   which is exactly what 20260729100000:906-918 forbids asserting.
--
-- WHY offering_courses IS MAPPED (it was missing before the 2026-07-27 review):
--   live_sessions RLS is `live_sessions_read` (has_course_access(course_id)) and
--   `live_sessions_student_read` (active enrolment in an offering mapped to the
--   course) — BOTH resolve through offering_courses. With no mapping, EVERY
--   actor read zero session rows for reasons that had nothing to do with room
--   membership, so every "live_sessions: 0 rows" result in the suite was a dead
--   probe dressed as evidence. One course per offering is also what keeps the
--   cross-OFFERING session attack real: member_B genuinely reads their own B
--   session, and still reads nothing of A's.
--   Note what this does NOT buy: live_sessions is course-scoped, never
--   batch-scoped, so both batches of offering A can read each other's session
--   ROWS at the table. That is pre-existing product shape, not something R0
--   changes; batch scoping of the schedule is delivered by R-3's envelope and
--   the suite asserts it there (R8.2). The residue that leaves at the TABLE and
--   in get_live_session_zoom_link is measured honestly as GAP-2 rather than
--   asserted away — see the note below.
--
-- ⚠️ READ THIS BEFORE ADDING A SURFACE IN R1–R4: live_sessions HAS NO BATCH
--   DIMENSION. The table hangs off course_id and reaches a batch only through
--   week_id → cohort_weeks → cohort_batch_id, so no RLS policy on it can draw a
--   batch boundary at all. Every batch boundary in this phase is therefore
--   drawn in an RPC standing ABOVE tables that do not know batches exist, and
--   the same root cause surfaces three times in this one diff: the envelope's
--   own session predicate (R8.2), the cross-batch table read and the
--   course-scoped get_live_session_zoom_link (both GAP-2), and
--   get_cohort_progress's lateral (GAP-3). Any NEW surface R1–R4 puts over
--   live_sessions needs its own hand-written scoping — and its own case here,
--   because nothing underneath it will do the scoping for you.
--
-- WHY TWO BATCHES UNDER ONE OFFERING: a single-batch fixture makes R8/R9/C3
-- vacuous. Splitting the canaries per batch is the only arrangement that proves
-- intra-offering batch isolation as well as cross-offering isolation.
--
-- WHY NOTHING IS HAND-INSERTED INTO cohort_room_members (except the manual
-- mentor grant, which IS the manual path): every derived membership in this
-- file is produced by driving the real truth tables — an enrolment plus a
-- cohort_batch_members row for members, and the confirmation_payment_id stamp
-- on cohort_applications for pre_member_A1. A hand-inserted membership row
-- would prove nothing about the resolver, and would itself be rejected by RLS
-- on any path a real client can reach.
--
-- SENTINELS PLANTED HERE (the suite greps the full response corpus for them)
--   LEAK_CANARY_A1          every batch-A1 content body
--   LEAK_CANARY_A2          every batch-A2 content body
--   LEAK_CANARY_B1          every offering-B content body
--   LEAK_CANARY_ZOOM_A1     zoom_link of the T+3h session (withheld until T-60)
--   LEAK_CANARY_ZOOMNEAR_A1 zoom_link of the T+30m session (released to A1 members
--                           ONLY — it is the positive control for the T-60 gate,
--                           so it must never reach anyone outside batch A1)
--   LEAK_CANARY_ZOOMLIVE_A1 zoom_link of the session that is RUNNING RIGHT NOW
--                           (started 20m ago, 90m long) — the row without which
--                           the "which session is this week's session" ordering
--                           cannot be tested at all
--   LEAK_CANARY_ZOOMCANCEL_A1 zoom_link of the CANCELLED session — a link that
--                           must reach nobody at any tier and at any distance,
--                           because the class is not happening
--   LEAK_CANARY_ZOOM_A2     zoom_link of batch A2's session (T+30m, so the
--                           entitlement half of the link gate is the only thing
--                           left to prove — a T+4h session answers NULL to
--                           everyone and proves nothing about entitlement)
--   LEAK_CANARY_ZOOM_B1     zoom_link of offering B's session (T+30m, same reason)
--   LEAK_CANARY_CONFIG_A    cohort_room_configs theme of offering A (masthead)
--   LEAK_CANARY_CONFIG_A2   cohort_room_configs theme of the batch-A2 OVERRIDE
--                           (readable by batch A2 only — the one intra-offering
--                           boundary room_configs_member_read actually draws)
--   LEAK_CANARY_REC_A1      recording_url of the recorded session (pre_member denied)
--   LEAK_CANARY_CURRIC_A1   cohort_weeks.description (curriculum detail)
--   LEAK_CANARY_CURRIC_A2   the same, for batch A2 (cross-batch curriculum)
--   LEAK_CANARY_CURRIC_B1   the same, for offering B (cross-offering curriculum)
--   LEAK_CANARY_ASSIGN_A1   cohort_weeks.assignment_prompt (assignment content)
--   LEAK_CANARY_ASSIGN_A2 / LEAK_CANARY_ASSIGN_B1   ditto, per container
--   LEAK_CANARY_FEEDBACK_A1 cohort_week_submissions.feedback_text (feedback)
--   LEAK_CANARY_MENTORDOC_A1 a mentor-materials resource
--   LEAK_CANARY_ATTEND_A1   cohort_week_attendance.notes (the attendance fact)
--   LEAK_CANARY_PII_A1      mentor_A's users.phone + users.email (roster PII)
--   LEAK_CANARY_PII_A2      member_A2's users.phone + users.email (cross-batch PII)
--
--   TWO SENTINELS ARE TIMESTAMPS, NOT STRINGS, because their tables have no
--   text column to hide a word in — cohort_room_seen is (user, offering,
--   seen_at) and cohort_recording_progress is (user, session, seconds,
--   completed, updated_at). An absurd, hand-picked instant is just as greppable
--   in a response body as a word, and it is the only sentinel those two
--   surfaces can carry:
--     2011-11-11T11:11:11+00  cohort_room_seen.seen_at        (member_A1)
--     2012-12-12T12:12:12+00  cohort_recording_progress.updated_at (member_A1)
--   Both render in UTC in a PostgREST body because Supabase pins the connection
--   TimeZone to UTC. If a shadow project ever did not, the positive control
--   fails loudly rather than the leak sweep passing quietly, which is the
--   direction that error has to break in.
--
-- EVERY SENTINEL ABOVE IS HUNTED BY A CORPUS THAT CAN ACTUALLY CARRY IT.
--   That is a rule, not an aspiration, and all three halves of it are checked by
--   machine: the suite's CANARY-LEDGER fails the run if a sentinel is planted
--   here and never swept for (.1), or swept for but never observed by the actor
--   entitled to it (.2), or hunted over a window that never queried a surface
--   carrying it (.3 — every canary declares its home surfaces in the spec's
--   CANARY_HOME map, and proveCorpusClean fails the individual sweep too). A
--   planted-but-unhunted sentinel is worse than no sentinel, because the sweep
--   it sits out still prints a pass. If you add a canary here, add it to the
--   CANARY map, to CANARY_HOME and to a needle list swept over a window that
--   probes its home surface — or do not add it at all.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Email → auth uid. Every reference below goes through this one function so
--    the file never carries a hard-coded uuid that could drift from auth.users.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._room_qa_uid(p_email text)
RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$fn$;

-- ---------------------------------------------------------------------------
-- 1. Teardown — explicit and in dependency order, so a re-run is clean even if
--    a previous run died halfway. Everything the fixture owns is prefixed
--    'room-qa' / 'ROOM QA'.
-- ---------------------------------------------------------------------------
DELETE FROM public.cohort_week_submissions
 WHERE cohort_week_id IN (
   SELECT w.id FROM public.cohort_weeks w
    JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
    JOIN public.offerings o ON o.id = b.offering_id
   WHERE o.slug LIKE 'room-qa-%');

-- Attendance hangs off cohort_weeks with ON DELETE CASCADE, so the offerings
-- delete below would take it — but it is spelled out for the same reason the
-- submissions delete above is: this file is re-applied against a project whose
-- previous run may have died between statements, and a half-torn world has to
-- be recoverable by running the file again, not by hand.
DELETE FROM public.cohort_week_attendance
 WHERE cohort_week_id IN (
   SELECT w.id FROM public.cohort_weeks w
    JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
    JOIN public.offerings o ON o.id = b.offering_id
   WHERE o.slug LIKE 'room-qa-%');

-- cohort_recording_progress cascades from live_sessions, and MUST be deleted
-- before them anyway if that cascade is ever weakened — it is the one fixture
-- table whose parent is deleted by title match rather than by the offerings
-- cascade, so it does not ride the same safety net as everything else.
DELETE FROM public.cohort_recording_progress
 WHERE live_session_id IN (SELECT id FROM public.live_sessions WHERE title LIKE 'ROOM QA %');

-- cohort_room_seen cascades from offerings (FK ON DELETE CASCADE), stated
-- explicitly so the teardown list matches the INSERT list one for one.
DELETE FROM public.cohort_room_seen
 WHERE offering_id IN (SELECT id FROM public.offerings WHERE slug LIKE 'room-qa-%');

DELETE FROM public.live_sessions WHERE title LIKE 'ROOM QA %';

DELETE FROM public.cohort_applications
 WHERE email LIKE 'room-qa-%'
    OR offering_id IN (SELECT id FROM public.offerings WHERE slug LIKE 'room-qa-%');

DELETE FROM public.enrolments
 WHERE offering_id IN (SELECT id FROM public.offerings WHERE slug LIKE 'room-qa-%');

-- Offerings cascade into batches, weeks, room configs, room members and every
-- room-content table. Courses are separate (live_sessions points at them).
DELETE FROM public.offerings WHERE slug LIKE 'room-qa-%';
DELETE FROM public.courses   WHERE slug LIKE 'room-qa-%';

-- ---------------------------------------------------------------------------
-- 2. Profiles. handle_new_user() already minted the public.users mirror rows
--    when the runner created the auth users; here we only dress them, and plant
--    the PII canaries that prove the roster never ships phone/email.
-- ---------------------------------------------------------------------------
UPDATE public.users SET role = 'admin', full_name = 'ROOM QA Admin'
 WHERE id = public._room_qa_uid('room-qa-admin@leveluptest.invalid');

UPDATE public.users
   SET full_name = 'ROOM QA Member A1', occupation = 'Editor', city = 'Chennai',
       phone = '+9190000000A1', email = 'room-qa-member-a1@leveluptest.invalid'
 WHERE id = public._room_qa_uid('room-qa-member-a1@leveluptest.invalid');

UPDATE public.users
   SET full_name = 'ROOM QA Member A2', occupation = 'Colourist', city = 'Kochi',
       phone = '+9190000LEAK_CANARY_PII_A2',
       email = 'room-qa-member-a2-LEAK_CANARY_PII_A2@leveluptest.invalid'
 WHERE id = public._room_qa_uid('room-qa-member-a2@leveluptest.invalid');

UPDATE public.users
   SET full_name = 'ROOM QA Member B', occupation = 'Writer', city = 'Mumbai',
       phone = '+9190000000B1', email = 'room-qa-member-b@leveluptest.invalid'
 WHERE id = public._room_qa_uid('room-qa-member-b@leveluptest.invalid');

UPDATE public.users
   SET full_name = 'ROOM QA Mentor A', occupation = 'Director', city = 'Bengaluru',
       phone = '+9190000LEAK_CANARY_PII_A1',
       email = 'room-qa-mentor-a-LEAK_CANARY_PII_A1@leveluptest.invalid'
 WHERE id = public._room_qa_uid('room-qa-mentor-a@leveluptest.invalid');

UPDATE public.users SET full_name = 'ROOM QA Accepted A', city = 'Pune'
 WHERE id = public._room_qa_uid('room-qa-accepted-a@leveluptest.invalid');

UPDATE public.users SET full_name = 'ROOM QA Pre Member A1', city = 'Hyderabad'
 WHERE id = public._room_qa_uid('room-qa-pre-member-a1@leveluptest.invalid');

UPDATE public.users SET full_name = 'ROOM QA Staged Lobby A1', city = 'Coimbatore'
 WHERE id = public._room_qa_uid('room-qa-staged-lobby-a1@leveluptest.invalid');

UPDATE public.users SET full_name = 'ROOM QA Outsider', city = 'Delhi'
 WHERE id = public._room_qa_uid('room-qa-outsider@leveluptest.invalid');

-- ---------------------------------------------------------------------------
-- 3. Catalog — two offerings, three batches, one course per offering.
--
--    offerings.type is CHECK (type IN ('onetime','subscription')) since the very
--    first migration (20260405062941:7) and no migration ever widens it. A live
--    cohort IS a 'onetime' offering in this schema — "cohort" is expressed by
--    payment_mode='staged' plus a cohort_batches row, never by `type`. Passing
--    'cohort' here raises 23514 on the fourth statement of this file and takes
--    the whole suite down before a single assertion runs.
-- ---------------------------------------------------------------------------
INSERT INTO public.courses (slug, title, status)
VALUES ('room-qa-course-a', 'ROOM QA Course A', 'draft'),
       ('room-qa-course-b', 'ROOM QA Course B', 'draft');

INSERT INTO public.offerings (slug, title, type, status, price_inr, is_public)
VALUES
  ('room-qa-offering-a', 'ROOM QA Offering A', 'onetime', 'active', 100000, false),
  ('room-qa-offering-b', 'ROOM QA Offering B', 'onetime', 'active', 100000, false);

-- The mapping live_sessions RLS resolves through. Without it every session probe
-- in the suite returns zero rows for a reason unrelated to room membership.
INSERT INTO public.offering_courses (offering_id, course_id)
SELECT o.id, c.id
FROM (VALUES
        ('room-qa-offering-a', 'room-qa-course-a'),
        ('room-qa-offering-b', 'room-qa-course-b')
     ) AS v(offering, course)
JOIN public.offerings o ON o.slug = v.offering
JOIN public.courses   c ON c.slug = v.course;

INSERT INTO public.cohort_batches (offering_id, name)
SELECT o.id, v.name
FROM (VALUES
        ('room-qa-offering-a', 'ROOM QA Batch A1'),
        ('room-qa-offering-a', 'ROOM QA Batch A2'),
        ('room-qa-offering-b', 'ROOM QA Batch B1')
     ) AS v(slug, name)
JOIN public.offerings o ON o.slug = v.slug;

-- ---------------------------------------------------------------------------
-- 4. Room configs. Offering A carries the default (batch_id NULL) plus a
--    batch-A2 override, so the override resolution path is exercised too.
--    Every modules key ships FALSE here; NFR-CONFIG-2 flips them all ON mid-run
--    and re-runs the outsider/accepted reads — a flag must never widen access.
--
--    THE OVERRIDE CARRIES ITS OWN SENTINEL (LEAK_CANARY_CONFIG_A2). It is the
--    only row in this fixture that exercises the one boundary
--    room_configs_member_read draws INSIDE a single offering: that policy routes
--    through cohort_room_can_access(offering_id, batch_id), which for a batch-A1
--    member reading THIS row evaluates m.batch_id = p_batch → false. With the
--    override unsentinelled, a regression of that predicate to "batch_id IS NULL
--    OR TRUE" would hand a batch-A1 member batch A2's skin and the corpus grep
--    would not see it, because the offering-level LEAK_CANARY_CONFIG_A is a row
--    both batches are entitled to.
-- ---------------------------------------------------------------------------
INSERT INTO public.cohort_room_configs (offering_id, batch_id, slug, phase, theme, modules)
SELECT o.id, NULL, 'room-qa-a', 'live',
       jsonb_build_object('accent_h', 268, 'accent_s', 72, 'accent_l', 58,
                          'texture', 'grain',
                          'wordmark_text', 'ROOM QA A LEAK_CANARY_CONFIG_A'),
       jsonb_build_object('weeks', false, 'sessions', false, 'recordings', false,
                          'assignments', false, 'feedback', false, 'commons', false,
                          'resources', false, 'demo_day', false, 'roster', false,
                          'announcements', false, 'mentor_materials', false,
                          'certificates', false)
FROM public.offerings o WHERE o.slug = 'room-qa-offering-a';

INSERT INTO public.cohort_room_configs (offering_id, batch_id, slug, phase, theme, modules)
SELECT b.offering_id, b.id, 'room-qa-a-batch-a2', 'live',
       jsonb_build_object('accent_h', 12, 'accent_s', 80, 'accent_l', 55,
                          'texture', 'none',
                          'wordmark_text', 'ROOM QA A2 LEAK_CANARY_CONFIG_A2'),
       '{}'::jsonb
FROM public.cohort_batches b WHERE b.name = 'ROOM QA Batch A2';

INSERT INTO public.cohort_room_configs (offering_id, batch_id, slug, phase, theme, modules)
SELECT o.id, NULL, 'room-qa-b', 'live',
       jsonb_build_object('accent_h', 190, 'accent_s', 65, 'accent_l', 52,
                          'texture', 'none', 'wordmark_text', 'ROOM QA B'),
       '{}'::jsonb
FROM public.offerings o WHERE o.slug = 'room-qa-offering-b';

-- ---------------------------------------------------------------------------
-- 5. Weeks. Batch A1's week carries the curriculum + assignment sentinels: a
--    pre_member may see that a week EXISTS (titles/dates) and must never see
--    these two bodies.
-- ---------------------------------------------------------------------------
INSERT INTO public.cohort_weeks (cohort_batch_id, week_number, theme, description,
                                 assignment_prompt, assignment_due_at,
                                 starts_on, ends_on, status)
SELECT b.id, 1, 'ROOM QA Week 1 ' || v.canary,
       'Curriculum detail ' || v.curric,
       'Assignment brief ' || v.assign,
       now() + interval '7 days',
       current_date - 1, current_date + 6, 'active'
FROM (VALUES
        ('ROOM QA Batch A1', 'LEAK_CANARY_A1', 'LEAK_CANARY_CURRIC_A1', 'LEAK_CANARY_ASSIGN_A1'),
        ('ROOM QA Batch A2', 'LEAK_CANARY_A2', 'LEAK_CANARY_CURRIC_A2', 'LEAK_CANARY_ASSIGN_A2'),
        ('ROOM QA Batch B1', 'LEAK_CANARY_B1', 'LEAK_CANARY_CURRIC_B1', 'LEAK_CANARY_ASSIGN_B1')
     ) AS v(batch, canary, curric, assign)
JOIN public.cohort_batches b ON b.name = v.batch;

-- ---------------------------------------------------------------------------
-- 6. Live sessions. FIVE for batch A1, deliberately timed:
--      FAR       at T+3h   → the T-60 gate must NULL its zoom_link
--      NEAR      at T+30m  → inside T-60, zoom_link must be present
--      LIVE      at T-20m  → RUNNING RIGHT NOW (started 20m ago, 90m long, so
--                            scheduled_at < now() < scheduled_at + duration)
--      CANCELLED at T-60m  → also still inside its own window, starts EARLIER
--                            than LIVE, and must lose anyway
--      PAST                → carries the recording sentinel
--    Offering A's sessions hang off course A, offering B's off course B, so the
--    course→offering mapping in §3 makes each one visible to exactly the
--    offering that paid for it and to nobody else.
--
--    WHY THE RUNNING SESSION EXISTS. A week with several sessions has to
--    collapse to ONE row in get_cohort_progress, and "which one" is a decision
--    with a right answer: the session a student is IN right now, not the one
--    that starts later this week. Without a currently-running row, both a
--    lateral that prefers the running session and one that classifies it as
--    "past" return the same answer for these fixtures, and the case cannot
--    fail — so it would prove nothing. It also gives the T-60 window its middle
--    case: the gate is a WINDOW (T-60 → end + 1h), and FAR/NEAR only ever
--    exercise its lower edge.
--
--    ALL FIVE HANG OFF WEEK A1 ON PURPOSE. That is what makes the per-week
--    collapse testable: five sessions, one week row — and it is the shape the
--    old plain LEFT JOIN turned into five week cards on the dashboard.
-- ---------------------------------------------------------------------------
INSERT INTO public.live_sessions (course_id, week_id, title, scheduled_at,
                                  duration_minutes, status, zoom_link, recording_url)
SELECT c.id, w.id, 'ROOM QA A1 FAR session', now() + interval '3 hours',
       90, 'scheduled', 'https://zoom.test/j/LEAK_CANARY_ZOOM_A1', NULL
FROM public.courses c
JOIN public.cohort_weeks w ON w.theme LIKE '%LEAK_CANARY_A1%'
WHERE c.slug = 'room-qa-course-a';

INSERT INTO public.live_sessions (course_id, week_id, title, scheduled_at,
                                  duration_minutes, status, zoom_link, recording_url)
SELECT c.id, w.id, 'ROOM QA A1 NEAR session', now() + interval '30 minutes',
       90, 'scheduled', 'https://zoom.test/j/LEAK_CANARY_ZOOMNEAR_A1', NULL
FROM public.courses c
JOIN public.cohort_weeks w ON w.theme LIKE '%LEAK_CANARY_A1%'
WHERE c.slug = 'room-qa-course-a';

INSERT INTO public.live_sessions (course_id, week_id, title, scheduled_at,
                                  duration_minutes, status, zoom_link, recording_url)
SELECT c.id, w.id, 'ROOM QA A1 LIVE session', now() - interval '20 minutes',
       90, 'scheduled', 'https://zoom.test/j/LEAK_CANARY_ZOOMLIVE_A1', NULL
FROM public.courses c
JOIN public.cohort_weeks w ON w.theme LIKE '%LEAK_CANARY_A1%'
WHERE c.slug = 'room-qa-course-a';

-- The CANCELLED decoy. It starts EARLIER than the live session and has not
-- ended, so under "pick the earliest session that has not finished" it would win
-- the week if cancelled sessions were candidates — which is the whole point:
-- a week whose Join button pointed at a class that was called off is a student
-- sitting alone in an empty meeting. Its link carries its own sentinel because
-- a cancelled session's link must never be handed to anyone, at any distance.
INSERT INTO public.live_sessions (course_id, week_id, title, scheduled_at,
                                  duration_minutes, status, zoom_link, recording_url)
SELECT c.id, w.id, 'ROOM QA A1 CANCELLED session', now() - interval '60 minutes',
       120, 'cancelled', 'https://zoom.test/j/LEAK_CANARY_ZOOMCANCEL_A1', NULL
FROM public.courses c
JOIN public.cohort_weeks w ON w.theme LIKE '%LEAK_CANARY_A1%'
WHERE c.slug = 'room-qa-course-a';

INSERT INTO public.live_sessions (course_id, week_id, title, scheduled_at,
                                  duration_minutes, status, zoom_link, recording_url)
SELECT c.id, w.id, 'ROOM QA A1 PAST session', now() - interval '2 days',
       90, 'completed', NULL, 'https://vdo.test/LEAK_CANARY_REC_A1.m3u8'
FROM public.courses c
JOIN public.cohort_weeks w ON w.theme LIKE '%LEAK_CANARY_A1%'
WHERE c.slug = 'room-qa-course-a';

INSERT INTO public.live_sessions (course_id, week_id, title, scheduled_at,
                                  duration_minutes, status, zoom_link, recording_url)
-- A2's and B1's sessions sit at T+30m, INSIDE the T-60 window, on purpose: a
-- session outside the window answers NULL to every caller, entitled or not, so
-- a "member_B gets NULL for batch A2's link" result would be a timing artefact
-- wearing an entitlement claim. Inside the window, time is settled and the only
-- thing left for the RPC to decide is who the caller is — which is the property
-- C2.7 is actually asserting.
SELECT c.id, w.id, 'ROOM QA A2 session', now() + interval '30 minutes',
       90, 'scheduled', 'https://zoom.test/j/LEAK_CANARY_ZOOM_A2', NULL
FROM public.courses c
JOIN public.cohort_weeks w ON w.theme LIKE '%LEAK_CANARY_A2%'
WHERE c.slug = 'room-qa-course-a';

INSERT INTO public.live_sessions (course_id, week_id, title, scheduled_at,
                                  duration_minutes, status, zoom_link, recording_url)
SELECT c.id, w.id, 'ROOM QA B1 session', now() + interval '30 minutes',
       90, 'scheduled', 'https://zoom.test/j/LEAK_CANARY_ZOOM_B1', NULL
FROM public.courses c
JOIN public.cohort_weeks w ON w.theme LIKE '%LEAK_CANARY_B1%'
WHERE c.slug = 'room-qa-course-b';

-- ---------------------------------------------------------------------------
-- 7. Memberships, driven through the REAL truth tables.
--    members  : enrolment (active) + cohort_batch_members → resolver trigger
--    mentor_A : the manual grant (source='manual', batch_id NULL = offering-wide)
--    accepted_A / pre_member_A1 : applications only — see §8
-- ---------------------------------------------------------------------------
INSERT INTO public.enrolments (user_id, offering_id, status, source)
SELECT public._room_qa_uid(v.email), o.id, 'active', 'admin_grant'
FROM (VALUES
        ('room-qa-member-a1@leveluptest.invalid', 'room-qa-offering-a'),
        ('room-qa-member-a2@leveluptest.invalid', 'room-qa-offering-a'),
        ('room-qa-member-b@leveluptest.invalid',  'room-qa-offering-b')
     ) AS v(email, slug)
JOIN public.offerings o ON o.slug = v.slug;

INSERT INTO public.cohort_batch_members (batch_id, enrolment_id)
SELECT b.id, e.id
FROM (VALUES
        ('room-qa-member-a1@leveluptest.invalid', 'ROOM QA Batch A1'),
        ('room-qa-member-a2@leveluptest.invalid', 'ROOM QA Batch A2'),
        ('room-qa-member-b@leveluptest.invalid',  'ROOM QA Batch B1')
     ) AS v(email, batch)
JOIN public.cohort_batches b ON b.name = v.batch
JOIN public.enrolments e
  ON e.user_id = public._room_qa_uid(v.email)
 AND e.offering_id = b.offering_id;

-- The manual mentor grant. Seeded directly (this row's whole point is that it
-- is NOT derived). The suite separately drives admin_grant_room_member from a
-- real ADMIN JWT and proves it writes a row (W3.5) before proving a student's
-- identical call writes nothing (W3.4) — without the admin half, "returned
-- NULL, wrote nothing" is indistinguishable from a function that is broken,
-- mis-signatured or REVOKEd, and W3.4 would go green against all three.
INSERT INTO public.cohort_room_members (user_id, offering_id, batch_id, role, source, status)
SELECT public._room_qa_uid('room-qa-mentor-a@leveluptest.invalid'), o.id, NULL,
       'mentor', 'manual', 'active'
FROM public.offerings o WHERE o.slug = 'room-qa-offering-a'
-- Uniqueness on this table is two PARTIAL indexes (batch rows vs offering-wide
-- rows); the offering-wide arbiter is the one that applies to a NULL batch.
ON CONFLICT (user_id, offering_id) WHERE batch_id IS NULL
DO UPDATE SET role = 'mentor', source = 'manual', status = 'active';

-- ---------------------------------------------------------------------------
-- 8. The funnel actors.
--    accepted_A stops at 'accepted' with the confirmation fee UNPAID: MEMBER-1
--    says that state carries zero room read grant and no membership row.
--    pre_member_A1 is walked through the REAL pre_member path — the row is
--    inserted at 'accepted' and then UPDATEd with the confirmation_payment_id
--    stamp, which is what R-1's AFTER UPDATE OF status trigger keys on. If that
--    trigger does not exist, no pre_member row appears and the suite fails at
--    its membership preflight, which is exactly the signal we want.
--
--    app_fee_payment_id / confirmation_payment_id are `uuid` columns
--    (20260413100000:24-25) and no migration ever retypes them, so a
--    'pay_…'-style Razorpay string raises 22P02 and takes the whole pre_member
--    half of the sign-off — PRE.5, R11.* and W6b.* — off the board. They carry
--    no FK, so a generated uuid is a faithful stand-in for the payment row the
--    webhook would have written.
-- ---------------------------------------------------------------------------
INSERT INTO public.cohort_applications
       (user_id, offering_id, full_name, email, phone, city, status, app_fee_paid_at, app_fee_payment_id)
SELECT public._room_qa_uid('room-qa-accepted-a@leveluptest.invalid'), o.id,
       'ROOM QA Accepted A', 'room-qa-accepted-a@leveluptest.invalid',
       '+9190000000AC', 'Pune', 'accepted', now() - interval '10 days', gen_random_uuid()
FROM public.offerings o WHERE o.slug = 'room-qa-offering-a';

INSERT INTO public.cohort_applications
       (user_id, offering_id, full_name, email, phone, city, status, app_fee_paid_at, app_fee_payment_id)
SELECT public._room_qa_uid('room-qa-pre-member-a1@leveluptest.invalid'), o.id,
       'ROOM QA Pre Member A1', 'room-qa-pre-member-a1@leveluptest.invalid',
       '+9190000000PM', 'Hyderabad', 'accepted', now() - interval '10 days', gen_random_uuid()
FROM public.offerings o WHERE o.slug = 'room-qa-offering-a';

-- The staged lobby occupant's application. Identical to pre_member_A1's up to
-- here; what makes it the STAGED shape is the active enrolment added below,
-- after the stamp.
INSERT INTO public.cohort_applications
       (user_id, offering_id, full_name, email, phone, city, status, app_fee_paid_at, app_fee_payment_id)
SELECT public._room_qa_uid('room-qa-staged-lobby-a1@leveluptest.invalid'), o.id,
       'ROOM QA Staged Lobby A1', 'room-qa-staged-lobby-a1@leveluptest.invalid',
       '+9190000000SL', 'Coimbatore', 'accepted', now() - interval '10 days', gen_random_uuid()
FROM public.offerings o WHERE o.slug = 'room-qa-offering-a';

-- The stamp. This UPDATE is the pre_member path; nothing else creates that row.
UPDATE public.cohort_applications
   SET confirmation_payment_id = gen_random_uuid(),
       status = 'confirmation_paid'
 WHERE email IN ('room-qa-pre-member-a1@leveluptest.invalid',
                 'room-qa-staged-lobby-a1@leveluptest.invalid');

-- ---------------------------------------------------------------------------
-- 8b. THE STAGED CONFIRMATION ENROLMENT — and the reason it is written HERE,
--     three statements after §7 rather than inside it.
--
--     ORDER IS LOAD-BEARING. The resolver runs on every one of these writes.
--     Insert this enrolment BEFORE the confirmation stamp and the sequence is:
--     branch (a2) sees an active enrolment with no application row, so
--     _room_balance_outstanding() is FALSE and it mints a full `member` row;
--     the stamp then fires the resolver again, branch (b) is blocked by its own
--     `NOT EXISTS (an active non-pre_member row)` guard, and branch (c)
--     retracts the member row to 'revoked'. The actor ends up with a revoked
--     member row and NO lobby row, and every GAP-4 probe measures the wrong
--     thing. Written in this order — application, stamp, then enrolment —
--     branch (b) owns the row first and the enrolment upserts it in place.
--
--     WHAT MAKES THE BALANCE OUTSTANDING: offerings.price_inr is 100000 and
--     app_fee_inr / confirmation_amount_inr are unset, so
--     price − app_fee − confirmation > 0 and _room_balance_outstanding()
--     (20260729100000:759-774) reads TRUE for this application. That predicate,
--     not the enrolments table, is the Δ2 tier line.
--
--     AND DELIBERATELY NO cohort_batch_members ROW. A staged occupant has not
--     been placed on a roster yet, which is what keeps
--     cohort_weeks_student_read shut for them — so GAP-4's residue is exactly
--     live_sessions and the join link, and the suite can assert the curriculum
--     half stays closed instead of carrying a vaguer gap.
-- ---------------------------------------------------------------------------
INSERT INTO public.enrolments (user_id, offering_id, status, source)
SELECT public._room_qa_uid('room-qa-staged-lobby-a1@leveluptest.invalid'), o.id,
       'active', 'admin_grant'
FROM public.offerings o WHERE o.slug = 'room-qa-offering-a';

-- ---------------------------------------------------------------------------
-- 9. Room content. Canary per batch — never co-mingled, or R8/R9/C3 prove
--    nothing.
-- ---------------------------------------------------------------------------

-- 9a. Announcements. One per batch, plus one offering-wide (batch_id NULL) that
--     every batch of offering A must see — the §R-2 edge case.
INSERT INTO public.cohort_announcements (offering_id, batch_id, author_id, title, body)
SELECT b.offering_id, b.id,
       public._room_qa_uid('room-qa-mentor-a@leveluptest.invalid'),
       'ROOM QA announcement ' || v.batch,
       'Private noticeboard body for ' || v.batch || ' :: ' || v.canary
FROM (VALUES
        ('ROOM QA Batch A1', 'LEAK_CANARY_A1'),
        ('ROOM QA Batch A2', 'LEAK_CANARY_A2'),
        ('ROOM QA Batch B1', 'LEAK_CANARY_B1')
     ) AS v(batch, canary)
JOIN public.cohort_batches b ON b.name = v.batch;

INSERT INTO public.cohort_announcements (offering_id, batch_id, author_id, title, body)
SELECT o.id, NULL,
       public._room_qa_uid('room-qa-mentor-a@leveluptest.invalid'),
       'ROOM QA offering-wide announcement',
       'Visible to every batch of offering A :: ROOMQA_ALLBATCH_A'
FROM public.offerings o WHERE o.slug = 'room-qa-offering-a';

-- 9b. Resources, including the mentor-materials row a pre_member must not reach.
INSERT INTO public.cohort_resources (offering_id, batch_id, cohort_week_id, title, kind, url, added_by)
SELECT b.offering_id, b.id, w.id,
       'ROOM QA resource ' || v.canary, 'link',
       'https://files.test/' || v.canary || '.pdf',
       public._room_qa_uid('room-qa-mentor-a@leveluptest.invalid')
FROM (VALUES
        ('ROOM QA Batch A1', 'LEAK_CANARY_A1'),
        ('ROOM QA Batch A2', 'LEAK_CANARY_A2'),
        ('ROOM QA Batch B1', 'LEAK_CANARY_B1')
     ) AS v(batch, canary)
JOIN public.cohort_batches b ON b.name = v.batch
JOIN public.cohort_weeks w ON w.cohort_batch_id = b.id AND w.week_number = 1;

INSERT INTO public.cohort_resources (offering_id, batch_id, cohort_week_id, title, kind, url, added_by)
SELECT b.offering_id, b.id, w.id,
       'ROOM QA mentor materials LEAK_CANARY_MENTORDOC_A1', 'file',
       'https://files.test/LEAK_CANARY_MENTORDOC_A1.pdf',
       public._room_qa_uid('room-qa-mentor-a@leveluptest.invalid')
FROM public.cohort_batches b
JOIN public.cohort_weeks w ON w.cohort_batch_id = b.id AND w.week_number = 1
WHERE b.name = 'ROOM QA Batch A1';

-- 9c. Feed posts + replies. channel_key / cohort_week_id are the Δ1 columns
--     landed dark in R0; the fixture writes them so the taxonomy is exercised
--     from day one.
INSERT INTO public.cohort_room_posts (offering_id, batch_id, author_id, kind, body, channel_key, cohort_week_id)
SELECT b.offering_id, b.id, public._room_qa_uid(v.author), 'question',
       'Feed post in ' || v.batch || ' :: ' || v.canary,
       'general', NULL
FROM (VALUES
        ('ROOM QA Batch A1', 'LEAK_CANARY_A1', 'room-qa-member-a1@leveluptest.invalid'),
        ('ROOM QA Batch A2', 'LEAK_CANARY_A2', 'room-qa-member-a2@leveluptest.invalid'),
        ('ROOM QA Batch B1', 'LEAK_CANARY_B1', 'room-qa-member-b@leveluptest.invalid')
     ) AS v(batch, canary, author)
JOIN public.cohort_batches b ON b.name = v.batch;

INSERT INTO public.cohort_room_post_replies (post_id, author_id, body)
SELECT p.id, p.author_id, 'Reply body :: ' || v.canary
FROM (VALUES
        ('ROOM QA Batch A1', 'LEAK_CANARY_A1'),
        ('ROOM QA Batch A2', 'LEAK_CANARY_A2'),
        ('ROOM QA Batch B1', 'LEAK_CANARY_B1')
     ) AS v(batch, canary)
JOIN public.cohort_batches b ON b.name = v.batch
JOIN public.cohort_room_posts p ON p.batch_id = b.id;

-- 9d. Demo-day entries (owner-writable, room-readable gallery).
INSERT INTO public.cohort_demo_entries (offering_id, batch_id, user_id, title, description, work_url)
SELECT b.offering_id, b.id, public._room_qa_uid(v.owner),
       'ROOM QA demo ' || v.canary,
       'Demo description :: ' || v.canary,
       'https://work.test/' || v.canary
FROM (VALUES
        ('ROOM QA Batch A1', 'LEAK_CANARY_A1', 'room-qa-member-a1@leveluptest.invalid'),
        ('ROOM QA Batch A2', 'LEAK_CANARY_A2', 'room-qa-member-a2@leveluptest.invalid'),
        ('ROOM QA Batch B1', 'LEAK_CANARY_B1', 'room-qa-member-b@leveluptest.invalid')
     ) AS v(batch, canary, owner)
JOIN public.cohort_batches b ON b.name = v.batch;

-- 9e. Assignment submission + feedback for member_A1 — the feedback body is a
--     sentinel a pre_member must never reach by any path.
INSERT INTO public.cohort_week_submissions (cohort_week_id, user_id, text_content, feedback_text, status, reviewed_at)
SELECT w.id, public._room_qa_uid('room-qa-member-a1@leveluptest.invalid'),
       'Submission text :: LEAK_CANARY_A1',
       'Mentor feedback :: LEAK_CANARY_FEEDBACK_A1',
       'reviewed', now() - interval '1 day'
FROM public.cohort_weeks w
JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
WHERE b.name = 'ROOM QA Batch A1';

-- 9f. Private recording position for member_A1 (own-row-only surface).
--     updated_at carries the sentinel: this table has no text column, and
--     without a greppable value the accepted_A / pre_member_A1 / outsider
--     corpus sweeps could not name what a leak from here would look like — the
--     surface would be probed but not hunted, which is the shape of a vacuous
--     pass. `completed` is set so the row is not all-defaults either.
INSERT INTO public.cohort_recording_progress (user_id, live_session_id, position_seconds, completed, updated_at)
SELECT public._room_qa_uid('room-qa-member-a1@leveluptest.invalid'), ls.id, 424, false,
       timestamptz '2012-12-12 12:12:12+00'
FROM public.live_sessions ls WHERE ls.title = 'ROOM QA A1 PAST session';

-- 9g. The room-seen watermark for member_A1. Until now this table had no seed
--     row at all, so the "accepted_A reads EVERY room-content surface and gets
--     nothing" claim was made over eight of the ten surfaces and this one was
--     simply absent from the list. seen_at IS the sentinel (see the header
--     note), and it is set absurdly far in the past so every announcement stays
--     UNSEEN — get_my_cohort_rooms counts announcements created after
--     max(seen_at), and MYROOMS.1/.4 assert that counter is non-zero.
INSERT INTO public.cohort_room_seen (user_id, offering_id, seen_at)
SELECT public._room_qa_uid('room-qa-member-a1@leveluptest.invalid'), o.id,
       timestamptz '2011-11-11 11:11:11+00'
FROM public.offerings o WHERE o.slug = 'room-qa-offering-a';

-- 9h. Attendance for member_A1's week. get_cohort_progress LEFT JOINs this
--     table for its `attended` / `attendance_marked` columns; with no row here
--     those two columns are structurally false/NULL for every fixture actor, so
--     a case asserting on them would be asserting on the absence of a seed
--     rather than on the RPC. notes carries a sentinel because the attendance
--     FACT — who showed up — is cohort-mate-private like everything else here.
INSERT INTO public.cohort_week_attendance (cohort_week_id, user_id, attended, marked_by, marked_at, notes)
SELECT w.id, public._room_qa_uid('room-qa-member-a1@leveluptest.invalid'), true,
       public._room_qa_uid('room-qa-mentor-a@leveluptest.invalid'), now() - interval '1 day',
       'Attendance note :: LEAK_CANARY_ATTEND_A1'
FROM public.cohort_weeks w
JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
WHERE b.name = 'ROOM QA Batch A1';

-- ---------------------------------------------------------------------------
-- 10. Safety net. The resolver runs on the enrolment/batch triggers above; call
--     it explicitly too so a fixture applied against a project where those
--     triggers have not landed yet fails on the MEMBERSHIP preflight (a clear,
--     named failure) rather than on twenty confusing downstream reads.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  PERFORM public.cohort_room_resolve_user(public._room_qa_uid(e))
  FROM unnest(ARRAY[
    'room-qa-member-a1@leveluptest.invalid',
    'room-qa-member-a2@leveluptest.invalid',
    'room-qa-member-b@leveluptest.invalid',
    -- pre_member_A1 goes through the application trigger above; re-running the
    -- resolver here is belt-and-braces so a missing TRIGGER (as opposed to a
    -- missing resolver branch) still surfaces as PRE.5 rather than as silence.
    'room-qa-pre-member-a1@leveluptest.invalid',
    -- The staged lobby occupant: the ONE actor whose end state depends on the
    -- order of three separate writes (§8b), so re-deriving them once more here
    -- means PRE.5b reads a settled world rather than whatever the last trigger
    -- happened to leave behind.
    'room-qa-staged-lobby-a1@leveluptest.invalid',
    -- accepted_A too: if a stray branch ever grants the unpaid applicant a row,
    -- PRE.6 must see it here rather than have it appear later out of nowhere.
    'room-qa-accepted-a@leveluptest.invalid'
  ]) AS e;
EXCEPTION WHEN undefined_function THEN
  RAISE WARNING 'cohort_room_resolve_user() not present — R-1 has not been applied to this project';
END $do$;

-- Report the world back to the runner (last statement = the returned rows).
SELECT
  (SELECT count(*) FROM public.offerings           WHERE slug LIKE 'room-qa-%')          AS offerings,
  (SELECT count(*) FROM public.cohort_batches b
     JOIN public.offerings o ON o.id = b.offering_id WHERE o.slug LIKE 'room-qa-%')      AS batches,
  (SELECT count(*) FROM public.cohort_room_configs c
     JOIN public.offerings o ON o.id = c.offering_id WHERE o.slug LIKE 'room-qa-%')      AS configs,
  -- Reported as EVIDENCE on PRE.1, never asserted as a number: every roster
  -- member legitimately owns two rows here (the batch-less row branch (a2)
  -- writes at the enrolment, and the batch-scoped row branch (a) writes at the
  -- roster placement, with (c) retracting the first). The per-actor SHAPE is
  -- what PRE.2–PRE.7 assert; pinning a total would break on correct behaviour.
  (SELECT count(*) FROM public.cohort_room_members m
     JOIN public.offerings o ON o.id = m.offering_id WHERE o.slug LIKE 'room-qa-%')      AS memberships,
  (SELECT count(*) FROM public.live_sessions       WHERE title LIKE 'ROOM QA %')         AS sessions,
  -- The suite asserts this is 2: a zero here means every live_sessions probe in
  -- the run is a dead probe, and the session half of the matrix proves nothing.
  (SELECT count(*) FROM public.offering_courses oc
     JOIN public.offerings o ON o.id = oc.offering_id WHERE o.slug LIKE 'room-qa-%')     AS course_maps,
  -- The three seeds added for the 10-surface matrix. Counted here so a missing
  -- one fails at the PRE preflight — named, in one line — instead of surfacing
  -- as an unarmed positive control twenty assertions later.
  (SELECT count(*) FROM public.cohort_room_seen s
     JOIN public.offerings o ON o.id = s.offering_id WHERE o.slug LIKE 'room-qa-%')      AS room_seen,
  (SELECT count(*) FROM public.cohort_recording_progress rp
     JOIN public.live_sessions ls ON ls.id = rp.live_session_id
    WHERE ls.title LIKE 'ROOM QA %')                                                    AS rec_progress,
  (SELECT count(*) FROM public.cohort_week_attendance a
     JOIN public.cohort_weeks w ON w.id = a.cohort_week_id
     JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
     JOIN public.offerings o ON o.id = b.offering_id WHERE o.slug LIKE 'room-qa-%')      AS attendance,
  -- A currently-RUNNING session must exist or the per-week session choice is
  -- untestable (see §6). BOTH of these are asserted as 1 by PRE.1b — the
  -- running session and the cancelled decoy that is ALSO inside its own window
  -- right now and must still lose. The decoy is the tighter clock dependency of
  -- the two (it leaves its window 60 minutes after this file applies, against
  -- the live session's 70), and if it has ended by the time PROG runs it drops
  -- out of the not-yet-ended bucket and loses on timing alone — so PROG.2 would
  -- pass with the cancelled-demotion sort key (rpcs.sql:1149) deleted. Hence
  -- the assertion rather than the comment this used to be.
  (SELECT count(*) FROM public.live_sessions ls
    WHERE ls.title LIKE 'ROOM QA %'
      AND COALESCE(ls.status, 'scheduled') <> 'cancelled'
      AND ls.scheduled_at < now()
      AND now() < ls.scheduled_at + make_interval(mins => COALESCE(ls.duration_minutes, 60))) AS running_sessions,
  (SELECT count(*) FROM public.live_sessions ls
    WHERE ls.title LIKE 'ROOM QA %'
      AND ls.status = 'cancelled'
      AND ls.scheduled_at < now()
      AND now() < ls.scheduled_at + make_interval(mins => COALESCE(ls.duration_minutes, 60))) AS cancelled_running;
