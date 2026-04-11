-- Add status, helpful_count, is_verified_purchase to existing course_reviews
ALTER TABLE public.course_reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS helpful_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_verified_purchase boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_course_reviews_course_status ON public.course_reviews(course_id, status);
CREATE INDEX IF NOT EXISTS idx_course_reviews_helpful ON public.course_reviews(course_id, helpful_count DESC);

-- Review helpful votes
CREATE TABLE IF NOT EXISTS public.review_helpful_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.course_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(review_id, user_id)
);
ALTER TABLE public.review_helpful_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_manage_own_votes" ON public.review_helpful_votes FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins_all_votes" ON public.review_helpful_votes FOR ALL USING (public.is_admin());

-- Course rating stats (denormalized)
CREATE TABLE IF NOT EXISTS public.course_rating_stats (
  course_id uuid PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  total_reviews integer NOT NULL DEFAULT 0,
  rating_1 integer NOT NULL DEFAULT 0,
  rating_2 integer NOT NULL DEFAULT 0,
  rating_3 integer NOT NULL DEFAULT 0,
  rating_4 integer NOT NULL DEFAULT 0,
  rating_5 integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE public.course_rating_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_stats" ON public.course_rating_stats FOR SELECT USING (true);
CREATE POLICY "admins_all_stats" ON public.course_rating_stats FOR ALL USING (public.is_admin());

-- Trigger to refresh rating stats
CREATE OR REPLACE FUNCTION public.refresh_course_rating_stats()
RETURNS TRIGGER AS $$
DECLARE
  target_course_id uuid;
BEGIN
  target_course_id := COALESCE(NEW.course_id, OLD.course_id);
  INSERT INTO public.course_rating_stats (course_id, avg_rating, total_reviews, rating_1, rating_2, rating_3, rating_4, rating_5, updated_at)
  SELECT
    target_course_id,
    COALESCE(AVG(rating), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE rating = 1),
    COUNT(*) FILTER (WHERE rating = 2),
    COUNT(*) FILTER (WHERE rating = 3),
    COUNT(*) FILTER (WHERE rating = 4),
    COUNT(*) FILTER (WHERE rating = 5),
    NOW()
  FROM public.course_reviews
  WHERE course_id = target_course_id AND status = 'approved'
  ON CONFLICT (course_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    total_reviews = EXCLUDED.total_reviews,
    rating_1 = EXCLUDED.rating_1,
    rating_2 = EXCLUDED.rating_2,
    rating_3 = EXCLUDED.rating_3,
    rating_4 = EXCLUDED.rating_4,
    rating_5 = EXCLUDED.rating_5,
    updated_at = NOW();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_refresh_rating_stats
AFTER INSERT OR UPDATE OR DELETE ON public.course_reviews
FOR EACH ROW EXECUTE FUNCTION public.refresh_course_rating_stats();

-- Trigger to update helpful count
CREATE OR REPLACE FUNCTION public.update_review_helpful_count()
RETURNS TRIGGER AS $$
DECLARE
  target_review_id uuid;
BEGIN
  target_review_id := COALESCE(NEW.review_id, OLD.review_id);
  UPDATE public.course_reviews
  SET helpful_count = (SELECT COUNT(*) FROM public.review_helpful_votes WHERE review_id = target_review_id)
  WHERE id = target_review_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_helpful_count
AFTER INSERT OR DELETE ON public.review_helpful_votes
FOR EACH ROW EXECUTE FUNCTION public.update_review_helpful_count();
