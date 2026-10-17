import { describe, it, expect, beforeEach } from "vitest";
import {
  cartKey,
  loadOpenOrder,
  paymentLocked,
  payStepFor,
  saveOpenOrder,
  type OpenOrder,
} from "@/lib/checkoutOpenOrder";

const order = (over: Partial<OpenOrder> = {}): OpenOrder => ({
  paymentOrderId: "po_1",
  razorpayOrderId: "order_1",
  amountPaise: 99900,
  currency: "INR",
  keyId: "rzp_live_x",
  offeringTitle: "Masterclass",
  isGuest: true,
  cartKey: "k",
  paid: null,
  savedAt: 1_000,
  ...over,
});

describe("payStepFor", () => {
  it("never starts a new order when money moved or may have", () => {
    expect(payStepFor("paid", true)).toBe("locked");
    expect(payStepFor("paid", false)).toBe("locked");
    expect(payStepFor("needs_review", true)).toBe("locked");
    // An open or unknown attempt may still be paid: a changed cart cannot get
    // a fresh order, the same cart reopens the same Razorpay order.
    expect(payStepFor("pending", false)).toBe("locked");
    expect(payStepFor("unknown", false)).toBe("locked");
    expect(payStepFor("pending", true)).toBe("reopen");
    expect(payStepFor("unknown", true)).toBe("reopen");
  });

  it("finishes a captured order and allows a new one only when nothing was paid", () => {
    expect(payStepFor("captured", false)).toBe("done");
    expect(payStepFor("none", true)).toBe("reopen");
    expect(payStepFor("none", false)).toBe("new_order");
  });
});

describe("paymentLocked", () => {
  it("locks Pay while a payment is being confirmed or cannot be cleared", () => {
    expect(paymentLocked({ kind: "verify_pending" })).toBe(true);
    expect(paymentLocked({ kind: "check_needed", reason: "unknown", locked: true })).toBe(true);
    expect(paymentLocked({ kind: "check_needed", reason: "pending", locked: false })).toBe(false);
    expect(paymentLocked({ kind: "dismissed" })).toBe(false);
    expect(paymentLocked({ kind: "no_payment_found" })).toBe(false);
    expect(paymentLocked(null)).toBe(false);
  });
});

describe("cartKey", () => {
  it("ignores key order and changes with the price inputs", () => {
    expect(cartKey({ total: 999, coupon: null })).toBe(cartKey({ coupon: null, total: 999 }));
    expect(cartKey({ total: 999, coupon: null })).not.toBe(cartKey({ total: 799, coupon: "c1" }));
  });
});

describe("open order storage", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("round-trips per offering and forgets on null", () => {
    saveOpenOrder("off_1", order({ savedAt: Date.now() }));
    expect(loadOpenOrder("off_1")?.paymentOrderId).toBe("po_1");
    expect(loadOpenOrder("off_2")).toBeNull();
    saveOpenOrder("off_1", null);
    expect(loadOpenOrder("off_1")).toBeNull();
  });

  it("drops entries older than a day and malformed ones", () => {
    saveOpenOrder("off_1", order({ savedAt: 0 }));
    expect(loadOpenOrder("off_1", 25 * 60 * 60 * 1000)).toBeNull();
    window.sessionStorage.setItem("lu_checkout_open_order:off_3", "{\"paymentOrderId\":1}");
    expect(loadOpenOrder("off_3")).toBeNull();
    window.sessionStorage.setItem("lu_checkout_open_order:off_4", "not json");
    expect(loadOpenOrder("off_4")).toBeNull();
  });
});
