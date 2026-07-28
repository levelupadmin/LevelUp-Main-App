-- ============================================================
-- PHASE RE — schedule the re-entry reminder ladder (E-1, added scope)
-- ============================================================
--
-- Runs `cohort-reentry-cron` every 15 minutes via pg_cron + pg_net, mirroring
-- 20260722140100_tally_poll_cron.sql exactly: extension guards, an
-- unschedule-if-present block so the migration is re-runnable, and the
-- service-role JWT sourced from the vault (`email_queue_service_role_key`)
-- rather than embedded, so a key rotation does not require a new migration.
--
-- ⚠️ WHY IT IS SAFE TO SHIP THIS SCHEDULED, AND WHAT THAT SAFETY DEPENDS ON.
-- This phase sends real messages to real applicants, and Rahul owns the switch
-- (brief Δ3). The switch is NOT this file and it is NOT `VITE_REMINDER_LADDER`:
-- that flag is resolved through `import.meta.env`, which does not exist in
-- Deno, so it cannot gate a cron. The gate is a SERVER-SIDE env var on the
-- edge function — `REMINDER_LADDER_ENABLED` — read at the top of
-- `supabase/functions/cohort-reentry-cron/index.ts`. Absent, or anything other
-- than the exact string 'true', and a LIVE tick returns BEFORE it reads a
-- single applicant row and before any sender exists. The body this job posts is
-- `'{}'::jsonb` with no `dry_run` key, so every tick scheduled here is a live
-- tick and takes exactly that path. Until that variable is set, every tick of
-- this job is an authenticated no-op.
--
-- (The handler does let an explicit `{"dry_run":true}` request through a
-- disabled switch, so an operator can preview what the ladder would decide
-- against real rows without arming this schedule to find out. That path forces
-- dry-run mode, which claims nothing and reaches no sender at all. This job
-- never sends that body.)
--
-- So the dependency is explicit: this schedule is inert ONLY because of that
-- env check. If that check is ever removed or weakened, this migration starts
-- messaging applicants every 15 minutes with nobody having decided to enable
-- anything. Do not relax one without re-reading the other.
--
-- To disable the ladder without touching this schedule:
--   unset the REMINDER_LADDER_ENABLED secret on the edge function.
-- To remove the schedule entirely:
--   SELECT cron.unschedule('cohort_reentry_ladder_every_15min');
--
-- If this lands before the edge function is deployed the job simply logs 404s
-- from the function endpoint. That is harmless: no row is read or written by a
-- failed call.
--
-- Why 15 minutes and not slower: the ladder's cadence is measured in hours, but
-- the "goes silent within ONE cron cycle of the stage advancing" guarantee is
-- only as tight as this period. 15 minutes matches the reconciler-adjacent
-- precedent and keeps the worst-case stale-nudge window to 15 minutes.
-- `CRON_PERIOD_MS` in `_shared/ladder.ts` mirrors this number and the
-- one-cycle-silence test asserts against it — change both together.
--
-- pg_net's `timeout_milliseconds := 60000` is the hard budget for one pass, and
-- the answer is CHUNK, not finish. One invocation is bounded by construction:
--   * candidates:  ≤ MAX_CANDIDATE_PAGES (5) × REENTRY_BATCH_LIMIT (200) rows,
--                  so ≤5 round trips, and the read is further bounded to the
--                  14-day ladder window and to the two ladder stages, so the
--                  pool cannot grow without limit;
--   * lookups:     ledger history + suppression chunked at 50, one lookup key
--                  per address → ≤20 + ≤20;
--   * the ledger:  ≤ MAX_CLAIM_ATTEMPTS_PER_RUN (50) CLAIM ATTEMPTS, each one
--                  INSERT plus, when the claim is won, one enqueue and one
--                  settle update → ≤150.
-- That is ≤195 sequential same-region round trips; at even 100 ms each the pass
-- lands near 20 s, a 3x margin inside this 60 s timeout. Anything past those
-- ceilings is left for the next tick 15 minutes later and the run reports
-- `truncated` with the reason. Since the engine allows at most one message per
-- application per day, a backlog can never build faster than the chunk drains it.
--
-- The budget counts CLAIM ATTEMPTS rather than deliveries, and that is what
-- makes the bound hold in the bad cases as well as the good one. A rung lost to
-- a 23505 race against an overlapping invocation, or a ledger INSERT that
-- errors, costs a round trip and produces no message; if only deliveries were
-- counted, a transient ledger outage or a single overlapping tick would let one
-- pass attempt an INSERT for every eligible row it scanned — up to 1000 — and
-- run straight past this timeout.

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
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'cohort_reentry_ladder_every_15min';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

-- The service-role JWT comes from the vault secret 'email_queue_service_role_key'
-- (added in 20260407192559_email_infra.sql for the email worker and reused by
-- the Tally poll cron). The handler compares the bearer against POLL_AUTH_TOKEN,
-- which must be set to that same value — see the auth block in the handler.
SELECT cron.schedule(
  'cohort_reentry_ladder_every_15min',
  '*/15 * * * *',
  $cmd$
    SELECT net.http_post(
      url := 'https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/cohort-reentry-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$
);
