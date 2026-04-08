-- =====================================================================
-- CRITICAL SECURITY FIX: Close paywall bypass in courses/sections/chapters
-- =====================================================================
--
-- The previous migration 20260407202108 created RLS policies that allowed
-- any authenticated user to read content if the parent course was
-- status = 'published'. This effectively granted every logged-in user free
-- access to every paid course, bypassing enrolment entirely.
--
-- This migration removes the "OR status = 'published'" clauses and replaces
-- them with strictly enrolment-scoped reads. The only allowed reads are:
--   1. User has an active enrolment in an offering containing the course
--   2. Chapter has make_free = true (chapters policy only)
--   3. Caller is_admin()
--
-- Anonymous public read (for PublicOffering.tsx sales pages) continues to
-- be handled by the existing courses_public_read policy which is left
-- untouched. That policy uses is_public on the offering, not status on
-- the course.
-- =====================================================================

DROP POLICY IF EXISTS courses_read_enrolled ON public.courses;
DROP POLICY IF EXISTS sections_read_enrolled ON public.sections;
DROP POLICY IF EXISTS chapters_read_enrolled ON public.chapters;

-- COURSES: only enrolled students and admins may read
CREATE POLICY courses_read_enrolled ON public.courses
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT oc.course_id
      FROM public.offering_courses oc
      JOIN public.enrolments e ON e.offering_id = oc.offering_id
      WHERE e.user_id = auth.uid() AND e.status = 'active'
    )
    OR is_admin()
  );

-- SECTIONS: only enrolled students and admins may read
CREATE POLICY sections_read_enrolled ON public.sections
  FOR SELECT
  TO authenticated
  USING (
    course_id IN (
      SELECT oc.course_id
      FROM public.offering_courses oc
      JOIN public.enrolments e ON e.offering_id = oc.offering_id
      WHERE e.user_id = auth.uid() AND e.status = 'active'
    )
    OR is_admin()
  );

-- CHAPTERS: only enrolled students, free chapters, and admins may read
CREATE POLICY chapters_read_enrolled ON public.chapters
  FOR SELECT
  TO authenticated
  USING (
    make_free = true
    OR section_id IN (
      SELECT s.id
      FROM public.sections s
      JOIN public.offering_courses oc ON oc.course_id = s.course_id
      JOIN public.enrolments e ON e.offering_id = oc.offering_id
      WHERE e.user_id = auth.uid() AND e.status = 'active'
    )
    OR is_admin()
  );
