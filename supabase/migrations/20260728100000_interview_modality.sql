-- ============================================================
-- PHASE IV — The Interview: Calendly booking-fact columns (V-1)
-- ============================================================
--
-- `04-INTEGRATION-CONTRACTS.md` §6 is explicit that there is no
-- `interview_modality` column anywhere today, and `00-INDEX-AND-VALIDATION.md`
-- (row 05) lists `reschedule_count` as NEW. These columns are that gap.
--
-- WHAT THEY ARE: the BOOKING FACT Calendly delivered to `calendly-webhook`,
-- mirrored onto the app's own table. WHAT THEY ARE NOT: a funnel stage. TeleCRM
-- is the master (SOR-1); the reconciler (`reconcile-funnel-stage`) DERIVES the
-- stage from facts like these. The receiver never writes `status`, and neither
-- does anything reading these columns.
--
-- SCOPE, STATED PLAINLY (the three named columns are not sufficient on their own):
--   (a) interview_modality      — §6.3, the modality the student picked.
--   (b) interview_starts_at     — the Calendly-owned start instant.
--   (c) reschedule_count        — storage for V-3's one-reschedule guardrail.
--   (d) calendly_event_uri      — REQUIRED by the receiver's stated contract,
--       "idempotent on the Calendly event URI". Value equality cannot stand in for
--       it: two bookings can share a start time, and a reschedule's cancel half and
--       its create half resolve to the SAME row, so without the identity of the
--       booking currently held, a cancellation for a superseded event wipes a live
--       one. The idempotency key has to be storable to be a key.
--   (e) calendly_booked_at      — the delivered invitee's `created_at`, the only
--       thing that orders two deliveries. A Calendly retry can land after a later
--       booking was already mirrored; without an ordering fact that retry writes a
--       superseded slot back over the live one and consumes another reschedule.
-- A CANCELLATION CLEARS (a)+(b)+interview_date BUT KEEPS (d)+(e) — the tombstone. It
-- is what makes the three row states readable from the schema alone:
--   (d) NULL                        → no Calendly delivery ever landed
--   (d) set, (b) set                → a LIVE booking
--   (d) set, (b) NULL               → that booking was cancelled
-- Clearing (d)/(e) on cancel would disarm the ordering in (e) exactly when it is
-- needed: a late retry of the cancelled booking's create half would look brand new,
-- resurrect the interview and consume a second reschedule.
-- The CHECK on (a) is §6.3's canonical enum ("CHECK `google_meet|phone`"), mirrored
-- in DATA §4.2 — the enum half of column (a), not a separate feature. It is added
-- NOT VALID and dropped by the single reversal statement at the foot of this file.
--
-- Additive, reversible, idempotent (`ADD COLUMN IF NOT EXISTS`). No RLS change:
-- the existing `students_read_own_applications` SELECT policy
-- (`user_id = auth.uid()`) covers new columns for free, and the service-role
-- writer bypasses RLS. No index change: the receiver resolves the row by phone
-- suffix / email (`idx_cohort_apps_email` already exists) and then writes by `id`;
-- `calendly_event_uri` is only ever compared against the row already resolved, so
-- it needs no index of its own.
--
-- NO `RAISE EXCEPTION` ANYWHERE, AND NO `DO` BLOCK. `db push` runs every pending
-- migration in ONE transaction, so an aborting block here would take its sibling
-- migrations down with it. Every statement below is a no-op on a second run.

-- ── (a)…(e) the columns ──
ALTER TABLE public.cohort_applications
  ADD COLUMN IF NOT EXISTS interview_modality text,
  ADD COLUMN IF NOT EXISTS interview_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calendly_event_uri text,
  ADD COLUMN IF NOT EXISTS calendly_booked_at timestamptz;

-- The modality enum (§6.3): 'google_meet' | 'phone' | NULL. NULL passes, and NULL
-- is the deliberate value for a location Calendly reported that the contract's
-- table does not pin down — the receiver returns null there rather than guessing,
-- and this constraint is what keeps a future guess out. NOT VALID so the add is
-- instant and never blocks on a scan of legacy rows; new writes are still checked.
-- DROP-then-ADD rather than a DO block: idempotent, and reversible in one line.
ALTER TABLE public.cohort_applications
  DROP CONSTRAINT IF EXISTS cohort_applications_interview_modality_check;
ALTER TABLE public.cohort_applications
  ADD CONSTRAINT cohort_applications_interview_modality_check
  CHECK (interview_modality IN ('google_meet', 'phone')) NOT VALID;

COMMENT ON COLUMN public.cohort_applications.interview_modality IS
  'Calendly booking fact only: ''google_meet'' | ''phone'' | NULL when the delivered location is not one the contract pins down (never guessed). The reconciler owns funnel stage; this column is not a stage and is never derived from one.';

-- WHICH START-TIME COLUMN TO READ. `interview_date` already existed
-- (`20260413100000:22`) and §6.1 says to reuse it, so the receiver keeps writing it
-- in lockstep. It has NO readers and NO other writers in the app today (grep:
-- only this migration, the 20260413100000 DDL, and calendly-webhook), so the
-- lockstep write is forward-compat for that reuse, not support for a live surface.
-- `interview_starts_at` is the Calendly-OWNED fact and is AUTHORITATIVE for a
-- Calendly-sourced booking — V-3 reads this one.
COMMENT ON COLUMN public.cohort_applications.interview_starts_at IS
  'Calendly booking fact only, and AUTHORITATIVE for Calendly-sourced bookings (read this, not interview_date, in interview UI). Written by calendly-webhook from scheduled_event.start_time; NULL once the booking is cancelled. The reconciler owns funnel stage; this column is not a stage.';

COMMENT ON COLUMN public.cohort_applications.reschedule_count IS
  'Calendly booking fact only: how many times the booking has been REPLACED (Calendly old_invitee), storage for the one-reschedule guardrail. The reconciler owns funnel stage; this column is not a stage.';

COMMENT ON COLUMN public.cohort_applications.calendly_event_uri IS
  'Calendly booking fact only: SCHEDULED-EVENT URI (never an invitee URI) of the last booking this row processed — the receiver''s idempotency key. NULL only before the first delivery; set with interview_starts_at NULL it is a TOMBSTONE, meaning that booking was cancelled and its late create retries must be refused rather than resurrect it. A cancellation for any other URI is ignored, which is what stops a reschedule''s cancel half from wiping the live booking. The reconciler owns funnel stage; this column is not a stage.';

COMMENT ON COLUMN public.cohort_applications.calendly_booked_at IS
  'Calendly booking fact only: the delivered invitee''s created_at, used ONLY to order two deliveries so a late Calendly retry cannot overwrite a newer booking. Monotonic and RETAINED through a cancellation (clearing it would disarm that ordering). Not a booking start time (see interview_starts_at) and not a stage.';

-- Back-compat note on the pre-existing column, so the split above is discoverable
-- from the schema itself rather than only from this file.
COMMENT ON COLUMN public.cohort_applications.interview_date IS
  'Pre-existing interview start (20260413100000), reused per §6.1 and written in lockstep by calendly-webhook. No app code reads it today; for Calendly-sourced bookings interview_starts_at is authoritative, so prefer it. Booking fact only — the reconciler owns funnel stage.';

-- ── Reversal (kept for reference; do not run in the forward migration) ──
-- ALTER TABLE public.cohort_applications
--   DROP CONSTRAINT IF EXISTS cohort_applications_interview_modality_check,
--   DROP COLUMN IF EXISTS interview_modality,
--   DROP COLUMN IF EXISTS interview_starts_at,
--   DROP COLUMN IF EXISTS reschedule_count,
--   DROP COLUMN IF EXISTS calendly_event_uri,
--   DROP COLUMN IF EXISTS calendly_booked_at;
