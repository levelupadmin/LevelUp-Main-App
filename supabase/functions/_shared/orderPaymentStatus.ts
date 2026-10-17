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
 *   captured      our row is captured: the buyer has the course
 *   needs_review  our row is parked for a person: money moved
 *   paid          Razorpay holds an authorized or captured payment on the
 *                 order that our row has not caught up with yet
 *   pending       a payment on the order was started and has not finished
 *   none          Razorpay shows no started, authorized or captured payment
 *   unknown       we could not ask Razorpay
 *
 * Pure apart from the injected fetch, so vitest can drive it.
 */

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
};

export async function orderPaymentStatus(
  po: OrderRow,
  razorpay: { keyId: string; keySecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: OrderPaymentStatus; razorpay_payment_id?: string | null }> {
  if (po.status === "captured") {
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
