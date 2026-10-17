import type { RazorpaySuccess } from "@/lib/checkoutVerify";
import type { PaymentIssue } from "@/components/checkout/PaymentNotice";
import type { OrderPaymentStatus } from "@shared/orderPaymentStatus";

/**
 * The last payment order this checkout opened a Razorpay sheet for, kept until
 * the order is paid and verified. It exists so that no state in which money
 * may have moved can turn into a second charge:
 *
 *  - after Razorpay reports success (`paid` is set) but verification did not
 *    confirm it, Pay stays locked and "Check payment status" runs the same
 *    verification again for the same order;
 *  - after the sheet closes without a result, the next Pay first asks the
 *    server whether a payment landed on that order (a UPI payment can finish
 *    in the UPI app after the sheet is gone). Only when none did may a new
 *    order be made; an unchanged cart simply reopens the same Razorpay order,
 *    which takes one successful payment only.
 *
 * Kept in sessionStorage per offering as well, so a reload in the same tab
 * does not hand the buyer a live Pay button again. Storage is a convenience:
 * every read and write is wrapped, and the page works without it.
 */
export type OpenOrder = {
  paymentOrderId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  offeringTitle: string | null;
  isGuest: boolean;
  /** What the order was priced from; a different cart needs a different order. */
  cartKey: string;
  /** Razorpay's success payload, once its handler fired: money has moved. */
  paid?: RazorpaySuccess | null;
  savedAt: number;
};

const STORAGE_PREFIX = "lu_checkout_open_order:";
/** Older entries are dropped: a payment cannot land on a day-old attempt. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function cartKey(parts: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(parts)
      .sort()
      .map((k) => [k, parts[k] ?? null]),
  );
}

function isOpenOrder(v: unknown): v is OpenOrder {
  const o = v as Partial<OpenOrder> | null;
  return (
    !!o &&
    typeof o === "object" &&
    typeof o.paymentOrderId === "string" &&
    typeof o.razorpayOrderId === "string" &&
    typeof o.amountPaise === "number" &&
    typeof o.currency === "string" &&
    typeof o.keyId === "string" &&
    typeof o.isGuest === "boolean" &&
    typeof o.cartKey === "string" &&
    typeof o.savedAt === "number"
  );
}

export function loadOpenOrder(offeringId: string, now = Date.now()): OpenOrder | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + offeringId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isOpenOrder(parsed) || now - parsed.savedAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(STORAGE_PREFIX + offeringId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveOpenOrder(offeringId: string, order: OpenOrder | null): void {
  try {
    if (order) window.sessionStorage.setItem(STORAGE_PREFIX + offeringId, JSON.stringify(order));
    else window.sessionStorage.removeItem(STORAGE_PREFIX + offeringId);
  } catch {
    /* storage blocked: the in-memory copy still guards this page view */
  }
}

/**
 * What Pay may do, given the last order's status and whether the cart is the
 * one that order was priced from.
 *
 *   done      the last order is captured: finish as a successful payment
 *   locked    money moved or may have: no new payment, offer a status check
 *   reopen    open the same Razorpay order again (it accepts one payment)
 *   new_order nothing was paid on the last order and the cart changed
 */
export type PayStep = "done" | "locked" | "reopen" | "new_order";

export function payStepFor(status: OrderPaymentStatus, sameCart: boolean): PayStep {
  switch (status) {
    case "captured":
      return "done";
    case "needs_review":
    case "paid":
      return "locked";
    case "pending":
    case "unknown":
      return sameCart ? "reopen" : "locked";
    case "none":
      return sameCart ? "reopen" : "new_order";
  }
}

/** Notices during which a new payment must not start: money moved or may have. */
export function paymentLocked(issue: PaymentIssue | null): boolean {
  return issue?.kind === "verify_pending" || (issue?.kind === "check_needed" && issue.locked);
}
