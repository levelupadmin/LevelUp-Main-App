-- Schedule reconcile-razorpay-orders to run every 15 minutes via pg_cron.
--
-- Recovered on 2026-10-30. Production applied this version on 2026-10-29
-- ("reconcile_razorpay_orders_cron") but recorded no statements, and no
-- branch had a file for it. This file is rebuilt from the live cron.job row
-- (jobname, schedule and command copied as they are on production). It may
-- not be the exact text that was run; the job it leaves behind is the same.
--
-- The function itself is supabase/functions/reconcile-razorpay-orders. It
-- finds payments Razorpay captured on orders still "created" or "failed"
-- here and finishes them the way razorpay-webhook does. Only a body with
-- "dry_run": false writes anything; this job sends one.
--
-- The bearer is the vault secret email_queue_service_role_key, the same
-- contract as tally_application_poll_every_15min and the re-entry crons.
--
-- To stop it:
--   SELECT cron.unschedule('reconcile_razorpay_orders_every_15min');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
END $$;

DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid
  FROM cron.job
  WHERE jobname = 'reconcile_razorpay_orders_every_15min';

  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'reconcile_razorpay_orders_every_15min',
  '*/15 * * * *',
  $cmd$
    SELECT net.http_post(
      url := 'https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/reconcile-razorpay-orders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')
      ),
      body := '{"dry_run": false, "lookback_hours": 72}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$
);
