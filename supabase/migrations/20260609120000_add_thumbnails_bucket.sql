-- Public 'thumbnails' bucket for auto-generated chapter thumbnails:
-- video frames (ffmpeg), PDF first pages (pdftoppm), etc. These are
-- non-sensitive derived images, served directly via <img> across the app
-- (Up Next rail, offering curriculum tiles), so the bucket is public-read.
-- Writes are restricted to admins / the service role (which bypasses RLS).
INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "thumbnails public read" ON storage.objects;
CREATE POLICY "thumbnails public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

DROP POLICY IF EXISTS "thumbnails admin write" ON storage.objects;
CREATE POLICY "thumbnails admin write"
  ON storage.objects FOR ALL
  USING (bucket_id = 'thumbnails' AND public.is_admin())
  WITH CHECK (bucket_id = 'thumbnails' AND public.is_admin());
