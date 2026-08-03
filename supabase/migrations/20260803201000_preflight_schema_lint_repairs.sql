-- Release preflight found two functions that compiled historically but fail
-- when PostgreSQL validates their bodies against the current schema.

-- Several shipped admin screens and admin_dashboard_metrics already select
-- offerings.product_tier. The column existed only on courses, so those reads
-- and the RPC failed with 42703. Add the missing denormalized classification
-- and seed it from the first linked course; unlinked offerings remain 'other'.
ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS product_tier text NOT NULL DEFAULT 'other';

UPDATE public.offerings AS offering
   SET product_tier = linked.product_tier
  FROM (
    SELECT DISTINCT ON (offering_course.offering_id)
           offering_course.offering_id,
           course.product_tier
      FROM public.offering_courses AS offering_course
      JOIN public.courses AS course ON course.id = offering_course.course_id
     WHERE course.product_tier IS NOT NULL
     ORDER BY offering_course.offering_id, course.sort_order, course.id
  ) AS linked
 WHERE offering.id = linked.offering_id
   AND offering.product_tier = 'other';

COMMENT ON COLUMN public.offerings.product_tier IS
  'Denormalized offering classification used by admin dashboards and filters; initialized from the first linked course and otherwise ''other''.';

-- RETURNS TABLE creates PL/pgSQL output variables named scope/created_by.
-- Qualify the source table so those variables cannot make the query ambiguous.
CREATE OR REPLACE FUNCTION public.verify_team_api_key(p_plaintext text)
RETURNS TABLE (key_id uuid, scope text, created_by uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  matched record;
BEGIN
  IF p_plaintext IS NULL OR char_length(p_plaintext) < 16 THEN
    RETURN;
  END IF;

  FOR matched IN
    SELECT api_key.id,
           api_key.scope AS matched_scope,
           api_key.created_by AS matched_created_by,
           api_key.hashed_key
      FROM public.team_api_keys AS api_key
     WHERE api_key.revoked_at IS NULL
       AND (api_key.expires_at IS NULL OR api_key.expires_at > now())
  LOOP
    IF matched.hashed_key = extensions.crypt(p_plaintext, matched.hashed_key) THEN
      RETURN QUERY
      SELECT matched.id, matched.matched_scope, matched.matched_created_by;
      RETURN;
    END IF;
  END LOOP;
END
$fn$;

COMMENT ON FUNCTION public.verify_team_api_key(text) IS
  'Verifies an active team API key without ambiguous PL/pgSQL output-variable references. Service-role only.';

REVOKE ALL ON FUNCTION public.verify_team_api_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_team_api_key(text) TO service_role;
