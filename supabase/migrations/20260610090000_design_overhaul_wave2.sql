-- Wave-2 design overhaul schema:
-- 1) chapter_moments — instructor-curated timestamps per lesson (MasterClass
--    "Moments"). Content metadata (label + seconds), safe for any reader.
-- 2) offerings cohort meta — start date / application deadline for the
--    DICE-style cohort info block (sales team fills via admin).
-- 3) users.craft_interests — post-OTP onboarding picks, used to personalise
--    the Home catalog ordering.

CREATE TABLE IF NOT EXISTS public.chapter_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  label text NOT NULL,
  seconds integer NOT NULL CHECK (seconds >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chapter_moments_chapter
  ON public.chapter_moments(chapter_id, sort_order);
ALTER TABLE public.chapter_moments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chapter_moments_read ON public.chapter_moments;
CREATE POLICY chapter_moments_read ON public.chapter_moments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS chapter_moments_admin_write ON public.chapter_moments;
CREATE POLICY chapter_moments_admin_write ON public.chapter_moments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS cohort_start_date date;
ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS application_deadline date;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS craft_interests text[];
