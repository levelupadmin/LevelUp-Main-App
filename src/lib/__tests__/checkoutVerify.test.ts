import { describe, it, expect } from "vitest";
import { buildVerifyBody, postPaymentNavState, postPaymentRoute } from "@/lib/checkoutVerify";

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
  it("hands the phone over via router state", () => {
    expect(postPaymentNavState("+919876543210")).toEqual({ phone: "+919876543210" });
    expect(postPaymentNavState("")).toBeUndefined();
    expect(postPaymentNavState(null)).toBeUndefined();
  });
});
