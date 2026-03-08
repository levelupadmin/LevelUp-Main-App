
-- Allow anon role access for mock auth
DROP POLICY IF EXISTS "Authenticated users can insert courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can update courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can delete courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can view all courses" ON public.courses;
DROP POLICY IF EXISTS "Anyone can view published courses" ON public.courses;

CREATE POLICY "Allow all access to courses" ON public.courses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage modules" ON public.course_modules;
DROP POLICY IF EXISTS "Anyone can view modules of published courses" ON public.course_modules;

CREATE POLICY "Allow all access to modules" ON public.course_modules FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage lessons" ON public.lessons;
DROP POLICY IF EXISTS "Anyone can view lessons of published courses" ON public.lessons;

CREATE POLICY "Allow all access to lessons" ON public.lessons FOR ALL USING (true) WITH CHECK (true);
