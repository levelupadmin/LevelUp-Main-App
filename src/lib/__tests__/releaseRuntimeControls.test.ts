import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = (...parts: string[]) => resolve(process.cwd(), ...parts);
const migration = readFileSync(
  root("supabase/migrations/20260803200000_release_runtime_controls.sql"),
  "utf8",
);
const config = readFileSync(root("supabase/config.toml"), "utf8");
const android = readFileSync(root("android/app/build.gradle"), "utf8");

describe("production release runtime controls", () => {
  it("keeps identity provisioning and native rooms dark by default", () => {
    expect(migration).toMatch(
      /identity_spine_enabled boolean NOT NULL DEFAULT false/,
    );
    expect(migration).toMatch(
      /cohort_rooms_enabled boolean NOT NULL DEFAULT false/,
    );
    expect(migration).toContain("VALUES (true, false)");
  });

  it("exposes one fail-closed getter without exposing the config table", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog");
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.app_runtime_config FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.cohort_rooms_surface_enabled\(\) TO anon, authenticated, service_role/,
    );
    expect(migration).toMatch(/COALESCE\([\s\S]*false[\s\S]*\)/);
  });

  it("keeps the cron behind gateway JWT verification as defense in depth", () => {
    expect(config).toMatch(
      /\[functions\.cohort-reentry-cron\]\s*\n\s*verify_jwt = true/,
    );
  });

  it("ships the Android candidate with R8 and resource shrinking", () => {
    expect(android).toContain("versionCode 619");
    expect(android).toContain('versionName "4.1.0"');
    expect(android).toContain("minifyEnabled true");
    expect(android).toContain("shrinkResources true");
    expect(android).toContain("proguard-android-optimize.txt");
  });
});
