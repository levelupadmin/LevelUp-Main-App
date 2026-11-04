/**
 * Signed in straight after paying — for a buyer whose account THIS purchase
 * just made (2026-11-04, the pay-first checkout).
 *
 * A guest pays without proving their phone or email first. Before this, every
 * guest then had to enter a one-time code on /login to open the course, and
 * some never did. For a brand-new account that code proves nothing worth
 * protecting: the account holds this one purchase and nothing else, so handing
 * its session to the browser that just paid for it gives away nothing but the
 * course they bought. For an EXISTING account it would hand a stranger who
 * typed someone's number that person's whole account, so those buyers still
 * prove the phone (or email) with one code.
 *
 * "Made by this purchase" is checked on the data, not on which capture path
 * created the account (verify and the webhook race, and either can create it):
 *   - the auth account is less than FRESH_WINDOW_MS old;
 *   - every enrolment it has came from THIS order, and it has no other paid
 *     order;
 *   - no unclaimed TagMango purchase is waiting on its phone or email. Those
 *     are claimed at the first sign-in (claim_my_purchases), and must never be
 *     claimed by a session nobody proved the phone for.
 *
 * The caller must also have proved it is the browser that made the order (the
 * reuse token) and that the payment is real (the Razorpay signature, checked
 * before this runs). Dependency-light: the admin client is structurally typed
 * so vitest can drive it with a fake.
 */

export const FRESH_WINDOW_MS = 60 * 60 * 1000;

export type SessionTokens = { access_token: string; refresh_token: string };

type Result<T> = { data: T; error: { message: string } | null };

// deno-lint-ignore no-explicit-any
type Query = any;

export type FreshAdmin = {
  from: (table: string) => Query;
  auth: {
    admin: {
      getUserById: (id: string) => PromiseLike<
        Result<{ user: { id: string; email?: string | null; phone?: string | null; created_at?: string } | null }>
      >;
    };
  };
};

function legacyPhone(authPhone: string | null | undefined): string | null {
  const d = (authPhone ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  return d ? `+${d}` : null;
}

/**
 * The auth email to mint a session against, when the account was made by this
 * order and holds nothing else; otherwise null (the buyer signs in with a code).
 */
export async function freshAccountLoginEmail(
  admin: FreshAdmin,
  userId: string,
  paymentOrderId: string,
  now: number = Date.now(),
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  const user = data?.user;
  if (error || !user?.email || !user.created_at) return null;
  const age = now - new Date(user.created_at).getTime();
  if (!(age >= 0 && age <= FRESH_WINDOW_MS)) return null;

  const { data: enrolments, error: enErr } = await admin
    .from("enrolments")
    .select("id, payment_order_id")
    .eq("user_id", userId)
    .limit(20);
  if (enErr || !Array.isArray(enrolments)) return null;
  if (enrolments.some((e: { payment_order_id?: string | null }) => e.payment_order_id !== paymentOrderId)) return null;

  const { data: orders, error: poErr } = await admin
    .from("payment_orders")
    .select("id")
    .eq("user_id", userId)
    .neq("id", paymentOrderId)
    .in("status", ["captured", "needs_review"])
    .limit(1);
  if (poErr || !Array.isArray(orders) || orders.length > 0) return null;

  const phone = legacyPhone(user.phone);
  if (phone) {
    const { data: legacy, error: lErr } = await admin
      .from("legacy_enrolments")
      .select("id")
      .is("claimed_by_user_id", null)
      .eq("phone", phone)
      .limit(1);
    if (lErr || !Array.isArray(legacy) || legacy.length > 0) return null;
  }
  const email = user.email.trim().toLowerCase();
  if (!email.endsWith("@phone.leveluplearning.in")) {
    const { data: legacy, error: lErr } = await admin
      .from("legacy_enrolments")
      .select("id")
      .is("claimed_by_user_id", null)
      .eq("email", email)
      .limit(1);
    if (lErr || !Array.isArray(legacy) || legacy.length > 0) return null;
  }
  return user.email;
}

export type MintAdmin = {
  auth: {
    admin: {
      generateLink: (attrs: { type: "magiclink"; email: string }) => PromiseLike<
        Result<{ properties?: { email_otp?: string; verification_type?: string } } | null>
      >;
    };
  };
};

export type AnonAuth = {
  auth: {
    verifyOtp: (attrs: { email: string; token: string; type: "magiclink" }) => PromiseLike<
      Result<{ session: { access_token: string; refresh_token: string } | null } | null>
    >;
  };
};

/** Same mint as verify-msg91-otp: a magic-link code, redeemed server-side. No email is sent. */
export async function mintSessionForEmail(
  admin: MintAdmin,
  anon: AnonAuth,
  email: string,
): Promise<SessionTokens | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const otp = data?.properties?.email_otp;
  if (error || !otp) return null;
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    email,
    token: otp,
    type: (data?.properties?.verification_type || "magiclink") as "magiclink",
  });
  if (vErr || !verified?.session) return null;
  return { access_token: verified.session.access_token, refresh_token: verified.session.refresh_token };
}
