
-- Step 1: Add columns to chapters
ALTER TABLE public.chapters
  ADD COLUMN video_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN vdocipher_video_id text,
  ADD COLUMN vdocipher_watermark_text text;

ALTER TABLE public.chapters
  ADD CONSTRAINT chapters_video_type_check CHECK (video_type IN ('standard', 'vdocipher'));

-- Step 2: Add column to courses
ALTER TABLE public.courses
  ADD COLUMN default_video_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.courses
  ADD CONSTRAINT courses_default_video_type_check CHECK (default_video_type IN ('standard', 'vdocipher'));

-- Step 3: Create vdocipher_video_views table
CREATE TABLE public.vdocipher_video_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  vdocipher_video_id text NOT NULL,
  otp_issued_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text
);

CREATE INDEX idx_vdocipher_views_user_otp ON public.vdocipher_video_views (user_id, otp_issued_at);

ALTER TABLE public.vdocipher_video_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vdocipher_views_own_read" ON public.vdocipher_video_views
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "vdocipher_views_admin_read" ON public.vdocipher_video_views
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "vdocipher_views_service_insert" ON public.vdocipher_video_views
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
