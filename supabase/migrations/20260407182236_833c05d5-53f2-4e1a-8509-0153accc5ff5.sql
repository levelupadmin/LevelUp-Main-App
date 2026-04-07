
-- Migration 6: Public read policy for offerings (unauthenticated access to public pages)
-- Note: existing policies are offerings_admin (ALL) and offerings_read_active (SELECT for authenticated)
-- This new policy allows anonymous access to public+active offerings for /p/:slug
CREATE POLICY offerings_public_read ON offerings
  FOR SELECT
  TO anon
  USING (is_public = true AND status = 'active');
