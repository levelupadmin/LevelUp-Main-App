-- ============================================================
-- PHASE TP — Tally intake by POLLING: the intake cutoff (TP-1)
-- ============================================================
--
-- ONE Tally form is reused across editions of the same programme. Creator
-- Academy Edition 2 (slug `creator-academy-edition-2`, offering
-- 449056b9-9269-4bc5-ba8b-4c079c2104ee, the funnel pilot per
-- design/cohorts/EXECUTION-BACKLOG-V3.md) is wired to form `81dRPA`, which
-- already holds ~880 completed submissions predating it. The poller
-- (`tally-application-poll`) walks that form newest-first, so without a cutoff
-- its first run would ingest all of them as Edition 2 applications: a
-- fabricated funnel, a corrupted NSM baseline, and (once the reminder ladder
-- ships) outreach to hundreds of stale contacts.
--
-- `intake_opens_at` is that cutoff. The poller ingests a submission only when
-- its Tally `submittedAt >= COALESCE(intake_opens_at, created_at)`, and stops
-- paging as soon as it crosses the line
-- (supabase/functions/tally-application-poll/index.ts).
--
-- Additive, idempotent (`ADD COLUMN IF NOT EXISTS`), reversible (see the
-- reversal block at the end). No RLS change: the offering read policies already
-- cover new columns, and the poller runs service-role. No index: the poller
-- scans the handful of staged offerings, not this column.
--
-- ── ⚠️ SAFETY ASSUMPTION THE WHOLE PHASE RESTS ON — CONFIRM BEFORE `db push` ──
-- Seeding the cutoff from `created_at` is only safe if the Edition 2 offering
-- ROW was created at or after the instant Edition 2 intake actually opened. The
-- row is `draft`+non-public and was only BOUND as the pilot on 2026-07-22, so it
-- may well have been drafted earlier. If `created_at` predates the intake-open
-- instant, the poller ingests everything submitted in between, which is exactly
-- the failure this column exists to prevent.
--
-- ── There is NO gap in the data to find. Ask Rahul for the instant. ──
-- Do not try to derive the cutoff by looking for a quiet stretch between
-- editions: `81dRPA` is not an edition-scoped application form. It is the
-- always-on Meta Ads lead-capture form for the Live Creators (L3C) product line
-- (design/cohorts/funnel/TALLY-UX-ANALYSIS.md: `Creators <> Meta Ads`, Active),
-- and it takes paid traffic continuously. It went 863 → 880 completed between
-- 2026-07-16 (that audit) and 2026-07-22 (the brief's live probe): roughly THREE
-- completed submissions per day, straight across the edition boundary. The two
-- editions are separated by a business decision, not by any silence in the
-- stream, so no instant exists that is "after Edition 1's last submission and
-- before Edition 2's first".
--
-- The cutoff is therefore a business fact, and it has exactly one source:
--
--   1. Ask Rahul: at what instant did Edition 2 intake open, i.e. from when
--      should L3C form traffic count as an Edition 2 application? (IST.)
--   2. SELECT created_at FROM public.offerings
--       WHERE slug = 'creator-academy-edition-2';
--   3. If that `created_at` is at or after the instant from step 1, the seed
--      below is correct as written. If it is EARLIER, replace `created_at` in
--      the UPDATE with that instant as an explicit literal, for example
--      (illustrative only; use the instant Rahul gives you):
--
--        SET intake_opens_at = timestamptz '2026-07-22 00:00:00+05:30'
--
-- Both directions of error are silent, and neither self-corrects:
--   • cutoff too EARLY → continuously arriving L3C leads (~3/day, plus up to
--     ~880 historical rows) land as Edition 2 applications on the first tick.
--   • cutoff too LATE  → genuine Edition 2 applications fall permanently out of
--     window. The poller stops paging at the cutoff, so those rows are never
--     retried and never logged. No error is raised, ever.
-- Never pick a later literal "to be safe".
--
-- Note for anyone tempted to sanity-check the cutoff against our own tables:
-- `cohort_applications.created_at` is when OUR row was inserted (poll/webhook
-- delivery lag, manual admin entry, backfills), not the Tally `submittedAt` the
-- poller compares against. It is systematically later, so it is not a usable
-- proxy for the boundary.
--
-- ── REQUIRED after `db push` (this migration raises no error of its own) ──
-- By design this file cannot fail the push; `db push` also does not surface
-- server-side NOTICE/WARNING output, so nothing here can tell you it went
-- wrong. Verify by hand, immediately, because the sibling migration in the same
-- push (20260722140100_tally_poll_cron.sql) arms a */15 cron:
--
--   SELECT slug, created_at, intake_opens_at
--     FROM public.offerings
--    WHERE slug = 'creator-academy-edition-2';
--
-- Expect exactly one row with a non-null `intake_opens_at` equal to the
-- confirmed intake-open instant (TP-1's acceptance criterion). If the row is
-- missing (expected on local/branch DBs), or `intake_opens_at` is NULL, or the
-- value is earlier than the confirmed instant, the poller is unsafe: disarm it
-- with `SELECT cron.unschedule('tally_application_poll_every_15min');`, fix the
-- value with a targeted UPDATE, then re-run the cron migration.

ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS intake_opens_at timestamptz;

COMMENT ON COLUMN public.offerings.intake_opens_at IS
  'Poller ingests Tally submissions submitted on/after this instant only; NULL falls back to offerings.created_at. Exists because one Tally form is reused across editions.';

-- Seed the pilot only. Guarded on `IS NULL` so a re-run never clobbers a cutoff
-- someone has since corrected, and scoped by slug so no other offering is
-- touched.
--
-- Accepted side effect: this fires the pre-existing `offerings_updated_at`
-- BEFORE UPDATE trigger, so the pilot row's `updated_at` bumps to now() even
-- though no human edited the offering. Any admin surface that sorts by
-- last-edited will float this row once. Suppressing the trigger for a one-row
-- backfill is not worth the blast radius.
UPDATE public.offerings
SET intake_opens_at = created_at
WHERE slug = 'creator-academy-edition-2'
  AND intake_opens_at IS NULL;

-- ── Reversal (kept for reference; do not run in the forward migration) ──
-- ALTER TABLE public.offerings
--   DROP COLUMN IF EXISTS intake_opens_at;
