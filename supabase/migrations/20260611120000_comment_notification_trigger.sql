-- Fix: community reply notifications never deliver.
--
-- CommunityPage.tsx used to insert the post author's notification row
-- directly from the commenter's client. The notifications INSERT policy
-- ("Admin insert notifications", 20260410160000) only allows
-- user_id = auth.uid() OR admin, so for any non-admin commenter the
-- insert was silently rejected by RLS and the author never heard about
-- the reply.
--
-- Move the insert server-side: an AFTER INSERT trigger on
-- community_post_comments runs as SECURITY DEFINER (bypasses the
-- notifications RLS) and writes the row for the post author. The
-- client-side insert is removed in the same change.
--
-- Payload mirrors what the client used to send:
--   type 'community_reply', title 'New comment on your post',
--   body = first 100 chars of the comment, link '/community'.

CREATE OR REPLACE FUNCTION public.notify_post_author_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_post_author uuid;
BEGIN
  SELECT user_id INTO v_post_author
  FROM public.community_posts
  WHERE id = NEW.post_id;

  -- Skip self-comments (no point notifying yourself) and orphaned posts.
  IF v_post_author IS NULL OR v_post_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    v_post_author,
    'community_reply',
    'New comment on your post',
    LEFT(NEW.comment_text, 100),
    '/community'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A notification must never block the comment itself.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_comment_notify ON public.community_post_comments;
CREATE TRIGGER community_comment_notify
  AFTER INSERT ON public.community_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_author_on_comment();
