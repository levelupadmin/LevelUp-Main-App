-- Guarded storefront deactivation for the Creator Academy Edition 2 pilot.
--
-- This reverses only offering visibility. It does not delete pilot data and it
-- deliberately preserves the independent per-offering identity-spine switch.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $deactivate_guard$
DECLARE
  v_status text;
  v_is_public boolean;
  v_identity_spine_enabled boolean;
  v_updated integer;
BEGIN
  SELECT offering.status,
         offering.is_public,
         offering.identity_spine_enabled
    INTO v_status,
         v_is_public,
         v_identity_spine_enabled
    FROM public.offerings AS offering
   WHERE offering.id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
     AND offering.slug = 'creator-academy-edition-2'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creator Academy Edition 2 offering identity is absent or changed';
  END IF;

  IF v_status IS DISTINCT FROM 'active'
     OR v_is_public IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION
      'Pilot deactivation requires active/public pre-state (found status=%, is_public=%)',
      v_status,
      v_is_public;
  END IF;

  UPDATE public.offerings AS offering
     SET status = 'draft',
         is_public = false
   WHERE offering.id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
     AND offering.slug = 'creator-academy-edition-2'
     AND offering.status = 'active'
     AND offering.is_public IS TRUE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Pilot deactivation updated % rows; expected exactly 1', v_updated;
  END IF;

  IF (
    SELECT count(*)
      FROM public.offerings AS offering
     WHERE offering.id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
       AND offering.slug = 'creator-academy-edition-2'
       AND offering.status = 'draft'
       AND offering.is_public IS FALSE
       AND offering.identity_spine_enabled IS NOT DISTINCT FROM v_identity_spine_enabled
  ) <> 1 THEN
    RAISE EXCEPTION 'Pilot deactivation post-state is invalid or identity-spine state changed';
  END IF;
END
$deactivate_guard$;

SELECT offering.id,
       offering.slug,
       offering.status,
       offering.is_public,
       offering.identity_spine_enabled
  FROM public.offerings AS offering
 WHERE offering.id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
   AND offering.slug = 'creator-academy-edition-2';

COMMIT;
