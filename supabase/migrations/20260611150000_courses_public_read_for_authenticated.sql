-- Fix: the catalog is EMPTY for every signed-in non-admin user.
--
-- courses_public_read was granted TO anon only, and the authenticated
-- fallback (courses_read_enrolled) only exposes courses the user already
-- owns. The old Browse page masked this by building cards from the
-- offerings table (offerings_read_active is TO public), but the wave-2
-- catalog rewrite (useCatalog) selects from courses directly - so since
-- that shipped, logged-in students saw "No programs match your filters"
-- on Home's Find-your-next-craft section on every platform. Anonymous
-- visitors and admins saw everything, which is why it slipped through
-- review.
--
-- Published courses are public marketing content; let authenticated
-- users read them too. courses_read_enrolled stays, still granting
-- enrolled users their non-published (e.g. retired/draft) courses.

DROP POLICY IF EXISTS "courses_public_read" ON public.courses;

CREATE POLICY "courses_public_read" ON public.courses
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');
