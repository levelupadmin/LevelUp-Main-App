-- CRITICAL: Lock down the course-content storage bucket.
--
-- Migration 20260308193137 created the bucket with public = true and three
-- wide-open policies allowing ANYONE on the internet to SELECT, INSERT and
-- DELETE objects. Paid course PDFs, thumbnails and any uploaded material
-- were freely downloadable by the public, and an unauthenticated attacker
-- could upload arbitrary payloads or DELETE the entire bucket's contents.
--
-- This migration:
--   1. Flips the bucket to private (public = false) so direct public URLs
--      stop working and clients must request signed URLs via the
--      storage.objects RLS policies.
--   2. Drops the three unsafe policies.
--   3. Creates new RLS policies:
--        - SELECT: admins always; students only if they have course access
--          via has_course_access(course_id). The convention is that
--          objects are stored at paths like  <course_id>/<filename>  so we
--          extract course_id from storage.foldername(name)[1]::uuid.
--        - INSERT / UPDATE / DELETE: admins only.

-- 1. Flip bucket to private
UPDATE storage.buckets SET public = false WHERE id = 'course-content';

-- 2. Drop the unsafe public policies
DROP POLICY IF EXISTS "Allow public read access on course-content" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to course-content"      ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete on course-content"      ON storage.objects;

-- 3a. Admins can do anything in the bucket
CREATE POLICY "course_content_admin_all"
  ON storage.objects FOR ALL
  USING (bucket_id = 'course-content' AND public.is_admin())
  WITH CHECK (bucket_id = 'course-content' AND public.is_admin());

-- 3b. Students can SELECT (download via signed URL) only if they have
-- access to the course whose UUID is the first path segment.
CREATE POLICY "course_content_student_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'course-content'
    AND (
      -- Legacy objects that were uploaded under arbitrary paths — only
      -- admins can see them; normal students cannot. This is intentional:
      -- anything that doesn't follow the <course_id>/... convention is
      -- treated as unknown-provenance and hidden.
      public.is_admin()
      OR (
        -- Path must start with a UUID that the current user has access to.
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.has_course_access(((storage.foldername(name))[1])::uuid)
      )
    )
  );
