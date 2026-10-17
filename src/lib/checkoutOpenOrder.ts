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
  /**
   * A guest order's reuse token (`guestReuseToken`), sent again with every
   * status check: the server answers a guest only for the token the order was
   * made with. Null for a signed-in order.
   */
  reuseToken?: string | null;
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
    (o.reuseToken === undefined || o.reuseToken === null || typeof o.reuseToken === "string") &&
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

const REUSE_TOKEN_PREFIX = "lu_checkout_reuse_token:";
const REUSE_TOKEN_PATTERN = /^[0-9a-f]{48}$/;
/** This page view's tokens, for when localStorage is blocked. */
const memoryReuseTokens = new Map<string, string>();

function newReuseToken(): string | null {
  try {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * The random token this browser sends with a guest order for this offering
 * (guest-create-order keeps its hash on the order). The server reuses an open
 * order, and answers a guest status check, only for the same token, so an
 * order someone else made with this buyer's phone and email is never handed
 * to this checkout. Kept in localStorage so a reload or a second tab in the
 * same browser lands on the same Razorpay order; when storage is blocked, the
 * token lives for this page view. Null only when the browser cannot make a
 * random value: the server then makes a fresh order every time.
 */
export function guestReuseToken(offeringId: string): string | null {
  const storageKey = REUSE_TOKEN_PREFIX + offeringId;
  let token = memoryReuseTokens.get(offeringId) ?? null;
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved && REUSE_TOKEN_PATTERN.test(saved)) token = saved;
  } catch {
    /* storage blocked: keep this page view's token */
  }
  token = token ?? newReuseToken();
  if (!token) return null;
  memoryReuseTokens.set(offeringId, token);
  try {
    window.localStorage.setItem(storageKey, token);
  } catch {
    /* storage blocked: the in-memory copy serves this page view */
  }
  return token;
}

/**
 * What Pay may do, given the last order's status and whether the cart is the
 * one that order was priced from.
 *
 *   done      the last order is captured and the buyer holds the course (the
 *             server reads a captured order without it as needs_review):
 *             finish as a successful payment
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
