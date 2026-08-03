import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Decision } from "@/hooks/useDecision";

/**
 * D-3 — the acceptance card, and the store guard on its forward CTA (REQ-DEC-4).
 *
 * This page had NO test file at all until this one, which is the reason worth
 * recording: four independent review lenses looked at the phase, three of them
 * flagged this card's unguarded "Claim my seat", and not one noticed that
 * `DecisionReveal.tsx` carried the identical unguarded CTA on the bigger
 * surface. Nothing pinned either. So the contracts locked here are locked in
 * `DecisionReveal.test.tsx` too, in the same shape, and neither surface can be
 * changed back on its own without a red run.
 *
 *  1. **Inside a native shell, no purchase-LABELLED affordance — under ANY
 *     name.** Play's Reader Rule (Path B) and Apple's 3.1.1 bar the affordance,
 *     not merely the checkout link, and a full-width "Claim my seat" one tap
 *     above an ₹8,000 confirmation is read as one. The assertion sweeps the
 *     label the page ACTUALLY RENDERED against the patterns below; there is no
 *     expected-label constant in this file, so a rename cannot be made green by
 *     editing a string here. (The first version of this file had one, and
 *     "Confirm your seat" sailed through it.) The patterns are pinned in turn,
 *     by `RENAME_CANDIDATES` / `NEUTRAL_LABELS`, because a sweep sees only the
 *     label that ships today: the first version of the guard wrote `\bpay\b`,
 *     which cannot match inside "payment", so "Proceed to payment" passed it
 *     clean on both surfaces with the whole suite green.
 *  2. **The path forward SURVIVES the guard.** The guard relabels; it must never
 *     delete. ClaimSeat is where the working "Continue on web" bounce lives, and
 *     this card is the only route to it from the reveal — a deleted CTA strands
 *     the accepted Android student one surface upstream of the dead-end this
 *     pass exists to close. Asserted by actually traversing it, and the CTA is
 *     found by `data-testid` precisely so that the traversal cannot be the thing
 *     that goes red when someone renames the label.
 *  3. **Web is untouched:** beat 3 of REQ-DEC-1 still renders verbatim and still
 *     lands on the claim flow, so the guard cannot be "satisfied" by deleting
 *     the CTA everywhere.
 *  4. **No rupee amount on ANY platform.** This card states none today; that is
 *     a state to keep rather than to rediscover.
 *  5. **REQ-DEC-4's floors:** no seat number or count that could stand in for
 *     one, and the locked-future previews are what replaced it.
 *  6. The gating that keeps this the ACCEPTED-only surface: flag off, a
 *     non-accepted verdict, and the offline hold that must not degrade to
 *     /my-application/:id (whose own uncached fetch fails offline and renders
 *     "Application Not Found").
 *
 * `useDecision`, `@/lib/flags` and `@/lib/platform` are mocked so the page
 * renders without the flag, the network or a native shell — the same isolation
 * `DecisionReveal.test.tsx`, `ClaimSeat.test.tsx` and `EnrollmentDetails.test.tsx`
 * use, so the four decision suites read the same way.
 */

const TEST_APP_ID = "app-1";

// Flipped per-test before render.
let mockFlagOn = true;
let mockPlatform: "web" | "android" | "ios" = "web";
let mockOffline = false;
let mockDecision: Decision | null = null;

vi.mock("@/hooks/useDecision", () => ({
  useDecision: () => ({
    decision: mockDecision,
    isLoading: false,
    isOffline: mockOffline,
    enabled: mockFlagOn,
  }),
}));

// The flag is the phase gate; every test but the flag-off one runs with it ON.
vi.mock("@/lib/flags", () => ({
  DECISION_FLOW: "VITE_DECISION_FLOW",
  flag: () => mockFlagOn,
}));

/* The real module asks Capacitor, which answers "web" under jsdom — so without
   this mock the native branch is never exercised, which is how an unguarded CTA
   sat here through four reviews.

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

import AcceptanceCard from "@/pages/decision/AcceptanceCard";

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
    seatHeldUntil: new Date("2026-08-02T10:00:00.000Z"),
    ...overrides,
  };
}

/** Marker routes, so a redirect or a traversal is provable rather than inferred. */
const TODAYS_PATH_MARKER = "TODAYS_APPLICATION_STATUS";
const CLAIM_MARKER = "CLAIM_SEAT_PAGE";
const DETAILS_MARKER = "ENROLLMENT_DETAILS_PAGE";

/** The locked web beat. The ONE label string this file names, and it is the one
    that must still be there on web. */
const WEB_BEAT_3 = "Claim my seat";

/**
 * The single forward affordance, identified by what it IS rather than by what it
 * SAYS. Every traversal below goes through this, so renaming the guarded label
 * leaves the traversals green and sends the sweep red — which is the only
 * failure that names the actual defect. `DecisionReveal.tsx` tags its beat-3
 * button with the same id for the same reason.
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
 *     one. "Proceed to payment" sailed through the boundary-anchored version
 *     with the whole suite green. Boundaries would also miss "Razorpay", the
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
 * This block is duplicated verbatim in `DecisionReveal.test.tsx`. The two
 * surfaces are one pair carrying one CTA, so the guard must be identical on
 * both: change one, change the other.
 *
 * Only `a` and `button` are swept. Prose that DESCRIBES the step ("Confirming
 * your seat is what opens these") is deliberately in scope for neither: that is
 * what ClaimSeat already ships inside the Play shell in `ContinueOnWebCTA`'s
 * body copy, and a sentence is not an affordance.
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
 * caught. This is the assertion whose absence let "Proceed to payment" through:
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
    <MemoryRouter initialEntries={[`/decision/${TEST_APP_ID}/accepted`]}>
      <Routes>
        <Route path="/decision/:applicationId/accepted" element={<AcceptanceCard />} />
        <Route path="/decision/:applicationId/claim" element={<p>{CLAIM_MARKER}</p>} />
        <Route path="/decision/:applicationId/details" element={<p>{DETAILS_MARKER}</p>} />
        <Route path="/my-application/:applicationId" element={<p>{TODAYS_PATH_MARKER}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AcceptanceCard (D-3)", () => {
  beforeEach(() => {
    mockFlagOn = true;
    mockPlatform = "web";
    mockOffline = false;
    mockDecision = makeDecision();
  });

  it("the rename guard catches the labels a relabel would reach for", () => {
    // Pins the PATTERNS, not the page. Without this the sweep below can only see
    // the label that ships today, which is how a boundary-anchored `\bpay\b`
    // shipped as "no purchase affordance under ANY name" while "Proceed to
    // payment" passed clean. Kept identical to DecisionReveal.test.tsx.
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
    renderPage();

    expect(screen.getByText(TODAYS_PATH_MARKER)).toBeInTheDocument();
    expect(screen.queryByText("You're in, Aarav.")).toBeNull();
    expect(screen.queryByTestId(FORWARD_CTA)).toBeNull();
  });

  it("is the ACCEPTED surface only — a rejection never reaches it", () => {
    mockDecision = makeDecision({ verdict: "rejected" });
    renderPage();

    expect(screen.getByText(TODAYS_PATH_MARKER)).toBeInTheDocument();
    expect(screen.queryByText("You're in, Aarav.")).toBeNull();
  });

  it("offline with no answer yet → it holds, it does not bounce to a page that 404s", () => {
    mockOffline = true;
    mockDecision = null;
    renderPage();

    expect(screen.queryByText(TODAYS_PATH_MARKER)).toBeNull();
    expect(screen.getByText("We'll have this for you in a moment")).toBeInTheDocument();
  });

  it("renders the locked future, and no seat number or count that stands in for one", () => {
    const { container } = renderPage();

    expect(screen.getByText("You're in, Aarav.")).toBeInTheDocument();
    expect(screen.getByText("What is waiting behind the lock")).toBeInTheDocument();
    expect(screen.getByText("The cohort room")).toBeInTheDocument();

    // REQ-DEC-4: a low number signals an empty cohort, so there is no number.
    const body = container.textContent ?? "";
    expect(body).not.toMatch(/seat\s*(no\.?|number|#)?\s*\d/i);
    expect(body).not.toMatch(/\d+\s*(seats?|spots?|places?)\s*(left|remaining|available)/i);
  });

  it("web: beat 3 stays verbatim and lands on the claim flow", () => {
    renderPage();

    const cta = screen.getByTestId(FORWARD_CTA);
    expect(labelOf(cta)).toBe(WEB_BEAT_3);
    fireEvent.click(cta);
    expect(screen.getByText(CLAIM_MARKER)).toBeInTheDocument();
  });

  it.each(NATIVE_SHELLS)("native (%s): NO purchase-labelled affordance survives", (platform) => {
    // Both shells, because Play's Reader Rule and Apple's 3.1.1 are different
    // rules that land in the same place here, and one `isNative()` test answers
    // for both.
    mockPlatform = platform;
    const { container } = renderPage();

    expectNoPurchaseAffordance(container);
    // The card itself is untouched: only the label is guarded.
    expect(screen.getByText("You're in, Aarav.")).toBeInTheDocument();
    expect(screen.getByText("The cohort room")).toBeInTheDocument();
  });

  it.each(NATIVE_SHELLS)("native (%s): the forward CTA cannot come back renamed", (platform) => {
    // The assertion the FIRST version of this suite failed to make. It reads the
    // label off the rendered button and tests the label itself, so mutating the
    // page to "Confirm your seat", "Reserve your spot" or "Proceed to payment"
    // goes red HERE, with a message that names the label as the thing to fix.
    // There is no expected string in this test to "correct" instead, and the
    // patterns behind it are pinned by RENAME_CANDIDATES above.
    mockPlatform = platform;
    renderPage();

    const label = labelOf(screen.getByTestId(FORWARD_CTA));
    expect(label).not.toBe(WEB_BEAT_3);
    expect(
      purchaseAffordanceIn(label),
      `the guarded forward CTA renders "${label}", which still reads as a purchase affordance`,
    ).toBeNull();
  });

  it.each(NATIVE_SHELLS)("native (%s): the path forward SURVIVES the guard", (platform) => {
    // ClaimSeat carries the working "Continue on web" bounce; this card is the
    // only way to it from the reveal. A guard that removes the CTA moves the
    // dead-end upstream instead of closing it. Found by test id, so this stays
    // green under a rename and only ever goes red on a DELETION.
    mockPlatform = platform;
    renderPage();

    fireEvent.click(screen.getByTestId(FORWARD_CTA));
    expect(screen.getByText(CLAIM_MARKER)).toBeInTheDocument();
  });

  it.each(NATIVE_SHELLS)("native (%s): the explainer route stays reachable", (platform) => {
    // "Read what the next step involves" is reading material, not a purchase
    // affordance, and EnrollmentDetails carries its own guard over the figures.
    // It stays on both platforms so the native student can still learn what the
    // step involves before leaving for the browser. It carries the guard too,
    // though: its previous copy ("Read what happens when you claim") put the
    // word the button just gave up back on the same screen, and the sweep above
    // covers links for exactly that reason. It must also stay distinct from the
    // primary CTA, so the two do not read as one destination said twice.
    mockPlatform = platform;
    renderPage();

    const explainer = screen.getByRole("link", { name: "Read what the next step involves" });
    expect(labelOf(explainer)).not.toBe(labelOf(screen.getByTestId(FORWARD_CTA)));
    fireEvent.click(explainer);
    expect(screen.getByText(DETAILS_MARKER)).toBeInTheDocument();
  });

  it("states no rupee amount on ANY platform, which is the state to keep", () => {
    for (const platform of ["web", ...NATIVE_SHELLS] as const) {
      mockPlatform = platform;
      const { container, unmount } = renderPage();
      expect(container.textContent ?? "").not.toContain("₹");
      unmount();
    }
  });
});
