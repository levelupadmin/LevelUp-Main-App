/**
 * Only the server writes payment_orders (migration 20261030120000).
 *
 * A signed-in user could insert a payment_orders row of their own with status
 * "captured" (policy payment_orders_insert_own), which verify-razorpay-payment
 * then trusted. The migration drops that policy and revokes browser writes.
 * Like admissionPublicPolicy.test.ts, this reads files off disk: vitest has no
 * database, so it checks the migration's text, that no later migration opens
 * the table again, and that no app code writes the table from the browser,
 * which would break once the revoke is live.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
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
const MIGRATIONS = join(ROOT, "supabase/migrations");
const THIS_MIGRATION = "20261030120000_payment_orders_server_writes_only.sql";

/** SQL without -- comments, lower-cased, whitespace collapsed. */
const code = (sql: string) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ");

function filesUnder(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === "__tests__" || name === "docs") continue;
      out.push(...filesUnder(p, keep));
    } else if (keep(p)) {
      out.push(p);
    }
  }
  return out;
}

describe("payment_orders: server writes only", () => {
  const sql = code(readFileSync(join(MIGRATIONS, THIS_MIGRATION), "utf8"));

  it("the migration drops the insert policy and revokes browser writes", () => {
    expect(sql).toContain("drop policy if exists payment_orders_insert_own on public.payment_orders;");
    expect(sql).toMatch(/revoke insert, update, delete, truncate on public\.payment_orders from anon, authenticated;/);
  });

  it("the migration leaves reads alone and grants nothing", () => {
    expect(sql).not.toMatch(/\bgrant\b/);
    expect(sql).not.toMatch(/revoke[^;]*\bselect\b/);
    expect(sql).not.toMatch(/drop policy[^;]*payment_orders_own\b/);
    expect(sql).not.toMatch(/create policy/);
  });

  it("no later migration opens payment_orders to the browser again", () => {
    const later = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql") && f > THIS_MIGRATION)
      .map((f) => [f, code(readFileSync(join(MIGRATIONS, f), "utf8"))] as const);
    for (const [file, text] of later) {
      for (const stmt of text.split(";")) {
        if (!/payment_orders/.test(stmt)) continue;
        const opens =
          /\bgrant\b[^]*\b(insert|update|delete|all)\b[^]*\bto\b[^]*\b(anon|authenticated|public)\b/.test(stmt) ||
          /create policy[^]*for (insert|update|delete)\b/.test(stmt);
        expect({ file, stmt: stmt.trim(), opens }).toEqual({ file, stmt: stmt.trim(), opens: false });
      }
    }
  });

  it("no app code writes payment_orders from the browser", () => {
    const sources = filesUnder(join(ROOT, "src"), (p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p));
    expect(sources.length).toBeGreaterThan(50);
    const writers: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      const re = /\.from\(\s*["'`]payment_orders["'`]\s*\)/g;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        // The chained call that follows, up to the end of the statement.
        const chain = text.slice(m.index, m.index + 800).split(/;\s*\n/)[0];
        if (/\.(insert|update|upsert|delete)\s*\(/.test(chain)) writers.push(relative(ROOT, file));
      }
      if (/\.rpc\(\s*["'`][a-z_]*payment_order/.test(text)) writers.push(`${relative(ROOT, file)} (rpc)`);
    }
    expect(writers).toEqual([]);
  });
});
