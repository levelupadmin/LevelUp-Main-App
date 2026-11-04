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
  /** A guest's per-browser order token: proves this browser made the order. */
  reuse_token?: string;
};

export function buildVerifyBody(
  response: RazorpaySuccess,
  paymentOrderId: string,
  isGuest: boolean,
  reuseToken?: string | null,
): VerifyBody {
  return {
    razorpay_payment_id: response.razorpay_payment_id,
    razorpay_order_id: response.razorpay_order_id,
    razorpay_signature: response.razorpay_signature,
    payment_order_id: paymentOrderId,
    is_guest: isGuest,
    ...(isGuest && reuseToken ? { reuse_token: reuseToken } : {}),
  };
}

/** What verify-razorpay-payment hands a guest after a verified payment. */
export type GuestHandOff = {
  login_hint?: "phone" | "email" | null;
  session?: { access_token: string; refresh_token: string } | null;
};

export function handOffFrom(data: unknown): GuestHandOff {
  const d = (data ?? {}) as Record<string, unknown>;
  const s = d.session as Record<string, unknown> | null | undefined;
  const session =
    s && typeof s.access_token === "string" && typeof s.refresh_token === "string"
      ? { access_token: s.access_token, refresh_token: s.refresh_token }
      : null;
  const hint = d.login_hint === "email" ? "email" : d.login_hint === "phone" ? "phone" : null;
  return { login_hint: hint, session };
}

/**
 * Where to send the buyer once verify succeeded. The guest's phone is NOT put
 * in the URL (analytics and error tracking record page URLs); CheckoutPage hands
 * it to /login via router state instead — see `postPaymentNavState`.
 */
export function postPaymentRoute(isGuest: boolean, paymentOrderId: string, byEmail = false): string {
  const thankYou = `/thank-you/${paymentOrderId}`;
  if (!isGuest) return thankYou;
  // Email sign-in lives on the classic page (the Stage sign-in is phone-only).
  if (byEmail) return `/login?${new URLSearchParams({ classic: "1", method: "email", next: thankYou }).toString()}`;
  return `/login?${new URLSearchParams({ next: thankYou }).toString()}`;
}

/**
 * Router state for the guest hand-off to /login: what to prefill, and
 * `autoSend` so the code goes out without another tap. An Indian number signs
 * in by SMS; any other number signs in by email (`hint: "email"`).
 */
export type PostPaymentState = { phone?: string; email?: string; autoSend?: boolean };

export function postPaymentNavState(
  guestPhone?: string | null,
  guestEmail?: string | null,
  hint?: "phone" | "email" | null,
): PostPaymentState | undefined {
  const phone = (guestPhone ?? "").trim();
  const email = (guestEmail ?? "").trim();
  const foreign = !!phone && phone.startsWith("+") && !phone.startsWith("+91");
  // The server's hint follows the account the course landed on.
  const byEmail = hint === "email" || (hint == null && foreign);
  if (byEmail && email) return { email, autoSend: true };
  // A phone account reached with a foreign number typed (an NRI's older
  // Indian account): nothing to prefill, they sign in as they always do.
  if (foreign) return undefined;
  return phone ? { phone, autoSend: true } : undefined;
}

/**
 * May the Razorpay sheet hide its contact step? Only when the email and phone
 * we prefill are both usable: a hidden field Razorpay rejects would leave the
 * buyer stuck with nothing to fix.
 */
export function razorpayContactLocked(email?: string | null, contact?: string | null): boolean {
  const e = (email ?? "").trim();
  const c = (contact ?? "").trim();
  const digits = c.replace(/\D/g, "");
  const indian = !c.startsWith("+") || c.startsWith("+91");
  const phoneOk = indian
    ? /^[6-9]\d{9}$/.test(digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits)
    : digits.length >= 8 && digits.length <= 15;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) &&
    !e.toLowerCase().endsWith("@phone.leveluplearning.in") &&
    phoneOk;
}
