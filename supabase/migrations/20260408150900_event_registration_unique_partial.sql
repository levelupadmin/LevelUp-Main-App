-- =====================================================================
-- FIX: Allow re-registration after a cancelled event registration
-- =====================================================================
--
-- event_registrations has UNIQUE(event_id, user_id), which means once a
-- user cancels their registration the row stays around with
-- status='cancelled' and the unique constraint blocks them from ever
-- registering again. They get a confusing duplicate-key error and
-- support has to clean it up by hand.
--
-- This migration replaces the full unique constraint with a partial
-- unique index that only enforces uniqueness for non-cancelled rows,
-- so a user can re-register after cancelling. The edge function
-- register-for-event is updated separately to upsert the existing
-- cancelled row back to 'registered' rather than insert a duplicate.
-- =====================================================================

-- Drop the existing constraint if it exists (name picked by Postgres
-- when the table was created with the inline UNIQUE clause).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.event_registrations'::regclass
    AND contype = 'u'
    AND conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = 'public.event_registrations'::regclass
        AND attname IN ('event_id', 'user_id')
    );
  IF cname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.event_registrations DROP CONSTRAINT %I',
      cname
    );
  END IF;
END$$;

-- Partial unique index: only one non-cancelled registration per
-- (event_id, user_id) pair.
DROP INDEX IF EXISTS event_registrations_unique_active;
CREATE UNIQUE INDEX event_registrations_unique_active
  ON public.event_registrations (event_id, user_id)
  WHERE status <> 'cancelled';

COMMENT ON INDEX public.event_registrations_unique_active IS
  'Allows re-registration after cancellation by only enforcing '
  'uniqueness on rows where status is not cancelled.';
