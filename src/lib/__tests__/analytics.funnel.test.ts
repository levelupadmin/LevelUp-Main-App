import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { track, type AnalyticsEvent } from "@/lib/analytics";

/**
 * P3-T7 acceptance criterion 9: the five phase-3 conversion-funnel events fire on
 * the funnel (verifiable via a spy on the sink), AND a blocked/absent/offline sink
 * produces zero console errors — analytics must never break the purchase flow.
 *
 * The five events, in the order a real buyer walks the funnel:
 *   1. offering_viewed    (PublicOffering mount)
 *   2. pay_cta_tapped     (hero / rail / sticky Buy CTA)
 *   3. checkout_loaded    (CheckoutPage resolved)
 *   4. payment_initiated  (Razorpay order created)
 *   5. purchase_completed (ThankYou)
 *
 * `track()` fans a funnel event to PostHog when present, else to the loaded pixels
 * as CUSTOM events (never a standard e-commerce event). Every sink is
 * optional-chained, so absent/blocked/offline is a silent no-op by construction —
 * this test pins that contract so a future refactor can't reintroduce a throw.
 */

// The funnel walk, in order, with the exact payloads each call site sends.
const FUNNEL: AnalyticsEvent[] = [
  { name: "offering_viewed", slug: "lokesh-kanagaraj-teaches-film-making" },
  { name: "pay_cta_tapped", slug: "lokesh-kanagaraj-teaches-film-making", surface: "hero" },
  { name: "checkout_loaded", offeringId: "190a09ee-3f34-4242-ad9f-70ddedcc8eae", guest: true },
  { name: "payment_initiated", orderId: "order_ABC123" },
  { name: "purchase_completed", orderId: "order_ABC123", valueInr: 4999 },
];

// The event names PostHog receives, in the same order (captureFunnel forwards the
// event name verbatim as the PostHog event key).
const EXPECTED_NAMES = [
  "offering_viewed",
  "pay_cta_tapped",
  "checkout_loaded",
  "payment_initiated",
  "purchase_completed",
];

describe("phase-3 conversion funnel (analytics track)", () => {
  const g = globalThis as unknown as {
    posthog?: unknown;
    fbq?: unknown;
    gtag?: unknown;
    twq?: unknown;
  };

  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete g.posthog;
    delete g.fbq;
    delete g.gtag;
    delete g.twq;
    // "zero console errors" is the literal criterion — spy on console.error and
    // assert it never fires across every sink state below. A blocked sink is
    // swallowed to a DEV-only console.warn (silent in prod via import.meta.env.DEV);
    // silence it here so the swallow is diagnosable-but-quiet, never an error.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    delete g.posthog;
    delete g.fbq;
    delete g.gtag;
    delete g.twq;
  });

  it("fires the five funnel events to the PostHog sink in funnel order", () => {
    const capture = vi.fn();
    g.posthog = { capture };

    FUNNEL.forEach(track);

    // Exactly five captures, one per funnel step, in order.
    expect(capture).toHaveBeenCalledTimes(5);
    const firedNames = capture.mock.calls.map((c) => c[0] as string);
    expect(firedNames).toEqual(EXPECTED_NAMES);

    // Payloads reach the sink intact (spot-check the two carrying revenue-relevant
    // ids/values so a silent prop rename is caught).
    const props = Object.fromEntries(
      capture.mock.calls.map((c) => [c[0] as string, c[1] as Record<string, unknown>]),
    );
    expect(props.checkout_loaded).toMatchObject({
      offering_id: "190a09ee-3f34-4242-ad9f-70ddedcc8eae",
      guest: true,
    });
    expect(props.purchase_completed).toMatchObject({
      order_id: "order_ABC123",
      value_inr: 4999,
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("falls back to loaded pixels (fbq/gtag) as CUSTOM events when PostHog is absent", () => {
    const fbq = vi.fn();
    const gtag = vi.fn();
    g.fbq = fbq;
    g.gtag = gtag;

    FUNNEL.forEach(track);

    // Pixel fallback uses trackCustom (never a standard e-commerce event name), so
    // the existing Purchase/ViewContent funnels are left untouched.
    const fbCustomNames = fbq.mock.calls
      .filter((c) => c[0] === "trackCustom")
      .map((c) => c[1] as string);
    expect(fbCustomNames).toEqual(EXPECTED_NAMES);

    const gtagEventNames = gtag.mock.calls
      .filter((c) => c[0] === "event")
      .map((c) => c[1] as string);
    expect(gtagEventNames).toEqual(EXPECTED_NAMES);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("no-ops silently with zero console errors when every sink is absent", () => {
    // Nothing on window: posthog/fbq/gtag all undefined.
    expect(() => FUNNEL.forEach(track)).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("swallows a blocked sink that throws (ad-blocker / CSP) with zero console errors", () => {
    // A blocked PostHog can throw on capture; track()'s guard must absorb it.
    g.posthog = {
      capture: () => {
        throw new Error("blocked by client");
      },
    };

    expect(() => FUNNEL.forEach(track)).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
