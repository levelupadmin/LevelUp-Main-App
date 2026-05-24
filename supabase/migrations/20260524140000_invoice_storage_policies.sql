-- ============================================================================
-- Storage policies for the `invoices` bucket
-- ============================================================================
--
-- Bucket created via Supabase dashboard / direct insert. This migration only
-- wires the RLS policies so:
-- - Users can read THEIR OWN invoice PDFs (path scheme: <user_id>/<order_id>.pdf)
-- - Service role (edge functions) can write anywhere
-- - Admins can read all invoices for support / refund work
--
-- We DO NOT mark the bucket public, so direct URL access is blocked. The
-- user dashboard generates signed URLs via supabase.storage.createSignedUrl
-- which respects these policies.

-- Users read their own invoices
DROP POLICY IF EXISTS "users read own invoices" ON storage.objects;
CREATE POLICY "users read own invoices"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins read all invoices (for support / customer service)
DROP POLICY IF EXISTS "admins read all invoices" ON storage.objects;
CREATE POLICY "admins read all invoices"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND public.is_admin()
  );

-- No client-side INSERT/UPDATE/DELETE policies - only the service role
-- (edge functions, via service_role key) writes invoices, and service
-- role bypasses RLS by design.
