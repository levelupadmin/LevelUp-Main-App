/**
 * verify-msg91-otp — Validate a MSG91 widget access token and mint a
 * Supabase session for the matching phone.
 *
 * Flow:
 *   1. Receive { accessToken, phone, email?, full_name? } from frontend.
 *      The accessToken is what window.verifyOtp() returns after the
 *      user enters the digits MSG91 sent them.
 *   2. Verify the token against MSG91 at /api/v5/widget/verifyAccessToken.
 *      MSG91 returns type=success when the token is real and unconsumed.
 *      We also accept "already verified" because the widget can return
 *      the same token on retry (idempotent on their side).
 *   3. Find the auth.users row by phone.
 *        existing user → login (mint session for that user's email)
 *        no user + email + full_name → signup (create + mint session)
 *        no user + no signup info → 404 signup_requires_email_and_name
 *   4. Mint a Supabase session via admin.generateLink + verifyOtp - the
 *      canonical workaround for "give me a session for this user without
 *      bouncing through email." No actual email is sent.
 *
 * Why this is not the previous send-sms-otp + OTP-hash-compare flow:
 * MSG91 Flow API was silently dropping the ##number## substitution for
 * our template/account combo - SMSes arrived as the template body with
 * a blank OTP slot. The MSG91 widget renders the template inside their
 * own pipeline and ships fully-rendered SMSes, so the failure mode does
 * not exist. The Forge app has been on this pattern for weeks with no
 * blank-OTP reports.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const MSG91_AUTH_KEY   = Deno.env.get("MSG91_AUTH_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Body {
  accessToken?: string;
  phone?: string;
  email?: string;
  full_name?: string;
  // Back-compat: the previous client also sent { phone, otp } against
  // this URL. Reject that explicitly with a hint so a stale cached
  // bundle in someone's browser doesn't silently fall through.
  otp?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  if (body.otp && !body.accessToken) {
    return json({
      error: "stale_client",
      detail: "This endpoint now expects a MSG91 widget accessToken, not a raw OTP. Hard-refresh the page.",
    }, 400);
  }
  if (!body.accessToken || !body.phone) {
    return json({ error: "missing_access_token_or_phone" }, 400);
  }

  // Normalise to E.164 with leading +. The widget validates digits-only,
  // so an incoming "+919884731816" or "919884731816" both reach here.
  const normPhone = body.phone.startsWith("+")
    ? body.phone
    : `+${body.phone.replace(/^0+/, "")}`;

  // ─ 1. Verify the access token with MSG91 ────────────────────────────
  const verifyResp = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authkey: MSG91_AUTH_KEY,
      "access-token": body.accessToken,
    }),
  });
  const verifyData = (await verifyResp.json().catch(() => ({}))) as {
    type?: string;
    message?: string;
  };
  const verified =
    verifyData.type === "success" ||
    String(verifyData.message || "").toLowerCase().includes("already verif");
  if (!verified) {
    return json({ error: "invalid_otp", detail: verifyData.message }, 401);
  }

  // ─ 2. Look up or create the user ────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const lookupResp = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?phone=${encodeURIComponent(normPhone)}`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  );
  const lookupData = (await lookupResp.json()) as {
    users?: Array<{ id: string; email?: string; phone?: string }>;
  };
  const user = (lookupData.users || []).find((u) =>
    u.phone === normPhone || u.phone === normPhone.replace(/^\+/, "")
  );

  // EXISTING USER → login
  if (user) {
    if (!user.email) return json({ error: "user_missing_email", phone: normPhone }, 422);
    const session = await mintSession(admin, user.email);
    if (!session) return json({ error: "session_mint_failed" }, 500);
    return json({ ...session, user_id: user.id, is_new_user: false });
  }

  // NEW USER → signup (requires email + full_name from Signup.tsx)
  if (!body.email || !body.full_name) {
    return json(
      { error: "signup_requires_email_and_name", reason: "no_account_for_phone" },
      404,
    );
  }
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    phone: normPhone,
    phone_confirm: true,
    email_confirm: false,
    user_metadata: { full_name: body.full_name.trim(), phone: normPhone },
  });
  if (createErr || !created.user) {
    return json({ error: "create_user_failed", detail: createErr?.message }, 500);
  }

  const session = await mintSession(admin, body.email);
  if (!session) return json({ error: "session_mint_failed" }, 500);
  return json({ ...session, user_id: created.user.id, is_new_user: true });
});

async function mintSession(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ access_token: string; refresh_token: string } | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties) return null;
  const { email_otp, verification_type } = data.properties as {
    email_otp?: string;
    verification_type?: string;
  };
  if (!email_otp) return null;

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    email,
    token: email_otp,
    type: (verification_type || "magiclink") as "magiclink",
  });
  if (verifyErr || !verified.session) return null;

  return {
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  };
}
