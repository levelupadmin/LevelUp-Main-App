import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CAPTURE_MAX_READS, CAPTURE_POLL_MS } from "@/lib/thankYouWait";

/**
 * Thank-you right after paying (UI/UX audit, 30 Oct 2026, top-10 #1).
 *
 * The order can still read as not captured when the buyer lands. The page must
 * wait for capture with a calm "confirming" state, re-read the order for a
 * while, and then offer a retry and support. It must never tell a buyer who
 * just paid "Order not found", and it must never leave on its own.
 */

vi.mock("@/lib/haptics", () => ({
  hapticNotification: vi.fn(() => Promise.resolve()),
  hapticImpact: vi.fn(() => Promise.resolve()),
  hapticSelection: vi.fn(() => Promise.resolve()),
  tapTick: vi.fn(() => Promise.resolve()),
  confirm: vi.fn(() => Promise.resolve()),
  celebrate: vi.fn(() => Promise.resolve()),
}));

const ORDER_ID = "6f1c2a9e-3b7d-4c11-9a2e-5d8f0b7c4e21";

const fixture = vi.hoisted(() => ({
  // Read number (1-based) from which the order reads as captured. Infinity =
  // never captured.
  capturedFromRead: Infinity,
  reads: 0,
  orderUserId: "user_1" as string | null,
}));

function capturedOrder() {
  return {
    id: "6f1c2a9e-3b7d-4c11-9a2e-5d8f0b7c4e21",
    offering_id: "off_1",
    application_id: null,
    total_inr: 1499,
    status: "captured",
    razorpay_payment_id: "pay_1",
    guest_email: null,
    guest_name: null,
    guest_phone: null,
    user_id: fixture.orderUserId,
    created_at: new Date("2026-10-30T10:00:00.000Z").toISOString(),
    offerings: {
      title: "Test Masterclass",
      product_tier: "masterclass",
      subtitle: null,
      thumbnail_url: null,
      slug: "test-masterclass",
      meta_pixel_id: null,
      google_ads_conversion: null,
      custom_tracking_script: null,
      thankyou_thumbnail_url: null,
      thankyou_headline: null,
      thankyou_body: null,
      thankyou_cta_label: null,
      // An absolute custom URL: the old countdown would have sent the buyer
      // here after 10 s. Nothing may.
      thankyou_cta_url: "https://example.com/next",
      thankyou_show_calendly: false,
      calendly_url: null,
      validity_days: null,
      offering_courses: [],
    },
  };
}

vi.mock("@/integrations/supabase/client", () => {
  const orders: Record<string, unknown> = {};
  orders.select = vi.fn(() => orders);
  orders.eq = vi.fn(() => orders);
  orders.single = vi.fn(() => {
    fixture.reads += 1;
    if (fixture.reads >= fixture.capturedFromRead) {
      return Promise.resolve({ data: capturedOrder(), error: null });
    }
    return Promise.resolve({
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    });
  });

  const upsells: Record<string, unknown> = {};
  upsells.select = vi.fn(() => upsells);
  upsells.eq = vi.fn(() => upsells);
  upsells.order = vi.fn(() => Promise.resolve({ data: [] }));

  return {
    supabase: {
      from: vi.fn((table: string) => (table === "payment_orders" ? orders : upsells)),
    },
  };
});

const navigateSpy = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ paymentOrderId: "6f1c2a9e-3b7d-4c11-9a2e-5d8f0b7c4e21" }),
    useNavigate: () => navigateSpy,
    Link: ({ to, children, ...rest }: { to: unknown; children?: unknown }) =>
      createElement("a", { href: typeof to === "string" ? to : "#", ...rest }, children as never),
  };
});

const authState = vi.hoisted(() => ({
  session: { user: { id: "user_1", email: "buyer@example.com" }, access_token: "t" } as unknown,
}));
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

/** Let pending promise callbacks settle without moving the clock. */
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
/** Move the clock by `ms` and settle what that triggers. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("ThankYou: waiting for capture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fixture.reads = 0;
    fixture.capturedFromRead = Infinity;
    fixture.orderUserId = "user_1";
    authState.session = { user: { id: "user_1", email: "buyer@example.com" }, access_token: "t" };
    navigateSpy.mockClear();
    vi.mocked(hapticNotification).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a calm confirming state and lands on the receipt once capture is seen", async () => {
    fixture.capturedFromRead = 3;
    render(createElement(ThankYou));
    await flush();

    expect(screen.getByText("Confirming your payment")).toBeTruthy();
    expect(screen.queryByText(/not found/i)).toBeNull();
    // No haptic while waiting: nothing is confirmed yet.
    expect(hapticNotification).not.toHaveBeenCalled();

    await advance(CAPTURE_POLL_MS);
    expect(fixture.reads).toBe(2);
    expect(screen.getByText("Confirming your payment")).toBeTruthy();

    await advance(CAPTURE_POLL_MS);
    expect(fixture.reads).toBe(3);
    expect(screen.getByText("You're in.")).toBeTruthy();
    // One success haptic, on capture.
    expect(vi.mocked(hapticNotification).mock.calls).toEqual([["success"]]);

    // Polling stops once captured.
    await advance(CAPTURE_POLL_MS * 5);
    expect(fixture.reads).toBe(3);
  });

  it("after the full wait, offers a retry and support instead of 'not found'", async () => {
    render(createElement(ThankYou));
    await flush();
    await advance(CAPTURE_POLL_MS * (CAPTURE_MAX_READS - 1));

    expect(fixture.reads).toBe(CAPTURE_MAX_READS);
    expect(screen.getByText("This is taking longer than usual.")).toBeTruthy();
    expect(screen.queryByText(/not found/i)).toBeNull();

    const support = screen.getByText("Message us on WhatsApp").closest("a")!;
    expect(support.getAttribute("href")).toContain("api.whatsapp.com/send");
    expect(decodeURIComponent(support.getAttribute("href")!)).toContain(ORDER_ID);
    expect(screen.getByText("Order 6F1C2A9E")).toBeTruthy();

    // It stops reading after the window.
    await advance(CAPTURE_POLL_MS * 5);
    expect(fixture.reads).toBe(CAPTURE_MAX_READS);

    // "Check again" starts a fresh wait; capture lands on the next read.
    fixture.capturedFromRead = fixture.reads + 1;
    fireEvent.click(screen.getByRole("button", { name: /check again/i }));
    expect(screen.getByText("Confirming your payment")).toBeTruthy();
    await flush();
    expect(screen.getByText("You're in.")).toBeTruthy();
  });

  it("offers sign-in on the delayed screen when there is no session", async () => {
    authState.session = null;
    render(createElement(ThankYou));
    await flush();
    await advance(CAPTURE_POLL_MS * (CAPTURE_MAX_READS - 1));

    const signIn = screen.getByText("Sign in with the phone you paid with").closest("a")!;
    expect(signIn.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(`/thank-you/${ORDER_ID}`)}`);
  });

  it("never leaves the page on its own", async () => {
    fixture.capturedFromRead = 1;
    const hrefBefore = window.location.href;
    render(createElement(ThankYou));
    await flush();
    expect(screen.getByText("You're in.")).toBeTruthy();

    await advance(60_000);
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(window.location.href).toBe(hrefBefore);
    expect(screen.queryByText(/redirecting in|opening lesson 1 in/i)).toBeNull();
  });

  it("says the order is on another account, without polling, when the user differs", async () => {
    fixture.capturedFromRead = 1;
    fixture.orderUserId = "someone_else";
    render(createElement(ThankYou));
    await flush();

    expect(screen.getByText("This order is on another account.")).toBeTruthy();
    await advance(CAPTURE_POLL_MS * 3);
    expect(fixture.reads).toBe(1);
    expect(hapticNotification).not.toHaveBeenCalled();
  });
});
