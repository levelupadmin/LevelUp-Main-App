-- ============================================================
-- PHASE RC — The Reconciler: reconciled-stage mirror columns (RC-T2)
-- ============================================================
--
-- The reconciler (`reconcile-funnel-stage` edge fn) is the app's first
-- first-party read of a logged-in user's funnel stage. It READS the three
-- external systems the app can query (Tally, TeleCRM, Razorpay) keyed on
-- phone → email, derives the §6 funnel stage, and MIRRORS that derived state
-- onto `cohort_applications` via a service-role write.
--
-- These five columns are that mirror — a read-through CACHE of external state,
-- NOT a source of truth (SOR-1). TeleCRM owns funnel `status`; the reconciler
-- NEVER writes `status` and NEVER authors `accepted`. A later reconcile simply
-- overwrites this cache, so a manual TeleCRM correction can never diverge
-- silently.
--
-- Additive, reversible, idempotent (`ADD COLUMN IF NOT EXISTS`). No RLS change:
-- the existing `students_read_own_applications` SELECT policy
-- (`user_id = auth.uid()`) covers these new columns for free, and the
-- service-role writer bypasses RLS. No index change required (the reconciler
-- writes/reads per-user by `user_id`, already indexed).

ALTER TABLE public.cohort_applications
  ADD COLUMN IF NOT EXISTS reconciled_stage text,
  ADD COLUMN IF NOT EXISTS reconciled_key text,
  ADD COLUMN IF NOT EXISTS completed_no_fee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contactable_partial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

-- Soft guard on the resolving key: 'phone' | 'email' | NULL (orphan). NOT VALID
-- so the add is instant and never blocks on a table scan of legacy rows; new
-- writes are still checked. Idempotent — skip if a prior run already added it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cohort_applications_reconciled_key_check'
      AND conrelid = 'public.cohort_applications'::regclass
  ) THEN
    ALTER TABLE public.cohort_applications
      ADD CONSTRAINT cohort_applications_reconciled_key_check
      CHECK (reconciled_key IN ('phone', 'email')) NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN public.cohort_applications.reconciled_stage IS
  'reconciler-written read-through mirror of external state; NOT a source of truth (SOR-1)';
COMMENT ON COLUMN public.cohort_applications.reconciled_key IS
  'reconciler-written read-through mirror of external state; NOT a source of truth (SOR-1)';
COMMENT ON COLUMN public.cohort_applications.completed_no_fee IS
  'reconciler-written read-through mirror of external state; NOT a source of truth (SOR-1)';
COMMENT ON COLUMN public.cohort_applications.contactable_partial IS
  'reconciler-written read-through mirror of external state; NOT a source of truth (SOR-1)';
COMMENT ON COLUMN public.cohort_applications.reconciled_at IS
  'reconciler-written read-through mirror of external state; NOT a source of truth (SOR-1)';

-- ── Reversal (kept for reference; do not run in the forward migration) ──
-- ALTER TABLE public.cohort_applications
--   DROP CONSTRAINT IF EXISTS cohort_applications_reconciled_key_check,
--   DROP COLUMN IF EXISTS reconciled_stage,
--   DROP COLUMN IF EXISTS reconciled_key,
--   DROP COLUMN IF EXISTS completed_no_fee,
--   DROP COLUMN IF EXISTS contactable_partial,
--   DROP COLUMN IF EXISTS reconciled_at;
