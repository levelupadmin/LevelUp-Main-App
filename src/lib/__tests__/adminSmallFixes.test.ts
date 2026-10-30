/**
 * Stage 2 small fixes: one admin check in policies, one updated_at trigger on
 * live_sessions, a refund audit row that can land, and an AdminEnrolments CSV
 * import that goes through admin-grant-access.
 *
 * vitest has no database, so like paymentOrdersServerWrites.test.ts this reads
 * the files off disk.
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

const ROOT = repoRoot();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** SQL without -- comments, lower-cased, whitespace collapsed. */
const code = (sql: string) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ");

describe("inline-role policies use is_admin()", () => {
  const sql = code(read("supabase/migrations/20261031120000_admin_policies_use_is_admin.sql"));
  const POLICIES: [string, string][] = [
    ["admin_manage_quizzes", "chapter_quizzes"],
    ["admin_manage_quiz_questions", "quiz_questions"],
    ["admin_manage_quiz_options", "quiz_options"],
    ["admin_read_all_attempts", "quiz_attempts"],
    ["admin_manage_applications", "cohort_applications"],
    ["admins manage cohort_batches", "cohort_batches"],
    ["admins manage cohort_batch_members", "cohort_batch_members"],
    ["live_sessions_admin_all", "live_sessions"],
    ["admins manage attendance", "session_attendance"],
    ["admin_manage_permissions", "role_permissions"],
    ["admin delete notifications", "notifications"],
    ["admin insert notifications", "notifications"],
  ];

  it("alters all 12 policies in place", () => {
    for (const [name, table] of POLICIES) {
      expect(sql).toContain(`alter policy "${name}" on public.${table}`);
    }
    expect(sql.match(/alter policy/g)).toHaveLength(12);
    expect(sql).not.toMatch(/drop policy|create policy/);
  });

  it("checks the role only through a wrapped is_admin()", () => {
    for (const stmt of sql.split(";").filter((s) => s.includes("alter policy"))) {
      expect(stmt).toContain("(select public.is_admin())");
      expect(stmt).not.toMatch(/from users|from public\.users|role =|superadmin|author/);
    }
  });

  it("still lets a signed-in user add a notification for themselves", () => {
    const insert = sql.split(";").find((s) => s.includes('"admin insert notifications"'))!;
    expect(insert).toContain("with check (user_id = (select auth.uid()) or (select public.is_admin()))");
  });
});

describe("live_sessions has one updated_at trigger", () => {
  const sql = code(read("supabase/migrations/20261031130000_live_sessions_one_updated_at_trigger.sql"));

  it("drops the copy and keeps the shared one", () => {
    expect(sql).toContain("drop trigger if exists live_sessions_updated_at on public.live_sessions;");
    expect(sql).toContain("drop function if exists public.update_live_sessions_updated_at();");
    expect(sql).not.toContain("trg_live_sessions_updated_at");
  });
});

describe("process-refund audit row", () => {
  const fn = read("supabase/functions/process-refund/index.ts");
  const insert = fn.slice(fn.indexOf('from("admin_audit_logs").insert('), fn.indexOf("});", fn.indexOf('from("admin_audit_logs").insert(')));

  it("writes the table's real columns", () => {
    for (const col of ["actor_user_id:", "action:", "target_table:", "target_id:", "metadata:"]) {
      expect(insert).toContain(col);
    }
    for (const col of ["admin_user_id", "entity_type", "entity_id", "details:"]) {
      expect(insert).not.toContain(col);
    }
  });
});

describe("AdminEnrolments CSV import", () => {
  const page = read("src/pages/admin/AdminEnrolments.tsx");

  it("goes through admin-grant-access", () => {
    const importFn = page.slice(page.indexOf("const handleCsvImport"), page.indexOf("const downloadCsvReport"));
    expect(importFn).toContain('supabase.functions.invoke("admin-grant-access"');
    expect(importFn).not.toMatch(/from\("enrolments"\)/);
  });

  it("no longer writes a source the check constraint rejects, or signs users up from the browser", () => {
    expect(page).not.toContain('"admin_csv_import"');
    expect(page).not.toContain("auth.signUp");
  });
});
