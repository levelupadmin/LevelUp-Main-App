
-- Replace overly permissive waitlist insert policy with one that requires email
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlists;

CREATE POLICY "Anyone can join waitlist with email"
  ON public.waitlists FOR INSERT
  TO anon, authenticated
  WITH CHECK (email IS NOT NULL AND name IS NOT NULL);
