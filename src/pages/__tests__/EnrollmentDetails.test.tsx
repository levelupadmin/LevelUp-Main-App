import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decision } from "@/hooks/useDecision";

/**
 * D-3 — the enrollment-details page, and the iOS guard on it.
 *
 * This page reads as an explainer, which is exactly why it went unguarded: it
 * carries no checkout link of its own. But Apple's anti-steering rules are about
 * what the screen SHOWS as much as where the tap lands, and this page shows the
 * full ₹ fee schedule and a full-width primary CTA into the claim flow. The
 * shipped precedent — `ApplicationStatus.tsx`, whose staged timeline hides every
 * amount and every pay button on iOS behind the same `isIOS()` call — is the one
 * this page must follow, so the two surfaces cannot disagree about what an iOS
 * build is allowed to display.
 *
 * So this file pins five things:
 *  1. **On iOS: zero rupee amounts anywhere in the rendered body**, including
 *     the step titles ("You pay ₹8,000"), not just the fee table.
 *  2. **On iOS: no payment entry point** — no `/checkout` href, and no CTA into
 *     the claim flow — replaced by the same fallback sentence
 *     `ApplicationStatus.tsx` already ships, verbatim and EXACTLY ONCE. That
 *     sentence stands in for a button wherever it ships, so a second copy in a
 *     section that describes no step reads as a rendering bug — on the surface
 *     an App Store reviewer is looking at.
 *  3. **Web and Android are untouched**: the figures and the CTA still render,
 *     so the guard cannot be "fixed" by deleting the fee schedule outright.
 *  4. **The offering read can fail on either platform**, and when it does
 *     neither states a fee term it could not load: the refund sentence is gated
 *     on the same `hasFeeRows` the fee table is, and a pointer to where the
 *     figures live takes its place.
 *  5. The guard is a PLATFORM branch, not a data branch: the two must not be
 *     able to disagree about what the page can back.
 *
 * `useDecision`, `@/lib/platform`, `@/lib/flags` and the supabase client are
 * mocked so the page renders without the flag, the network or auth, mirroring
 * the isolation of `ClaimSeat.test.tsx`.
 */

const TEST_APP_ID = "app-1";
const TEST_OFFERING_ID = "off-1";

/**
 * An L3AI-shaped SKU: ₹700 to apply, ₹8,000 to confirm, ₹30,000 all in, so the
 * balance is ₹21,300. Four distinct figures, which is what makes "no ₹ on iOS"
 * a real assertion rather than a one-row check.
 */
const L3AI_TERMS = {
  app_fee_inr: 700,
  confirmation_amount_inr: 8000,
  price_inr: 30000,
  cohort_start_date: "2026-09-01",
};

const acceptedDecision: Decision = {
  applicationId: TEST_APP_ID,
  offeringId: TEST_OFFERING_ID,
  verdict: "accepted",
  name: "Aditi Rao",
  firstName: "Aditi",
  cohort: "Live Filmmaking Cohort",
  craft: "Editor",
  city: "Chennai",
  seatHeldUntil: new Date("2026-07-29T12:30:00.000Z"),
};

// Overridden per test before render.
let mockIsIOS = false;

/**
 * What `.single()` answers with. Overridden by the read-failure tests, which are
 * the point of exercising it through the mock rather than only seeding the
 * cache: the page's `queryFn` swallows the error and returns null, and it is
 * that null — not a thrown query — the fee copy has to survive.
 */
let mockTermsResponse: { data: typeof L3AI_TERMS | null; error: unknown } = {
  data: L3AI_TERMS,
  error: null,
};

vi.mock("@/hooks/useDecision", () => ({
  useDecision: () => ({
    decision: acceptedDecision,
    isLoading: false,
    isOffline: false,
    enabled: true,
  }),
}));

// The flag is the phase gate; every test here runs with the feature ON.
vi.mock("@/lib/flags", () => ({
  DECISION_FLOW: "VITE_DECISION_FLOW",
  flag: () => true,
}));

vi.mock("@/lib/platform", () => ({
  isIOS: () => mockIsIOS,
}));

// The page reads only the offering's money + schedule terms:
// .from("offerings").select(...).eq("id", ...).single()
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(mockTermsResponse),
        }),
      }),
    }),
  },
}));

import EnrollmentDetails from "@/pages/decision/EnrollmentDetails";

/**
 * The terms are seeded into the cache rather than awaited, so every assertion
 * runs against the page's FIRST paint — the state in which an App Store
 * reviewer would see it. `seed: false` skips that and lets the mocked read
 * resolve for real, which is how the read-FAILURE state is reached: the page's
 * `queryFn` turns a supabase error into `null`, and only going through it
 * proves that is what the copy is gated on.
 */
function renderPage({ seed = true }: { seed?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (seed) {
    queryClient.setQueryData(
      ["decision", "enrolment-terms", TEST_OFFERING_ID],
      L3AI_TERMS,
    );
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/decision/${TEST_APP_ID}/details`]}>
        <Routes>
          <Route
            path="/decision/:applicationId/details"
            element={<EnrollmentDetails />}
          />
          {/* The flag-off / not-accepted fallback target, so a <Navigate> away
              resolves instead of blanking the tree. */}
          <Route
            path="/my-application/:applicationId"
            element={<p>application status</p>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const bodyText = () => document.body.textContent ?? "";

/** Every href the page offers, so "no payment link" can be asserted globally. */
const allHrefs = () =>
  Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");

/** The sentence the precedent uses in place of a BUTTON, and only a button. */
const BROWSER_FALLBACK = "Complete this step from a web browser.";

/** The refund term, which only holds when there are figures behind it. */
const REFUND_TERM = /It is not refundable on its own/i;

describe("EnrollmentDetails — the iOS guard on the fee schedule and the CTA", () => {
  beforeEach(() => {
    mockIsIOS = false;
    mockTermsResponse = { data: L3AI_TERMS, error: null };
  });

  afterEach(() => {
    cleanup();
  });

  it("on web: the per-SKU figures and the claim CTA both render", () => {
    renderPage();

    expect(screen.getByText("₹700")).toBeInTheDocument();
    expect(screen.getByText("₹30,000")).toBeInTheDocument();
    // 30000 − 700 − 8000: the balance checkout will actually charge.
    expect(screen.getByText("₹21,300")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /claim my seat/i }),
    ).toHaveAttribute("href", `/decision/${TEST_APP_ID}/claim`);
  });

  it("on iOS: no rupee amount appears anywhere in the body", () => {
    mockIsIOS = true;
    renderPage();

    // The whole surface, not just the fee table: the step titles interpolate
    // the same figures ("You pay ₹8,000", "You clear the balance of ₹21,300").
    expect(bodyText()).not.toContain("₹");
    expect(screen.queryByText("Application fee, already paid")).toBeNull();
    expect(screen.getByText("You confirm the seat")).toBeInTheDocument();
    expect(screen.getByText("You clear the balance")).toBeInTheDocument();
  });

  it("on iOS: no payment entry point, and the shipped fallback copy instead", () => {
    mockIsIOS = true;
    renderPage();

    expect(screen.queryByRole("link", { name: /claim my seat/i })).toBeNull();
    expect(allHrefs().some((h) => h.includes("/checkout"))).toBe(false);
    expect(allHrefs().some((h) => h.includes("/claim"))).toBe(false);
    expect(allHrefs().some((h) => /razorpay|rzp\.io/i.test(h))).toBe(false);
    // Verbatim the sentence ApplicationStatus.tsx already ships, so the two
    // surfaces cannot drift into two different explanations.
    expect(screen.getAllByText(BROWSER_FALLBACK)).toHaveLength(1);
  });

  it("on iOS: the fallback sentence appears once, in the slot a CTA would be", () => {
    // Everywhere it ships it replaces a BUTTON — `ApplicationStatus.tsx`,
    // `ClaimSeat.tsx` — so "this step" has an antecedent. A second copy in the
    // fee section, which describes a policy rather than a step, has no
    // antecedent and reads as a rendering bug on the exact screen an App Store
    // reviewer opens. The fee section says where the figures are instead.
    mockIsIOS = true;
    renderPage();

    expect(screen.getAllByText(BROWSER_FALLBACK)).toHaveLength(1);
    expect(
      screen.getByText(/exact figures for this cohort are shown when you open/i),
    ).toBeInTheDocument();
  });

  it("on iOS: the non-money terms still render, so the page stays useful", () => {
    mockIsIOS = true;
    renderPage();

    expect(screen.getByText("What happens when you claim")).toBeInTheDocument();
    expect(screen.getByText("The fee structure")).toBeInTheDocument();
    expect(screen.getByText("The schedule")).toBeInTheDocument();
    expect(screen.getByText("Cohort begins")).toBeInTheDocument();
    // The lapse promise is platform-independent and carries no amount.
    expect(
      screen.getByText(/your acceptance carries to the next one/i),
    ).toBeInTheDocument();
  });
});

/**
 * The offering read is allowed to fail — `queryFn` catches the error and returns
 * null rather than throwing, so the page renders with every amount unset. The
 * fee copy is gated on that state on BOTH platforms, because a refund term is a
 * claim about figures and there are none to claim about.
 */
describe("EnrollmentDetails — when the offering read fails", () => {
  beforeEach(() => {
    mockIsIOS = false;
    mockTermsResponse = { data: null, error: { message: "offerings unavailable" } };
  });

  afterEach(() => {
    cleanup();
  });

  it("on web: no fee table, no fee term, and the figures are pointed at", async () => {
    // The shipped behaviour, asserted so the iOS branch below has something to
    // be measured against rather than being read as the odd one out.
    renderPage({ seed: false });

    await waitFor(() =>
      expect(screen.getByText("The fee structure")).toBeInTheDocument(),
    );
    expect(bodyText()).not.toContain("₹");
    expect(screen.queryByText(REFUND_TERM)).toBeNull();
    expect(
      screen.getByText(/exact figures for this cohort are on your claim page/i),
    ).toBeInTheDocument();
  });

  it("on iOS: states no fee term it cannot back, and still says where to look", async () => {
    mockIsIOS = true;
    renderPage({ seed: false });

    await waitFor(() =>
      expect(screen.getByText("The fee structure")).toBeInTheDocument(),
    );
    // The refund assertion is gated on the same read the web copy is: with no
    // figures loaded there is nothing behind "it is not refundable on its own".
    expect(screen.queryByText(REFUND_TERM)).toBeNull();
    // And the reader is not left with a fee section that points nowhere.
    expect(
      screen.getByText(/exact figures for this cohort are shown when you open/i),
    ).toBeInTheDocument();
    expect(bodyText()).not.toContain("₹");
    expect(screen.getAllByText(BROWSER_FALLBACK)).toHaveLength(1);
  });

  it("on iOS: the fee term returns once the figures do", async () => {
    // The gate is the data, not the platform: an iOS reader with a healthy
    // offering read still gets the term the web reader gets.
    mockIsIOS = true;
    mockTermsResponse = { data: L3AI_TERMS, error: null };
    renderPage({ seed: false });

    await waitFor(() =>
      expect(screen.getByText(REFUND_TERM)).toBeInTheDocument(),
    );
    expect(bodyText()).not.toContain("₹");
  });
});
