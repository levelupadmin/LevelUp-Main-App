/**
 * One browser Purchase per payment.
 *
 * The checkout fires Purchase right after verify, and Thank-you fires it again
 * when it loads (and on every reload). Meta documents merging a browser event
 * with a server event that shares its event id, not two browser copies; the X
 * tag's tw-purchase carries no id at all, and an offering's own Google Ads tag
 * counts each conversion it sees. So the browser sends Purchase once per
 * razorpay_payment_id, whichever page gets there first, across reloads and tabs
 * on the device (localStorage), with an in-memory copy for when storage is
 * blocked. The eventID stays purchase_<razorpay_payment_id>, so Meta still
 * merges this copy with the server (CAPI) one.
 *
 * `scope` separates independent sends for one payment: the global pixels in
 * analytics.track ("purchase") and Thank-you's per-offering pixels
 * ("offering_pixels").
 */
const PREFIX = "lu_purchase_sent:";
const claimedHere = new Set<string>();

/** True the first time a payment is claimed for a scope on this device; false after. */
export function claimPurchaseOnce(transactionId: string | null | undefined, scope = "purchase"): boolean {
  const id = String(transactionId ?? "").trim();
  if (!id) return true; // nothing to key on
  const key = `${PREFIX}${scope}:${id}`;
  if (claimedHere.has(key)) return false;
  claimedHere.add(key);
  try {
    if (window.localStorage.getItem(key) !== null) return false;
    window.localStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage blocked: the in-memory set still guards this page view */
  }
  return true;
}
