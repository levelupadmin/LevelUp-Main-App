-- FIX 1: courses_public_read already exists, skip

-- FIX 2: Remove overly permissive read-all policies
DROP POLICY IF EXISTS courses_read_authenticated ON courses;
DROP POLICY IF EXISTS sections_read_authenticated ON sections;
DROP POLICY IF EXISTS chapters_read_authenticated ON chapters;

-- FIX 3: Replace with enrolment-based access policies
CREATE POLICY courses_read_enrolled ON courses
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    OR id IN (
      SELECT oc.course_id FROM offering_courses oc
      JOIN enrolments e ON e.offering_id = oc.offering_id
      WHERE e.user_id = auth.uid() AND e.status = 'active'
    )
    OR is_admin()
  );

CREATE POLICY sections_read_enrolled ON sections
  FOR SELECT
  TO authenticated
  USING (
    course_id IN (
      SELECT oc.course_id FROM offering_courses oc
      JOIN enrolments e ON e.offering_id = oc.offering_id
      WHERE e.user_id = auth.uid() AND e.status = 'active'
    )
    OR course_id IN (SELECT id FROM courses WHERE status = 'published')
    OR is_admin()
  );

CREATE POLICY chapters_read_enrolled ON chapters
  FOR SELECT
  TO authenticated
  USING (
    section_id IN (
      SELECT s.id FROM sections s
      JOIN offering_courses oc ON oc.course_id = s.course_id
      JOIN enrolments e ON e.offering_id = oc.offering_id
      WHERE e.user_id = auth.uid() AND e.status = 'active'
    )
    OR section_id IN (
      SELECT s.id FROM sections s
      JOIN courses c ON c.id = s.course_id
      WHERE c.status = 'published'
    )
    OR is_admin()
  );

-- FIX 4: Users table — remove overly permissive read
DROP POLICY IF EXISTS users_read_public ON users;

-- FIX 5: Coupons — remove anonymous enumeration
DROP POLICY IF EXISTS coupons_public_read ON coupons;