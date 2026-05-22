-- Allow anonymous + authenticated users to read sections + chapter
-- METADATA (titles, descriptions, durations, free-preview flags) for
-- any course that belongs to a public, active offering.
--
-- Needed for the marketing PublicOffering page to render its "Course
-- Curriculum" section. Without these policies, the join returns an
-- empty array because anon has no SELECT grant on sections/chapters.

DROP POLICY IF EXISTS sections_read_public_offering ON public.sections;
CREATE POLICY sections_read_public_offering ON public.sections
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.offering_courses oc
      JOIN public.offerings o ON o.id = oc.offering_id
      WHERE oc.course_id = sections.course_id
        AND o.is_public = true
        AND o.status = 'active'
    )
  );

DROP POLICY IF EXISTS chapters_read_public_offering ON public.chapters;
CREATE POLICY chapters_read_public_offering ON public.chapters
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sections s
      JOIN public.offering_courses oc ON oc.course_id = s.course_id
      JOIN public.offerings o ON o.id = oc.offering_id
      WHERE s.id = chapters.section_id
        AND o.is_public = true
        AND o.status = 'active'
    )
  );
