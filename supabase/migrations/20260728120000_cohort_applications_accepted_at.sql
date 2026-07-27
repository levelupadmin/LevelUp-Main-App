-- ============================================================
-- PHASE DC — D-1: the held-seat anchor (`accepted_at`) for REQ-DEC-5
-- ============================================================
--
-- ── WHY THIS COLUMN EXISTS ──
-- REQ-DEC-5's "seat held · closes {countdown}" needs ONE thing the table did not
-- carry: a timestamp that is written ONCE, when the acceptance first reaches the
-- student, and never moved again. Every candidate already on the row fails that
-- test:
--   • `reconciled_at` is re-stamped with now() on EVERY reconcile run
--     (`reconcile-funnel-stage`, both mirror branches), so a deadline hung off it
--     slides forward each time the student opens the app.
--   • `updated_at` moves with that same write, plus every other write.
--   • `status` carries no timestamp at all.
-- A countdown dated off a moving anchor lies in both directions — always ~2 days
-- away for an active user, already lapsed for someone accepted since the last
-- run — so `useDecision` returned `null` and the conversion lever silently
-- disappeared. This column is the honest anchor that turns it back on.
--
-- ── WHAT IT MEANS (read this before using it for anything else) ──
-- `accepted_at` is "when the app FIRST OBSERVED this application at the derived
-- `accepted` stage". It is NOT TeleCRM's decision timestamp — the reconciler
-- cannot see one — and it is NOT a source of truth (SOR-1). That is deliberate
-- and it is the student-fair reading: the hold window starts when the student
-- could first learn they were in, so it can never present as already lapsed on
-- the very first open.
--
-- ── WRITE RULES (enforced in the reconciler, stated here for the reader) ──
--   1. Stamped ONCE, only when it is currently NULL and the derived stage is
--      exactly `accepted`. Never re-stamped — that is the whole point.
--   2. Never cleared, not even when the application later goes terminal-negative:
--      "the seat releases but the acceptance stays valid for the next batch"
--      (D-3's lapse contract) needs the original anchor to survive.
--   3. Never written by the client. The app holds no write path to this table's
--      funnel columns at all; the only writer is the service-role reconciler.
--
-- ── SHAPE OF THE CHANGE ──
-- Additive, idempotent, reversible, no RAISE (an aborting DO block would take
-- every sibling migration in the same `db push` down with it). Nullable with no
-- default, so applying it changes nothing about any existing row and no
-- countdown appears until a reconcile run observes an acceptance.
--
-- RLS: unchanged. The existing `students_read_own_applications` SELECT policy
-- (`user_id = auth.uid()`) covers the new column for free, and the service-role
-- writer bypasses RLS. It is NOT on the public admission whitelist: the anon
-- role holds no privilege on this table (`20260728110000` §3) and
-- `get_admission_page()` projects two columns, neither of them this one — a
-- recipient of a shared link must not learn when, or whether, a deadline runs.
--
-- Source: PRD REQ-DEC-5; design/briefs/cohort-dc.md D-1/D-3.

ALTER TABLE public.cohort_applications
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

COMMENT ON COLUMN public.cohort_applications.accepted_at IS
  'Reconciler-written held-seat anchor (REQ-DEC-5): stamped ONCE the first time the derived stage is observed as `accepted`, never re-stamped and never cleared. First-observation time, NOT TeleCRM''s decision time; not a source of truth (SOR-1). The seat window is accepted_at + offerings.confirmation_deadline_days + confirmation_grace_hours.';

-- ── Reversal (kept for reference; do not run in the forward migration) ──
-- ALTER TABLE public.cohort_applications
--   DROP COLUMN IF EXISTS accepted_at;
