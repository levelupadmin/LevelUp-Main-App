-- ============================================================================
-- LUCA rollback: removes every LUCA database object and its data.
-- Nothing outside the luca_ namespace is touched (cohort_applications rows
-- created by in-app applications stay, as they are real applications).
-- Run only if LUCA must be removed entirely; turning the switch off
-- (luca_runtime_config.surface_enabled = false) is the normal "off".
-- ============================================================================
BEGIN;
-- The reminders job (20261007100400), if it was scheduled.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'luca_reminders_every_10min';
  END IF;
END $$;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE 'luca\_%' ESCAPE '\' OR (n.nspname = 'public' AND p.proname LIKE '\_luca\_%' ESCAPE '\')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
DROP TABLE IF EXISTS
  public.luca_reminders_sent, public.luca_resources, public.luca_announcements, public.luca_demo_slots, public.luca_rec_notes,
  public.luca_rec_progress, public.luca_hotseat, public.luca_nudges, public.luca_feedback,
  public.luca_sprint_posts, public.luca_prewatch, public.luca_submissions, public.luca_attendance,
  public.luca_coin_ledger, public.luca_applications, public.luca_members, public.luca_clans,
  public.luca_assignments, public.luca_sessions, public.luca_weeks, public.luca_mentors,
  public.luca_programs, public.luca_runtime_config CASCADE;
DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('20261007100000','20261007100100','20261007100200','20261007100300','20261007100400');
COMMIT;
