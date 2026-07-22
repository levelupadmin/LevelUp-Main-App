import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * H3-2 — client withholds the payment CTA when the reconciler flags the money
 * signal as `ambiguous`.
 *
 * This wires the `reconcile.test.ts:284-299` contract ("`ambiguous` is surfaced
 * for the client to soften the CTA"). The reconciler resolves the highest
 * *non-money* stage the corroborated signals support and sets `ambiguous=true`
 * when a shared-tier amount can't be pinned to exactly one offering. Here we
 * feed ApplicationStatus a `completed-no-fee` payload with `ambiguous=true` and
 * assert it renders the chip (information) but NOT the "Pay application fee"
 * money CTA — it degrades to the status-driven timeline, which owns payments.
 *
 * useFunnelStage + useAuth + the supabase client are mocked so the page renders
 * without the flag/edge-fn/network, mirroring the isolation of
 * CheckoutPage.phonePayload.test.tsx.
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

// Non-iOS so a payment CTA WOULD render if it weren't withheld — proving the
// suppression is the ambiguity guard, not the Apple anti-steering guard.
vi.mock("@/lib/platform", () => ({
  isIOS: () => false,
}));

// The page reads its one application row via
// supabase.from(...).select(...).eq(...).single(). Return a submitted (step 0)
// application owned by TEST_UID so both render floors pass for completed-no-fee.
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

describe("ApplicationStatus — ambiguous reconciled payload (H3-2)", () => {
  beforeEach(() => {
    mockFunnelData = null;
  });

  it("renders the chip and NO payment CTA when the money signal is ambiguous", async () => {
    mockFunnelData = {
      stage: "completed-no-fee",
      resolvedKey: "phone",
      markers: { completedNoFee: false, contactablePartial: false },
      ambiguous: true,
    };

    renderPage();

    // The information chip still renders (completed-no-fee maps to this chip).
    expect(await screen.findByText("Application fee due")).toBeInTheDocument();

    // But the money CTA is withheld — neither the reconciled fee CTA nor the
    // status-driven balance CTA appears for a submitted (step 0) application.
    expect(screen.queryByText("Pay application fee")).toBeNull();
    expect(screen.queryByText("Pay balance")).toBeNull();
    expect(screen.queryByText("Pay Balance")).toBeNull();
  });

  it("renders the payment CTA for the same stage when it is NOT ambiguous", async () => {
    mockFunnelData = {
      stage: "completed-no-fee",
      resolvedKey: "phone",
      markers: { completedNoFee: true, contactablePartial: false },
      ambiguous: false,
    };

    renderPage();

    // Same chip, but now the money CTA is present — confirming ambiguity (not
    // the stage or platform) is what withholds it.
    expect(await screen.findByText("Application fee due")).toBeInTheDocument();
    expect(screen.getByText("Pay application fee")).toBeInTheDocument();
  });
});
