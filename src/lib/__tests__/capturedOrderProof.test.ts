import { describe, it, expect, vi } from "vitest";
import { hmacSha256Hex } from "@shared/crypto";
import { proveCapturedOrder, type CapturedOrderRow } from "@shared/capturedOrderProof";

/**
 * verify-razorpay-payment grants the course on an already-captured order only
 * when Razorpay's own record proves the row: the row's payment is captured on
 * the row's Razorpay order for the row's total, and that order's receipt is the
 * row's id. A made-up row (one a signed-in user could insert before migration
 * 20261030120000) must never be enough, even with a real signature or a real,
 * cheaper payment of the caller's.
 */

const KEYS = { keyId: "rzp_test_k", keySecret: "rzp_secret" };

const row: CapturedOrderRow = {
  id: "po_1",
  razorpay_order_id: "order_1",
  razorpay_payment_id: "pay_1",
  total_inr: "999.00",
};

const signature = (orderId = "order_1", paymentId = "pay_1") => hmacSha256Hex(`${orderId}|${paymentId}`, KEYS.keySecret);

async function sent(over: Partial<{ razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }> = {}) {
  return { razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: await signature(), ...over };
}

type Answer = { status: number; body?: unknown } | "throw";

/** A stand-in for Razorpay: answers by path, records each call. */
function razorpay(answers: { payment?: Answer; order?: Answer } = {}) {
  const calls: string[] = [];
  const payment: Answer = answers.payment ?? {
    status: 200,
    body: { id: "pay_1", status: "captured", order_id: "order_1", amount: 99900 },
  };
  const order: Answer = answers.order ?? { status: 200, body: { id: "order_1", receipt: "po_1", status: "paid" } };
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    const a = u.includes("/v1/payments/") ? payment : order;
    if (a === "throw") throw new Error("network down");
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const holds = (v: boolean) => vi.fn(async () => v);

describe("proveCapturedOrder", () => {
  it("proves a real captured order and asks Razorpay about the row's own payment and order", async () => {
    const rp = razorpay();
    const courseGranted = holds(false);
    expect(await proveCapturedOrder(row, await sent(), KEYS, { courseGranted, fetchImpl: rp.fetchImpl })).toEqual({ kind: "proven" });
    expect(rp.calls.sort()).toEqual(["https://api.razorpay.com/v1/orders/order_1", "https://api.razorpay.com/v1/payments/pay_1"]);
    expect(courseGranted).not.toHaveBeenCalled();
  });

  it("accepts an authorized payment, as the first-time verify does", async () => {
    const rp = razorpay({ payment: { status: 200, body: { id: "pay_1", status: "authorized", order_id: "order_1", amount: 99900 } } });
    expect((await proveCapturedOrder(row, await sent(), KEYS, { courseGranted: holds(false), fetchImpl: rp.fetchImpl })).kind).toBe("proven");
  });

  it("needs Razorpay's word, not the caller's signature: junk strings are proven only by the real record", async () => {
    // The guest flow does not scope the order to a login; a caller who knows a
    // real order's id still only gets the real buyer's own course granted.
    const rp = razorpay();
    const junk = { razorpay_order_id: "order_1", razorpay_payment_id: "x", razorpay_signature: "x" };
    expect((await proveCapturedOrder(row, junk, KEYS, { courseGranted: holds(false), fetchImpl: rp.fetchImpl })).kind).toBe("proven");
  });

  it("refuses a made-up row that points at a real, cheaper payment of the caller's", async () => {
    // The row claims an expensive course for ₹99 and borrows a real ₹99
    // payment on a Razorpay order made for something else. Amount and
    // signature both match; only the order's receipt gives it away.
    const cheap = { ...row, id: "po_forged", total_inr: 99 };
    const rp = razorpay({
      payment: { status: 200, body: { id: "pay_1", status: "captured", order_id: "order_1", amount: 9900 } },
      order: { status: 200, body: { id: "order_1", receipt: "po_real_cheap_order" } },
    });
    const proof = await proveCapturedOrder(cheap, await sent(), KEYS, { courseGranted: holds(false), fetchImpl: rp.fetchImpl });
    expect(proof).toMatchObject({ kind: "refused" });
    expect(proof.kind === "refused" && proof.detail).toContain("receipt po_real_cheap_order");
  });

  it("refuses an event-fee order, which has no payment_orders row and no receipt", async () => {
    const rp = razorpay({ order: { status: 200, body: { id: "order_1", receipt: null } } });
    expect((await proveCapturedOrder(row, await sent(), KEYS, { courseGranted: holds(true), fetchImpl: rp.fetchImpl })).kind).toBe("refused");
  });

  it("refuses when the payment is for another amount, another order, or did not go through", async () => {
    const cases = [
      { id: "pay_1", status: "captured", order_id: "order_1", amount: 100 },
      { id: "pay_1", status: "captured", order_id: "order_1", amount: "99900" },
      { id: "pay_1", status: "captured", order_id: "order_2", amount: 99900 },
      { id: "pay_1", status: "failed", order_id: "order_1", amount: 99900 },
      { id: "pay_1", status: "refunded", order_id: "order_1", amount: 99900 },
      { id: "pay_2", status: "captured", order_id: "order_1", amount: 99900 },
    ];
    for (const body of cases) {
      const rp = razorpay({ payment: { status: 200, body } });
      const proof = await proveCapturedOrder(row, await sent(), KEYS, { courseGranted: holds(true), fetchImpl: rp.fetchImpl });
      expect({ body, kind: proof.kind }).toEqual({ body, kind: "refused" });
    }
  });

  it("refuses when Razorpay does not know the payment or the order", async () => {
    for (const answers of [{ payment: { status: 400 } }, { order: { status: 404 } }]) {
      const rp = razorpay(answers);
      expect((await proveCapturedOrder(row, await sent(), KEYS, { courseGranted: holds(true), fetchImpl: rp.fetchImpl })).kind).toBe("refused");
    }
  });

  it("refuses without asking Razorpay when the row lacks ids or the caller sends another order id", async () => {
    const rp = razorpay();
    const deps = { courseGranted: holds(true), fetchImpl: rp.fetchImpl };
    expect((await proveCapturedOrder({ ...row, razorpay_order_id: null }, await sent(), KEYS, deps)).kind).toBe("refused");
    expect((await proveCapturedOrder({ ...row, razorpay_payment_id: " " }, await sent(), KEYS, deps)).kind).toBe("refused");
    expect((await proveCapturedOrder(row, await sent({ razorpay_order_id: "order_9" }), KEYS, deps)).kind).toBe("refused");
    expect(rp.calls).toEqual([]);
  });

  describe("when Razorpay cannot be asked", () => {
    const outages: Array<[string, { payment?: Answer; order?: Answer }]> = [
      ["payment 503", { payment: { status: 503 } }],
      ["order 500", { order: { status: 500 } }],
      ["payment 429", { payment: { status: 429 } }],
      ["network error", { payment: "throw", order: "throw" }],
    ];

    it("a valid signature and a course the buyer already holds read as held", async () => {
      for (const [label, answers] of outages) {
        const rp = razorpay(answers);
        const proof = await proveCapturedOrder(row, await sent(), KEYS, { courseGranted: holds(true), fetchImpl: rp.fetchImpl });
        expect({ label, kind: proof.kind }).toEqual({ label, kind: "held" });
      }
    });

    it("never grants: no course held, a bad signature, or a signature for another payment all ask for a retry", async () => {
      const variants = [
        { courseGranted: holds(false), sent: await sent() },
        { courseGranted: vi.fn(async () => Promise.reject(new Error("read failed"))), sent: await sent() },
        { courseGranted: holds(true), sent: await sent({ razorpay_signature: "junk" }) },
        // Signed by Razorpay, but for a different payment than the row's.
        { courseGranted: holds(true), sent: await sent({ razorpay_payment_id: "pay_2", razorpay_signature: await signature("order_1", "pay_2") }) },
      ];
      for (const v of variants) {
        const rp = razorpay({ payment: { status: 503 } });
        const proof = await proveCapturedOrder(row, v.sent, KEYS, { courseGranted: v.courseGranted, fetchImpl: rp.fetchImpl });
        expect(proof.kind).toBe("retry");
      }
    });
  });
});
