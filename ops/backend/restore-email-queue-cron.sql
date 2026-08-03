-- Restore the dynamic email dispatcher schedule created by the original
-- setup_email_infra operation. The service credential stays in Supabase Vault;
-- this script never reads it into client output or embeds it in cron.job.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF to_regclass('public.email_send_state') IS NULL
     OR to_regclass('pgmq.q_auth_emails') IS NULL
     OR to_regclass('pgmq.q_transactional_emails') IS NULL
     OR to_regclass('cron.job') IS NULL
     OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL
  THEN
    RAISE EXCEPTION 'Email queue infrastructure is incomplete';
  END IF;

  IF (SELECT count(*) FROM public.email_send_state WHERE id = 1) <> 1 THEN
    RAISE EXCEPTION 'email_send_state singleton is missing';
  END IF;

  IF (SELECT count(*) FROM vault.secrets WHERE name = 'email_queue_service_role_key') <> 1 THEN
    RAISE EXCEPTION 'email_queue_service_role_key is missing or duplicated';
  END IF;
END
$guard$;

DO $unschedule$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'process-email-queue'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END
$unschedule$;

SELECT cron.schedule(
  'process-email-queue',
  '5 seconds',
  $command$
    SELECT net.http_post(
      url := 'https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/process-email-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    )
    WHERE EXISTS (
      SELECT 1
      FROM public.email_send_state
      WHERE id = 1
        AND (retry_after_until IS NULL OR retry_after_until <= now())
    )
      AND (
        EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
        OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails)
      );
  $command$
);

DO $verify$
BEGIN
  IF (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'process-email-queue'
      AND schedule = '5 seconds'
      AND active
  ) <> 1 THEN
    RAISE EXCEPTION 'process-email-queue schedule did not become active';
  END IF;
END
$verify$;

SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'process-email-queue';

COMMIT;
