-- ============================================================
-- live_sessions.week_id → cohort_weeks(id) foreign key
-- ============================================================
--
-- RECONSTRUCTED FROM PRODUCTION (2026-07-22). This migration was applied
-- directly to the prod project (`ivkvluezuiojovpotlyb`) on 2026-07-21 but its
-- file was never committed, so `migration list` showed it as remote-only and
-- `db push` refused to run against the drift.
--
-- The SQL below is copied VERBATIM from
-- `supabase_migrations.schema_migrations.statements` for version 20260721000000,
-- so re-applying it is a no-op and local history now matches remote. It is NOT
-- re-run against prod (the row already exists in the history table) — this file
-- exists so the repo is an honest record of the deployed schema.
--
-- What it fixes: `live_sessions.week_id` was declared `text` while being FK'd to
-- `cohort_weeks(id)` (`uuid`) — the mechanical type mismatch tracked as a gate
-- before the cohort-room R0 backbone (see `design/cohorts/EXECUTION-BACKLOG-V3.md`
-- §Round-F correction delta Δ7). Verified on prod 2026-07-22:
-- `live_sessions.week_id` is now `uuid` with `live_sessions_week_id_fkey`
-- referencing `cohort_weeks(id) ON DELETE SET NULL`. Gate Δ7 is CLOSED.

ALTER TABLE public.live_sessions DROP CONSTRAINT IF EXISTS live_sessions_week_id_fkey;
ALTER TABLE public.live_sessions ADD CONSTRAINT live_sessions_week_id_fkey FOREIGN KEY (week_id) REFERENCES public.cohort_weeks(id) ON DELETE SET NULL;
