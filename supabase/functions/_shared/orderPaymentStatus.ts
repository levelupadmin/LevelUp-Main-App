/**
 * Did any money land on a payment order? A read-only answer for the checkout,
 * which asks before it lets a buyer start a new payment after a closed
 * Razorpay sheet, and from its "Check payment status" button.
 *
 * Why the checkout needs it: a buyer can finish a UPI payment in their UPI app
 * after the Razorpay sheet has closed (common in the Instagram and Facebook
 * in-app browsers). The sheet then reports nothing, our order row still reads
 * "created", and a fresh order would let the buyer pay a second time.
 *
 *   captured      our row is captured and, for a paid single payment, the
 *                 buyer holds the course
 *   needs_review  our row is parked for a person, or it is captured but the
 *                 course is not granted (yet): money moved either way
 *   paid          Razorpay holds an authorized or captured payment on the
 *                 order that our row has not caught up with yet
 *   pending       a payment on the order was started and has not finished
 *   none          Razorpay shows no started, authorized or captured payment
 *   unknown       we could not ask Razorpay
 *
 * Captured is not the same as granted: verify writes "captured" before it
 * inserts the enrolment, and the step between can fail. Reading such an order
 * as "captured" sent the buyer a "Welcome" for a course no one granted, so a
 * single payment counts as captured only when `courseGranted` says the buyer
 * holds the course. Staged cohort payments answer from the row, as before.
 *
 * A free order (no Razorpay payment, or a total of 0) answers from the row as
 * well, without asking about the course. guest-create-order writes it captured
 * at creation and credits it to the typed phone's account, so `courseGranted`
 * would read that person's enrolments, and the answer would tell a caller with
 * no login whether they once held the course and lost it.
 *
 * Pure apart from the injected fetch and enrolment read, so vitest can drive it.
 */

import { paidOrder } from "./captureGrant.ts";

export type OrderPaymentStatus = "captured" | "needs_review" | "paid" | "pending" | "none" | "unknown";

/** Razorpay's payment list for one order → what it means for a new payment. */
export function classifyRazorpayPayments(items: unknown): "paid" | "pending" | "none" | "unknown" {
  if (!Array.isArray(items)) return "unknown";
  const statuses = items.map((p) =>
    p && typeof p === "object" ? String((p as { status?: unknown }).status ?? "") : "",
  );
  if (statuses.some((s) => s === "captured" || s === "authorized")) return "paid";
  if (statuses.some((s) => s === "created")) return "pending";
  return "none";
}

export type OrderRow = {
  status: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id?: string | null;
  total_inr?: number | string | null;
  payment_type?: string | null;
  application_id?: string | null;
};

export async function orderPaymentStatus(
  po: OrderRow,
  razorpay: { keyId: string; keySecret: string },
  deps: {
    /** Does the buyer hold this order's course? Throws when it cannot tell. */
    courseGranted: () => Promise<boolean>;
    fetchImpl?: typeof fetch;
  },
): Promise<{ status: OrderPaymentStatus; razorpay_payment_id?: string | null }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  if (po.status === "captured") {
    if (!po.payment_type && !po.application_id && paidOrder(po)) {
      let granted = false;
      try {
        granted = await deps.courseGranted();
      } catch {
        granted = false;
      }
      if (!granted) return { status: "needs_review" };
    }
    return { status: "captured", razorpay_payment_id: po.razorpay_payment_id ?? null };
  }
  if (po.status === "needs_review") return { status: "needs_review" };
  if (!po.razorpay_order_id) return { status: "none" };
  try {
    const res = await fetchImpl(
      `https://api.razorpay.com/v1/orders/${encodeURIComponent(po.razorpay_order_id)}/payments`,
      { headers: { Authorization: "Basic " + btoa(`${razorpay.keyId}:${razorpay.keySecret}`) } },
    );
    if (!res.ok) return { status: "unknown" };
    const body = (await res.json()) as { items?: unknown };
    return { status: classifyRazorpayPayments(body?.items) };
  } catch {
    return { status: "unknown" };
  }
}
