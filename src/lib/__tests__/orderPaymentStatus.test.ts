import { describe, it, expect, vi } from "vitest";
import { classifyRazorpayPayments, orderPaymentStatus } from "@shared/orderPaymentStatus";

const keys = { keyId: "rzp_test_k", keySecret: "s" };
const respond = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
const granted = (yes: boolean) => vi.fn(async () => yes);

describe("classifyRazorpayPayments", () => {
  it("reads authorized or captured as paid, created as pending, the rest as none", () => {
    expect(classifyRazorpayPayments([{ status: "failed" }, { status: "captured" }])).toBe("paid");
    expect(classifyRazorpayPayments([{ status: "authorized" }])).toBe("paid");
    expect(classifyRazorpayPayments([{ status: "failed" }, { status: "created" }])).toBe("pending");
    expect(classifyRazorpayPayments([{ status: "failed" }, { status: "refunded" }])).toBe("none");
    expect(classifyRazorpayPayments([])).toBe("none");
    expect(classifyRazorpayPayments(undefined)).toBe("unknown");
  });
});

describe("orderPaymentStatus", () => {
  it("answers from our row without calling Razorpay when it is settled", async () => {
    const f = respond({ items: [] });
    const deps = { fetchImpl: f, courseGranted: granted(true) };
    await expect(
      orderPaymentStatus({ status: "captured", razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" }, keys, deps),
    ).resolves.toEqual({ status: "captured", razorpay_payment_id: "pay_1" });
    await expect(orderPaymentStatus({ status: "needs_review", razorpay_order_id: "order_1" }, keys, deps)).resolves.toEqual({
      status: "needs_review",
    });
    await expect(orderPaymentStatus({ status: "created", razorpay_order_id: null }, keys, deps)).resolves.toEqual({
      status: "none",
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("reads a captured single payment as needs_review until the buyer holds the course", async () => {
    const f = respond({ items: [] });
    const captured = { status: "captured", razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" };
    await expect(orderPaymentStatus(captured, keys, { fetchImpl: f, courseGranted: granted(false) })).resolves.toEqual({
      status: "needs_review",
    });
    const boom = vi.fn(async () => {
      throw new Error("db down");
    });
    await expect(orderPaymentStatus(captured, keys, { fetchImpl: f, courseGranted: boom })).resolves.toEqual({
      status: "needs_review",
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("answers a staged cohort payment from the row without asking about the course", async () => {
    const ask = granted(false);
    await expect(
      orderPaymentStatus(
        { status: "captured", razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", payment_type: "app_fee", application_id: "app_1" },
        keys,
        { courseGranted: ask },
      ),
    ).resolves.toEqual({ status: "captured", razorpay_payment_id: "pay_1" });
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks Razorpay for the order's payments while our row is open or failed", async () => {
    const f = respond({ items: [{ status: "captured" }] });
    await expect(
      orderPaymentStatus({ status: "failed", razorpay_order_id: "order_1" }, keys, { fetchImpl: f, courseGranted: granted(true) }),
    ).resolves.toEqual({ status: "paid" });
    expect(f).toHaveBeenCalledWith(
      "https://api.razorpay.com/v1/orders/order_1/payments",
      expect.objectContaining({ headers: { Authorization: `Basic ${btoa("rzp_test_k:s")}` } }),
    );
  });

  it("says unknown when Razorpay cannot be asked", async () => {
    await expect(
      orderPaymentStatus({ status: "created", razorpay_order_id: "order_1" }, keys, {
        fetchImpl: respond({}, false),
        courseGranted: granted(true),
      }),
    ).resolves.toEqual({ status: "unknown" });
    const boom = vi.fn(async () => {
      throw new Error("network");
    });
    await expect(
      orderPaymentStatus({ status: "created", razorpay_order_id: "order_1" }, keys, {
        fetchImpl: boom as unknown as typeof fetch,
        courseGranted: granted(true),
      }),
    ).resolves.toEqual({ status: "unknown" });
  });
});
