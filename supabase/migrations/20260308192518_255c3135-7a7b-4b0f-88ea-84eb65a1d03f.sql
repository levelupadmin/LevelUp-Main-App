
DROP POLICY IF EXISTS "Authenticated users can insert courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can update courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can delete courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can view all courses" ON public.courses;

CREATE POLICY "Authenticated users can insert courses" ON public.courses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update courses" ON public.courses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete courses" ON public.courses FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated users can view all courses" ON public.courses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage modules" ON public.course_modules;
CREATE POLICY "Authenticated users can manage modules" ON public.course_modules FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage lessons" ON public.lessons;
CREATE POLICY "Authenticated users can manage lessons" ON public.lessons FOR ALL TO authenticated USING (true) WITH CHECK (true);
