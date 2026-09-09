/**
 * Small pure helpers around the verify-razorpay-payment round trip, split out
 * of CheckoutPage so the guest contract can be unit-tested:
 *
 *  - a guest checkout MUST send `is_guest: true`. Without it the edge function
 *    demands a login token, returns 401, and the buyer sees "contact support"
 *    seconds after paying (the 2026-09-09 incident's support-ticket trigger).
 *  - after a successful guest capture the buyer is sent to /login with `next`
 *    pointing at the Thank-you page and the paid phone prefilled (router state).
 *    The order is attached to the account that owns that phone, and
 *    payment_orders has no anonymous read policy, so one OTP is the shortest
 *    path that both proves the phone and lets the Thank-you page load.
 */

export type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type VerifyBody = RazorpaySuccess & {
  payment_order_id: string;
  is_guest: boolean;
};

export function buildVerifyBody(
  response: RazorpaySuccess,
  paymentOrderId: string,
  isGuest: boolean,
): VerifyBody {
  return {
    razorpay_payment_id: response.razorpay_payment_id,
    razorpay_order_id: response.razorpay_order_id,
    razorpay_signature: response.razorpay_signature,
    payment_order_id: paymentOrderId,
    is_guest: isGuest,
  };
}

/**
 * Where to send the buyer once verify succeeded. The guest's phone is NOT put
 * in the URL (analytics and error tracking record page URLs); CheckoutPage hands
 * it to /login via router state instead — see `postPaymentNavState`.
 */
export function postPaymentRoute(isGuest: boolean, paymentOrderId: string): string {
  const thankYou = `/thank-you/${paymentOrderId}`;
  if (!isGuest) return thankYou;
  return `/login?${new URLSearchParams({ next: thankYou }).toString()}`;
}

/** Router state for the guest hand-off: the phone to prefill on /login. */
export function postPaymentNavState(guestPhone?: string | null): { phone: string } | undefined {
  const phone = (guestPhone ?? "").trim();
  return phone ? { phone } : undefined;
}
