/**
 * Admin reports read precomputed legacy tables (migrations 20261031100000 and
 * 20261031110000).
 *
 * vitest has no database, so like paymentOrdersServerWrites.test.ts this reads
 * the files off disk. It checks the parts a later edit could quietly break:
 * the indexes build without locking writes, the new tables stay closed to
 * clients, every new RPC checks is_admin(), sign-in claims never trigger a
 * rebuild, the old RPCs stay until nothing calls them, and the admin pages
 * call the new RPCs. The numbers themselves were compared against the old RPCs
 * on a copy of production data; see the PR.
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

const indexes = code(read("supabase/migrations/20261031100000_legacy_enrolments_report_indexes.sql"));
const reports = code(read("supabase/migrations/20261031110000_legacy_report_tables.sql"));

/** Body of one `create or replace function public.<name>(` … `$$;` block. */
function fn(name: string): string {
  const start = reports.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  const open = reports.indexOf("$$", start);
  const close = reports.indexOf("$$", open + 2);
  return reports.slice(start, close + 2);
}

describe("legacy report indexes", () => {
  it("builds all three indexes concurrently, outside a transaction", () => {
    for (const ix of [
      "legacy_enrolments_phone_idx on public.legacy_enrolments (phone)",
      "legacy_enrolments_purchased_at_idx on public.legacy_enrolments (legacy_purchased_at)",
      "legacy_enrolments_offering_id_idx on public.legacy_enrolments (offering_id)",
    ]) {
      expect(indexes).toContain(`create index concurrently if not exists ${ix}`);
    }
    expect(indexes).not.toMatch(/\bbegin\b|\bcommit\b/);
  });
});

describe("legacy report tables", () => {
  it("keeps the new tables closed to clients", () => {
    for (const t of ["legacy_revenue_daily", "legacy_customers", "legacy_customer_emails"]) {
      expect(reports).toContain(`alter table public.${t} enable row level security;`);
      expect(reports).not.toMatch(new RegExp(`create policy[^;]*on public\\.${t}\\b`));
    }
    expect(reports).toContain(
      "revoke all on public.legacy_revenue_daily, public.legacy_customers, public.legacy_customer_emails from anon, authenticated;",
    );
  });

  it("rebuilds on writes to report columns, never on a claim stamp", () => {
    const upd = reports.slice(
      reports.indexOf("create trigger legacy_enrolments_refresh_reports_upd"),
      reports.indexOf("for each statement", reports.indexOf("create trigger legacy_enrolments_refresh_reports_upd")),
    );
    expect(upd).toContain("after update of");
    expect(upd).not.toContain("claimed_by_user_id");
    expect(upd).not.toContain("claimed_at");
    expect(reports).toMatch(/after insert or delete or truncate on public\.legacy_enrolments for each statement/);
  });

  it("lets only admins call the new RPCs", () => {
    for (const name of ["admin_revenue", "admin_revenue_by_offering", "admin_dashboard_summary", "admin_users_page"]) {
      const body = fn(name);
      expect(body).toContain("security definer");
      expect(body).toContain("where (select public.is_admin())");
      expect(reports).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`));
    }
  });

  it("keeps the internal helpers away from clients", () => {
    for (const name of ["refresh_legacy_reports", "legacy_enrolments_refresh_reports", "legacy_revenue_in_window", "legacy_only_customers"]) {
      expect(reports).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(reports).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\(`));
    }
  });

  it("leaves the old RPCs in place", () => {
    expect(reports).not.toMatch(
      /drop (function|view)[^;]*(revenue_in_range|offering_performance_in_range|admin_dashboard_combined|users_unified)/,
    );
  });

  it("builds the tables once at the end", () => {
    expect(reports.trim().endsWith("select public.refresh_legacy_reports();")).toBe(true);
  });
});

describe("admin pages call the new RPCs", () => {
  it("dashboard", () => {
    const page = read("src/pages/admin/AdminDashboard.tsx");
    expect(page).toContain('supabase.rpc("admin_dashboard_summary"');
    expect(page).toContain('supabase.rpc("admin_revenue_by_offering"');
    expect(page).not.toMatch(/rpc\("(admin_dashboard_combined|offering_performance_in_range)"/);
  });

  it("revenue page", () => {
    const page = read("src/pages/admin/AdminRevenue.tsx");
    expect(page).toContain('supabase.rpc("admin_revenue"');
    expect(page).not.toMatch(/rpc\("revenue_in_range"/);
  });

  it("users page", () => {
    const page = read("src/pages/admin/AdminUsers.tsx");
    expect(page).toContain('supabase.rpc("admin_users_page"');
    expect(page).not.toMatch(/from\("users_unified"/);
  });
});
