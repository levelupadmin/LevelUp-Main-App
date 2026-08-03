import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = (...parts: string[]) => resolve(process.cwd(), ...parts);
const reconciler = readFileSync(
  root("supabase/functions/reconcile-funnel-stage/index.ts"),
  "utf8",
);
const ladder = readFileSync(
  root("supabase/functions/cohort-reentry-cron/index.ts"),
  "utf8",
);
const schedule = readFileSync(
  root("supabase/migrations/20260803173000_reentry_server_reconciliation.sql"),
  "utf8",
);

describe("server-owned re-entry reconciliation", () => {
  it("does not depend on the default-off browser flag", () => {
    expect(schedule).not.toContain("VITE_FUNNEL_RECON=true");
    expect(schedule).toContain("reconcile-funnel-stage");
    expect(schedule).toContain("'application_id', candidate.id");
    expect(schedule).toContain("'offering_id', candidate.offering_id");
  });

  it("is bounded to the ladder population and refreshes one row per tick", () => {
    expect(schedule).toContain("status IN ('submitted', 'app_fee_paid')");
    expect(schedule).toContain("created_at >= now() - interval '14 days'");
    expect(schedule).toContain("reconciled_at < now() - interval '12 hours'");
    expect(schedule).toMatch(/ORDER BY reconciled_at ASC NULLS FIRST[\s\S]*LIMIT 1/);
  });

  it("authenticates application-scoped calls before reading the named row", () => {
    const auth = reconciler.indexOf("timingSafeEqual(token, internalExpected)");
    const appRead = reconciler.indexOf('.from("cohort_applications")', auth);
    expect(auth).toBeGreaterThan(0);
    expect(appRead).toBeGreaterThan(auth);
    expect(reconciler).toContain('.eq("id", applicationId)');
    expect(reconciler).toContain('.eq("offering_id", offeringId)');
  });

  it("uses the completed application as the Tally fact but still reads external money/status", () => {
    expect(reconciler).toContain("completedApplicationTally");
    expect(reconciler).toContain("readTeleCrm(keys)");
    expect(reconciler).toContain("readRazorpay(keys, offering)");
    expect(reconciler).toContain("no payment state is inferred from local defaults");
  });

  it("mirrors a cron reading to exactly the named application", () => {
    expect(reconciler).toContain('mirrorQuery.eq("id", internalApplication.id)');
    expect(reconciler).toContain('mirrorQuery.eq("user_id", user!.id)');
  });

  it("keeps the DC terminal floor fail-closed on the RE service path", () => {
    expect(reconciler).toContain("if (internalApplication)");
    expect(reconciler).toContain("applicationStatusUnknown = !appStatus");
    expect(reconciler).toContain(
      "const retractMirror = applicationTerminal || applicationStatusUnknown",
    );
    expect(reconciler).not.toMatch(/catch\s*\{\s*applicationTerminal\s*=\s*false/);
  });

  it("preserves the once-ever accepted_at anchor for browser and service callers", () => {
    expect(reconciler).toContain('.select("accepted_at")');
    expect(reconciler).toMatch(
      /anchorQuery = internalApplication[\s\S]*anchorQuery\.eq\("id", internalApplication\.id\)[\s\S]*anchorQuery\.eq\("user_id", user!\.id\)/,
    );
    expect(reconciler).toContain(
      '...(stampAcceptedAt ? { accepted_at: new Date().toISOString() } : {})',
    );
  });

  it("couples live messaging to the server reconciler fail-closed", () => {
    expect(ladder).toContain(
      'const REENTRY_RECONCILE_ENABLED = Deno.env.get("REENTRY_RECONCILE_ENABLED") === "true"',
    );
    expect(ladder).toContain('if (LADDER_ENABLED && !requestedDryRun && !REENTRY_RECONCILE_ENABLED)');
    expect(ladder).toContain("refusing to run ladder");
  });
});
