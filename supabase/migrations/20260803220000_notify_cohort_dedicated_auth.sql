-- Give notify-cohort a purpose-specific caller credential instead of reusing a
-- database authority key. The secret value is never stored in this migration:
-- operators place the same random value in the Edge Function secret
-- NOTIFY_COHORT_AUTH_TOKEN and the Vault secret cohort_notify_auth_token.
--
-- Missing, blank, or duplicate Vault values fail closed. The cron job remains
-- installed but its SELECT produces no row, so pg_net makes no HTTP request.
-- Supplying exactly one value later self-heals the schedule without replaying
-- this migration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
END $$;

-- Remove every same-name row, not just an arbitrary first match, so replaying
-- the migration converges to one active job even after an interrupted rollout.
DO $$
DECLARE
  scheduled_job record;
BEGIN
  FOR scheduled_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'notify_cohort_every_15min'
  LOOP
    PERFORM cron.unschedule(scheduled_job.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'notify_cohort_every_15min',
  '*/15 * * * *',
  $cmd$
    WITH credential AS (
      SELECT
        min(decrypted_secret) AS token,
        count(*)::integer AS match_count
      FROM vault.decrypted_secrets
      WHERE name = 'cohort_notify_auth_token'
    )
    SELECT net.http_post(
      url := 'https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/notify-cohort',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || credential.token
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
    FROM credential
    WHERE credential.match_count = 1
      AND NULLIF(btrim(credential.token), '') IS NOT NULL;
  $cmd$
);

-- Make a partial or drifted replay fail at migration time. Secret presence is
-- deliberately not validated here: absence is a supported fail-closed state.
DO $$
DECLARE
  active_count integer;
  installed_schedule text;
  installed_command text;
BEGIN
  SELECT count(*)::integer, min(schedule), min(command)
  INTO active_count, installed_schedule, installed_command
  FROM cron.job
  WHERE jobname = 'notify_cohort_every_15min'
    AND active;

  IF active_count <> 1 THEN
    RAISE EXCEPTION 'notify-cohort cron expected one active job, found %', active_count;
  END IF;
  IF installed_schedule <> '*/15 * * * *' THEN
    RAISE EXCEPTION 'notify-cohort cron has unexpected schedule %', installed_schedule;
  END IF;
  IF position('cohort_notify_auth_token' IN installed_command) = 0 THEN
    RAISE EXCEPTION 'notify-cohort cron is not wired to its dedicated Vault secret';
  END IF;
END $$;

-- Reversal (schedule only):
--   SELECT cron.unschedule(jobid)
--   FROM cron.job
--   WHERE jobname = 'notify_cohort_every_15min';
