import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decision } from "@/hooks/useDecision";

/**
 * D-3 — the held-seat window and the claim CTA (REQ-DEC-5 / INTEG-PAY-1).
 *
 * The seat-number grep is the least interesting thing locked down here:
 *
 *  1. **The countdown is DERIVED, not stored.** It is computed from
 *     `decision.seatHeldUntil` on every render. So a remount — which is what a
 *     refresh is — must show the window as it stands NOW, not a value frozen at
 *     first paint and not a per-device timer that restarts. The test advances
 *     the system clock across the remount and asserts the countdown moved with
 *     it, and that nothing was written to localStorage. A stored countdown fails
 *     both halves.
 *
 *     ⚠️ `useDecision` is MOCKED here, so a green run proves this PAGE handles
 *     the anchor correctly — not that the hook produces one. The hook derives
 *     `seatHeldUntil` from the row's acceptance stamp plus the offering's
 *     confirmation window and returns null when there is no stamp, so the
 *     no-anchor case is covered by its own test below rather than assumed away.
 *  2. **The claim CTA is the EXISTING checkout route.** `INTEG-PAY-1` means the
 *     app-originated order diff is 0: this page must link to the same
 *     `/checkout/{offering_id}?type=confirmation&app={application_id}` URL
 *     `ApplicationStatus.tsx` already uses, and must not reach for Razorpay
 *     itself. The href is asserted character for character.
 *  3. **iOS renders the fallback, and no payment link at all.** A new money CTA
 *     that isn't wrapped in the `isIOS()` guard is an App Store rejection risk.
 *  4. **The lapse copy is present** — the promise that a closed window releases
 *     the seat but keeps the acceptance valid for the next batch.
 *  5. **The money is the money.** The balance quoted here must equal what
 *     `/checkout?type=balance` will actually charge (`price − app_fee −
 *     confirmation`), and a zero/unset confirmation amount must never render as
 *     "₹0" next to a pay button.
 *
 * `useDecision`, `@/lib/platform` and the supabase client are mocked so the page
 * renders without the flag, the network or auth, mirroring the isolation of
 * `ApplicationStatus.ambiguous.test.tsx`.
 */

const TEST_APP_ID = "app-1";
const TEST_OFFERING_ID = "off-1";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** The one URL shape INTEG-PAY-1 allows this page to send anyone to. */
const EXISTING_CHECKOUT_HREF = `/checkout/${TEST_OFFERING_ID}?type=confirmation&app=${TEST_APP_ID}`;

// Frozen "now" so every countdown assertion is exact.
const NOW = new Date("2026-07-27T10:00:00.000Z");
// 2h30m out — inside the last day, so the live clock is the useful display.
const HELD_UNTIL = new Date("2026-07-27T12:30:00.000Z");

const acceptedDecision: Decision = {
  applicationId: TEST_APP_ID,
  offeringId: TEST_OFFERING_ID,
  verdict: "accepted",
  name: "Aditi Rao",
  firstName: "Aditi",
  cohort: "Live Filmmaking Cohort",
  craft: "Editor",
  city: "Chennai",
  seatHeldUntil: HELD_UNTIL,
};

/**
 * An L3AI-shaped SKU. The balance a student owes after both earlier stages is
 * 30000 − 700 − 8000 = ₹21,300; dropping the application fee would quote
 * ₹22,000 and mis-state what checkout charges by exactly the fee.
 */
const L3AI_TERMS = {
  app_fee_inr: 700,
  confirmation_amount_inr: 8000,
  price_inr: 30000,
};

// Overridden per test before render.
let mockDecision: Decision | null = acceptedDecision;
let mockIsIOS = false;
let mockIsOffline = false;
let mockTerms: Record<string, number | null> | null = L3AI_TERMS;

vi.mock("@/hooks/useDecision", () => ({
  useDecision: () => ({
    decision: mockDecision,
    isLoading: false,
    isOffline: mockIsOffline,
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

// The page reads only the offering's money terms:
// .from("offerings").select(...).eq("id", ...).single()
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: mockTerms, error: null }),
        }),
      }),
    }),
  },
}));

import ClaimSeat from "@/pages/decision/ClaimSeat";

/**
 * The terms are seeded into the query cache rather than awaited, so every
 * assertion runs against the page's FIRST paint. That is deliberate: the page
 * must never paint a money figure it is about to replace, so "first paint" is
 * the state worth testing. `seedTerms: false` exercises the in-flight state.
 */
function renderPage({ seedTerms = true }: { seedTerms?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (seedTerms) {
    queryClient.setQueryData(
      ["decision", "offering-terms", TEST_OFFERING_ID],
      mockTerms,
    );
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/decision/${TEST_APP_ID}/claim`]}>
        <Routes>
          <Route path="/decision/:applicationId/claim" element={<ClaimSeat />} />
          {/* The flag-off / not-accepted fallback target, so a <Navigate> away
              from the claim page resolves instead of blanking the tree. */}
          <Route
            path="/my-application/:applicationId"
            element={<p>application status</p>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * This jsdom build exposes no `localStorage`, so we install a recording stub.
 * That is stricter than reading `.length` back would have been: it proves the
 * page never WRITES the window anywhere per-device, which is the whole reason
 * the countdown can be trusted after a refresh or on a second phone.
 */
const setItem = vi.fn();
function installStorageSpy() {
  setItem.mockClear();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: () => null,
      setItem,
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: () => null,
      length: 0,
    },
  });
}

/**
 * The <Countdown> digits, concatenated: "hh:mm:ss". `hidden: true` because the
 * ticking clock is deliberately hidden from assistive tech — <Countdown> is a
 * session-start component whose own aria-label says "Starts in …", so the strip
 * supplies its own sentence instead (asserted separately).
 */
const countdownText = () =>
  screen.getByRole("timer", { hidden: true }).textContent;

const bodyText = () => document.body.textContent ?? "";

/** Every `aria-label` in the tree — an accessible name never reaches textContent. */
const ariaLabels = () =>
  Array.from(document.querySelectorAll("[aria-label]")).map(
    (el) => el.getAttribute("aria-label") ?? "",
  );

/** Every href the page offers, so "no payment link" can be asserted globally. */
const allHrefs = () =>
  Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");

describe("ClaimSeat — the held-seat window and the existing checkout link", () => {
  beforeEach(() => {
    mockDecision = acceptedDecision;
    mockIsIOS = false;
    mockIsOffline = false;
    mockTerms = L3AI_TERMS;
    installStorageSpy();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the honest held-seat window: 'seat held · closes {countdown}'", () => {
    renderPage();

    expect(screen.getByText("seat held")).toBeInTheDocument();
    expect(screen.getByText("closes")).toBeInTheDocument();
    expect(countdownText()).toBe("02:30:00");
  });

  it("the countdown survives a remount because it is DERIVED, not stored", () => {
    const first = renderPage();
    expect(countdownText()).toBe("02:30:00");

    // Nothing about the window was persisted per-device. If it had been, the
    // countdown could reset on a second device or after a storage clear, and
    // the "closes" copy would stop being true.
    expect(setItem).not.toHaveBeenCalled();

    // An hour passes, then the page is remounted — which is what a refresh is.
    first.unmount();
    vi.setSystemTime(new Date(NOW.getTime() + 60 * 60 * 1000));
    renderPage();

    // Derived from the server-side deadline, so it picks up where real time
    // left it. A stored countdown would have replayed 02:30:00 from the top.
    expect(countdownText()).toBe("01:30:00");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("a multi-day window states the close time instead of an hour count past 24", () => {
    // The `confirmation_deadline_days` default is 2. <Countdown> has no days
    // rollover, so rendering it here would read "48:00:00".
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() + 2 * MS_PER_DAY),
    };
    renderPage();

    expect(screen.getByText("seat held")).toBeInTheDocument();
    expect(screen.getByText("closes")).toBeInTheDocument();
    expect(screen.queryByRole("timer", { hidden: true })).toBeNull();
    expect(bodyText()).not.toMatch(/\b\d{2,}:\d{2}:\d{2}\b/);
  });

  it("gives assistive tech a sentence that says the window is CLOSING, with a days unit", () => {
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() + 2 * MS_PER_DAY),
    };
    renderPage();

    expect(bodyText()).toMatch(/Seat held\. Closes in 2 days, on /);
  });

  it("buries <Countdown>'s 'Starts in' label under aria-hidden and speaks its own", () => {
    // The default 2h30m window, so <Countdown> IS rendered and its hardcoded
    // label is actually in the tree — the case worth guarding. An `aria-label`
    // never reaches `textContent`, so asserting on body text here would pass
    // whether or not the label leaked.
    renderPage();

    const timer = screen.getByRole("timer", { hidden: true });
    // <Countdown> is a session-START component: its label says "Starts in …",
    // the opposite of a window closing, and it exposes no prop to override it.
    expect(timer.getAttribute("aria-label")).toMatch(/^Starts in /);
    expect(ariaLabels().filter((l) => /starts in/i.test(l))).toHaveLength(1);

    // It is only safe to render because the strip hides that whole span from
    // the accessibility tree — `queryByRole` without `hidden` resolves against
    // the tree, so this is null exactly when the aria-hidden wrapper is doing
    // its job.
    expect(timer.closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.queryByRole("timer")).toBeNull();

    // …and the sentence that replaces it says the right thing, in units
    // <Countdown> does not have.
    expect(bodyText()).toMatch(
      /Seat held\. Closes in 2 hours and 30 minutes, on /,
    );
  });

  it("with no server-side anchor it states the hold WITHOUT inventing a deadline", () => {
    // `useDecision` returns null whenever the row carries no acceptance stamp —
    // anyone accepted before the column existed, and any offering with no
    // confirmation window configured. A real, reachable state, and the rule it
    // locks down is that an absent window is said to be absent: no strip, no
    // clock, and above all no client-side deadline standing in for a server one.
    mockDecision = { ...acceptedDecision, seatHeldUntil: null };
    renderPage();

    expect(screen.queryByText("seat held")).toBeNull();
    expect(screen.queryByText("closes")).toBeNull();
    expect(screen.queryByRole("timer", { hidden: true })).toBeNull();
    expect(bodyText()).not.toMatch(/\d{2}:\d{2}:\d{2}/);

    // The hold, the claim path and the lapse promise are all unaffected.
    expect(
      screen.getByText(/your seat is held for you while you confirm/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /claim my seat/i })).toHaveAttribute(
      "href",
      EXISTING_CHECKOUT_HREF,
    );
    expect(
      screen.getByText(/if the window closes before you confirm/i),
    ).toBeInTheDocument();
  });

  it("re-arms the phase timer even when a boundary resolves to the SAME phase", async () => {
    // 26h out: outside the live-clock window, so the strip opens on the close
    // time and the scheduler arms for the held → closing boundary in 2h.
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() + 26 * MS_PER_HOUR),
    };
    renderPage();
    expect(screen.queryByRole("timer", { hidden: true })).toBeNull();

    // The system clock steps BACKWARD 2h — routine on Android WebView under an
    // NTP correction. Fake timers shift pending timeouts with it, so the armed
    // boundary still fires after 2h of ticking, but by then `Date.now()` is
    // back where it started and the boundary resolves to "held" again.
    vi.setSystemTime(new Date(NOW.getTime() - 2 * MS_PER_HOUR));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * MS_PER_HOUR);
    });
    // Unchanged phase — React bails out of a same-value setState, so a
    // scheduler keyed on `phase` would never re-run and would arm no successor.
    expect(screen.queryByRole("timer", { hidden: true })).toBeNull();

    // The successor boundary. It only exists if the previous fire re-armed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * MS_PER_HOUR);
    });
    expect(screen.getByRole("timer", { hidden: true })).toBeInTheDocument();
  });

  it("offline with no answer yet: holds the page instead of redirecting", () => {
    // `useDecision` PAUSES offline rather than failing, so a null decision is
    // "no answer". Redirecting on it lands the student on /my-application/:id,
    // whose own fetch also fails offline and renders "Application Not Found".
    mockDecision = null;
    mockIsOffline = true;
    renderPage();

    expect(screen.getByText("Your seat is still held")).toBeInTheDocument();
    expect(screen.queryByText("application status")).toBeNull();
    // Nothing is offered that cannot be completed: no money CTA on this state.
    expect(allHrefs().some((h) => h.includes("/checkout"))).toBe(false);
  });

  it("the claim CTA is EXACTLY the existing confirmation checkout route (INTEG-PAY-1)", () => {
    renderPage();

    const claim = screen.getByRole("link", { name: /claim my seat/i });
    expect(claim).toHaveAttribute("href", EXISTING_CHECKOUT_HREF);

    // And it is the ONLY checkout link on the page: no second money entry
    // point, and nothing pointing at a hosted Razorpay link.
    const checkoutHrefs = allHrefs().filter((h) => h.includes("/checkout"));
    expect(checkoutHrefs).toEqual([EXISTING_CHECKOUT_HREF]);
    expect(allHrefs().some((h) => /razorpay|rzp\.io/i.test(h))).toBe(false);
  });

  it("on iOS: the anti-steering fallback copy renders and NO payment link exists", () => {
    mockIsIOS = true;
    renderPage();

    expect(
      screen.getByText("Complete this step from a web browser."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /claim my seat/i })).toBeNull();
    expect(allHrefs().some((h) => h.includes("/checkout"))).toBe(false);
  });

  it("states the lapse behaviour upfront: the seat releases, the acceptance does not", () => {
    renderPage();

    expect(
      screen.getByText(/if the window closes before you confirm/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/carries to the next batch/i),
    ).toBeInTheDocument();
  });

  it("quotes the balance checkout will actually charge: price − app fee − confirmation", () => {
    renderPage();

    expect(screen.getByText("₹8,000")).toBeInTheDocument();
    // 30000 − 700 − 8000. Omitting the application fee would print ₹22,000,
    // while /checkout?type=balance charges ₹21,300.
    expect(screen.getByText("₹21,300")).toBeInTheDocument();
    expect(bodyText()).not.toContain("₹22,000");
  });

  it("an unset confirmation amount reads back as 0 and must never render as a price", () => {
    // `confirmation_amount_inr` has a DB DEFAULT of 0, and the offering editor
    // writes an explicit 0 for every non-staged offering, so `?? null` would
    // sail straight through and print "Due now to confirm ₹0".
    mockTerms = { app_fee_inr: 0, confirmation_amount_inr: 0, price_inr: 30000 };
    renderPage();

    expect(bodyText()).not.toContain("₹0");
    expect(screen.queryByText("Due now to confirm")).toBeNull();
    expect(
      screen.getByText(/exact amount due to confirm is shown on the checkout screen/i),
    ).toBeInTheDocument();
    // The claim path itself is unaffected: checkout still owns the amount.
    expect(screen.getByRole("link", { name: /claim my seat/i })).toHaveAttribute(
      "href",
      EXISTING_CHECKOUT_HREF,
    );
  });

  it("shows no money figures at all while the offering terms are still in flight", () => {
    renderPage({ seedTerms: false });

    // No half-page: no figure, and no button under the reader's thumb that is
    // about to be pushed down by a fee card popping in above it.
    expect(bodyText()).not.toContain("₹");
    expect(screen.queryByRole("link", { name: /claim my seat/i })).toBeNull();
  });

  it("after the window lapses: no claim CTA, and the acceptance is still valid", () => {
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() - 60_000),
    };
    renderPage();

    expect(screen.getByText("Your window has closed.")).toBeInTheDocument();
    expect(screen.getByText(/does not expire with it/i)).toBeInTheDocument();
    // A released seat must not still offer to take money for itself.
    expect(screen.queryByRole("link", { name: /claim my seat/i })).toBeNull();
    expect(allHrefs().some((h) => h.includes("/checkout"))).toBe(false);
    expect(screen.queryByRole("timer", { hidden: true })).toBeNull();
  });

  it("renders NO seat number anywhere (REQ-DEC-4 / §9i)", () => {
    renderPage();

    const text = bodyText();
    // "Seat 12", "seat #12", "Seat No. 7", "you are number 4", "4th seat".
    expect(text).not.toMatch(/seat\s*(no\.?|number|#)?\s*\d/i);
    expect(text).not.toMatch(/#\s*\d+/);
    expect(text).not.toMatch(/\b\d+(st|nd|rd|th)\s+seat\b/i);
    expect(text).not.toMatch(/\b\d+\s+seats?\s+(left|remaining|available)\b/i);
  });

  it("a decision that is not `accepted` never renders the claim surface", () => {
    mockDecision = { ...acceptedDecision, verdict: "pending" };
    renderPage();

    expect(screen.getByText("application status")).toBeInTheDocument();
    expect(screen.queryByRole("timer", { hidden: true })).toBeNull();
    expect(allHrefs().some((h) => h.includes("/checkout"))).toBe(false);
  });
});
