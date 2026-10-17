import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * No state in which money may have moved can become a second charge:
 *  - after Razorpay reports success but verify does not confirm it, Pay and
 *    the sticky bar stay locked and "Check payment status" runs verify again;
 *  - after the sheet closes, the next Pay asks whether a payment landed on the
 *    last order before anything new is charged, and reopens the same order.
 */

vi.mock("@/lib/haptics", () => ({
  hapticNotification: vi.fn(() => Promise.resolve()),
  hapticImpact: vi.fn(() => Promise.resolve()),
  hapticSelection: vi.fn(() => Promise.resolve()),
  tapTick: vi.fn(() => Promise.resolve()),
}));

const trackSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({
  track: trackSpy,
  whenAnalyticsReady: () => Promise.resolve(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock("@/lib/platform", () => ({ isNative: () => false, isAndroid: () => false }));
vi.mock("@/components/checkout/TrustPanel", () => ({ default: () => null }));

const navigateSpy = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

const offering = {
  id: "off_1",
  title: "Nelson Dilipkumar Teaches Filmmaking",
  slug: "nelson",
  price_inr: 999,
  gst_mode: "inclusive",
  gst_rate: 18,
  status: "active",
  is_public: true,
  payment_mode: "full",
  product_tier: "masterclass",
  refund_policy_days: 7,
  currency: "INR",
  mrp_inr: null,
};

type Invoke = (name: string, opts: { body: Record<string, unknown> }) => Promise<{ data: unknown; error: unknown }>;
const invokeImpl = vi.hoisted(() => ({ fn: null as unknown as Invoke }));
const invokeSpy = vi.hoisted(() => vi.fn((name: string, opts: { body: Record<string, unknown> }) => invokeImpl.fn(name, opts)));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (result: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "neq", "is"]) b[m] = vi.fn(() => b);
    b.single = vi.fn(() => Promise.resolve(result));
    b.maybeSingle = vi.fn(() => Promise.resolve(result));
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad);
    return b;
  };
  return {
    supabase: {
      from: vi.fn((table: string) =>
        table === "offerings" ? builder({ data: offering, error: null }) : builder({ data: [], error: null }),
      ),
      functions: { invoke: invokeSpy },
    },
  };
});

type RzpOptions = {
  order_id: string;
  handler: (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => Promise<void>;
  modal: { ondismiss: () => void };
};
const sheets: RzpOptions[] = [];

import CheckoutPage from "@/pages/CheckoutPage";

function renderCheckout() {
  return render(
    <MemoryRouter initialEntries={["/checkout/off_1"]}>
      <Routes>
        <Route path="/checkout/:offeringId" element={<CheckoutPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillGuestForm() {
  fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "Asha Rao" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "asha@example.com" } });
  const phone = document.querySelector('input[type="tel"]') as HTMLInputElement;
  fireEvent.change(phone, { target: { value: "9876543210" } });
}

const payButtons = () =>
  screen.getAllByRole("button", { name: /Pay ₹999|Confirming your payment|Waiting on your last payment/ });
const calls = (name: string) => invokeSpy.mock.calls.filter(([n]) => n === name);

beforeEach(() => {
  sheets.length = 0;
  invokeSpy.mockClear();
  navigateSpy.mockClear();
  trackSpy.mockClear();
  window.sessionStorage.clear();
  (window as unknown as { Razorpay: unknown }).Razorpay = class {
    constructor(opts: RzpOptions) {
      sheets.push(opts);
    }
    on() {}
    open() {}
  };
});

const order = {
  razorpay_order_id: "order_1",
  amount: 99900,
  currency: "INR",
  key_id: "rzp_test_k",
  payment_order_id: "po_1",
  offering_title: offering.title,
};
const paid = { razorpay_payment_id: "pay_1", razorpay_order_id: "order_1", razorpay_signature: "sig" };

describe("CheckoutPage: no second charge", () => {
  it("locks Pay after an unconfirmed payment and checks the same order again", async () => {
    let verifyOk = false;
    invokeImpl.fn = async (name) => {
      if (name === "guest-create-order") return { data: order, error: null };
      if (name === "verify-razorpay-payment")
        return verifyOk ? { data: { success: true, offering_title: offering.title }, error: null } : { data: null, error: new Error("network") };
      return { data: { available: false }, error: null };
    };
    renderCheckout();
    await fillGuestForm();
    fireEvent.click(payButtons()[0]);
    await waitFor(() => expect(sheets).toHaveLength(1));

    await act(() => sheets[0].handler(paid));

    expect(await screen.findByText("Payment received. Confirming it now")).toBeInTheDocument();
    for (const b of payButtons()) expect(b).toBeDisabled();
    expect(trackSpy.mock.calls.some(([e]) => e.name === "purchase")).toBe(false);

    // Tapping a locked Pay does nothing.
    fireEvent.click(payButtons()[0]);
    expect(calls("guest-create-order")).toHaveLength(1);

    verifyOk = true;
    fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
    const verifies = calls("verify-razorpay-payment");
    expect(verifies).toHaveLength(2);
    expect(verifies[1][1].body).toEqual(verifies[0][1].body);
    expect(navigateSpy.mock.calls[0][0]).toBe(`/login?${new URLSearchParams({ next: "/thank-you/po_1" })}`);
    expect(trackSpy.mock.calls.filter(([e]) => e.name === "purchase")).toHaveLength(1);
    expect(calls("guest-create-order")).toHaveLength(1);
  });

  it("after a closed sheet, checks the last order and reopens it instead of making a new one", async () => {
    invokeImpl.fn = async (name, { body }) => {
      if (name === "guest-create-order") return { data: order, error: null };
      if (name === "verify-razorpay-payment" && body.status_check) return { data: { status: "none" }, error: null };
      return { data: { available: false }, error: null };
    };
    renderCheckout();
    await fillGuestForm();
    fireEvent.click(payButtons()[0]);
    await waitFor(() => expect(sheets).toHaveLength(1));
    act(() => sheets[0].modal.ondismiss());

    expect(await screen.findByText("Payment not finished")).toBeInTheDocument();
    expect(screen.queryByText(/nothing was charged/i)).toBeNull();

    fireEvent.click(payButtons()[0]);
    await waitFor(() => expect(sheets).toHaveLength(2));
    expect(sheets[1].order_id).toBe("order_1");
    expect(calls("guest-create-order")).toHaveLength(1);
    expect(calls("verify-razorpay-payment")[0][1].body).toEqual({
      payment_order_id: "po_1",
      is_guest: true,
      status_check: true,
    });
  });

  it("after a closed sheet, a payment that landed locks Pay instead of charging again", async () => {
    invokeImpl.fn = async (name, { body }) => {
      if (name === "guest-create-order") return { data: order, error: null };
      if (name === "verify-razorpay-payment" && body.status_check) return { data: { status: "paid" }, error: null };
      return { data: { available: false }, error: null };
    };
    renderCheckout();
    await fillGuestForm();
    fireEvent.click(payButtons()[0]);
    await waitFor(() => expect(sheets).toHaveLength(1));
    act(() => sheets[0].modal.ondismiss());
    await screen.findByText("Payment not finished");

    fireEvent.click(payButtons()[0]);
    expect(await screen.findByText("Payment received. Confirming it now")).toBeInTheDocument();
    for (const b of payButtons()) expect(b).toBeDisabled();
    expect(sheets).toHaveLength(1);
    expect(calls("guest-create-order")).toHaveLength(1);
  });

  it("a captured order whose course is not granted yet never says Welcome; it finishes once the course is there", async () => {
    // The server reads a captured order without an active enrolment as
    // needs_review (verify-razorpay-payment status_check).
    let status = "needs_review";
    invokeImpl.fn = async (name, { body }) => {
      if (name === "guest-create-order") return { data: order, error: null };
      if (name === "verify-razorpay-payment" && body.status_check) return { data: { status, razorpay_payment_id: "pay_1" }, error: null };
      return { data: { available: false }, error: null };
    };
    renderCheckout();
    await fillGuestForm();
    fireEvent.click(payButtons()[0]);
    await waitFor(() => expect(sheets).toHaveLength(1));
    act(() => sheets[0].modal.ondismiss());
    await screen.findByText("Payment not finished");

    fireEvent.click(payButtons()[0]);
    expect(await screen.findByText(/setting up your access by hand/)).toBeInTheDocument();
    for (const b of payButtons()) expect(b).toBeDisabled();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(trackSpy.mock.calls.some(([e]) => e.name === "purchase")).toBe(false);
    expect(sheets).toHaveLength(1);

    status = "captured";
    fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
    expect(navigateSpy.mock.calls[0][0]).toBe(`/login?${new URLSearchParams({ next: "/thank-you/po_1" })}`);
    expect(trackSpy.mock.calls.filter(([e]) => e.name === "purchase")).toHaveLength(1);
    expect(calls("guest-create-order")).toHaveLength(1);
  });

  it("an open payment on the last order with a changed cart locks Pay under a label that says so", async () => {
    invokeImpl.fn = async (name, { body }) => {
      if (name === "guest-create-order") return { data: order, error: null };
      if (name === "verify-razorpay-payment" && body.status_check) return { data: { status: "pending" }, error: null };
      return { data: { available: false }, error: null };
    };
    renderCheckout();
    await fillGuestForm();
    fireEvent.click(payButtons()[0]);
    await waitFor(() => expect(sheets).toHaveLength(1));
    act(() => sheets[0].modal.ondismiss());
    await screen.findByText("Payment not finished");

    // A different cart needs a different order, but the last one is still open.
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Asha R" } });
    fireEvent.click(payButtons()[0]);
    expect(await screen.findByText("Your last payment is still open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waiting on your last payment" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Confirming your payment" })).toBeNull();
    expect(sheets).toHaveLength(1);
    expect(calls("guest-create-order")).toHaveLength(1);
  });

  it("keeps Pay locked after a reload when Razorpay had reported the payment", async () => {
    window.sessionStorage.setItem(
      "lu_checkout_open_order:off_1",
      JSON.stringify({
        paymentOrderId: "po_1",
        razorpayOrderId: "order_1",
        amountPaise: 99900,
        currency: "INR",
        keyId: "rzp_test_k",
        offeringTitle: offering.title,
        isGuest: true,
        cartKey: "k",
        paid,
        savedAt: Date.now(),
      }),
    );
    invokeImpl.fn = async () => ({ data: { available: false }, error: null });
    renderCheckout();
    expect(await screen.findByText("Payment received. Confirming it now")).toBeInTheDocument();
    for (const b of payButtons()) expect(b).toBeDisabled();
  });
});
