-- Deep sweep fix: offering_upsells SELECT policy only checked `is_active = true`
-- on the upsell row itself. This leaked draft / archived parent offerings:
-- anyone could SELECT upsells whose parent_offering_id pointed at an offering
-- that was not yet public, exposing unreleased offering ids (and by join, their
-- titles and prices via the offerings table — which already requires
-- status = 'active' on its own SELECT policy, but the id alone is a leak).
--
-- Fix: additionally require the parent offering to be active. We use a
-- SECURITY DEFINER helper so the policy doesn't need a subquery against
-- offerings with its own RLS recursion.

CREATE OR REPLACE FUNCTION public.is_offering_active(p_offering_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM offerings
    WHERE id = p_offering_id AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_offering_active(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_offering_active(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS offering_upsells_read ON offering_upsells;

CREATE POLICY offering_upsells_read ON offering_upsells
  FOR SELECT USING (
    is_active = true
    AND public.is_offering_active(parent_offering_id)
    AND public.is_offering_active(upsell_offering_id)
  );
