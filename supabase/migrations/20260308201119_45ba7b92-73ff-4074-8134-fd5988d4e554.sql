
-- Drop old permissive policies
DROP POLICY IF EXISTS "Allow all access to modules" ON public.course_modules;
DROP POLICY IF EXISTS "Allow all access to courses" ON public.courses;
DROP POLICY IF EXISTS "Allow all access to lessons" ON public.lessons;

-- Courses: everyone can read published, admins/mentors can do everything
CREATE POLICY "Anyone can read published courses"
  ON public.courses FOR SELECT
  USING (status = 'published' OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'mentor'));

CREATE POLICY "Admins can manage courses"
  ON public.courses FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'mentor'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'mentor'));

-- Modules: same pattern
CREATE POLICY "Anyone can read modules"
  ON public.course_modules FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage modules"
  ON public.course_modules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'mentor'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'mentor'));

-- Lessons: same pattern
CREATE POLICY "Anyone can read lessons"
  ON public.lessons FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage lessons"
  ON public.lessons FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'mentor'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'mentor'));
