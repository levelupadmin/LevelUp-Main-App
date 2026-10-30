/**
 * pg_cron run history is kept for 7 days (migration 20261030130000).
 *
 * cron.job_run_details grew to 5.4 GB of a 5.66 GB database because nothing
 * purged it, and autovacuum never runs on it. The migration purges it once
 * (copy the last 7 days aside, lock, truncate, put them back) and schedules a
 * nightly delete, a nightly vacuum, and the unscheduled purge_old_rate_limits.
 * Like paymentOrdersServerWrites.test.ts, this reads the file off disk:
 * vitest has no database, so it pins the migration's text.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "supabase", "migrations"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const MIGRATION = join(repoRoot(), "supabase/migrations/20261030130000_purge_cron_run_history.sql");

/** SQL without -- comments, lower-cased, whitespace collapsed. */
const code = (sql: string) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ");

const sql = code(readFileSync(MIGRATION, "utf8"));

/** Position of a fragment; fails the test if it is missing. */
function at(fragment: string): number {
  const i = sql.indexOf(fragment);
  expect(i, fragment).toBeGreaterThanOrEqual(0);
  return i;
}

const JOBS = [
  ["purge_old_rate_limits_nightly", "20 21 * * *", "select public.purge_old_rate_limits();"],
  [
    "purge_cron_job_run_details_nightly",
    "30 21 * * *",
    "delete from cron.job_run_details where start_time < now() - interval '7 days';",
  ],
  ["vacuum_cron_job_run_details_nightly", "40 21 * * *", "vacuum (analyze) cron.job_run_details;"],
] as const;

describe("cron run history purge", () => {
  it("gives up on a busy lock instead of stalling cron", () => {
    expect(at("set local lock_timeout = '10s';")).toBeLessThan(at("lock table cron.job_run_details"));
  });

  it("keeps the last 7 days, by the same rule as the nightly delete", () => {
    expect(sql).toContain(
      "create temp table keep_job_run_details on commit drop as select * from cron.job_run_details where start_time >= now() - interval '7 days' or start_time is null;",
    );
    expect(sql).toContain("delete from cron.job_run_details where start_time < now() - interval '7 days';");
  });

  it("copies before it locks, catches up under the lock, then swaps", () => {
    const copy = at("create temp table keep_job_run_details");
    const lock = at("lock table cron.job_run_details in access exclusive mode;");
    const noScan = at("set_config('enable_seqscan', 'off', true)");
    const newer = at("insert into keep_job_run_details select * from cron.job_run_details where runid > last_copied;");
    const truncate = at("truncate cron.job_run_details;");
    const restore = at("insert into cron.job_run_details select * from keep_job_run_details;");
    expect([copy, lock, noScan, newer, truncate, restore]).toEqual(
      [copy, lock, noScan, newer, truncate, restore].sort((a, b) => a - b),
    );
  });

  it("does not reset the runid sequence or drop anything", () => {
    expect(sql).not.toMatch(/restart identity/);
    expect(sql).not.toMatch(/\bdrop (table|schema|extension|function|index|sequence)\b/);
    expect(sql).not.toMatch(/vacuum full/);
    expect(sql.match(/\btruncate\b/g)).toHaveLength(1);
  });

  it("schedules each nightly job by name, after unscheduling it by name", () => {
    const unschedule = at("perform cron.unschedule(jid);");
    for (const [name, schedule, command] of JOBS) {
      expect(at(`'${name}'`)).toBeLessThan(unschedule);
      const call = `select cron.schedule( '${name}', '${schedule}', $cmd$ ${command} $cmd$ );`;
      expect(at(call)).toBeGreaterThan(unschedule);
      expect(sql.split(`cron.schedule( '${name}'`)).toHaveLength(2);
    }
  });

  it("runs VACUUM as a job of its own", () => {
    // pg_cron sends a job's command as one query; VACUUM fails in a multi-statement one.
    const vacuumJob = sql.match(/'vacuum_cron_job_run_details_nightly', '[^']*', \$cmd\$ ([^$]*) \$cmd\$/);
    expect(vacuumJob?.[1].split(";").filter((s) => s.trim())).toEqual(["vacuum (analyze) cron.job_run_details"]);
  });
});
