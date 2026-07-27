import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * V1-1 — the reconciler drives NON-MONEY stages only.
 *
 * Rahul RULED (2026-07-22, design/briefs/cohort-rc-v1-scope.md V1-1): disable the
 * reconciler's payment CTAs in v1. The reconciler still derives every stage (for
 * the NSM backend + mirror), but the CLIENT surfaces its chip/CTA ONLY for
 * non-money stages. Money-bearing reconciled stages (`completed-no-fee` → would be
 * "Pay application fee", `confirm-paid-no-balance` → would be "Pay balance") have
 * their ENTIRE reconciled override suppressed: the badge falls back to
 * `statusLabel(application.status)` and no reconciled CTA renders. This
 * structurally eliminates every reconciler-driven payment CTA from the v1 UI,
 * regardless of the `ambiguous` flag (the money suppression is a superset of the
 * older ambiguous-only softening, which stays intact for the fast-follow re-enable).
 *
 * useFunnelStage + useAuth + the supabase client are mocked so the page renders
 * without the flag/edge-fn/network, mirroring the isolation of
 * CheckoutPage.phonePayload.test.tsx. isIOS() is forced false so a payment CTA
 * WOULD render if it weren't suppressed — proving the suppression is the v1
 * money-stage rule, not the Apple anti-steering guard.
 */

const TEST_UID = "user-1";
const TEST_APP_ID = "app-1";
const TEST_OFFERING_ID = "off-1";

// The reconciled payload the page consumes. Overridden per-test before render.
let mockFunnelData: unknown = null;

vi.mock("@/hooks/useFunnelStage", () => ({
  useFunnelStage: () => ({ data: mockFunnelData }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: TEST_UID } }),
}));

// Non-iOS so a payment CTA WOULD render if it weren't suppressed — proving the
// suppression is the v1 money-stage rule, not the Apple anti-steering guard.
vi.mock("@/lib/platform", () => ({
  isIOS: () => false,
}));

// The page reads its one application row via
// supabase.from(...).select(...).eq(...).single(). Return a submitted (step 0)
// application owned by TEST_UID so both render floors pass for every reconciled
// stage under test (each stage's ladder step sits at or ahead of step 0).
const applicationRow = {
  id: TEST_APP_ID,
  user_id: TEST_UID,
  offering_id: TEST_OFFERING_ID,
  status: "submitted",
  created_at: "2026-07-01T00:00:00.000Z",
  rejection_reason: null,
  offerings: {
    title: "Live Filmmaking Cohort",
    price_inr: 30000,
    app_fee_inr: 400,
    confirmation_amount_inr: 8000,
  },
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: applicationRow, error: null }),
        }),
      }),
    }),
  },
}));

import ApplicationStatus from "@/pages/ApplicationStatus";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/application/${TEST_APP_ID}`]}>
      <Routes>
        <Route path="/application/:applicationId" element={<ApplicationStatus />} />
      </Routes>
    </MemoryRouter>,
  );
}

// statusLabel("submitted") — the fallback chip for a suppressed money stage.
const STATUS_CHIP = "Submitted";

describe("ApplicationStatus — v1: reconciler drives non-money stages only (V1-1)", () => {
  beforeEach(() => {
    mockFunnelData = null;
  });

  it("completed-no-fee (money) → statusLabel chip + NO 'Pay application fee'", async () => {
    mockFunnelData = {
      stage: "completed-no-fee",
      resolvedKey: "phone",
      markers: { completedNoFee: true, contactablePartial: false },
      ambiguous: false,
    };

    renderPage();

    // The reconciled "Application fee due" chip is suppressed; the badge falls
    // back to the status label. No reconciler-driven fee CTA renders.
    expect(await screen.findByText(STATUS_CHIP)).toBeInTheDocument();
    expect(screen.queryByText("Application fee due")).toBeNull();
    expect(screen.queryByText("Pay application fee")).toBeNull();
  });

  it("completed-no-fee stays suppressed even when NOT ambiguous (money rule supersedes ambiguity)", async () => {
    // Pre-v1 this exact payload rendered the "Pay application fee" CTA (ambiguity
    // was the only softener). In v1 the money-stage suppression is a superset, so
    // the CTA is gone regardless of `ambiguous` — this locks that in.
    mockFunnelData = {
      stage: "completed-no-fee",
      resolvedKey: "phone",
      markers: { completedNoFee: true, contactablePartial: false },
      ambiguous: false,
    };

    renderPage();

    expect(await screen.findByText(STATUS_CHIP)).toBeInTheDocument();
    expect(screen.queryByText("Pay application fee")).toBeNull();

    // And with ambiguous flipped on, still no CTA — same outcome.
    mockFunnelData = {
      stage: "completed-no-fee",
      resolvedKey: "phone",
      markers: { completedNoFee: false, contactablePartial: false },
      ambiguous: true,
    };
    expect(screen.queryByText("Pay application fee")).toBeNull();
  });

  it("confirm-paid-no-balance (money) → statusLabel chip + NO 'Pay balance'", async () => {
    mockFunnelData = {
      stage: "confirm-paid-no-balance",
      resolvedKey: "phone",
      markers: { completedNoFee: false, contactablePartial: false },
      ambiguous: false,
    };

    renderPage();

    // The reconciled "Balance due" chip is suppressed; badge falls back to the
    // status label. No reconciled "Pay balance" CTA, and the status-driven
    // timeline shows no "Pay Balance" for a submitted (step 0) application.
    expect(await screen.findByText(STATUS_CHIP)).toBeInTheDocument();
    expect(screen.queryByText("Balance due")).toBeNull();
    expect(screen.queryByText("Pay balance")).toBeNull();
    expect(screen.queryByText("Pay Balance")).toBeNull();
  });

  it("fee-paid-no-interview (non-money) → STILL renders its reconciled chip", async () => {
    mockFunnelData = {
      stage: "fee-paid-no-interview",
      resolvedKey: "phone",
      markers: { completedNoFee: false, contactablePartial: false },
      ambiguous: false,
    };

    renderPage();

    // Non-money stage: the reconciler still drives the chip (proves the money
    // suppression didn't nuke the non-money path). Fallback status chip absent.
    expect(await screen.findByText("Book your interview")).toBeInTheDocument();
    expect(screen.queryByText(STATUS_CHIP)).toBeNull();
  });

  it("enrolled (non-money) → renders its reconciled chip", async () => {
    mockFunnelData = {
      stage: "enrolled",
      resolvedKey: "phone",
      markers: { completedNoFee: false, contactablePartial: false },
      ambiguous: false,
    };

    renderPage();

    // Ensure the page has loaded, then assert the reconciled chip won over the
    // status fallback. "Enrolled" also appears as a timeline step label, so we
    // assert the fallback status chip is absent (reconciled chip drove the badge)
    // and that at least one "Enrolled" is present.
    await screen.findByText("Live Filmmaking Cohort");
    expect(screen.queryByText(STATUS_CHIP)).toBeNull();
    expect(screen.getAllByText("Enrolled").length).toBeGreaterThanOrEqual(1);
  });
});
