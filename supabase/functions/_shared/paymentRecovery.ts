/**
 * Paid at Razorpay, still "created" here: which orders to recover, and how.
 *
 * Why this exists (2026-10-29): only two things turn a Razorpay payment into
 * access, the browser's handler calling verify-razorpay-payment and Razorpay
 * calling razorpay-webhook. On mobile UPI the browser often never comes back
 * (the page dies while the buyer is in their UPI app), so the webhook was the
 * only path for those buyers. The Supabase pause of 2026-10-09 made webhook
 * deliveries fail for days, Razorpay stopped sending them, and every buyer
 * whose browser did not return paid and got nothing: their order stayed
 * "created" with no payment id. reconcile-razorpay-orders asks Razorpay
 * itself on a schedule, so neither of those two paths is the only way in.
 *
 * Only a CAPTURED payment is recovered, the same rule as the webhook (which
 * acts on payment.captured alone). An authorized payment is reported and left
 * for a later run: it is not our money until it is captured.
 *
 * Pure and free of imports so vitest can run it.
 */

/** The fields of a Razorpay payment entity this file reads. */
export type RazorpayPayment = {
  id: string;
  order_id?: string | null;
  status?: string | null;
  /** In paise. */
  amount?: number | null;
  currency?: string | null;
  /** Unix seconds. */
  created_at?: number | null;
};

export type OpenOrder = {
  id: string;
  razorpay_order_id: string | null;
  status: string | null;
  total_inr: number | string | null;
  payment_type?: string | null;
  application_id?: string | null;
};

export type RecoveryStep =
  /** Captured, right amount: capture the order and grant the course. */
  | { kind: "capture"; order: OpenOrder; payment: RazorpayPayment; extraPayments: RazorpayPayment[] }
  /** Captured, wrong amount or currency: park it for a person, as the webhook does. */
  | { kind: "amount_mismatch"; order: OpenOrder; payment: RazorpayPayment }
  /** Authorized but not captured yet: report it; a later run picks it up once captured. */
  | { kind: "authorized_only"; order: OpenOrder; payment: RazorpayPayment }
  /** A staged cohort payment: its pipeline lives in the webhook, so a person handles it. */
  | { kind: "staged"; order: OpenOrder; payment: RazorpayPayment };

/** How long a payment is left to verify and the webhook before this file touches its order. */
export const RECOVERY_MIN_AGE_MS = 10 * 60 * 1000;

/**
 * Order statuses a captured payment can still be recovered from. "failed" is
 * what verify writes when it could not confirm a payment; the webhook still
 * captures such an order when Razorpay reports the payment, so this does too.
 */
export const RECOVERABLE_STATUSES = ["created", "failed"];

function byCreatedAt(a: RazorpayPayment, b: RazorpayPayment): number {
  return (a.created_at ?? 0) - (b.created_at ?? 0);
}

/**
 * What to do with each still-open order ("created" or "failed") that Razorpay
 * holds a payment for. Orders in any other status, payments younger than
 * `minAgeMs`, and payments on orders we do not have are left out.
 */
export function planRecovery(
  orders: OpenOrder[],
  payments: RazorpayPayment[],
  opts: { now: number; minAgeMs?: number },
): RecoveryStep[] {
  const minAgeMs = opts.minAgeMs ?? RECOVERY_MIN_AGE_MS;
  const byOrder = new Map<string, RazorpayPayment[]>();
  for (const p of payments) {
    if (!p || typeof p.id !== "string" || !p.order_id) continue;
    const list = byOrder.get(p.order_id) ?? [];
    list.push(p);
    byOrder.set(p.order_id, list);
  }

  const steps: RecoveryStep[] = [];
  for (const order of orders) {
    if (!RECOVERABLE_STATUSES.includes(order.status ?? "") || !order.razorpay_order_id) continue;
    const mine = (byOrder.get(order.razorpay_order_id) ?? []).slice().sort(byCreatedAt);
    // A payment still in flight belongs to verify and the webhook for now.
    if (mine.some((p) => opts.now - (p.created_at ?? 0) * 1000 < minAgeMs)) continue;

    const captured = mine.filter((p) => p.status === "captured");
    const payment = captured[0];
    if (!payment) {
      const authorized = mine.find((p) => p.status === "authorized");
      if (authorized) steps.push({ kind: "authorized_only", order, payment: authorized });
      continue;
    }
    if (order.payment_type || order.application_id) {
      steps.push({ kind: "staged", order, payment });
      continue;
    }
    const expectedPaise = Math.round(Number(order.total_inr) * 100);
    if (payment.amount !== expectedPaise || (payment.currency ?? "INR") !== "INR") {
      steps.push({ kind: "amount_mismatch", order, payment });
      continue;
    }
    steps.push({ kind: "capture", order, payment, extraPayments: captured.slice(1) });
  }
  return steps;
}

/** The buyer's active enrolment in the course, with the order it came from (if any). */
export type HeldEnrolment = {
  payment_order_id: string | null;
  order?: { status?: string | null; razorpay_payment_id?: string | null; total_inr?: number | string | null } | null;
};

/**
 * Did the buyer already pay for this course on another order? Then this
 * payment is a second charge: a refund candidate for a person, not a sale to
 * finish (no coupon use, no receipt, no Purchase). A course held from an admin
 * grant or a free order is not a payment, so it does not count. Returns the
 * other order's id, or null.
 */
export function duplicateOf(held: HeldEnrolment | null | undefined, orderId: string): string | null {
  if (!held?.payment_order_id || held.payment_order_id === orderId) return null;
  const o = held.order;
  const paid =
    !!o && o.status === "captured" && typeof o.razorpay_payment_id === "string" && o.razorpay_payment_id !== "" &&
    Number(o.total_inr) > 0;
  return paid ? held.payment_order_id : null;
}

/**
 * Should a captured order whose buyer holds no course be granted it again?
 * A grant refused because the course was taken away or the order had no buyer
 * is for a person (notes.grant_issue, _shared/captureGrant.ts); anything else,
 * including no marker at all (a run that died between capture and grant), is
 * retried.
 */
export function grantRetryable(notes: unknown): boolean {
  const issue =
    notes && typeof notes === "object" && !Array.isArray(notes)
      ? (notes as { grant_issue?: { reason?: unknown; resolved_at?: unknown } }).grant_issue
      : undefined;
  if (!issue || issue.resolved_at) return true;
  return issue.reason !== "taken_away" && issue.reason !== "no_user";
}

/** The lookback a caller asked for, in hours: 72 by default, clamped to 1..1080 (45 days). */
export function lookbackHours(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 72;
  return Math.min(Math.max(Math.floor(n), 1), 1080);
}

/** Only a body that says `dry_run: false` in so many words writes anything. */
export function isLiveRun(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as { dry_run?: unknown }).dry_run === false;
}

/** The last four digits of a phone, for a report that should not carry the number. */
export function phoneTail(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `…${digits.slice(-4)}` : null;
}
