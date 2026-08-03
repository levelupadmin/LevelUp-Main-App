import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260803201000_preflight_schema_lint_repairs.sql",
  ),
  "utf8",
);

describe("release schema-lint repairs", () => {
  it("adds the offering classification already consumed by admin surfaces", () => {
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS product_tier text NOT NULL DEFAULT 'other'/,
    );
    expect(migration).toContain("JOIN public.courses AS course");
  });

  it("fully qualifies team API-key columns and preserves the service-only grant", () => {
    expect(migration).toContain("api_key.scope AS matched_scope");
    expect(migration).toContain("api_key.created_by AS matched_created_by");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.verify_team_api_key\(text\) FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.verify_team_api_key\(text\) TO service_role/,
    );
  });
});
