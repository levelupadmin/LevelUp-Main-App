/**
 * verify-msg91-otp — Bridges the MSG91 OTP Widget to Supabase Auth.
 *
 * Flow:
 *   1. Frontend (Login/Signup) drives window.OTPWidget.sendOTP +
 *      verifyOTP. Widget returns an `accessToken` (a JWT MSG91 issues
 *      to prove the phone was just verified).
 *   2. Frontend POSTs { phone, accessToken, [email, full_name] } to
 *      this edge function.
 *   3. We POST to MSG91's verifyAccessToken endpoint to confirm the
 *      token is genuine (defends against forged client-side payloads).
 *   4. Look up the user by phone:
 *        - exists  → login   → mint session and return tokens
 *        - missing → signup  → require email + full_name, create user,
 *                              mint session, return tokens
 *   5. Frontend calls supabase.auth.setSession({access_token,refresh_token}).
 *
 * Why mint via generateLink + verifyOtp?
 *   Supabase doesn't expose a "create a session for verified phone"
 *   admin endpoint. The workaround is: generate a magiclink (admin
 *   API returns the email_otp embedded in the link), then verify it
 *   from a regular client. That returns a normal session that
 *   refreshes correctly. The user never sees or types this OTP.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MSG91_AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface RequestBody {
  phone: string;
  accessToken: string;
  email?: string;
  full_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const { phone, accessToken, email, full_name } = body;
  if (!phone || !accessToken) return json({ error: "missing_phone_or_token" }, 400);

  // Normalise phone to E.164 with leading +
  const normPhone = phone.startsWith("+") ? phone : `+${phone.replace(/^0+/, "")}`;

  // === 1. Verify the MSG91 access token ===
  const verifyResp = await fetch(
    "https://control.msg91.com/api/v5/widget/verifyAccessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authkey: MSG91_AUTH_KEY, "access-token": accessToken }),
    },
  );
  const verifyData = (await verifyResp.json()) as { type?: string; message?: string };
  if (!verifyResp.ok || verifyData.type !== "success") {
    return json({ error: "msg91_verify_failed", detail: verifyData }, 401);
  }

  // === 2. Look up user by phone ===
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Admin listUsers doesn't have a phone filter, so query auth.users
  // through the REST endpoint with service role.
  const lookupResp = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?phone=${encodeURIComponent(normPhone)}`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  );
  const lookupData = (await lookupResp.json()) as {
    users?: Array<{ id: string; email?: string; phone?: string }>;
  };
  let user = (lookupData.users || []).find((u) => u.phone === normPhone.replace(/^\+/, "") || u.phone === normPhone);

  // === 3a. Existing user → login ===
  if (user) {
    if (!user.email) {
      // Phone-only account without email — we can't use the magiclink
      // trick without an email. Surface a useful error so we know to
      // backfill.
      return json({ error: "user_missing_email", phone: normPhone }, 422);
    }
    const sessionToken = await mintSession(admin, user.email);
    if (!sessionToken) return json({ error: "session_mint_failed" }, 500);
    return json({ ...sessionToken, user_id: user.id, is_new_user: false });
  }

  // === 3b. New user → signup (requires email + full_name) ===
  if (!email || !full_name) {
    return json(
      { error: "signup_requires_email_and_name", reason: "no_account_for_phone" },
      404,
    );
  }
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    phone: normPhone,
    phone_confirm: true,
    email_confirm: false, // user verifies email via the magiclink we mint right after
    user_metadata: { full_name: full_name.trim(), phone: normPhone },
  });
  if (createErr || !created.user) {
    return json({ error: "create_user_failed", detail: createErr?.message }, 500);
  }
  user = created.user;

  const sessionToken = await mintSession(admin, email);
  if (!sessionToken) return json({ error: "session_mint_failed" }, 500);
  return json({ ...sessionToken, user_id: user.id, is_new_user: true });
});

/**
 * Mint a real Supabase session for the given email by generating a
 * magic link and verifying its embedded OTP server-side.
 */
async function mintSession(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ access_token: string; refresh_token: string } | null> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data?.properties) return null;

  const { email_otp, verification_type } = data.properties as {
    email_otp?: string;
    verification_type?: string;
  };
  if (!email_otp) return null;

  // Verify with anon client to get a real session
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
