import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Native Reader Rule regression proof for the staged application checkout.
 *
 * ApplicationStatus has two live staged-payment CTAs (confirmation and balance)
 * plus one reconciler CTA branch that is dormant while the v1 money-stage
 * suppression is active. Android and iOS native shells must expose none of
 * them; web keeps both live staged checkout routes.
 */

const TEST_UID = "user-1";
const TEST_APP_ID = "app-1";
const TEST_OFFERING_ID = "off-1";

type Runtime = "web" | "android" | "ios";

const state = vi.hoisted(() => ({
  runtime: "web" as Runtime,
  status: "accepted",
}));

vi.mock("@/lib/platform", () => ({
  isNative: () => state.runtime !== "web",
  isAndroid: () => state.runtime === "android",
  isIOS: () => state.runtime === "ios",
  isWeb: () => state.runtime === "web",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: TEST_UID, email: "reader@example.com" },
    profile: { full_name: "Reader", email: "reader@example.com" },
  }),
}));

vi.mock("@/hooks/useFunnelStage", () => ({
  useFunnelStage: () => ({ data: undefined }),
}));

vi.mock("@/lib/flags", () => ({
  COHORT_INTERVIEW: "cohort-interview",
  DECISION_FLOW: "decision-flow",
  flag: () => false,
}));

vi.mock("@/hooks/useInstallMoment", () => ({
  isInstallNudgeEnabled: () => false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                id: TEST_APP_ID,
                user_id: TEST_UID,
                offering_id: TEST_OFFERING_ID,
                status: state.status,
                created_at: "2026-07-01T00:00:00.000Z",
                rejection_reason: null,
                interview_date: null,
                interview_modality: null,
                interview_interviewer_name: null,
                reschedule_count: 0,
                calendly_canceled_at: null,
                offerings: {
                  title: "Native Reader Cohort",
                  price_inr: 30_000,
                  app_fee_inr: 400,
                  confirmation_amount_inr: 8_000,
                },
              },
              error: null,
            }),
        }),
      }),
    }),
  },
}));

import ApplicationStatus from "@/pages/ApplicationStatus";

async function renderStatus(status: "accepted" | "confirmation_paid") {
  state.status = status;
  render(
    <MemoryRouter initialEntries={[`/application/${TEST_APP_ID}`]}>
      <Routes>
        <Route
          path="/application/:applicationId"
          element={<ApplicationStatus />}
        />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText("Native Reader Cohort");
}

describe("ApplicationStatus native payment Reader Rule", () => {
  beforeEach(() => {
    state.runtime = "web";
    state.status = "accepted";
  });

  it.each([
    ["accepted", "Pay Confirmation", "confirmation"],
    ["confirmation_paid", "Pay Balance", "balance"],
  ] as const)(
    "web retains the %s checkout CTA",
    async (status, label, paymentType) => {
      await renderStatus(status);

      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute(
        "href",
        `/checkout/${TEST_OFFERING_ID}?type=${paymentType}&app=${TEST_APP_ID}`,
      );
      expect(
        screen.queryByText("Complete this step from a web browser."),
      ).toBeNull();
    },
  );

  it.each([
    ["android", "accepted", "Pay Confirmation"],
    ["android", "confirmation_paid", "Pay Balance"],
    ["ios", "accepted", "Pay Confirmation"],
    ["ios", "confirmation_paid", "Pay Balance"],
  ] as const)(
    "%s hides the %s payment CTA",
    async (runtime, status, label) => {
      state.runtime = runtime;
      await renderStatus(status);

      expect(screen.queryByRole("link", { name: label })).toBeNull();
      expect(
        screen.getByText("Complete this step from a web browser."),
      ).toBeInTheDocument();
    },
  );

  it("keeps all three payment-bearing render branches on the native guard", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/pages/ApplicationStatus.tsx"),
      "utf8",
    );

    expect(source).toMatch(
      /reconciledCta\.payment && isNative\(\)/,
    );
    expect(source).toMatch(
      /step\.key === "confirmation_paid"[\s\S]{0,160}isNative\(\)/,
    );
    expect(source).toMatch(
      /step\.key === "balance_paid"[\s\S]{0,160}isNative\(\)/,
    );
    expect(source).not.toMatch(/isIOS\(\)/);
  });
});
