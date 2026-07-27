-- Schedule tally-application-poll to run every 15 minutes via pg_cron.
--
-- Calls the edge function via pg_net.http_post. The service_role JWT is
-- pulled from the vault rather than embedded in the cron command so we
-- don't have to redeploy this migration if the key rotates.
--
-- To disable the poll:
--   SELECT cron.unschedule('tally_application_poll_every_15min');
--
-- If this migration lands before the edge function is deployed the cron
-- simply logs 404s from the function endpoint until the deploy happens.
-- That is harmless: no rows are read or written by a failed call.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
END $$;

-- Cancel prior schedule if present (re-runnable)
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'tally_application_poll_every_15min';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

-- Look up the existing service-role JWT from the vault. The
-- 'email_queue_service_role_key' secret already exists (added in
-- 20260407192559_email_infra.sql for the email worker), so we reuse it.
SELECT cron.schedule(
  'tally_application_poll_every_15min',
  '*/15 * * * *',
  $cmd$
    SELECT net.http_post(
      url := 'https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/tally-application-poll',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$
);
