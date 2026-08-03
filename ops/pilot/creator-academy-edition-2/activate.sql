-- Guarded storefront activation for the Creator Academy Edition 2 pilot.
--
-- This changes only offering visibility. The per-offering identity-spine switch
-- is intentionally preserved so intake provisioning remains an independent
-- production control.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $activate_guard$
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

  IF v_status IS DISTINCT FROM 'draft'
     OR v_is_public IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION
      'Pilot activation requires draft/private pre-state (found status=%, is_public=%)',
      v_status,
      v_is_public;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.cohort_batches AS batch
      JOIN public.cohort_room_configs AS room
        ON room.batch_id = batch.id
       AND room.offering_id = batch.offering_id
     WHERE batch.id = '1a1908de-fb07-32de-fba0-f850eff82dc6'
       AND batch.offering_id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
       AND batch.name = 'Creator Academy Edition 2 - Pilot'
       AND room.id = '155e49eb-66c9-894d-8613-6e5e19644e87'
       AND room.slug = 'creator-academy-edition-2'
       AND room.phase = 'live'
  ) THEN
    RAISE EXCEPTION 'Pilot seed is absent or no longer matches its deterministic room identity';
  END IF;

  UPDATE public.offerings AS offering
     SET status = 'active',
         is_public = true
   WHERE offering.id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
     AND offering.slug = 'creator-academy-edition-2'
     AND offering.status = 'draft'
     AND offering.is_public IS FALSE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Pilot activation updated % rows; expected exactly 1', v_updated;
  END IF;

  IF (
    SELECT count(*)
      FROM public.offerings AS offering
     WHERE offering.id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
       AND offering.slug = 'creator-academy-edition-2'
       AND offering.status = 'active'
       AND offering.is_public IS TRUE
       AND offering.identity_spine_enabled IS NOT DISTINCT FROM v_identity_spine_enabled
  ) <> 1 THEN
    RAISE EXCEPTION 'Pilot activation post-state is invalid or identity-spine state changed';
  END IF;
END
$activate_guard$;

SELECT offering.id,
       offering.slug,
       offering.status,
       offering.is_public,
       offering.identity_spine_enabled
  FROM public.offerings AS offering
 WHERE offering.id = '449056b9-9269-4bc5-ba8b-4c079c2104ee'
   AND offering.slug = 'creator-academy-edition-2';

COMMIT;
