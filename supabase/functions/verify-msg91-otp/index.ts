/**
 * verify-msg91-otp — Validate a phone-OTP against the hash stored by
 * send-sms-otp, then mint a real Supabase session for the user.
 *
 * Flow:
 *   1. Receive { phone, otp, email?, full_name? } from frontend
 *   2. Hash incoming OTP with phone, compare against latest unexpired
 *      unconsumed row in phone_otp_attempts (5-attempt cap)
 *   3. If matched: mark consumed
 *   4. Find user by phone in auth.users
 *        - exists  → login (need email on file)
 *        - missing → signup (require email + full_name)
 *   5. Mint session via admin.generateLink + verifyOtp trick (no email
 *      roundtrip — Supabase doesn't expose a "session for phone" admin
 *      endpoint, so this is the canonical workaround)
 *   6. Return { access_token, refresh_token } → frontend setSession
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY          = Deno.env.get("SUPABASE_ANON_KEY")!;

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

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Body {
  phone: string;
  otp: string;
  email?: string;
  full_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.phone || !body.otp) return json({ error: "missing_phone_or_otp" }, 400);

  const normPhone = body.phone.startsWith("+")
    ? body.phone
    : `+${body.phone.replace(/^0+/, "")}`;
  const otpHash = await sha256Hex(`${normPhone}:${String(body.otp)}`);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fetch latest unexpired, unconsumed OTP attempt for this phone.
  const { data: rows, error: fetchErr } = await admin
    .from("phone_otp_attempts")
    .select("*")
    .eq("phone", normPhone)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (fetchErr) return json({ error: "db_error", detail: fetchErr.message }, 500);
  if (!rows?.length) return json({ error: "otp_expired_or_not_found" }, 401);

  const attempt = rows[0];
  if (attempt.attempts >= 5) return json({ error: "too_many_attempts" }, 429);

  // Always increment attempts so brute force doesn't get free guesses.
  await admin
    .from("phone_otp_attempts")
    .update({ attempts: attempt.attempts + 1 })
    .eq("id", attempt.id);

  if (attempt.otp_hash !== otpHash) return json({ error: "invalid_otp" }, 401);

  // Mark consumed before doing the user/session work, so this OTP can't
  // be reused even if the next steps fail.
  await admin
    .from("phone_otp_attempts")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", attempt.id);

  // Find user by phone via admin REST.
  const lookupResp = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?phone=${encodeURIComponent(normPhone)}`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  );
  const lookupData = (await lookupResp.json()) as {
    users?: Array<{ id: string; email?: string; phone?: string }>;
  };
  let user = (lookupData.users || []).find((u) =>
    u.phone === normPhone || u.phone === normPhone.replace(/^\+/, "")
  );

  // EXISTING USER → login
  if (user) {
    if (!user.email) return json({ error: "user_missing_email", phone: normPhone }, 422);
    const session = await mintSession(admin, user.email);
    if (!session) return json({ error: "session_mint_failed" }, 500);
    return json({ ...session, user_id: user.id, is_new_user: false });
  }

  // NEW USER → signup
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
