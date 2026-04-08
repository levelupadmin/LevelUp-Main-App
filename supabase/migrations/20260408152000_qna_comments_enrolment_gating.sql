-- #15: Gate chapter Q&A and comments behind has_course_access.
--
-- Previous state: qna_read / qna_replies_read / comments_read all used
-- `USING (auth.uid() IS NOT NULL)`. Any signed-in user — including a
-- free-trial or never-paid account — could read the full Q&A history
-- and comments of every paid course. Same for inserts (anyone could
-- post questions into a course they don't own).
--
-- New state: read / insert policies additionally require
-- has_course_access(course_id) resolved via the chapters → sections
-- join, so community content is scoped to people who actually have
-- access to the course.

-- chapter_qna -----------------------------------------------------------

DROP POLICY IF EXISTS qna_read        ON public.chapter_qna;
DROP POLICY IF EXISTS qna_insert_own  ON public.chapter_qna;

CREATE POLICY qna_read ON public.chapter_qna
  FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.chapters ch
      JOIN public.sections s ON s.id = ch.section_id
      WHERE ch.id = chapter_qna.chapter_id
        AND public.has_course_access(s.course_id)
    )
  );

CREATE POLICY qna_insert_own ON public.chapter_qna
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.chapters ch
      JOIN public.sections s ON s.id = ch.section_id
      WHERE ch.id = chapter_qna.chapter_id
        AND public.has_course_access(s.course_id)
    )
  );

-- chapter_qna_replies ---------------------------------------------------

DROP POLICY IF EXISTS qna_replies_read       ON public.chapter_qna_replies;
DROP POLICY IF EXISTS qna_replies_insert_own ON public.chapter_qna_replies;

CREATE POLICY qna_replies_read ON public.chapter_qna_replies
  FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.chapter_qna q
      JOIN public.chapters ch ON ch.id = q.chapter_id
      JOIN public.sections s  ON s.id = ch.section_id
      WHERE q.id = chapter_qna_replies.qna_id
        AND public.has_course_access(s.course_id)
    )
  );

CREATE POLICY qna_replies_insert_own ON public.chapter_qna_replies
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.chapter_qna q
      JOIN public.chapters ch ON ch.id = q.chapter_id
      JOIN public.sections s  ON s.id = ch.section_id
      WHERE q.id = chapter_qna_replies.qna_id
        AND public.has_course_access(s.course_id)
    )
  );

-- chapter_comments ------------------------------------------------------

DROP POLICY IF EXISTS comments_read       ON public.chapter_comments;
DROP POLICY IF EXISTS comments_insert_own ON public.chapter_comments;

CREATE POLICY comments_read ON public.chapter_comments
  FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.chapters ch
      JOIN public.sections s ON s.id = ch.section_id
      WHERE ch.id = chapter_comments.chapter_id
        AND public.has_course_access(s.course_id)
    )
  );

CREATE POLICY comments_insert_own ON public.chapter_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.chapters ch
      JOIN public.sections s ON s.id = ch.section_id
      WHERE ch.id = chapter_comments.chapter_id
        AND public.has_course_access(s.course_id)
    )
  );
