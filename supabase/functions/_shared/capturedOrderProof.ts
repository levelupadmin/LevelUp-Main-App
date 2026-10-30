/**
 * Payment proof for a single-payment order that is already marked captured.
 *
 * verify-razorpay-payment's already-captured return used to grant the course
 * from the row alone. Until migration 20261030120000, any signed-in user could
 * insert a payment_orders row of their own (policy payment_orders_insert_own,
 * with status "captured" allowed), so a made-up row plus one verify call with
 * any non-empty strings would likely have granted a paid course. The migration
 * closes the insert; this file makes verify ask for proof as well, so a row is
 * never enough on its own.
 *
 * Proof is Razorpay's own record, fetched with our key:
 *   - the row's payment is captured or authorized, on the row's Razorpay
 *     order, for exactly the row's total in paise;
 *   - the row's Razorpay order has receipt = this row's id. create-razorpay-order
 *     and guest-create-order set it when they make the order. Without this, a
 *     made-up row could point at a real, cheaper payment of the caller's (another
 *     course, an event fee) and set total_inr to match it.
 * The caller must also send the row's Razorpay order id.
 *
 * The checkout's signature is not proof on its own here: it shows that Razorpay
 * signed some payment on that Razorpay order, not that the order belongs to this
 * row or was for this amount. It counts only when Razorpay cannot be asked: a
 * valid signature for the row's own order and payment lets verify answer success
 * when the buyer already holds the course, which grants nothing.
 *
 * Pure apart from the injected fetch and enrolment read, so vitest can drive it.
 */

import { hmacSha256Hex, timingSafeEqual } from "./crypto.ts";

export type CapturedOrderProof =
  /** Razorpay confirms the row: grant the course as before. */
  | { kind: "proven" }
  /** Razorpay could not be asked, the signature is valid, and the buyer holds the course: answer success, grant nothing. */
  | { kind: "held" }
  /** Razorpay could not be asked: change nothing, ask the buyer to check again. */
  | { kind: "retry"; detail: string }
  /** The payment does not match the row: change nothing, grant nothing. */
  | { kind: "refused"; detail: string };

export type CapturedOrderRow = {
  id: string;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  total_inr?: number | string | null;
};

export type SentProof = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type Fetched = { ok: true; body: Record<string, unknown> } | { ok: false; unreachable: boolean; detail: string };

async function fetchRazorpay(
  path: string,
  razorpay: { keyId: string; keySecret: string },
  fetchImpl: typeof fetch,
): Promise<Fetched> {
  try {
    const res = await fetchImpl(`https://api.razorpay.com/v1/${path}`, {
      headers: { Authorization: "Basic " + btoa(`${razorpay.keyId}:${razorpay.keySecret}`) },
    });
    if (!res.ok) {
      // 5xx or 429: Razorpay could not answer, which says nothing about the payment.
      return { ok: false, unreachable: res.status >= 500 || res.status === 429, detail: `${path}: Razorpay API ${res.status}` };
    }
    const body = await res.json();
    if (!body || typeof body !== "object") return { ok: false, unreachable: false, detail: `${path}: unreadable body` };
    return { ok: true, body: body as Record<string, unknown> };
  } catch (e) {
    return { ok: false, unreachable: true, detail: `${path}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function proveCapturedOrder(
  po: CapturedOrderRow,
  sent: SentProof,
  razorpay: { keyId: string; keySecret: string },
  deps: {
    /** Does the buyer hold this order's course? Throws when it cannot tell. */
    courseGranted: () => Promise<boolean>;
    fetchImpl?: typeof fetch;
  },
): Promise<CapturedOrderProof> {
  const orderId = typeof po.razorpay_order_id === "string" ? po.razorpay_order_id.trim() : "";
  const paymentId = typeof po.razorpay_payment_id === "string" ? po.razorpay_payment_id.trim() : "";
  if (!orderId || !paymentId) return { kind: "refused", detail: "the row has no Razorpay order or payment id" };
  if (sent.razorpay_order_id !== orderId) return { kind: "refused", detail: "the sent Razorpay order id is not the row's" };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const [payment, order] = await Promise.all([
    fetchRazorpay(`payments/${encodeURIComponent(paymentId)}`, razorpay, fetchImpl),
    fetchRazorpay(`orders/${encodeURIComponent(orderId)}`, razorpay, fetchImpl),
  ]);

  if ((!payment.ok && payment.unreachable) || (!order.ok && order.unreachable)) {
    const detail = [payment, order].filter((f): f is Extract<Fetched, { ok: false }> => !f.ok).map((f) => f.detail).join("; ");
    const signed =
      sent.razorpay_payment_id === paymentId &&
      timingSafeEqual(await hmacSha256Hex(`${orderId}|${paymentId}`, razorpay.keySecret), sent.razorpay_signature);
    if (signed) {
      let held = false;
      try {
        held = await deps.courseGranted();
      } catch {
        held = false;
      }
      if (held) return { kind: "held" };
    }
    return { kind: "retry", detail };
  }
  if (!payment.ok) return { kind: "refused", detail: payment.detail };
  if (!order.ok) return { kind: "refused", detail: order.detail };

  const p = payment.body;
  const expectedPaise = Math.round(Number(po.total_inr) * 100);
  const problems: string[] = [];
  if (p.id !== paymentId) problems.push(`payment id ${String(p.id)}`);
  if (p.status !== "captured" && p.status !== "authorized") problems.push(`payment status ${String(p.status)}`);
  if (p.order_id !== orderId) problems.push(`payment is on order ${String(p.order_id)}`);
  if (typeof p.amount !== "number" || p.amount !== expectedPaise) problems.push(`amount ${String(p.amount)} (expected ${expectedPaise})`);
  if (order.body.receipt !== po.id) problems.push(`order receipt ${String(order.body.receipt)}`);
  if (problems.length > 0) return { kind: "refused", detail: problems.join(", ") };
  return { kind: "proven" };
}
