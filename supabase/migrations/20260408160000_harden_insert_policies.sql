-- ═══════════════════════════════════════════════
-- FIX #1: assignment_submissions — require enrolment to submit
-- ═══════════════════════════════════════════════
-- Previously any authenticated user could insert submissions for any
-- chapter, even courses they never enrolled in. Now requires the
-- submitter to be enrolled in a course that contains the chapter.

DROP POLICY IF EXISTS "Users can insert own submissions" ON assignment_submissions;

CREATE POLICY assignment_submissions_insert_own
  ON assignment_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM chapters ch
      JOIN sections s ON s.id = ch.section_id
      JOIN offering_courses oc ON oc.course_id = s.course_id
      JOIN enrolments e ON e.offering_id = oc.offering_id
      WHERE ch.id = assignment_submissions.chapter_id
        AND e.user_id = auth.uid()
        AND e.status = 'active'
    )
  );

-- ═══════════════════════════════════════════════
-- FIX #2: course_reviews — require enrolment to review
-- ═══════════════════════════════════════════════
-- Previously any authenticated user could leave reviews on courses
-- they never purchased. Now requires active or expired enrolment
-- (expired = they completed the course, still valid to review).

DROP POLICY IF EXISTS "Users can insert own reviews" ON course_reviews;
DROP POLICY IF EXISTS reviews_insert_own ON course_reviews;

CREATE POLICY reviews_insert_enrolled
  ON course_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM enrolments e
      JOIN offering_courses oc ON oc.offering_id = e.offering_id
      WHERE oc.course_id = course_reviews.course_id
        AND e.user_id = auth.uid()
        AND e.status IN ('active', 'expired')
    )
  );
