-- #6: Tighten chapter_progress RLS.
--
-- Previous state: FOR ALL USING (auth.uid() = user_id) with NO WITH CHECK.
-- Consequences:
--   • Postgres re-uses USING for INSERT/UPDATE when WITH CHECK is absent,
--     which is acceptable here for the user_id guard — but nothing stops
--     a user from marking a chapter complete for a course they haven't
--     enrolled in. ChapterViewer only enforces course access client-side.
--   • A leaderboard / progress-based retention feature could be gamed by
--     just inserting rows directly from the JS console.
--
-- New state: split FOR ALL into per-verb policies. INSERT and UPDATE
-- additionally require has_course_access() for the chapter being written,
-- so progress rows can only exist for courses the user has actually paid
-- for (or admin-granted access to).

DROP POLICY IF EXISTS progress_own ON public.chapter_progress;

CREATE POLICY progress_own_select ON public.chapter_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY progress_own_insert ON public.chapter_progress
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.chapters ch
      JOIN public.sections s ON s.id = ch.section_id
      WHERE ch.id = chapter_progress.chapter_id
        AND public.has_course_access(s.course_id)
    )
  );

CREATE POLICY progress_own_update ON public.chapter_progress
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.chapters ch
      JOIN public.sections s ON s.id = ch.section_id
      WHERE ch.id = chapter_progress.chapter_id
        AND public.has_course_access(s.course_id)
    )
  );

CREATE POLICY progress_own_delete ON public.chapter_progress
  FOR DELETE
  USING (auth.uid() = user_id);
