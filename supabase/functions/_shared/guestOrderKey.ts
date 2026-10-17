/**
 * Ties a guest payment order to the browser that created it.
 *
 * guest-create-order needs no login. It reuses an open order from the last 10
 * minutes, so a retry lands on the same Razorpay order, which takes one
 * successful payment only. verify-razorpay-payment's status check answers for
 * an order id with no login. When reuse matched on phone and email alone,
 * anyone who knew both could make an order, have the person pay it (their
 * checkout was handed that order), and poll the status check to learn that
 * they bought. The caller's text also went on the person's receipt and invoice.
 *
 * So the checkout sends a random token it keeps per offering in the browser
 * (src/lib/checkoutOpenOrder.ts, `guestReuseToken`), and the order keeps
 * sha256(token) as notes.reuse_key. An open order is reused only for the same
 * token, and a guest status check is answered only for the same token. A
 * request with no token gets a fresh order that nothing can reuse, and that no
 * guest status check can read.
 *
 * Free of URL imports so vitest can run it.
 */

import { timingSafeEqual } from "./crypto.ts";

/** What the checkout sends: 32 to 128 URL-safe characters (it makes 48 hex). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

/** The token as sent, or null when it is missing or not one the checkout makes. */
export function readReuseToken(v: unknown): string | null {
  return typeof v === "string" && TOKEN_PATTERN.test(v) ? v : null;
}

/** sha256(token) in lowercase hex: what an order keeps as notes.reuse_key. */
export async function reuseKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The order's notes.reuse_key, or null when it has none. */
export function orderReuseKey(notes: unknown): string | null {
  const v = notes && typeof notes === "object" && !Array.isArray(notes)
    ? (notes as Record<string, unknown>).reuse_key
    : null;
  return typeof v === "string" && v !== "" ? v : null;
}

/** Did the browser holding this key make this order? False when either side has none. */
export function reuseKeyMatches(notes: unknown, key: string | null): boolean {
  const stored = orderReuseKey(notes);
  return !!stored && !!key && timingSafeEqual(stored, key);
}

/** The key for a request's token, or null when it sent none. */
export async function requestReuseKey(v: unknown): Promise<string | null> {
  const token = readReuseToken(v);
  return token ? await reuseKey(token) : null;
}
