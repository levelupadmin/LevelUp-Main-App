import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { render, waitFor } from "@testing-library/react";

/**
 * P3 punch-list: automated proof of the exactly-one success haptic on ThankYou
 * mount (ThankYou.tsx — the `successHapticFired` ref-guarded effect).
 *
 * The thank-you page fires ONE native "success" notification haptic the moment a
 * captured order resolves, and never again for the life of the mount. That
 * one-shot guarantee is the whole point of the `successHapticFired` ref: the
 * effect depends on `[order, notFound]`, so it runs first with `order === null`
 * (must NOT fire — data hasn't arrived) and again once the fetch resolves and
 * `order` flips to the captured row (fires exactly once). Any later re-render —
 * the 1s redirect countdown, upsell state, hover pauses — must not re-fire it.
 *
 * This spec is the regression guard for that contract: it spies
 * hapticNotification and asserts exactly one 'success' call on the mounted
 * captured-order success, and none on a subsequent re-render.
 */

// ── Spy the haptic boundary. The component calls hapticNotification("success")
//    unconditionally; the native/web gate lives inside lib/haptics (out of
//    scope here), so the spy records the intent on any platform.
vi.mock("@/lib/haptics", () => ({
  hapticNotification: vi.fn(() => Promise.resolve()),
  hapticImpact: vi.fn(() => Promise.resolve()),
  hapticSelection: vi.fn(() => Promise.resolve()),
  tapTick: vi.fn(() => Promise.resolve()),
  confirm: vi.fn(() => Promise.resolve()),
  celebrate: vi.fn(() => Promise.resolve()),
}));

// ── Captured-order fixture + a chainable Supabase stub. The first query
//    (payment_orders …select…eq…eq…single) yields the captured order; the
//    second (offering_upsells …select…eq…eq…order) yields no upsells.
const capturedOrder = {
  id: "order_test_123",
  offering_id: "off_1",
  total_inr: 4999,
  status: "captured",
  razorpay_payment_id: "pay_abc123",
  guest_email: "buyer@example.com",
  guest_name: "Test Buyer",
  guest_phone: "+919876543210",
  user_id: null,
  created_at: new Date("2026-07-07T10:00:00.000Z").toISOString(),
  offerings: {
    title: "Test Masterclass",
    subtitle: "A test offering",
    thumbnail_url: null,
    slug: "test-masterclass",
    meta_pixel_id: null,
    google_ads_conversion: null,
    custom_tracking_script: null,
    thankyou_thumbnail_url: null,
    thankyou_headline: null,
    thankyou_body: null,
    thankyou_cta_label: null,
    thankyou_cta_url: null,
    thankyou_auto_redirect: false,
    thankyou_redirect_seconds: null,
    thankyou_show_calendly: false,
    calendly_url: null,
    offering_courses: [],
  },
};

vi.mock("@/integrations/supabase/client", () => {
  const paymentBuilder: Record<string, unknown> = {};
  paymentBuilder.select = vi.fn(() => paymentBuilder);
  paymentBuilder.eq = vi.fn(() => paymentBuilder);
  // Fresh object identity per fetch so a refetch flips `order` to a NEW
  // reference — that is what re-runs the haptic effect and lets the spec catch
  // a missing ref guard (identical references would bail React's re-render).
  paymentBuilder.single = vi.fn(() =>
    Promise.resolve({ data: { ...capturedOrder }, error: null }),
  );

  const upsellBuilder: Record<string, unknown> = {};
  upsellBuilder.select = vi.fn(() => upsellBuilder);
  upsellBuilder.eq = vi.fn(() => upsellBuilder);
  upsellBuilder.order = vi.fn(() => Promise.resolve({ data: [] }));

  return {
    supabase: {
      from: vi.fn((table: string) =>
        table === "payment_orders" ? paymentBuilder : upsellBuilder,
      ),
    },
  };
});

// ── Router: pin the order id, stub navigation, render Link as a plain anchor so
//    no Router context is required.
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ paymentOrderId: "order_test_123" }),
    useNavigate: () => vi.fn(),
    Link: ({ to, children, ...rest }: { to: unknown; children?: unknown }) =>
      createElement(
        "a",
        { href: typeof to === "string" ? to : "#", ...rest },
        children as never,
      ),
  };
});

// ── Auth: mutable session so a test can flip guest → signed-in and force the
//    fetch effect (deps `[paymentOrderId, session]`) to refetch the order.
const authState = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ session: authState.session }),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/platform", () => ({
  isNative: () => false,
  isAndroid: () => false,
  isIOS: () => false,
  isWeb: () => true,
}));

import ThankYou from "@/pages/ThankYou";
import { hapticNotification } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";

const successCalls = () =>
  vi.mocked(hapticNotification).mock.calls.filter(([type]) => type === "success");

// How many times the order fetch has been dispatched. Each fetch queries
// payment_orders and, after `order` is committed, offering_upsells — so the
// count of offering_upsells queries equals the number of fetches that reached
// their setOrder. Waiting on it is a deterministic "the refetch committed" gate.
const orderFetchCommits = () =>
  vi.mocked(supabase.from).mock.calls.filter(([t]) => t === "offering_upsells").length;

describe("ThankYou success haptic (P3 punch-list)", () => {
  beforeEach(() => {
    vi.mocked(hapticNotification).mockClear();
    vi.mocked(supabase.from).mockClear();
    authState.session = null;
  });

  it("fires exactly one 'success' haptic when a captured order mounts", async () => {
    render(createElement(ThankYou));

    // The captured order resolves asynchronously; the haptic effect fires only
    // after `order` flips from null → the captured row.
    await waitFor(() => {
      expect(successCalls().length).toBe(1);
    });

    // Exactly one call, and it is the success notification.
    expect(vi.mocked(hapticNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(hapticNotification)).toHaveBeenCalledWith("success");
  });

  it("does not re-fire the haptic when the order effect re-runs (ref guard)", async () => {
    const { rerender } = render(createElement(ThankYou));

    // First captured-order fetch → one haptic.
    await waitFor(() => {
      expect(orderFetchCommits()).toBe(1);
    });
    expect(successCalls().length).toBe(1);

    // Guest signs in on the thank-you page: `session` changes, so the fetch
    // effect (`[paymentOrderId, session]`) re-runs and commits a NEW order
    // object. The haptic effect (`[order, notFound]`) therefore re-runs with
    // its ref already set — the one-shot guarantee must hold.
    authState.session = { user: { id: "u1", email: "buyer@example.com" } };
    rerender(createElement(ThankYou));

    // Wait until the second fetch has committed its setOrder (proven by the
    // second offering_upsells query, which runs strictly after setOrder).
    await waitFor(() => {
      expect(orderFetchCommits()).toBe(2);
    });
    // Flush any trailing microtasks so a would-be second haptic could land.
    await Promise.resolve();
    await Promise.resolve();

    // Still exactly one — the ref guard suppressed the re-fire.
    expect(successCalls().length).toBe(1);
    expect(vi.mocked(hapticNotification)).toHaveBeenCalledTimes(1);
  });
});
