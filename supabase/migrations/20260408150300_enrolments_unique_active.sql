-- =====================================================================
-- DATA INTEGRITY FIX: Prevent duplicate active enrolments
-- =====================================================================
--
-- The enrolments table has no uniqueness constraint on (user_id, offering_id).
-- This means double-click on Pay Now, a webhook + redirect race, or a
-- retried edge function call can create multiple active enrolment rows
-- for the same purchase. That corrupts cohort attendance, progress
-- tracking, and analytics.
--
-- This migration:
--   1. Archives any existing duplicates (status='duplicate_archived')
--   2. Adds a partial unique index enforcing at most one active enrolment
--      per (user_id, offering_id)
--
-- After this migration, edge functions can safely use INSERT ... ON CONFLICT
-- DO NOTHING (on the new index) to make enrolment creation idempotent.
-- =====================================================================

-- Archive any existing duplicates before creating the index.
-- We keep the earliest-created active row and archive the rest.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, offering_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.enrolments
  WHERE status = 'active'
)
UPDATE public.enrolments
SET status = 'duplicate_archived'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Partial unique index: at most one active enrolment per (user_id, offering_id).
-- Cancelled, expired, or duplicate_archived rows do not count, so users can
-- legitimately re-enrol after cancellation.
CREATE UNIQUE INDEX IF NOT EXISTS enrolments_unique_active
  ON public.enrolments (user_id, offering_id)
  WHERE status = 'active';

COMMENT ON INDEX public.enrolments_unique_active IS
  'Ensures at most one active enrolment per user per offering. '
  'Edge functions should use ON CONFLICT DO NOTHING on this index '
  'to make enrolment creation idempotent across webhook + redirect races.';
