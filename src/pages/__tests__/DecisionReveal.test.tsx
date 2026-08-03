import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { decisionReveal } from "@/lib/motion";
import type { Decision } from "@/hooks/useDecision";

/**
 * D-1 — the sealed decision and its reveal (REQ-DEC-1/2).
 *
 * The contracts locked here are all acceptance criteria:
 *   1. `VITE_DECISION_FLOW` off → NOTHING of the decision experience renders;
 *      the surface falls back to today's application-status path.
 *   2. `prefers-reduced-motion` → the reveal collapses to a ≤200ms crossfade
 *      that STILL reveals the verdict. A motion preference never withholds the
 *      outcome.
 *   3. A rejection gets the dignified screen and NO shareable artifact — no
 *      share/download/copy-link affordance and no "Claim my seat".
 *   4. Offline → the seal holds with an offline note. It must NOT redirect to
 *      /my-application/:id, which cannot load offline either and renders
 *      "Application Not Found" — a not-found page at the emotional peak. A
 *      FAILED read (which `navigator.onLine` cannot see) gets its own state for
 *      the same reason, with a retry.
 *   5. Skip actually SHORTENS the timeline. Relabelling the mode is not enough:
 *      framer strips `transition` from its prop diff, so a control that only
 *      swaps the transition is inert. The assertion is on settled values inside
 *      the crossfade budget, not on a data attribute.
 *   6. `deriveVerdict`'s floors (asserted directly, since they are the
 *      difference between a reveal and a SECOND ₹8k charge): a status that has
 *      already acted on the decision never yields `"accepted"`, however loudly
 *      the reconciler says `accepted`. `deriveSeatHeldUntil`'s arithmetic is
 *      pinned alongside it — the held-seat window is REQ-DEC-5's conversion
 *      lever and must never be fabricated from a missing anchor.
 *   7. **The store guard on beat 3, both halves of it.** Inside a native shell
 *      no purchase-LABELLED affordance may render on this screen (Play Reader
 *      Rule Path B / Apple 3.1.1 bar the affordance, not merely the checkout
 *      link) — AND the route onward must survive the guard, because the working
 *      "Continue on web" bounce lives two surfaces downstream on ClaimSeat and a
 *      deleted CTA would strand the accepted Android student here. Both halves
 *      are asserted, on this page and on `AcceptanceCard.tsx`, which carries the
 *      identical CTA and is pinned by `AcceptanceCard.test.tsx`. The guard is
 *      pinned against a RENAME, not against one string: the sweep reads the
 *      label the page rendered, and the traversals find the CTA by
 *      `data-testid`, so there is no expected-label constant here that could be
 *      updated to let a purchase CTA back onto a native shell. The rename
 *      PATTERNS are pinned in turn (`RENAME_CANDIDATES` / `NEUTRAL_LABELS`),
 *      because a sweep can only ever see the label that ships today: the first
 *      version of this guard wrote `\bpay\b`, which cannot match inside
 *      "payment", so "Complete payment" passed it clean. This screen states no
 *      rupee amount on any platform, and that is asserted too rather than left
 *      to be noticed later.
 *
 * `useDecision`'s HOOK, `flag`, `@/lib/platform` and framer's `useReducedMotion`
 * are mocked so the page renders without the flag/network/media query/native
 * shell, mirroring the isolation of ApplicationStatus.ambiguous.test.tsx. The
 * hook module's pure exports are kept real (`importOriginal`) so §5 tests the
 * shipping function, not a copy.
 */

const TEST_APP_ID = "app-1";

// Flipped per-test before render.
let mockFlagOn = true;
let mockReduced = false;
let mockOffline = false;
let mockErrored = false;
let mockPlatform: "web" | "android" | "ios" = "web";
let mockDecision: Decision | null = null;
const mockRefetch = vi.fn();

vi.mock("@/lib/flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags")>();
  return { ...actual, flag: () => mockFlagOn };
});

vi.mock("@/hooks/useDecision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useDecision")>();
  return {
    ...actual,
    useDecision: () => ({
      decision: mockDecision,
      isLoading: false,
      isOffline: mockOffline,
      isError: mockErrored,
      refetch: mockRefetch,
      enabled: mockFlagOn,
    }),
  };
});

/* The real module asks Capacitor, which answers "web" under jsdom — so without
   this the native branch would never be exercised at all, which is precisely how
   an unguarded CTA sat on this page through four reviews.

   The SHAPE is ClaimSeat.test.tsx's and EnrollmentDetails.test.tsx's, to the
   character: ONE `mockPlatform` string with both exports derived from it, never
   a bare `isNative` boolean. Those two pages already branch on `isIOS()`; when
   this one gains such a branch, a half-mocked module would resolve `isIOS` to
   undefined and kill the suite with "isIOS is not a function" instead of failing
   as a platform assertion — and no test here could tell the iOS shell from the
   Android one. */
vi.mock("@/lib/platform", () => ({
  isIOS: () => mockPlatform === "ios",
  isNative: () => mockPlatform !== "web",
}));

// motion.ts's useMotionSafe wraps framer's useReducedMotion, so mocking the
// hook at the source drives the reduced-motion branch deterministically (jsdom's
// matchMedia stub cannot).
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => mockReduced };
});

import DecisionReveal from "@/pages/decision/DecisionReveal";
import { deriveSeatHeldUntil, deriveVerdict } from "@/hooks/useDecision";

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    applicationId: TEST_APP_ID,
    offeringId: "off-1",
    verdict: "accepted",
    name: "Aarav Menon",
    firstName: "Aarav",
    cohort: "Live Filmmaking Cohort",
    craft: "Wedding cinematographer",
    city: "Kochi",
    // A real window: `accepted_at` (stamped once by the reconciler) plus the
    // offering's confirmation deadline. The reveal itself renders no countdown,
    // but the claim flow downstream is dated from exactly this value.
    seatHeldUntil: new Date("2026-08-02T10:00:00.000Z"),
    ...overrides,
  };
}

// The page redirects to today's path (/my-application/:id) whenever it must not
// render. Giving that route a marker proves the redirect happened AND that the
// reveal rendered nothing.
const TODAYS_PATH_MARKER = "TODAYS_APPLICATION_STATUS";

/** Beat 3's destination. Real on every platform — that is half the contract. */
const ACCEPTANCE_CARD_MARKER = "ACCEPTANCE_CARD";

/** The locked web beat: the one label string this file names, because it is the
    one that must still be there on web. What beat 3 says on a native shell is
    deliberately NOT written down anywhere here — see FORWARD_CTA. */
const WEB_BEAT_3 = "Claim my seat";

/**
 * Beat 3, identified by what it IS rather than by what it SAYS. Every traversal
 * goes through this id, so renaming the guarded label leaves the traversals
 * green and sends the sweep below red — the only failure that names the actual
 * defect. `AcceptanceCard.tsx` tags its forward CTA with the same id, and
 * `AcceptanceCard.test.tsx` carries this same block, because the two surfaces
 * are one pair and must fail together.
 */
const FORWARD_CTA = "decision-forward-cta";

/** Both store shells. The guard is one `isNative()` test, so it must hold on
    both, and running it twice is what makes the platform mock's `isIOS` half
    load-bearing rather than decorative. */
const NATIVE_SHELLS = ["android", "ios"] as const;

/**
 * What a store reviewer reads as a purchase entry point on a button or a link.
 * Groups rather than strings, because the failure being pinned is a RENAME:
 *
 *   • the transaction VERBS — "confirm your seat", "reserve your spot" and
 *     "secure your place" are the same button in a different coat. "Confirm" is
 *     first in the list because it is this repo's own canonical phrase for this
 *     exact action (`ApplicationTimeline.tsx`, `ApplicationStatus.tsx`,
 *     `CheckoutPage.tsx`), which makes it one of the likeliest renames;
 *   • the PAYMENT words, matched WITHOUT word boundaries, deliberately. The
 *     first version of this guard wrote `\bpay\b`, which cannot match inside
 *     "payment" — and "payment" is this repo's own UI wording
 *     (`AdminOfferingEditor.tsx`, `ThankYou.tsx`, `AdminEvents.tsx`) while
 *     `ApplicationStatus.tsx` ships a "Pay Confirmation" link today, so a
 *     payment-NOUN relabel is the likeliest rename there is, not a contrived
 *     one. "Complete payment" sailed through the boundary-anchored version with
 *     the whole suite green. Boundaries would also miss "Razorpay", the
 *     processor this flow actually hands off to;
 *   • the OBJECT — inside a native shell no affordance needs the word "seat",
 *     so a button reaching for it is reaching for the sale;
 *   • the stock conversion PHRASES, which carry no verb from the first group;
 *   • the MONEY, in each of the forms this app writes one.
 *
 * `RENAME_CANDIDATES` / `NEUTRAL_LABELS` below pin these patterns in BOTH
 * directions, so neither a hole nor an over-broad sweep can arrive unnoticed —
 * a hole is what shipped last time, and it was invisible because nothing tested
 * the patterns themselves.
 *
 * This block is duplicated verbatim in `AcceptanceCard.test.tsx`. The two
 * surfaces are one pair carrying one CTA, so the guard must be identical on
 * both: change one, change the other.
 *
 * Only `a` and `button` are swept: prose that DESCRIBES the step is not an
 * affordance, and ClaimSeat already ships exactly that inside the Play shell in
 * `ContinueOnWebCTA`'s body copy.
 */
const PURCHASE_VERB =
  /\b(confirm\w*|claim\w*|reserv\w*|secure|book(ing|s)?|buy\w*|purchas\w*|paid|checkout|check out|order(s|ing)?|regist\w*|enrol\w*|admit|subscrib\w*|upgrade|deposit|redeem|unlock|activat\w*|renew\w*)\b/i;
const PAYMENT_WORD = /pay|\bupi\b|\bnetbanking\b|\bstripe\b/i;
const PURCHASE_OBJECT = /\b(seats?|spots?|places?|admissions?|tickets?)\b/i;
const PURCHASE_PHRASE = /\b(get started|sign ?up|join now|start now|lock (it|this|yours) in)\b/i;
const MONEY = /₹|\brs\.?\s*\d|\b(inr|rupees?)\b/i;

/** The matched fragment, so a red run names the word that has to change. */
function purchaseAffordanceIn(label: string): string | null {
  for (const pattern of [
    PURCHASE_VERB,
    PAYMENT_WORD,
    PURCHASE_OBJECT,
    PURCHASE_PHRASE,
    MONEY,
  ]) {
    const hit = label.match(pattern);
    if (hit) return hit[0];
  }
  return null;
}

/**
 * The labels a relabel would actually reach for — every one of them must be
 * caught. This is the assertion whose absence let "Complete payment" through:
 * the sweep below only ever sees the label the page renders TODAY, so a hole in
 * the patterns is invisible until someone renames into it.
 */
const RENAME_CANDIDATES = [
  "Claim my seat",
  "Confirm your seat",
  "Reserve your spot",
  "Secure your place",
  "Complete payment",
  "Proceed to payment",
  "Continue to payment",
  "Make payment",
  "Payment",
  "Payment details",
  "Pay now",
  "Continue to Razorpay",
  "Order now",
  "Register now",
  "Complete your admission",
  "Book your place",
  "Buy now",
  "Enrol now",
  "Get started",
  "Unlock your seat",
  "₹8,000 to confirm",
  "8,000 INR",
] as const;

/**
 * The other direction. A guard nobody can satisfy gets widened until it means
 * nothing, so the labels this phase legitimately ships inside a native shell —
 * forward motion that names no transaction — are pinned as ALLOWED.
 */
const NEUTRAL_LABELS = [
  "See what's next",
  "Continue to the next step",
  "Read what the next step involves",
  "Open your decision",
  "Read the panel's note",
  "Back to your application",
  "Try again",
  "Skip",
] as const;

function labelOf(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Sweeps EVERY affordance the page rendered, not a list of known ones. */
function expectNoPurchaseAffordance(container: HTMLElement) {
  for (const el of Array.from(container.querySelectorAll("a, button"))) {
    const label = labelOf(el);
    expect(
      purchaseAffordanceIn(label),
      `"${label}" reads as a purchase affordance inside a native shell. ` +
        "The LABEL is what has to change — widening this guard to admit it is " +
        "the regression it exists to catch.",
    ).toBeNull();
    expect(el.getAttribute("href") ?? "").not.toMatch(/checkout/i);
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/decision/${TEST_APP_ID}`]}>
      <Routes>
        <Route path="/decision/:applicationId" element={<DecisionReveal />} />
        {/* The acceptance card, stubbed: the reveal's job is to REACH it, and on
            a native shell reaching it is the half of the guard that a deletion
            would silently break. */}
        <Route
          path="/decision/:applicationId/accepted"
          element={<p>{ACCEPTANCE_CARD_MARKER}</p>}
        />
        <Route path="/my-application/:applicationId" element={<p>{TODAYS_PATH_MARKER}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Open the seal — beat 2 of the three kept beats. */
function openTheSeal() {
  fireEvent.click(screen.getByRole("button", { name: "Open your decision" }));
}

describe("DecisionReveal (D-1)", () => {
  beforeEach(() => {
    mockFlagOn = true;
    mockReduced = false;
    mockOffline = false;
    mockErrored = false;
    mockPlatform = "web";
    mockDecision = makeDecision();
    mockRefetch.mockClear();
  });

  it("the rename guard catches the labels a relabel would reach for", () => {
    // Pins the PATTERNS, not the page. Without this the sweep below can only see
    // the label that ships today, which is how a boundary-anchored `\bpay\b`
    // shipped as "no purchase affordance under ANY name" while "Complete
    // payment" passed clean on both surfaces.
    for (const label of RENAME_CANDIDATES) {
      expect(
        purchaseAffordanceIn(label),
        `"${label}" is a rename a native CTA could take, and the guard misses it`,
      ).not.toBeNull();
    }
  });

  it("…and stays narrow enough to leave the honest labels alone", () => {
    for (const label of NEUTRAL_LABELS) {
      expect(
        purchaseAffordanceIn(label),
        `"${label}" names no transaction, so flagging it would push the next ` +
          "maintainer to widen the guard's exceptions instead of the label",
      ).toBeNull();
    }
  });

  it("flag off → nothing renders; the surface falls back to today's path", () => {
    mockFlagOn = false;
    // An accepted decision is present — only the flag is holding the reveal back,
    // which is exactly the "accepted seen but flag off" edge case.
    renderPage();

    expect(screen.getByText(TODAYS_PATH_MARKER)).toBeInTheDocument();
    expect(screen.queryByText("Your decision is ready")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open your decision" })).toBeNull();
    expect(screen.queryByText("you're in.")).toBeNull();
    expect(screen.queryByTestId(FORWARD_CTA)).toBeNull();
  });

  it("no decision yet (pending) → today's path, no reveal", () => {
    mockDecision = makeDecision({ verdict: "pending" });
    renderPage();

    expect(screen.getByText(TODAYS_PATH_MARKER)).toBeInTheDocument();
    expect(screen.queryByText("Your decision is ready")).toBeNull();
  });

  it("renders the three kept beats verbatim, sealed until opened", () => {
    renderPage();

    // Beat 1 + beat 2. The verdict is NOT in the DOM while the seal holds.
    expect(screen.getByText("Your decision is ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open your decision" })).toBeInTheDocument();
    expect(screen.queryByText("you're in.")).toBeNull();

    openTheSeal();

    // Beat 3, last of all.
    expect(screen.getByText("you're in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: WEB_BEAT_3 })).toBeInTheDocument();
  });

  it("web: beat 3 stays verbatim and lands on the acceptance card", () => {
    renderPage();
    openTheSeal();

    const cta = screen.getByTestId(FORWARD_CTA);
    expect(labelOf(cta)).toBe(WEB_BEAT_3);
    fireEvent.click(cta);
    expect(screen.getByText(ACCEPTANCE_CARD_MARKER)).toBeInTheDocument();
  });

  it.each(NATIVE_SHELLS)("native (%s): NO purchase-labelled affordance survives", (platform) => {
    // The full-viewport reveal is the largest surface in the phase and the one
    // most likely to be screenshotted into a store review, and it shipped the
    // same unguarded "Claim my seat" the acceptance card did. Both stores bar
    // the AFFORDANCE, not merely the checkout link, so the label goes — and it
    // goes on BOTH shells: Play's Reader Rule and Apple's 3.1.1 land in the same
    // place here even though they are different rules.
    mockPlatform = platform;
    const { container } = renderPage();
    openTheSeal();

    expectNoPurchaseAffordance(container);
    // The verdict is not collateral damage: the guard touches one label.
    expect(screen.getByText("you're in.")).toBeInTheDocument();
    expect(screen.getByText("Aarav,")).toBeInTheDocument();
  });

  it.each(NATIVE_SHELLS)("native (%s): beat 3 cannot come back under a new name", (platform) => {
    // The assertion the first version of this suite failed to make. It reads the
    // label off the rendered button and tests the LABEL, so mutating this page
    // to "Confirm your seat", "Reserve your spot" or "Complete payment" goes red
    // here, naming the label as the thing to fix. There is no expected string in
    // this test that could be "corrected" instead — and the patterns it leans on
    // are themselves pinned by RENAME_CANDIDATES above.
    mockPlatform = platform;
    renderPage();
    openTheSeal();

    const label = labelOf(screen.getByTestId(FORWARD_CTA));
    expect(label).not.toBe(WEB_BEAT_3);
    expect(
      purchaseAffordanceIn(label),
      `beat 3 renders "${label}" on a native shell, which still reads as a purchase affordance`,
    ).toBeNull();
  });

  it.each(NATIVE_SHELLS)("native (%s): the path forward SURVIVES the guard", (platform) => {
    // The half no lens asked for. The accepted Android student reaches the
    // working "Continue on web" bounce through this button and the acceptance
    // card behind it; deleting the CTA to satisfy the Reader Rule would dead-end
    // them on the reveal, which is the failure class this pass exists to close.
    // Found by test id, so this stays green under a rename and goes red only on
    // a DELETION — the two failures stay distinguishable.
    mockPlatform = platform;
    renderPage();
    openTheSeal();

    fireEvent.click(screen.getByTestId(FORWARD_CTA));
    expect(screen.getByText(ACCEPTANCE_CARD_MARKER)).toBeInTheDocument();
  });

  it("native + reduced motion: the guard costs the reveal nothing", async () => {
    // The guard is a one-word platform branch, never a timeline branch: the
    // verdict still lands inside the crossfade budget and the forward path is
    // still there. If a future edit buys the guard by weakening the reveal
    // (gating a beat on the platform, say), this is what catches it.
    mockPlatform = "android";
    mockReduced = true;
    renderPage();
    openTheSeal();

    expect(screen.getByText("you're in.")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("data-reveal-mode", "crossfade");
    const rule = screen.getByTestId("decision-rule");
    expect(["", "none"]).toContain(rule.style.transform);
    await waitFor(() => expect(rule.style.opacity).toBe("1"), { timeout: 800 });

    expect(screen.getByTestId(FORWARD_CTA)).toBeInTheDocument();
  });

  it("states no rupee amount on ANY platform, which is the state to keep", () => {
    for (const platform of ["web", ...NATIVE_SHELLS] as const) {
      mockPlatform = platform;
      const { container, unmount } = renderPage();
      openTheSeal();
      expect(container.textContent ?? "").not.toContain("₹");
      unmount();
    }
  });

  it("reduced motion → a crossfade that STILL reveals the verdict", async () => {
    mockReduced = true;
    renderPage();
    openTheSeal();

    // The verdict is revealed, not withheld…
    expect(screen.getByText("you're in.")).toBeInTheDocument();
    expect(screen.getByText("Aarav,")).toBeInTheDocument();
    // …via the crossfade path, not the staged timeline.
    expect(screen.getByRole("main")).toHaveAttribute("data-reveal-mode", "crossfade");
    // And no skip affordance: there is no staged timeline left to skip.
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();

    // Opacity-only: the element is mounted at its settled geometry, so framer
    // writes no transform at all (`""` or the identity `none`) — never a
    // translate or a scale. And the one beat actually LANDS (a staged run would
    // still be 1.35s of delay away from touching the rule).
    const rule = screen.getByTestId("decision-rule");
    expect(["", "none"]).toContain(rule.style.transform);
    await waitFor(() => expect(rule.style.opacity).toBe("1"), { timeout: 800 });
  });

  it("the reduced-motion crossfade stays inside the ≤200ms budget", () => {
    // Contract lock on the token itself: if a future edit lengthens the
    // reduced-motion path past 200ms, or the staged timeline past 2.6s, this
    // fails rather than silently regressing REQ-DEC-2.
    expect(decisionReveal.reducedCrossfade).toBeLessThanOrEqual(0.2);
    expect(decisionReveal.letter + decisionReveal.beat).toBeLessThanOrEqual(decisionReveal.total);
    expect(decisionReveal.total).toBeLessThanOrEqual(2.6);
  });

  it("rejected → the dignified screen, and NO shareable artifact", () => {
    mockDecision = makeDecision({ verdict: "rejected" });
    renderPage();
    openTheSeal();

    // The outcome is still delivered plainly, and kindly.
    expect(screen.getByText("not this cohort.")).toBeInTheDocument();
    expect(screen.getByText(/not the end of the road/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read the panel's note" })).toBeInTheDocument();

    // No artifact affordance of any kind, and no claim CTA.
    expect(screen.queryByRole("button", { name: /share/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /download/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /copy link/i })).toBeNull();
    expect(screen.queryByTestId(FORWARD_CTA)).toBeNull();
    expect(screen.queryByText("you're in.")).toBeNull();
  });

  it("waitlisted → the same quiet staging, no artifact, no claim CTA", () => {
    mockDecision = makeDecision({ verdict: "waitlisted" });
    renderPage();
    openTheSeal();

    expect(screen.getByText("you're on the waitlist.")).toBeInTheDocument();
    expect(screen.queryByTestId(FORWARD_CTA)).toBeNull();
    expect(screen.queryByRole("button", { name: /share/i })).toBeNull();
  });

  it("Skip mid-timeline COMPLETES the reveal, it does not just relabel it", async () => {
    renderPage();
    openTheSeal();

    // Staged first: the skip affordance only exists while there is a timeline.
    expect(screen.getByRole("main")).toHaveAttribute("data-reveal-mode", "staged");

    // The rule is the honest probe: its only visibility is `scaleX`, and its
    // staged beat does not even BEGIN for 1.35s. Nothing has landed yet.
    const rule = screen.getByTestId("decision-rule");
    expect(rule.style.opacity).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("main")).toHaveAttribute("data-reveal-mode", "crossfade");

    // …and now it lands, far inside what the staged timeline (1.35s + 0.55s)
    // could have managed. This is the assertion that a transition-only swap
    // cannot pass: framer strips `transition` from its prop diff, so relabelling
    // the mode leaves the staged animation running and this stays at 0.
    await waitFor(
      () => {
        expect(rule.style.opacity).toBe("1");
        expect(rule.style.transform).toBe("none");
      },
      { timeout: 800 },
    );

    // The timeline COMPLETES; it does not unwind. Nothing is remounted, so the
    // verdict and the last beat's CTA are still there.
    expect(screen.getByText("you're in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: WEB_BEAT_3 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it("offline with no answer yet → the seal holds, NOT a redirect to a page that 404s", () => {
    // react-query pauses (not fails) an offline read, so there is no decision to
    // show and no error either. Redirecting here lands on /my-application/:id,
    // whose own uncached fetch also fails offline → "Application Not Found".
    mockOffline = true;
    mockDecision = null;
    renderPage();

    expect(screen.queryByText(TODAYS_PATH_MARKER)).toBeNull();
    expect(screen.getByText("We'll have this for you in a moment")).toBeInTheDocument();
    // The seal is intact: no verdict, and nothing to open yet.
    expect(screen.queryByText("you're in.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open your decision" })).toBeNull();
  });

  it("offline but the decision is already in memory → the reveal still fires", () => {
    mockOffline = true;
    renderPage();
    openTheSeal();

    expect(screen.getByText("you're in.")).toBeInTheDocument();
  });

  it("a FAILED read gets its own state with a retry, not a bounce to a page that also fails", () => {
    // The captive-portal / no-internet-Wi-Fi case: `navigator.onLine` is true,
    // so react-query errors rather than pausing. Treating that as "no decision"
    // is what redirects an accepted student onto /my-application/:id, whose own
    // uncached fetch is failing identically → "Application Not Found".
    mockErrored = true;
    mockDecision = null;
    renderPage();

    expect(screen.queryByText(TODAYS_PATH_MARKER)).toBeNull();
    expect(screen.getByText("This didn't load. It's still here.")).toBeInTheDocument();
    // The seal is intact and the verdict is not named, or even implied.
    expect(screen.queryByText("you're in.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open your decision" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("a failed refresh never hides a decision already in hand", () => {
    // Stale-while-error: react-query keeps the last good data. The reveal wins
    // over the error state, so a background failure cannot swallow the moment.
    mockErrored = true;
    renderPage();
    openTheSeal();

    expect(screen.getByText("you're in.")).toBeInTheDocument();
    expect(screen.queryByText("This didn't load. It's still here.")).toBeNull();
  });
});

/**
 * The floors on the verdict itself. These are not cosmetic: `accepted` from the
 * reconciler is an EXTERNAL signal that only advances past `accepted` when the
 * seat-confirm is visible under the join key, so a student who has already paid
 * from another phone/email still derives `accepted`. Without these floors the
 * reveal walks them back into the ₹8k confirmation checkout.
 */
describe("deriveVerdict floors (D-1)", () => {
  it("fires only when the reconciler says accepted", () => {
    expect(deriveVerdict("interview_done", "accepted")).toBe("accepted");
    expect(deriveVerdict("interview_done", "awaiting-decision")).toBe("pending");
    expect(deriveVerdict("interview_done", undefined)).toBe("pending");
  });

  it("a student who already acted on the decision is never re-shown it", () => {
    // Each of these is first-party truth written by the app's own payment
    // webhook, and each would otherwise get "you're in." → "Claim my seat".
    for (const status of ["confirmation_paid", "balance_paid", "enrolled"]) {
      expect(deriveVerdict(status, "accepted")).toBe("pending");
    }
  });

  it("a negative or non-progressing status outranks a positive derived stage", () => {
    expect(deriveVerdict("rejected", "accepted")).toBe("rejected");
    expect(deriveVerdict("waitlisted", "accepted")).toBe("waitlisted");
    expect(deriveVerdict("withdrawn", "accepted")).toBe("pending");
  });

  it("is case- and whitespace-insensitive on the status", () => {
    expect(deriveVerdict(" ENROLLED ", "accepted")).toBe("pending");
    expect(deriveVerdict(" Rejected", "accepted")).toBe("rejected");
  });
});

/**
 * The held-seat window (REQ-DEC-5). This is the arithmetic behind "seat held ·
 * closes {countdown}", the brief's named v1 conversion lever, so it is pinned
 * here rather than inferred from a rendered countdown.
 *
 * The anchor is `cohort_applications.accepted_at` — stamped ONCE by the
 * reconciler on first observation of `accepted` (migration 20260728120000) — and
 * deliberately NOT `reconciled_at`, which is re-written on every reconcile run
 * and would slide the deadline forward on every open.
 */
describe("deriveSeatHeldUntil (REQ-DEC-5)", () => {
  const ANCHOR = "2026-07-27T09:00:00.000Z";
  const HOUR = 60 * 60 * 1000;

  it("is the anchor plus the offering's deadline days and grace hours", () => {
    const held = deriveSeatHeldUntil(ANCHOR, 2, 6);
    expect(held?.toISOString()).toBe("2026-07-29T15:00:00.000Z");
  });

  it("falls back to the 2-day DB default, and to no grace at all", () => {
    // `confirmation_deadline_days` defaults to 2 in the schema but is nullable;
    // `confirmation_grace_hours` is nullable with NO default — absent means none.
    const held = deriveSeatHeldUntil(ANCHOR, null, null);
    expect(held?.getTime()).toBe(new Date(ANCHOR).getTime() + 48 * HOUR);
  });

  it("returns null rather than inventing a window when the anchor is absent", () => {
    // No acceptance observed yet: the consumers state the hold WITHOUT a
    // deadline. A fabricated one is what makes a countdown lie.
    expect(deriveSeatHeldUntil(null, 2, 0)).toBeNull();
    expect(deriveSeatHeldUntil(undefined, 2, 0)).toBeNull();
    expect(deriveSeatHeldUntil("not-a-timestamp", 2, 0)).toBeNull();
  });

  it("never shortens the window on a nonsense offering setting", () => {
    // A negative/NaN setting falls back rather than dating the deadline into the
    // past, which would read as ALREADY LAPSED to a student who just got in.
    expect(deriveSeatHeldUntil(ANCHOR, -5, 0)?.getTime()).toBe(
      new Date(ANCHOR).getTime() + 48 * HOUR,
    );
    expect(deriveSeatHeldUntil(ANCHOR, 2, -12)?.getTime()).toBe(
      new Date(ANCHOR).getTime() + 48 * HOUR,
    );
  });
});
