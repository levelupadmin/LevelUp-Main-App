-- Guarded rollback for the Creator Academy Edition 2 production pilot seed.
--
-- This is intentionally fail-closed. If the pilot has gained another member,
-- assignment, attendance mark, reply, recording progress, session, resource,
-- or course dependency, the transaction aborts rather than deleting live work.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $rollback_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cohort_batches
    WHERE id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND name = 'Creator Academy Edition 2 - Pilot'
  ) THEN
    RAISE EXCEPTION 'Pilot batch is absent or no longer seed-owned';
  END IF;

  -- Every deterministic row must still be the row this seed created. This
  -- prevents an ID that was repurposed or an edited live session from being
  -- mistaken for disposable pilot data.
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
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cohort_batch_members
    WHERE id = '32360ea7-14fc-f095-8f62-1797cd6caf02'
      AND batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND enrolment_id = 'f2c2f34a-2a51-1cb2-78ec-57c443a7419a'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cohort_room_members
    WHERE id = '74f5fdc9-7312-fee8-855b-b447bf4ee9be'
      AND user_id = '614e5085-e98c-48f0-86dd-9df5f3147b39'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND role = 'host'
      AND source = 'manual'
      AND status = 'active'
  ) OR (
    SELECT count(*) FROM public.cohort_room_members
    WHERE user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND role = 'member'
      AND source = 'derived'
      AND status = 'active'
  ) <> 1 THEN
    RAISE EXCEPTION 'Pilot infrastructure is absent or no longer seed-owned';
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
    RAISE EXCEPTION 'Pilot schedule or content is absent, edited, or repurposed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.enrolments
    WHERE user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
      AND id <> 'f2c2f34a-2a51-1cb2-78ec-57c443a7419a'
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_applications
    WHERE user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
      AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
  ) THEN
    RAISE EXCEPTION 'Demo Student now has non-seed funnel truth; rollback refused';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cohort_batch_members
    WHERE batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND id <> '32360ea7-14fc-f095-8f62-1797cd6caf02'
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_weeks
    WHERE cohort_batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND id NOT IN (
        'fba6fb94-3bd0-c264-2c99-fac42e36fc7f',
        'e2630f68-5a39-67a1-281e-8e481f660c87'
      )
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_room_configs
    WHERE batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND id <> '155e49eb-66c9-894d-8613-6e5e19644e87'
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_room_members
    WHERE batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND NOT (
        id = '74f5fdc9-7312-fee8-855b-b447bf4ee9be'
        OR (
          user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
          AND source = 'derived'
        )
      )
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_announcements
    WHERE batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND id <> '6ba0eff3-dfec-b547-f22a-b100440b5564'
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_resources
    WHERE batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND id <> '1ca990b0-4e6b-8c19-a331-89a4d5ce7d8f'
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_room_posts
    WHERE batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
      AND id <> '8fce7580-e9d9-34ae-5230-e8c3d14eccb2'
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_demo_entries
    WHERE batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
  ) OR EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE cohort_batch_id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
  ) THEN
    RAISE EXCEPTION 'Pilot batch has live or non-seed data; rollback refused';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cohort_week_submissions
    WHERE cohort_week_id IN (
      'fba6fb94-3bd0-c264-2c99-fac42e36fc7f',
      'e2630f68-5a39-67a1-281e-8e481f660c87'
    )
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_week_attendance
    WHERE cohort_week_id IN (
      'fba6fb94-3bd0-c264-2c99-fac42e36fc7f',
      'e2630f68-5a39-67a1-281e-8e481f660c87'
    )
  ) OR EXISTS (
    SELECT 1 FROM public.live_sessions
    WHERE week_id IN (
      'fba6fb94-3bd0-c264-2c99-fac42e36fc7f',
      'e2630f68-5a39-67a1-281e-8e481f660c87'
    )
      AND id NOT IN (
        '881cd194-4fcb-7366-d5c3-4178c6bd5af8',
        'f8899583-f243-5fd6-21f8-e9eb55cd5fa2'
      )
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_room_post_replies
    WHERE post_id = '8fce7580-e9d9-34ae-5230-e8c3d14eccb2'
  ) OR EXISTS (
    SELECT 1 FROM public.session_attendance
    WHERE session_id IN (
      '881cd194-4fcb-7366-d5c3-4178c6bd5af8',
      'f8899583-f243-5fd6-21f8-e9eb55cd5fa2'
    )
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_recording_progress
    WHERE live_session_id IN (
      '881cd194-4fcb-7366-d5c3-4178c6bd5af8',
      'f8899583-f243-5fd6-21f8-e9eb55cd5fa2'
    )
  ) THEN
    RAISE EXCEPTION 'Members have interacted with pilot content; rollback refused';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.offering_courses
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
      AND offering_id <> '449056b9-9269-4bc5-ba8b-4c079c2104ee'
  ) OR EXISTS (
    SELECT 1 FROM public.live_sessions
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
      AND id NOT IN (
        '881cd194-4fcb-7366-d5c3-4178c6bd5af8',
        'f8899583-f243-5fd6-21f8-e9eb55cd5fa2'
      )
  ) OR EXISTS (
    SELECT 1 FROM public.sections
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.chapter_progress
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.certificates
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.certificate_templates
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.course_reviews
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.course_testimonials
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.course_rating_stats
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.course_drip_config
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.course_notify_requests
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.event_free_courses
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.instructor_course_assignments
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE course_tag_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) OR EXISTS (
    SELECT 1 FROM public.qna_posts
    WHERE course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) THEN
    RAISE EXCEPTION 'Hidden pilot course has acquired live dependencies; rollback refused';
  END IF;
END
$rollback_guard$;

DELETE FROM public.notifications
WHERE user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
  AND type = 'room_announcement'
  AND link_url = '/cohort/449056b9-9269-4bc5-ba8b-4c079c2104ee?announcement=6ba0eff3-dfec-b547-f22a-b100440b5564';

DELETE FROM public.cohort_room_posts
WHERE id = '8fce7580-e9d9-34ae-5230-e8c3d14eccb2';

DELETE FROM public.cohort_resources
WHERE id = '1ca990b0-4e6b-8c19-a331-89a4d5ce7d8f';

DELETE FROM public.cohort_announcements
WHERE id = '6ba0eff3-dfec-b547-f22a-b100440b5564';

DELETE FROM public.live_sessions
WHERE id IN (
  '881cd194-4fcb-7366-d5c3-4178c6bd5af8',
  'f8899583-f243-5fd6-21f8-e9eb55cd5fa2'
);

-- Remove config before roster truth so the batch-member DELETE cannot
-- re-materialize an offering-wide membership.
DELETE FROM public.cohort_room_configs
WHERE id = '155e49eb-66c9-894d-8613-6e5e19644e87';

DELETE FROM public.cohort_batches
WHERE id = '1a1908de-fb07-32de-fba0-f850eff82dc6';

DELETE FROM public.enrolments
WHERE id = 'f2c2f34a-2a51-1cb2-78ec-57c443a7419a';

DELETE FROM public.cohort_room_members
WHERE user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
  AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
  AND source = 'derived';

DELETE FROM public.cohort_room_seen
WHERE user_id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
  AND offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee';

DELETE FROM public.offering_courses
WHERE offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
  AND course_id = '75c1bdd7-b726-8356-8bbd-b153e22fb980';

DELETE FROM public.courses
WHERE id = '75c1bdd7-b726-8356-8bbd-b153e22fb980';

DO $rollback_verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.cohort_batches
    WHERE id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
  ) OR EXISTS (
    SELECT 1 FROM public.enrolments
    WHERE id = 'f2c2f34a-2a51-1cb2-78ec-57c443a7419a'
  ) OR EXISTS (
    SELECT 1 FROM public.cohort_room_configs
    WHERE id = '155e49eb-66c9-894d-8613-6e5e19644e87'
  ) OR EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = '75c1bdd7-b726-8356-8bbd-b153e22fb980'
  ) THEN
    RAISE EXCEPTION 'Pilot rollback manifest is incomplete';
  END IF;
END
$rollback_verify$;

COMMIT;

SELECT jsonb_build_object(
  'pilot_rollback', 'complete',
  'offering_preserved', EXISTS (
    SELECT 1 FROM public.offerings
    WHERE id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
  ),
  'member_identity_preserved', EXISTS (
    SELECT 1 FROM public.users
    WHERE id = 'e35895f3-a13b-4cda-ba2d-703d4874cda9'
  ),
  'host_identity_preserved', EXISTS (
    SELECT 1 FROM public.users
    WHERE id = '614e5085-e98c-48f0-86dd-9df5f3147b39'
  )
) AS rollback_manifest;
