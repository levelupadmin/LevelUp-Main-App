import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decision } from "@/hooks/useDecision";

/**
 * D-3 — the enrollment-details page, and the NATIVE guard on it.
 *
 * This page reads as an explainer, which is exactly why it went unguarded: it
 * carries no checkout link of its own. But what a screen SHOWS matters as much
 * as where the tap lands, and this page shows the full ₹ fee schedule and a
 * full-width primary CTA into the claim flow. Both shells forbid that. Google
 * Play's Reader Rule (Path B) is the strictest: the Android build may carry no
 * purchase UI whatsoever, not even a price chip. Apple's anti-steering rules
 * (3.1.1 / 3.1.3) forbid the purchase and the link out to one alike.
 *
 * So the guard is `isNative()`, never `isIOS()` — an iOS-only test is FALSE
 * inside the Play shell, which left the whole fee table and a "Claim my seat"
 * button live in a shipped Play app. Android is exercised explicitly below for
 * that reason.
 *
 * So this file pins five things:
 *  1. **On either native shell: zero rupee amounts anywhere in the rendered
 *     body**, including the step titles ("You pay ₹8,000"), not just the fee
 *     table.
 *  2. **On either native shell: no purchase entry point of its own, and no
 *     outbound link either** — no in-shell `/checkout` or `/claim` href, no
 *     purchase-labelled CTA, and no absolute URL. The out-link is absent on
 *     ANDROID too, which is the counter-intuitive half: Path B permits it in
 *     principle, but in this shell it does not leave the app.
 *     `https://app.leveluplearning.in` is the origin the WebView serves the
 *     bundled build from (`capacitor.config.ts` `server.hostname`) and matches
 *     its own `allowNavigation`, so `Bridge.launchIntent()` declines ACTION_VIEW
 *     and the WebView navigates internally — straight back to the in-shell claim
 *     page. `ClaimSeat.tsx` carries the full reasoning, including the
 *     full-price-`/p/{slug}` money bug the equivalent link causes there. What
 *     fills the slot on BOTH shells is the shared link-free sentence
 *     `ApplicationStatus.tsx` already ships, stated by the page rather than
 *     delegated because that component's native branch drops the `body` prop and
 *     hardcodes an already-enrolled claim — false for a student who has not paid
 *     the confirmation fee. Both halves are pinned.
 *  3. **Web is untouched**: the figures and the CTA still render, so the guard
 *     cannot be "fixed" by deleting the fee schedule outright.
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

/**
 * The shell the page believes it is running in, overridden per test. ONE
 * variable drives BOTH platform helpers, so no test can describe an impossible
 * device (`isIOS` true while `isNative` is false), and so the thing being varied
 * reads as "native" rather than "iOS" — the Reader Rule makes Android the shell
 * that carried the exposure. The page itself now reads only `isNative()`, but
 * `vi.mock` REPLACES the whole module, so any helper left unexported resolves to
 * `undefined` and throws "is not a function" the moment something reaches for
 * it. Both are exported, and both are driven off this one variable, so the mock
 * can never be the reason a test fails and can never describe an impossible
 * device.
 */
let mockPlatform: "web" | "android" | "ios" = "web";
const NATIVE_PLATFORMS = ["android", "ios"] as const;

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
  isIOS: () => mockPlatform === "ios",
  isNative: () => mockPlatform !== "web",
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

/**
 * In-shell routes only, kept separate from absolute URLs so the two rules can be
 * asserted independently: no relative route may lead into the claim or checkout
 * flow, and (below) no absolute one may exist at all on native.
 */
const inAppHrefs = () => allHrefs().filter((h) => h.startsWith("/"));

/**
 * Anything absolute. On native this must be EMPTY on both shells — iOS forbids
 * the steer, and on Android the link is served back into the same WebView rather
 * than out to a browser, so it is a link that does not do what it says.
 */
const externalHrefs = () => allHrefs().filter((h) => /^https?:/.test(h));

/**
 * The one sentence the app is allowed to say to a NATIVE student about this
 * money step, and the ONLY instruction they get in place of the CTA.
 * `ApplicationStatus.tsx` ships it verbatim at three callsites, so it is pinned
 * here — as it was before this guard was rewritten — so the two surfaces cannot
 * drift into two different explanations of one step.
 */
const BROWSER_FALLBACK = "Complete this step from a web browser.";

/**
 * `ContinueOnWebCTA`'s hardcoded native paragraph. Asserted ABSENT: it is false
 * for an accepted student who has not paid the confirmation fee, and it reaches
 * the screen silently — that component returns early on native and ignores
 * `body`, so passing the correct copy does not stop the wrong copy shipping.
 */
const ENROLLED_CLAIM = /everything you're enrolled in lives right here in the app/i;

/** The refund term, which only holds when there are figures behind it. */
const REFUND_TERM = /It is not refundable on its own/i;

describe("EnrollmentDetails — the native guard on the fee schedule and the CTA", () => {
  beforeEach(() => {
    mockPlatform = "web";
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

  it("in EITHER native shell: no rupee amount appears anywhere in the body", () => {
    // Android is asserted alongside iOS because the Reader Rule is the stricter
    // of the two and the old `isIOS()` test was false there: all four figures
    // shipped inside the Play build.
    for (const platform of NATIVE_PLATFORMS) {
      cleanup();
      mockPlatform = platform;
      renderPage();

      // The whole surface, not just the fee table: the step titles interpolate
      // the same figures ("You pay ₹8,000", "You clear the balance of ₹21,300").
      expect(bodyText()).not.toContain("₹");
      expect(screen.queryByText("Application fee, already paid")).toBeNull();
      expect(screen.getByText("You confirm the seat")).toBeInTheDocument();
      expect(screen.getByText("You clear the balance")).toBeInTheDocument();
    }
  });

  it("in EITHER native shell: no in-shell purchase entry point at all", () => {
    for (const platform of NATIVE_PLATFORMS) {
      cleanup();
      mockPlatform = platform;
      renderPage();

      expect(screen.queryByRole("link", { name: /claim my seat/i })).toBeNull();
      expect(inAppHrefs().some((h) => h.startsWith("/checkout"))).toBe(false);
      expect(inAppHrefs().some((h) => h.includes("/claim"))).toBe(false);
      expect(allHrefs().some((h) => /razorpay|rzp\.io/i.test(h))).toBe(false);
    }
  });

  it("in EITHER native shell: no outbound link either — ANDROID included", () => {
    // Path B does permit an out-link in principle, which is exactly why this
    // needs pinning on Android and not only on iOS: in THIS shell the link does
    // not leave the app. https://app.leveluplearning.in is the origin the
    // WebView serves the bundled build from (capacitor.config.ts
    // `server.hostname`) and matches its own
    // `allowNavigation: ["*.leveluplearning.in"]`, so `Bridge.launchIntent()`
    // never fires ACTION_VIEW and the WebView navigates internally — back to the
    // in-shell claim page, i.e. a "Continue on web" button that does not
    // continue on web. `target="_blank"` does not help: no
    // `setSupportMultipleWindows` or `onCreateWindow` exists anywhere.
    for (const platform of NATIVE_PLATFORMS) {
      cleanup();
      mockPlatform = platform;
      renderPage();

      expect(externalHrefs()).toEqual([]);
      expect(screen.queryByRole("link", { name: /continue on web/i })).toBeNull();
      // The fee section still says where the figures are; that pointer is its
      // own sentence rather than a duplicate of whatever fills the CTA slot.
      expect(
        screen.getByText(/exact figures for this cohort are shown when you open/i),
      ).toBeInTheDocument();
    }
  });

  it("in EITHER native shell: the CTA slot states the browser sentence, not an enrolment claim", () => {
    // Losing the link must not lose the instruction. This is the sentence
    // `ApplicationStatus.tsx` gives a native student for the same money step,
    // and the pin exists so the two surfaces cannot explain one step two ways.
    //
    // The regression it catches is silent: `ContinueOnWebCTA` returns early on
    // native and IGNORES the `body` prop, so delegating this slot to it renders
    // "Everything you're enrolled in lives right here in the app" whatever copy
    // was passed — told to a student who has not paid the confirmation fee, on
    // the page whose whole subject is what they still owe.
    for (const platform of NATIVE_PLATFORMS) {
      cleanup();
      mockPlatform = platform;
      renderPage();

      expect(screen.getByText(BROWSER_FALLBACK)).toBeInTheDocument();
      expect(bodyText()).not.toMatch(ENROLLED_CLAIM);
    }
  });

  it("in EITHER native shell: the non-money terms still render, so the page stays useful", () => {
    for (const platform of NATIVE_PLATFORMS) {
      cleanup();
      mockPlatform = platform;
      renderPage();

      expect(screen.getByText("What happens when you claim")).toBeInTheDocument();
      expect(screen.getByText("The fee structure")).toBeInTheDocument();
      expect(screen.getByText("The schedule")).toBeInTheDocument();
      expect(screen.getByText("Cohort begins")).toBeInTheDocument();
      // The lapse promise is platform-independent and carries no amount.
      expect(
        screen.getByText(/your acceptance carries to the next one/i),
      ).toBeInTheDocument();
    }
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
    mockPlatform = "web";
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

  it("on native: states no fee term it cannot back, and still says where to look", async () => {
    for (const platform of NATIVE_PLATFORMS) {
      cleanup();
      mockPlatform = platform;
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
      // A failed read never re-opens the purchase surface either.
      expect(inAppHrefs().some((h) => h.includes("/claim"))).toBe(false);
    }
  });

  it("on ANDROID: the fee term returns once the figures do, still without a price", async () => {
    // The gate is the data, not the platform: a Play-shell reader with a
    // healthy offering read still gets the term the web reader gets — and
    // still, per the Reader Rule, none of the numbers behind it.
    mockPlatform = "android";
    mockTermsResponse = { data: L3AI_TERMS, error: null };
    renderPage({ seed: false });

    await waitFor(() =>
      expect(screen.getByText(REFUND_TERM)).toBeInTheDocument(),
    );
    expect(bodyText()).not.toContain("₹");
    expect(externalHrefs()).toEqual([]);
    expect(screen.getByText(BROWSER_FALLBACK)).toBeInTheDocument();
  });
});
