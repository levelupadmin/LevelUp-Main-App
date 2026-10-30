/**
 * How long the thank-you page waits for an order to read as captured.
 *
 * The buyer usually lands a moment after verify, but the row can still read
 * as not captured: verify and the Razorpay webhook race, or the page was opened
 * from a link before either landed. So the page re-reads the order every
 * CAPTURE_POLL_MS, up to CAPTURE_MAX_READS reads (about 30 s), before it says
 * the payment is still confirming.
 */
export const CAPTURE_POLL_MS = 2000;
export const CAPTURE_MAX_READS = 15;

/** What the thank-you page is showing. */
export type ThankYouPhase =
  /** Reading the order; capture not seen yet. */
  | "waiting"
  /** Captured order loaded. */
  | "ready"
  /** Still not captured after the full wait. Offers a retry and support. */
  | "delayed"
  /** Captured, but it belongs to a different signed-in account. */
  | "wrong_account";
