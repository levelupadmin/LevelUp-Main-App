-- The sales page (/p/:slug) as a landing page that sells on its own.
--
-- offerings.landing holds one product's page content (hero, trailer, lessons,
-- mentors, reviews, FAQs...), copied from the marketing site
-- (leveluplearning.in masterclass pages, leveluplearning.live cohort pages).
-- `kind` says which template renders it ("masterclass" or "cohort") and `v`
-- its shape version. NULL keeps today's page, so this is inert until filled.
-- Media paths in it are keys in the public 'landing' bucket; the app builds
-- the URL from its own Supabase URL, so the same JSON works on staging and
-- live.
ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS landing jsonb;

COMMENT ON COLUMN public.offerings.landing IS
  'Landing-page content for /p/:slug (kind = masterclass | cohort, v = shape version). Media are keys in the public landing bucket. NULL = the standard sales page.';

-- Public 'landing' bucket for that media: posters, mentor photos, film
-- stills and short silent loops. Marketing material that is already public
-- on our websites, so the bucket is public-read. Writes are restricted to
-- admins / the service role (which bypasses RLS).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing', 'landing', true, 52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "landing public read" ON storage.objects;
CREATE POLICY "landing public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'landing');

DROP POLICY IF EXISTS "landing admin write" ON storage.objects;
CREATE POLICY "landing admin write"
  ON storage.objects FOR ALL
  USING (bucket_id = 'landing' AND public.is_admin())
  WITH CHECK (bucket_id = 'landing' AND public.is_admin());
