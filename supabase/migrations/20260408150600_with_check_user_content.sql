-- =====================================================================
-- SECURITY FIX: Add WITH CHECK to user-content UPDATE policies
-- =====================================================================
--
-- Multiple UPDATE policies on user-generated content tables only have a
-- USING clause and no WITH CHECK clause. PostgreSQL allows the row to
-- pass USING (which gates which rows you can target) but, with no
-- WITH CHECK, lets the user rewrite any column on those rows — including
-- user_id / posted_by_user_id. That means a user can edit their own
-- post and change the author to point to someone else, enabling
-- impersonation, defamation, fake reviews, and forged Q&A.
--
-- This migration drops and recreates each affected policy with a
-- matching WITH CHECK clause that locks the ownership column to the
-- current auth.uid() (admins still bypass via is_admin()).
--
-- Tables hardened:
--   chapter_qna
--   chapter_qna_replies
--   chapter_comments
--   course_reviews
--   community_posts
--   community_post_comments
--   opportunities
--   qna_posts
-- =====================================================================

-- chapter_qna
DROP POLICY IF EXISTS qna_update_own ON public.chapter_qna;
CREATE POLICY qna_update_own ON public.chapter_qna
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

-- chapter_qna_replies
DROP POLICY IF EXISTS qna_replies_update_own ON public.chapter_qna_replies;
CREATE POLICY qna_replies_update_own ON public.chapter_qna_replies
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

-- chapter_comments
DROP POLICY IF EXISTS comments_update_own ON public.chapter_comments;
CREATE POLICY comments_update_own ON public.chapter_comments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

-- course_reviews — was FOR ALL, split into explicit per-verb policies so
-- UPDATE can carry a WITH CHECK and DELETE still works.
DROP POLICY IF EXISTS reviews_own ON public.course_reviews;

CREATE POLICY reviews_insert_own ON public.course_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY reviews_update_own ON public.course_reviews
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

CREATE POLICY reviews_delete_own ON public.course_reviews
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin());

-- community_posts
DROP POLICY IF EXISTS posts_update_own ON public.community_posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.community_posts;
CREATE POLICY posts_update_own ON public.community_posts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

-- community_post_comments
DROP POLICY IF EXISTS post_comments_update_own ON public.community_post_comments;
CREATE POLICY post_comments_update_own ON public.community_post_comments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

-- opportunities
DROP POLICY IF EXISTS opportunities_update_own ON public.opportunities;
CREATE POLICY opportunities_update_own ON public.opportunities
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = posted_by_user_id OR is_admin())
  WITH CHECK (auth.uid() = posted_by_user_id OR is_admin());

-- qna_posts
DROP POLICY IF EXISTS qna_update_own ON public.qna_posts;
CREATE POLICY qna_update_own ON public.qna_posts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());
