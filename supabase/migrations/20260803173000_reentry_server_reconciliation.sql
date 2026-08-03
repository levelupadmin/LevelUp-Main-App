-- ============================================================
-- PHASE RE FOLLOW-UP — server-owned reconciliation input
-- ============================================================
--
-- The reminder ladder reads `cohort_applications.reconciled_*`, but before this
-- migration those columns had only a browser-triggered writer behind
-- `VITE_FUNNEL_RECON` (default OFF). Anonymous completed applications could
-- never call it at all. That made the ladder's input structurally empty even
-- when its own server flag was enabled.
--
-- This bounded schedule refreshes ONE oldest missing/stale application every
-- five minutes through `reconcile-funnel-stage`'s service-only application
-- contract. It does not infer payment state from `status` or local defaults:
-- that function still performs the read-only TeleCRM and Razorpay joins and
-- writes only the five app-owned reconciliation mirror columns.
--
-- CAPACITY AND FAILURE MODE
--   * 288 applications/day, enough to refresh the measured 199-row population
--     inside the 26-hour fee-evidence ceiling without concurrent global
--     Razorpay scans.
--   * only rows in the ladder's 14-day window and status whitelist are read;
--   * an unavailable external source fails soft inside the reconciler;
--   * a backlog beyond capacity becomes `fee-evidence-stale` and SILENCES the
--     fee ladder. It does not turn a local default into evidence of non-payment.
--
-- ROLLOUT IS FAIL-CLOSED. The scheduled function returns before reading an
-- application unless REENTRY_RECONCILE_ENABLED is exactly 'true'. The ladder
-- itself also refuses live execution unless that same flag is true. Therefore:
--   1. deploy this migration + both functions while both flags remain unset;
--   2. set REENTRY_RECONCILE_ENABLED=true and observe reconciled_at advancing;
--   3. preview the ladder with {"dry_run":true};
--   4. only then, with Rahul's approval, set REMINDER_LADDER_ENABLED=true.
--
-- No production flag is changed by this migration.

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
  WHERE jobname = 'cohort_reentry_reconcile_every_5min';

  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'cohort_reentry_reconcile_every_5min',
  '*/5 * * * *',
  $cmd$
    SELECT net.http_post(
      url := 'https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/reconcile-funnel-stage',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := jsonb_build_object(
        'application_id', candidate.id,
        'offering_id', candidate.offering_id
      ),
      timeout_milliseconds := 60000
    )
    FROM (
      SELECT id, offering_id
      FROM public.cohort_applications
      WHERE status IN ('submitted', 'app_fee_paid')
        AND created_at >= now() - interval '14 days'
        AND (
          reconciled_at IS NULL
          OR reconciled_at < now() - interval '12 hours'
        )
      ORDER BY reconciled_at ASC NULLS FIRST, created_at ASC, id ASC
      LIMIT 1
    ) AS candidate;
  $cmd$
);

-- Reversal (schedule only; mirror columns predate this migration and remain):
--   SELECT cron.unschedule('cohort_reentry_reconcile_every_5min');
