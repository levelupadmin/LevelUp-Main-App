-- #12: Portfolio bucket INSERT policy has no path check.
--
-- Previous state: "Authenticated users can upload portfolio files" only
-- required `bucket_id = 'portfolio'` in its WITH CHECK — any authenticated
-- user could upload to `<some_other_user_id>/evil.jpg`, spoofing someone
-- else's portfolio, filling their storage quota, or planting arbitrary
-- files under another user's namespace (which the UPDATE/DELETE policies
-- assume are owned by them).
--
-- New state: INSERT policy mirrors UPDATE/DELETE by requiring that the
-- first path segment matches auth.uid()::text, so a user can only upload
-- files under their own folder.

DROP POLICY IF EXISTS "Authenticated users can upload portfolio files"
  ON storage.objects;

CREATE POLICY "Authenticated users can upload portfolio files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
