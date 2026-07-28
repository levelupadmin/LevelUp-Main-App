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
-- THE START INSTANT IS NOT ONE OF THEM, DELIBERATELY. §6.1 scopes the net-new work
-- as a new `interview_modality` column "plus REUSE of the existing `interview_date`
-- column (`20260413100000`)", and §6.3 maps `scheduled_event.start_time` →
-- `cohort_applications.interview_date`. There is therefore ONE start column and it
-- already exists. A Calendly-owned twin beside it would give ONE fact TWO homes:
-- `interview_date` is the general-purpose column a manual, admin or backfilled
-- scheduling path would reach for, so the admin view and the interview UI could then
-- hold different instants for the same interview with no rule saying which one wins.
--
-- REUSE OBLIGES US TO STATE THAT RULE, so here it is, and the receiver implements it
-- exactly: while the held Calendly booking is LIVE, Calendly is authoritative on its
-- start and a redelivery re-asserts `start_time`. The moment that booking is
-- cancelled the receiver stops writing this column at all — so a human may then
-- schedule into it, and no late Calendly retry can take it back.
--
-- SCOPE, STATED PLAINLY (the named columns are not sufficient on their own):
--   (a) interview_modality      — §6.3, the modality the student picked.
--   (b) reschedule_count        — storage for the one-reschedule guardrail (read by
--       Task V-3's reschedule control, which owns what the count MEANS).
--   (c) calendly_event_uri      — REQUIRED by the receiver's stated contract,
--       "idempotent on the Calendly event URI". Value equality cannot stand in for
--       it: two bookings can share a start time, and a reschedule's cancel half and
--       its create half resolve to the SAME row, so without the identity of the
--       booking currently held, a cancellation for a superseded event wipes a live
--       one. The idempotency key has to be storable to be a key.
--   (d) calendly_booked_at      — the delivered invitee's `created_at`, the only
--       thing that orders two deliveries. A Calendly retry can land after a later
--       booking was already mirrored; without an ordering fact that retry writes a
--       superseded slot back over the live one and consumes another reschedule.
--   (e) calendly_canceled_at    — the CANCELLATION SIGNAL, and the reason it is a
--       column of its own rather than the absence of a value in `interview_date`.
--       The receiver must refuse a late create retry for a booking it has ALREADY
--       cancelled. Inferring "cancelled" from an empty `interview_date` would be
--       sound only while this receiver is that column's sole writer — and the whole
--       point of reusing `interview_date` (above) is that it is not. Any human or
--       backfill putting a date back would silently disarm the refusal and let the
--       retry resurrect a cancelled interview over the top of their date. This
--       column is written by `calendly-webhook` under the service role and by
--       nothing else, so the signal cannot be forged by a writer that knows nothing
--       about Calendly.
-- A CANCELLATION CLEARS (a) + `interview_date` AND SETS (e), KEEPING (c)+(d) — the
-- tombstone. It is what makes the three row states readable from the schema alone:
--   (c) NULL              → no Calendly delivery ever landed
--   (c) set, (e) NULL     → a LIVE booking
--   (c) set, (e) set      → that booking was cancelled
-- Clearing (c)/(d) on cancel would disarm the ordering in (d) exactly when it is
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
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calendly_event_uri text,
  ADD COLUMN IF NOT EXISTS calendly_booked_at timestamptz,
  ADD COLUMN IF NOT EXISTS calendly_canceled_at timestamptz;

-- ── The column this version must NOT leave behind ──
-- An earlier revision of THIS FILE, at this same version `20260728100000`, added a
-- Calendly-owned `interview_starts_at` beside `interview_date`. It was withdrawn for
-- the one-fact-one-home reason stated above, but Supabase records applied migrations
-- BY VERSION: `db push` will never re-run `20260728100000`, so an environment that
-- already ran the earlier revision would keep that column forever as an orphan no
-- code, no COMMENT and no generated type accounts for. This statement is that
-- cleanup. It is a no-op wherever the earlier revision never ran (`IF EXISTS`), and
-- it destroys nothing: that revision wrote `interview_starts_at` in LOCKSTEP with
-- `interview_date` on every path, so every value it ever held is still in
-- `interview_date`.
ALTER TABLE public.cohort_applications
  DROP COLUMN IF EXISTS interview_starts_at;

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

COMMENT ON COLUMN public.cohort_applications.reschedule_count IS
  'Calendly booking fact only: how many times the booking has been REPLACED (Calendly old_invitee), storage for the one-reschedule guardrail that Task V-3 renders. The reconciler owns funnel stage; this column is not a stage.';

COMMENT ON COLUMN public.cohort_applications.calendly_event_uri IS
  'Calendly booking fact only: SCHEDULED-EVENT URI (never an invitee URI) of the last booking this row processed — the receiver''s idempotency key. NULL only before the first delivery; set alongside a non-NULL calendly_canceled_at it is a TOMBSTONE, meaning that booking was cancelled and its late create retries must be refused rather than resurrect it. A cancellation for any other URI is ignored, which is what stops a reschedule''s cancel half from wiping the live booking. The reconciler owns funnel stage; this column is not a stage.';

COMMENT ON COLUMN public.cohort_applications.calendly_booked_at IS
  'Calendly booking fact only: the delivered invitee''s created_at, used ONLY to order two deliveries so a late Calendly retry cannot overwrite a newer booking. Monotonic and RETAINED through a cancellation (clearing it would disarm that ordering). Not a booking start time (that is interview_date) and not a stage.';

COMMENT ON COLUMN public.cohort_applications.calendly_canceled_at IS
  'Calendly booking fact only: when calendly-webhook RECORDED the cancellation of the booking named by calendly_event_uri (the receiver''s own clock, not a Calendly field). NULL means that booking is live. This — never an empty interview_date — is the cancellation signal, because interview_date is a shared column any manual or admin scheduling may write, and a forgeable signal would let a late Calendly create retry resurrect a cancelled interview. Cleared again when a new booking is mirrored onto the row. The reconciler owns funnel stage; this column is not a stage.';

-- THE ONE START COLUMN, re-documented rather than re-created. `interview_date`
-- pre-dates this migration (`20260413100000:22`); §6.1 reuses it and §6.3 maps
-- `scheduled_event.start_time` onto it, so `calendly-webhook` writes THIS column and
-- there is no second start for it to drift from. Stating that — and the precedence
-- rule that makes the reuse unambiguous — on the column itself keeps it discoverable
-- from the schema, not just from this file.
COMMENT ON COLUMN public.cohort_applications.interview_date IS
  'The interview start instant, and the only one (pre-existing 20260413100000, reused per §6.1; §6.3 maps scheduled_event.start_time here). calendly-webhook is its only writer in the code as it stands; it is deliberately left general-purpose so that manual or admin scheduling schedules INTO it rather than into a second start of its own. Precedence: while calendly_canceled_at IS NULL the held Calendly booking is live and a redelivery re-asserts Calendly''s start; once calendly_canceled_at is set the receiver never writes this column again. A cancellation clears it, which the reconciler reads as "no longer scheduled" — but the cancellation SIGNAL is calendly_canceled_at, never an empty value here. Booking fact only — the reconciler owns funnel stage; this column is not a stage.';

-- ── Reversal (kept for reference; do not run in the forward migration) ──
-- Deliberately does NOT restore `interview_starts_at`: that column was withdrawn,
-- not reversed, and `interview_date` already holds every value it ever carried.
-- COMMENT ON COLUMN public.cohort_applications.interview_date IS NULL;
-- ALTER TABLE public.cohort_applications
--   DROP CONSTRAINT IF EXISTS cohort_applications_interview_modality_check,
--   DROP COLUMN IF EXISTS interview_modality,
--   DROP COLUMN IF EXISTS reschedule_count,
--   DROP COLUMN IF EXISTS calendly_event_uri,
--   DROP COLUMN IF EXISTS calendly_booked_at,
--   DROP COLUMN IF EXISTS calendly_canceled_at;
