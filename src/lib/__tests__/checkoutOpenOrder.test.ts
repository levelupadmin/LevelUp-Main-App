import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cartKey,
  guestReuseToken,
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

  it("keeps a guest order's reuse token, and drops an entry whose token is not a string", () => {
    saveOpenOrder("off_1", order({ savedAt: Date.now(), reuseToken: "a1".repeat(24) }));
    expect(loadOpenOrder("off_1")?.reuseToken).toBe("a1".repeat(24));
    saveOpenOrder("off_2", order({ savedAt: Date.now(), isGuest: false, reuseToken: null }));
    expect(loadOpenOrder("off_2")?.reuseToken).toBeNull();
    window.sessionStorage.setItem(
      "lu_checkout_open_order:off_5",
      JSON.stringify({ ...order({ savedAt: Date.now() }), reuseToken: 42 }),
    );
    expect(loadOpenOrder("off_5")).toBeNull();
  });
});

describe("guestReuseToken", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("is random, one per offering, and the same on every call in this browser", () => {
    const a = guestReuseToken("tok_off_1");
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(guestReuseToken("tok_off_1")).toBe(a);
    expect(window.localStorage.getItem("lu_checkout_reuse_token:tok_off_1")).toBe(a);
    const b = guestReuseToken("tok_off_2");
    expect(b).toMatch(/^[0-9a-f]{48}$/);
    expect(b).not.toBe(a);
  });

  it("uses the token another tab stored, and replaces one that is not a token it makes", () => {
    window.localStorage.setItem("lu_checkout_reuse_token:tok_off_3", "f0".repeat(24));
    expect(guestReuseToken("tok_off_3")).toBe("f0".repeat(24));
    window.localStorage.setItem("lu_checkout_reuse_token:tok_off_4", "planted");
    const t = guestReuseToken("tok_off_4");
    expect(t).toMatch(/^[0-9a-f]{48}$/);
    expect(window.localStorage.getItem("lu_checkout_reuse_token:tok_off_4")).toBe(t);
  });

  it("works with storage blocked: one token for this page view", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const t = guestReuseToken("tok_off_5");
    expect(t).toMatch(/^[0-9a-f]{48}$/);
    expect(guestReuseToken("tok_off_5")).toBe(t);
  });

  it("is null when the browser cannot make a random value", () => {
    vi.spyOn(window.crypto, "getRandomValues").mockImplementation(() => {
      throw new Error("no crypto");
    });
    expect(guestReuseToken("tok_off_6")).toBeNull();
  });
});
