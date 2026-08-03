import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = (...parts: string[]) => resolve(process.cwd(), ...parts);
const config = readFileSync(root("supabase/config.toml"), "utf8");
const transactionalWorker = readFileSync(
  root("supabase/functions/queue-transactional-email/index.ts"),
  "utf8",
);
const couponPreview = readFileSync(
  root("supabase/functions/validate-coupon/index.ts"),
  "utf8",
);

function expectJwtVerificationDisabled(functionName: string) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  expect(config).toMatch(
    new RegExp(`\\[functions\\.${escapedName}\\]\\s+verify_jwt\\s*=\\s*false`),
  );
}

describe("opaque-key Edge Function gateway posture", () => {
  it("lets the transactional worker's exact service credential reach its handler", () => {
    expectJwtVerificationDisabled("queue-transactional-email");

    const compare = transactionalWorker.indexOf("timingSafeEqual(token, serviceKey)");
    const adminClient = transactionalWorker.indexOf("createClient(supabaseUrl, serviceKey)");
    expect(compare).toBeGreaterThan(0);
    expect(adminClient).toBeGreaterThan(compare);
  });

  it("keeps the guest coupon preview reachable behind its narrow rate limit", () => {
    expectJwtVerificationDisabled("validate-coupon");
    expect(couponPreview).toContain('p_key: `validate-coupon:${ip}:${offering_id}`');
    expect(couponPreview).toContain("p_max_count: 20");
    expect(couponPreview).toContain("p_window_seconds: 900");
    expect(couponPreview).not.toContain("max_redemptions:");
    expect(couponPreview).not.toContain("used_count:");
  });
});
