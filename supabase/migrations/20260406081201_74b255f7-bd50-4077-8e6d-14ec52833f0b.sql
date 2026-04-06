DROP POLICY IF EXISTS "courses_read" ON public.courses;
DROP POLICY IF EXISTS "courses_read_published" ON public.courses;
DROP POLICY IF EXISTS "courses_read_authenticated" ON public.courses;
DROP POLICY IF EXISTS "sections_read" ON public.sections;
DROP POLICY IF EXISTS "sections_read_authenticated" ON public.sections;
DROP POLICY IF EXISTS "chapters_read" ON public.chapters;
DROP POLICY IF EXISTS "chapters_read_authenticated" ON public.chapters;

CREATE POLICY "courses_read_authenticated"
ON public.courses
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "sections_read_authenticated"
ON public.sections
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "chapters_read_authenticated"
ON public.chapters
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);