-- Keep 7 days of pg_cron run history, and purge old rate-limit rows nightly.
--
-- cron.job_run_details logs every pg_cron run and nothing ever purged it. On
-- 30 Oct 2026 it held 1.52 million rows in 5,485 MB of a 5,657 MB database.
-- Almost all of it is process-email-queue, which runs every 5 seconds
-- (17,280 rows a day). The last 7 days are 127,589 rows, about 100 MB.
--
-- Why the heap is 4x the live rows: pg_cron writes each run as an insert and
-- then status updates, from its launcher process. The launcher never reports
-- table stats (pg_stat shows 0 inserts and no vacuum, ever), so autovacuum
-- never runs on this table and the dead row versions are never reused. A
-- nightly DELETE alone would not stop the growth, so a separate nightly job
-- runs VACUUM. postgres has MAINTAIN on the table, so it may.
--
-- Why not one DELETE: it would not block cron (it only touches old rows), but
-- it frees no disk. The file stays 5.4 GB until VACUUM FULL or pg_repack, and
-- the rows we keep sit at the end of the file, so plain VACUUM cannot shrink
-- it. VACUUM FULL cannot run inside a migration and would hold an exclusive
-- lock while it reads all 5.4 GB. Batching the DELETE has the same problem.
--
-- So: copy the rows to keep into a temp table while cron keeps writing (a
-- read; about a minute for 5.4 GB), lock the table, copy what changed since,
-- TRUNCATE, and put the kept rows back. The lock is held for a few seconds;
-- cron runs that fall due in that time wait, then go. One transaction: if any
-- step fails, nothing changes. The old file is freed at commit. Running this
-- file twice is safe.
--
-- Undo: deleted history cannot be brought back except from a backup. To stop
-- the nightly jobs:
--   select cron.unschedule('purge_cron_job_run_details_nightly');
--   select cron.unschedule('vacuum_cron_job_run_details_nightly');
--   select cron.unschedule('purge_old_rate_limits_nightly');

SET LOCAL statement_timeout = '15min';
-- Give up rather than queue behind another lock and stall cron.
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- One-off purge. A row is kept when it started in the last 7 days or has no
-- start time yet. The nightly job below deletes by the same rule.

DO $$
DECLARE
  last_copied bigint;
  r record;
BEGIN
  -- 1. Copy the rows to keep. A plain read: cron keeps writing meanwhile.
  CREATE TEMP TABLE keep_job_run_details ON COMMIT DROP AS
    SELECT * FROM cron.job_run_details
    WHERE start_time >= now() - interval '7 days' OR start_time IS NULL;

  SELECT coalesce(max(runid), 0) INTO last_copied FROM keep_job_run_details;

  -- 2. Stop cron's writes for the swap.
  LOCK TABLE cron.job_run_details IN ACCESS EXCLUSIVE MODE;

  -- The table has never been analyzed. Make sure the reads below go through
  -- the runid key and do not scan 5.4 GB while the lock is held.
  PERFORM set_config('enable_seqscan', 'off', true);

  -- Runs that started after the copy.
  INSERT INTO keep_job_run_details
    SELECT * FROM cron.job_run_details WHERE runid > last_copied;

  -- Runs that were still going when copied: take their final state.
  FOR r IN
    SELECT runid FROM keep_job_run_details
    WHERE status IS DISTINCT FROM 'succeeded' AND status IS DISTINCT FROM 'failed'
  LOOP
    DELETE FROM keep_job_run_details WHERE runid = r.runid;
    INSERT INTO keep_job_run_details
      SELECT * FROM cron.job_run_details WHERE runid = r.runid;
  END LOOP;

  PERFORM set_config('enable_seqscan', 'on', true);

  -- 3. Swap. runid keeps counting from the same sequence.
  TRUNCATE cron.job_run_details;
  INSERT INTO cron.job_run_details SELECT * FROM keep_job_run_details;
END $$;

ANALYZE cron.job_run_details;

-- ────────────────────────────────────────────────────────────────────
-- Nightly jobs, between the OTP purge (20:45 UTC) and the cohort room
-- reconcile (22:15 UTC). Each is unscheduled by name first, so this file can
-- run twice. VACUUM gets its own job: it cannot share a command with another
-- statement.
--
--   21:20 UTC (02:50 IST)  public.purge_old_rate_limits(): rate-limit windows
--                          older than a day. Defined in 20260408151400 but
--                          never scheduled.
--   21:30 UTC (03:00 IST)  delete run history older than 7 days.
--   21:40 UTC (03:10 IST)  vacuum and analyze run history.

DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'purge_old_rate_limits_nightly',
      'purge_cron_job_run_details_nightly',
      'vacuum_cron_job_run_details_nightly'
    )
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'purge_old_rate_limits_nightly',
  '20 21 * * *',
  $cmd$ SELECT public.purge_old_rate_limits(); $cmd$
);

SELECT cron.schedule(
  'purge_cron_job_run_details_nightly',
  '30 21 * * *',
  $cmd$ DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days'; $cmd$
);

SELECT cron.schedule(
  'vacuum_cron_job_run_details_nightly',
  '40 21 * * *',
  $cmd$ VACUUM (ANALYZE) cron.job_run_details; $cmd$
);
