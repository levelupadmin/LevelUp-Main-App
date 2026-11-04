import { describe, it, expect } from "vitest";
import { buildVerifyBody, handOffFrom, postPaymentNavState, postPaymentRoute, razorpayContactLocked } from "@/lib/checkoutVerify";

const rzp = {
  razorpay_payment_id: "pay_1",
  razorpay_order_id: "order_1",
  razorpay_signature: "sig",
};

describe("buildVerifyBody", () => {
  it("marks a guest checkout so the edge function skips the login-token gate", () => {
    expect(buildVerifyBody(rzp, "po-1", true)).toEqual({ ...rzp, payment_order_id: "po-1", is_guest: true });
  });
  it("keeps signed-in checkouts on the authenticated path", () => {
    expect(buildVerifyBody(rzp, "po-1", false).is_guest).toBe(false);
  });
  it("sends a guest's order token (it proves this browser made the order), never a signed-in buyer's", () => {
    expect(buildVerifyBody(rzp, "po-1", true, "tok").reuse_token).toBe("tok");
    expect(buildVerifyBody(rzp, "po-1", false, "tok").reuse_token).toBeUndefined();
  });
});

describe("postPaymentRoute / postPaymentNavState", () => {
  it("sends a signed-in buyer straight to Thank-you", () => {
    expect(postPaymentRoute(false, "po-1")).toBe("/thank-you/po-1");
  });
  it("sends a guest to login with Thank-you as next, and never puts the phone in the URL", () => {
    const route = postPaymentRoute(true, "po-1");
    expect(route).toBe("/login?next=%2Fthank-you%2Fpo-1");
    expect(route).not.toContain("phone");
  });
  it("hands the phone over via router state, and asks for the code to go out by itself", () => {
    expect(postPaymentNavState("+919876543210", "a@b.co")).toEqual({ phone: "+919876543210", autoSend: true });
    expect(postPaymentNavState("")).toBeUndefined();
    expect(postPaymentNavState(null)).toBeUndefined();
  });
  it("sends a buyer with a number outside India to email sign-in, on the classic page", () => {
    expect(postPaymentNavState("+447911123456", "jo@example.co.uk")).toEqual({ email: "jo@example.co.uk", autoSend: true });
    expect(postPaymentNavState("+919876543210", "a@b.co", "email")).toEqual({ email: "a@b.co", autoSend: true });
    expect(postPaymentRoute(true, "po-1", true)).toBe("/login?classic=1&method=email&next=%2Fthank-you%2Fpo-1");
  });
  it("prefills nothing when a foreign number landed on a phone account", () => {
    expect(postPaymentNavState("+447911123456", "jo@example.co.uk", "phone")).toBeUndefined();
  });
});

describe("handOffFrom", () => {
  it("reads a session only when both tokens are strings", () => {
    expect(handOffFrom({ login_hint: "phone", session: { access_token: "a", refresh_token: "r" } }))
      .toEqual({ login_hint: "phone", session: { access_token: "a", refresh_token: "r" } });
    expect(handOffFrom({ login_hint: "email", session: { access_token: "a" } })).toEqual({ login_hint: "email", session: null });
    expect(handOffFrom(null)).toEqual({ login_hint: null, session: null });
  });
});

describe("razorpayContactLocked", () => {
  it("hides Razorpay's contact step only when both details are usable", () => {
    expect(razorpayContactLocked("a@b.co", "+919876543210")).toBe(true);
    expect(razorpayContactLocked("a@b.co", "+447911123456")).toBe(true);
    expect(razorpayContactLocked("", "+919876543210")).toBe(false);
    expect(razorpayContactLocked("a@b.co", "123")).toBe(false);
    expect(razorpayContactLocked("a@b.co", "+911234567890")).toBe(false);
    expect(razorpayContactLocked("919876543210@phone.leveluplearning.in", "+919876543210")).toBe(false);
  });
});
