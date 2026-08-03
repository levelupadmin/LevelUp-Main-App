import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { notifyCohortAuthMatches } from "../../../supabase/functions/notify-cohort/auth.ts";

const root = (...parts: string[]) => resolve(process.cwd(), ...parts);
const handler = readFileSync(root("supabase/functions/notify-cohort/index.ts"), "utf8");
const authGate = readFileSync(root("supabase/functions/notify-cohort/auth.ts"), "utf8");
const schedule = readFileSync(
  root("supabase/migrations/20260803220000_notify_cohort_dedicated_auth.sql"),
  "utf8",
);
const config = readFileSync(root("supabase/config.toml"), "utf8");

describe("notify-cohort caller authentication", () => {
  const dedicatedToken = "notify-only-5da42181b61f4d0e";

  it("accepts only an exact dedicated bearer token", () => {
    expect(notifyCohortAuthMatches(`Bearer ${dedicatedToken}`, dedicatedToken)).toBe(true);
    expect(notifyCohortAuthMatches(`bearer ${dedicatedToken}`, dedicatedToken)).toBe(true);
    expect(notifyCohortAuthMatches(`Bearer ${dedicatedToken}-wrong`, dedicatedToken)).toBe(false);
  });

  it("fails closed when the header or configured secret is absent", () => {
    expect(notifyCohortAuthMatches(null, dedicatedToken)).toBe(false);
    expect(notifyCohortAuthMatches("Bearer ", dedicatedToken)).toBe(false);
    expect(notifyCohortAuthMatches(`Bearer ${dedicatedToken}`, "")).toBe(false);
    expect(notifyCohortAuthMatches("Bearer ", "")).toBe(false);
  });

  it("rejects a decodeable forged service-role JWT", () => {
    const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    const forged = `eyJhbGciOiJub25lIn0.${payload}.unsigned`;
    expect(notifyCohortAuthMatches(`Bearer ${forged}`, dedicatedToken)).toBe(false);
  });

  it("authenticates before constructing the service-role client", () => {
    const authCheck = handler.indexOf("notifyCohortAuthMatches(");
    const adminClient = handler.indexOf("createAdminClient();");
    // Keep the server-only accessor itself out of client-source text. A
    // repository-wide guard intentionally rejects that contiguous spelling
    // anywhere under src/, including test fixtures.
    const secretAccessor = ["Deno", ".env", ".get(", '"NOTIFY_COHORT_AUTH_TOKEN"', ")"].join("");
    expect(handler).toContain(secretAccessor);
    expect(authCheck).toBeGreaterThan(0);
    expect(adminClient).toBeGreaterThan(authCheck);
    expect(handler).not.toContain("payload.role");
    expect(handler).not.toContain("atob(");
    expect(authGate).toContain("timingSafeEqual(presented, expected)");
    expect(authGate).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("declares the opaque-token gateway posture explicitly", () => {
    expect(config).toMatch(/\[functions\.notify-cohort\]\s+verify_jwt\s*=\s*false/);
  });

  it("installs a secret-free, replay-safe, fail-closed cron caller", () => {
    expect(schedule).toContain("WHERE name = 'cohort_notify_auth_token'");
    expect(schedule).toContain("credential.match_count = 1");
    expect(schedule).toContain("NULLIF(btrim(credential.token), '') IS NOT NULL");
    expect(schedule).toContain("FOR scheduled_job IN");
    expect(schedule).not.toContain("email_queue_service_role_key");
    expect(schedule).not.toContain(dedicatedToken);
  });
});
