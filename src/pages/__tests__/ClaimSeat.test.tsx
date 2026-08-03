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
 *  3. **NEITHER native shell renders a price or a purchase CTA — Android
 *     included.** The guard is `isNative()`, never `isIOS()`. Google Play's
 *     Reader Rule (Path B) means the Android build may carry no purchase UI at
 *     all, not even a price chip, so an iOS-only test — which is simply false on
 *     Android — left seven rupee glyphs and a "Claim my seat" button live inside
 *     a shipped Play app. Both shells are exercised here for that reason.
 *
 *     Neither shell gets an outbound "Continue on web" link, Android included,
 *     and THAT is the half most likely to be undone by someone reading only the
 *     Reader Rule. On Android such a link does not leave the app:
 *     `https://app.leveluplearning.in` is the very origin the WebView serves the
 *     bundled build from (`capacitor.config.ts` `server.hostname`) and is
 *     covered by its own `allowNavigation` mask, so `Bridge.launchIntent()`
 *     declines to fire `ACTION_VIEW` and the WebView navigates internally; no
 *     `setSupportMultipleWindows` / `onCreateWindow` exists anywhere, so
 *     `target="_blank"` does not escape either. The SPA would reboot in-shell
 *     with `isNative()` still true, and `CheckoutPage`'s native fallback would
 *     drop `?type=confirmation&app=` and re-route to the full-price `/p/{slug}`
 *     first-purchase page — charging a confirmed student the wrong amount, which
 *     is the K-2 dead end reproduced one platform over. So "no external href on
 *     EITHER native shell" is asserted globally, not just on iOS, and what
 *     stands in the slot is an instruction plus a pointer to where the figure
 *     is. Asserting only the href STRING would prove nothing about escape, which
 *     is why the rule pinned here is the absence of the link.
 *  4. **The lapse does not dead-end, and does not contradict itself.** A closed
 *     window keeps the acceptance valid for the next batch — and the page must
 *     still offer the SAME single existing-checkout path it offered before,
 *     because `accepted_at` is stamped once with no write path to it (a student
 *     re-admitted later arrives already lapsed), release is manual (SEAT-1),
 *     and `ApplicationStatus.tsx` goes on offering that identical link for an
 *     `accepted` row with no lapse check. Two live surfaces disagreeing about
 *     one seat is the bug; the lapse changes the copy, never the path. The
 *     ORDER is part of the contract: because release is manual, the lapsed
 *     screen may not assert that the seat has already gone, and the
 *     check-where-you-stand line must sit ABOVE the ₹8k CTA, not under it.
 *     Equally, the pre-deadline surfaces may not defuse the countdown by
 *     announcing up front that the payment step outlives it — that is the v1
 *     conversion lever, and the promise made there is that the ACCEPTANCE
 *     survives, nothing more.
 *
 *     And the two phases must describe the SAME mechanic. SEAT-1 means nothing
 *     happens at the deadline by itself, so the pre-deadline copy may not
 *     promise that the clock puts the seat back while the lapsed copy says
 *     seats move by hand and this one may well still be open. That is the K-2
 *     defect — two surfaces disagreeing about one seat — relocated into copy,
 *     and it is asserted on both phases here. `AcceptanceCard.tsx` carries the
 *     same hedged sentence; it has no test file, so this docblock is the note
 *     that the two must be changed together.
 *
 *     Finally the lapsed page owes a REMEDY, not encouragement. Nothing
 *     downstream refuses the charge — `create-razorpay-order`'s confirmation
 *     branch checks ownership, the app fee and a duplicate confirmation, and
 *     has no window or status test — so a page that surfaces the path on a seat
 *     it has just said it cannot vouch for must say what happens if the money
 *     goes in and the answer turns out to be no. It must NOT editorialise the
 *     button ("it still works" reads as a claim about the seat), and it must
 *     not point at a "step below": on iOS there is no step below, only the
 *     anti-steering line.
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

/**
 * The one sentence the app is allowed to say to a NATIVE student about this
 * money step. `ApplicationStatus.tsx` ships it at three callsites; this page
 * states it verbatim rather than delegating to `ContinueOnWebCTA`, whose native
 * branch drops the `body` prop and hardcodes an already-enrolled claim. Pinned
 * here so the two surfaces cannot drift into two different explanations of one
 * step.
 */
const BROWSER_FALLBACK = "Complete this step from a web browser.";

/**
 * The other half of what replaces the money block on native, and the half that
 * is easy to drop: an instruction to go and complete a payment step is useless
 * to a reader who has not been told where the amount is stated.
 * `EnrollmentDetails.tsx` keeps the equivalent pointer on the same platforms, so
 * this pin is what stops the two surfaces handing one student two different
 * levels of information about one step.
 */
const FIGURE_POINTER =
  /exact amount due to confirm is shown on the checkout screen when you open this page in a web browser/i;

/**
 * `ContinueOnWebCTA`'s hardcoded native paragraph. It is FALSE on this page —
 * the reader is an accepted student who has not paid the confirmation fee — and
 * on the lapsed branch it contradicts the copy directly above it. Asserted
 * absent, because rendering it is a silent regression: the component swallows
 * `body`, so passing the right copy does not stop the wrong copy shipping.
 */
const ENROLLED_CLAIM = /everything you're enrolled in lives right here in the app/i;

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
/**
 * The shell the page believes it is running in. ONE variable drives BOTH
 * platform helpers, so no test can describe an impossible device (`isIOS` true
 * while `isNative` is false), and so the thing being varied reads as "native"
 * rather than "iOS" — the Reader Rule makes Android the shell that carried the
 * exposure. The page itself now reads only `isNative()`, but `vi.mock` REPLACES
 * the whole module, so any helper left unexported resolves to `undefined` and
 * throws "is not a function" the moment something reaches for it. Both are
 * exported, and both are driven off this one variable, so the mock can never be
 * the reason a test fails and can never describe a device that cannot exist.
 */
let mockPlatform: "web" | "android" | "ios" = "web";
const NATIVE_PLATFORMS = ["android", "ios"] as const;
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
  isIOS: () => mockPlatform === "ios",
  isNative: () => mockPlatform !== "web",
}));

/**
 * The page reads only the offering's money terms:
 * `.from("offerings").select(...).eq("id", ...).single()`. Hoisted as a spy so
 * "a native shell never issues this read at all" is assertable — on native every
 * figure it returns is suppressed, so fetching it would be a native-only round
 * trip for data that never paints.
 */
const { fromSpy } = vi.hoisted(() => ({ fromSpy: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromSpy },
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

/**
 * In-shell routes only, kept separate from absolute URLs so the two rules can be
 * asserted independently: no relative route may lead to checkout, and (below) no
 * absolute one may exist at all on native.
 */
const inAppHrefs = () => allHrefs().filter((h) => h.startsWith("/"));

/**
 * Anything absolute. On native this must be EMPTY on both shells: iOS forbids
 * the steer, and on Android a link to the web origin is served back into the
 * same WebView, where the SPA reboots with `isNative()` true and `CheckoutPage`
 * re-routes to the full-price page.
 */
const externalHrefs = () => allHrefs().filter((h) => /^https?:/.test(h));

/**
 * Reading order, which on the money surface is part of the copy. `getByText`
 * proves a sentence exists; only document position proves the student meets it
 * before the button rather than under it.
 */
const precedes = (first: Element, second: Element) =>
  Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

describe("ClaimSeat — the held-seat window and the existing checkout link", () => {
  beforeEach(() => {
    mockDecision = acceptedDecision;
    mockPlatform = "web";
    mockIsOffline = false;
    mockTerms = L3AI_TERMS;
    fromSpy.mockReset();
    fromSpy.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: mockTerms, error: null }),
        }),
      }),
    }));
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

  it("the lapsed page offers that SAME single route, not a second one", () => {
    // The whole point of the shared payment block: a closed window must not
    // grow its own money path, and must not lose the existing one. Asserting
    // equality (not `.toContain`) is what would catch a hosted link or a
    // duplicated CTA sneaking into the lapsed branch.
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() - 60_000),
    };
    renderPage();

    const checkoutHrefs = allHrefs().filter((h) => h.includes("/checkout"));
    expect(checkoutHrefs).toEqual([EXISTING_CHECKOUT_HREF]);
    expect(allHrefs().some((h) => /razorpay|rzp\.io/i.test(h))).toBe(false);
  });

  it("crossing the boundary live rewrites copy in place instead of restacking", async () => {
    // The page schedules this transition for itself, so it owns the
    // consequence. The spinner gate above exists precisely so a block arriving
    // late cannot push the claim button down under a reader's thumb; a boundary
    // firing mid-read does not get to do it either. Both phases therefore fill
    // the SAME slots — window bar, heading, lead, the shared payment block,
    // footnote — and the bar in particular must not unmount and pull the page
    // up by its own height at the moment the copy below it is growing.
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() + 60_000),
    };
    renderPage();
    expect(screen.getByText("seat held")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    expect(screen.getByText("Your window has closed.")).toBeInTheDocument();
    // Same bar, same slot, saying the closed thing.
    expect(screen.getByText("seat window")).toBeInTheDocument();
    expect(screen.queryByText("seat held")).toBeNull();
    expect(screen.queryByRole("timer", { hidden: true })).toBeNull();
    // And the payment path was re-framed, never withdrawn.
    expect(screen.getByRole("link", { name: /claim my seat/i })).toHaveAttribute(
      "href",
      EXISTING_CHECKOUT_HREF,
    );
  });

  it("in EITHER native shell: no rupee figure and no purchase-labelled CTA", () => {
    // The guard is `isNative()`, so Android is asserted alongside iOS. An
    // `isIOS()` test is simply FALSE inside the Play shell, which is how seven
    // rupee glyphs and a "Claim my seat" button reached a live Play app with
    // ~2.05k installs: the Reader Rule (Path B) allows no purchase UI there at
    // all, not even a price chip that looks like it could lead to checkout.
    for (const platform of NATIVE_PLATFORMS) {
      cleanup();
      mockPlatform = platform;
      renderPage();

      expect(bodyText()).not.toContain("₹");
      expect(screen.queryByText("Due now to confirm")).toBeNull();
      expect(
        screen.queryByText(/balance, due before the cohort begins/i),
      ).toBeNull();
      // No in-shell route into checkout, and no button that names the purchase.
      expect(screen.queryByRole("link", { name: /claim my seat/i })).toBeNull();
      expect(inAppHrefs().some((h) => h.startsWith("/checkout"))).toBe(false);
    }
  });

  it("in EITHER native shell there is NO outbound link — ANDROID included", () => {
    // The half a future reader is most likely to undo, because Path B does
    // permit an out-link in principle. It does not work in THIS shell.
    // `ContinueOnWebCTA` targets https://app.leveluplearning.in, which is both
    // the origin the Android WebView serves the bundled build from
    // (capacitor.config.ts `server.hostname`) and a match for its own
    // `allowNavigation: ["*.leveluplearning.in"]`. `Bridge.launchIntent()` fires
    // ACTION_VIEW only when the host differs from the app URL's host AND misses
    // that mask; both tests pass here, so it returns false and the WebView
    // navigates INTERNALLY off the bundled assets. Nothing sets
    // `setSupportMultipleWindows` or overrides `onCreateWindow`, so
    // `target="_blank"` does not escape either.
    //
    // The consequence is the money bug: the SPA reboots in-shell, `isNative()`
    // is still TRUE, and `CheckoutPage`'s fallback drops
    // `?type=confirmation&app=` and re-routes to the full-price `/p/{slug}`
    // first-purchase page — the K-2 dead end, charging a confirmed student the
    // wrong amount. Asserting an href STRING would not have caught that; only
    // the absence of the link does.
    for (const platform of NATIVE_PLATFORMS) {
      cleanup();
      mockPlatform = platform;
      renderPage();

      expect(externalHrefs()).toEqual([]);
      expect(screen.queryByRole("link", { name: /continue on web/i })).toBeNull();
      expect(bodyText()).not.toContain("₹");
    }
  });

  it("in EITHER native shell it states the browser sentence AND where the figure is", () => {
    // Losing the link must not lose the instruction, and the instruction on its
    // own is not enough: a reader sent to a browser to pay is owed the sentence
    // saying where the amount is stated. `EnrollmentDetails.tsx` keeps that
    // pointer on the same platforms, so dropping it here would hand one student
    // two levels of information about one step, one surface apart.
    //
    // The failure mode on the sentence is quiet: `ContinueOnWebCTA` returns
    // early on native and IGNORES `body`, so a page that delegates the slot to
    // it ships "Everything you're enrolled in lives right here in the app" no
    // matter what copy it passed — false for a student who has not paid the
    // confirmation fee, and on the lapsed branch a flat contradiction of the
    // paragraph above.
    for (const platform of NATIVE_PLATFORMS) {
      cleanup();
      mockPlatform = platform;
      renderPage();

      expect(screen.getByText(BROWSER_FALLBACK)).toBeInTheDocument();
      expect(screen.getByText(FIGURE_POINTER)).toBeInTheDocument();
      expect(bodyText()).not.toMatch(ENROLLED_CLAIM);
    }
  });

  it("on the LAPSED iOS page the same sentence stands, still with no enrolment claim", () => {
    // The branch where the wrong copy reads worst: "Your window has closed." and
    // "your seat may still be open" sitting directly above a card telling the
    // same student they are already enrolled.
    mockPlatform = "ios";
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() - 60_000),
    };
    renderPage();

    expect(screen.getByText("Your window has closed.")).toBeInTheDocument();
    expect(screen.getByText(BROWSER_FALLBACK)).toBeInTheDocument();
    expect(screen.getByText(FIGURE_POINTER)).toBeInTheDocument();
    expect(bodyText()).not.toMatch(ENROLLED_CLAIM);
  });

  it("in EITHER native shell the LAPSED page is equally silent", () => {
    // The lapsed branch renders the same shared block, so the guard must hold
    // on both phases. This is the branch most likely to be written by hand and
    // to forget it — and the lapsed native reader must still keep the same way
    // forward the open branch gives them, which is the browser, not a link.
    for (const platform of NATIVE_PLATFORMS) {
      cleanup();
      mockPlatform = platform;
      mockDecision = {
        ...acceptedDecision,
        seatHeldUntil: new Date(NOW.getTime() - 60_000),
      };
      renderPage();

      expect(screen.getByText("Your window has closed.")).toBeInTheDocument();
      expect(bodyText()).not.toContain("₹");
      expect(inAppHrefs().some((h) => h.startsWith("/checkout"))).toBe(false);
      expect(externalHrefs()).toEqual([]);
      expect(screen.getByText(BROWSER_FALLBACK)).toBeInTheDocument();
      expect(screen.getByText(FIGURE_POINTER)).toBeInTheDocument();
    }
  });

  it("the lapsed copy never points at a 'step below' that native does not render", () => {
    // In neither native shell is the block underneath the ₹8k step: it is a
    // pointer to where the figure is stated plus one line asking the reader to
    // open a browser, which is a way out of the shell rather than a step within
    // it. So any sentence introducing the thing underneath ("the step below is
    // the same one it always was", "it still works") describes something that is
    // not there — and it is unconditional copy, so it reaches every native
    // reader. The same sentence is a liability on web for a
    // different reason: "it still works" reads to a fast reader as a claim
    // about the SEAT, on the screen that has just said the seat may already be
    // gone.
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() - 60_000),
    };

    for (const platform of ["web", ...NATIVE_PLATFORMS] as const) {
      cleanup();
      mockPlatform = platform;
      renderPage();

      const text = bodyText();
      expect(text).not.toMatch(/still works/i);
      expect(text).not.toMatch(/step below|below is the same/i);
    }
  });

  it("the lapsed page states the remedy for paying on a seat that has gone", () => {
    // `create-razorpay-order` will happily take the ₹8k: its confirmation
    // branch checks ownership, the app fee and a duplicate confirmation, and
    // has no window or status test. So the page that surfaces the path on a
    // seat it has just said it cannot vouch for owes the student the other
    // outcome, in the same breath as the CTA.
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() - 60_000),
    };
    renderPage();

    const remedy = screen.getByText(/that payment is not lost/i);
    expect(remedy).toBeInTheDocument();
    expect(remedy.textContent ?? "").toMatch(
      /moves with you to the next batch, or comes back to you/i,
    );
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

  it("does not defuse its own countdown before the deadline", () => {
    // The promise made while the window is still open is that the ACCEPTANCE
    // survives — not that the ₹8k step does. "seat held · closes {countdown}"
    // is the v1 conversion lever (REQ-DEC-5); telling a student here that
    // paying stays available afterwards spends the lever before it is pulled.
    // The soft landing belongs to the lapsed screen, which is where a student
    // who actually missed the window reads it.
    renderPage();

    expect(screen.getByText("seat held")).toBeInTheDocument();
    const text = bodyText();
    expect(text).not.toMatch(/stays open to you/i);
    expect(text).not.toMatch(/released by hand/i);
    expect(text).not.toMatch(/still works/i);
  });

  it("the pre-deadline copy describes the SAME mechanic the lapsed copy does", () => {
    // The lever may create urgency; it may not create a mechanic. Nothing
    // happens at the deadline by itself (SEAT-1), so "the seat goes back to the
    // list" is a promise about an event no clock performs — and the lapsed
    // screen tells the same student the opposite, that seats move by hand and
    // theirs may well still be open. Hedged and future-tense is the version
    // that is true on both screens. `AcceptanceCard.tsx` carries the same
    // sentence and has no test file of its own; change them together.
    renderPage();

    const footnote = screen.getByText(/if the window closes before you confirm/i);
    expect(footnote.textContent ?? "").toMatch(
      /we may pass the seat to someone else in this batch/i,
    );
    expect(bodyText()).not.toMatch(/goes back to the list/i);
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
    // The gate is justified precisely because the read feeds the render here.
    expect(fromSpy).toHaveBeenCalled();
  });

  it("in a native shell it never reads the money terms, and never waits to paint", () => {
    // Every figure that read produces is suppressed on native, and there is no
    // fee card and no button for a late-arriving amount to shove down the page.
    // So the read is not issued at all, and native is off the spinner gate: the
    // highest-stakes screen in the funnel must not carry a native-only latency
    // path for data it discards. Asserted on Android too, where the guard used
    // to be false and the round trip therefore really happened.
    for (const platform of NATIVE_PLATFORMS) {
      cleanup();
      fromSpy.mockClear();
      mockPlatform = platform;
      renderPage({ seedTerms: false });

      expect(fromSpy).not.toHaveBeenCalled();
      expect(bodyText()).not.toContain("₹");
      // The page still paints its own content rather than hanging on a spinner.
      expect(
        screen.getByText(/your seat is held for you/i),
      ).toBeInTheDocument();
    }
  });

  it("after the window lapses: honest copy, and the SAME path forward (no dead end)", () => {
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() - 60_000),
    };
    renderPage();

    // The framing is unchanged and stays honest: the window did close, and the
    // urgency device is not retroactively pretended away.
    expect(screen.getByText("Your window has closed.")).toBeInTheDocument();
    expect(screen.getByText(/does not expire with it/i)).toBeInTheDocument();
    expect(screen.getByText(/carries to the next batch/i)).toBeInTheDocument();
    // The clock itself is gone: nothing is still counting down.
    expect(screen.queryByRole("timer", { hidden: true })).toBeNull();
    expect(screen.queryByText("seat held")).toBeNull();

    // …and the student is NOT stranded. `accepted_at` is stamped once with no
    // write path to it, so a student re-admitted into a later batch arrives
    // with the original anchor and this window already lapsed; and
    // ApplicationStatus.tsx keeps offering this very link for an `accepted`
    // row with no lapse check. Withholding it here is what makes the two
    // surfaces disagree about one seat and leaves SQL as the only remedy.
    expect(screen.getByRole("link", { name: /claim my seat/i })).toHaveAttribute(
      "href",
      EXISTING_CHECKOUT_HREF,
    );
    // Release is manual (SEAT-1), so the page says that rather than promising
    // the seat is definitely still there.
    expect(screen.getByText(/released by hand/i)).toBeInTheDocument();
  });

  it("the lapsed screen never claims the clock already took the seat", () => {
    // Nothing happens at the deadline: release is a manual admin action
    // (SEAT-1), so a flat past-tense "the seat goes back to the list" is a
    // statement about an event no clock performs — and it contradicts the very
    // next paragraph, which says release is by hand. Selling a ₹8k seat on a
    // screen that just declared it gone is the K-2 bug class reproduced inside
    // one page. The pre-deadline copy may say it, in the future tense; the
    // lapsed copy may not.
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() - 60_000),
    };
    renderPage();

    const text = bodyText();
    expect(text).not.toMatch(/goes back to the list/i);
    expect(text).not.toMatch(
      /(the|your) seat (is|has|was) ?(been )?(released|gone|passed on|given)/i,
    );
    // What it says instead: it does not know, and says so. The only mention of
    // the seat being passed on is hedged, which is the true statement.
    expect(
      screen.getByText(/may still be open, or it may already have been passed/i),
    ).toBeInTheDocument();
  });

  it("the lapsed screen offers the check-first path ABOVE the pay CTA", () => {
    // Order is the finding. "Reply to your decision email first … before you
    // pay anything" is advice about the button; underneath it, it is a
    // footnote to a decision already made.
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() - 60_000),
    };
    renderPage();

    const checkFirst = screen.getByText(/reply to your decision email first/i);
    const feeCard = screen.getByText("Due now to confirm");
    const claim = screen.getByRole("link", { name: /claim my seat/i });

    expect(precedes(checkFirst, feeCard)).toBe(true);
    expect(precedes(checkFirst, claim)).toBe(true);
    // And the manual-release caveat comes before the check-first line, so the
    // page reads: window closed → nobody knows yet → here is how to find out →
    // here is the step if you want it anyway.
    expect(precedes(screen.getByText(/released by hand/i), checkFirst)).toBe(
      true,
    );
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

  it("renders no seat number on the LAPSED page either", () => {
    // The closed window bar puts a date next to the word "seat", which is
    // exactly the shape §9i bans anywhere near it. Same sweep, other phase.
    mockDecision = {
      ...acceptedDecision,
      seatHeldUntil: new Date(NOW.getTime() - 60_000),
    };
    renderPage();

    const text = bodyText();
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
