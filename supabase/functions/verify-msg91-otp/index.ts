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

  // ─ 1b. Bind the verified token to the phone being logged in ─────────
  // verifyAccessToken only proves the token is REAL — not that it was
  // issued for body.phone. Without this, an attacker who completes a
  // genuine OTP for THEIR OWN number can POST that valid token together
  // with any victim's phone and we'd mint the victim's session (full
  // account takeover; phone numbers are low-entropy/public). MSG91
  // returns the verified mobile in the success `message` and/or inside
  // the access-token JWT, so we recover it and require it to match.
  //
  // We hard-reject only on a *definite* mismatch. If no identifier can be
  // recovered ("unknown") we proceed but log loudly — a legitimate login
  // always matches (the token's mobile == the number the user just
  // entered == body.phone), so this can never lock users out if MSG91
  // changes its response shape; it only ever blocks the takeover case
  // where a real identifier is present and differs.
  const binding = phoneBinding(normPhone, verifyData, body.accessToken);
  if (binding === "mismatch") {
    return json({ error: "phone_token_mismatch" }, 401);
  }
  if (binding === "unknown") {
    console.warn(
      "verify-msg91-otp: no verified phone recoverable from MSG91 response/JWT; proceeding without strict token↔phone binding",
      { phone: normPhone },
    );
  }

  // ─ 2. Look up or create the user ────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // GoTrue stores phone WITHOUT the leading '+', so filter on the
  // plus-less form. Querying "+91…" matches nothing and would
  // misclassify a returning user as brand new (then try to re-create
  // them). The JS candidates filter below still matches both stored
  // formats defensively.
  const lookupResp = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?phone=${encodeURIComponent(normPhone.replace(/^\+/, ""))}`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  );
  const lookupData = (await lookupResp.json()) as {
    users?: Array<{ id: string; email?: string; phone?: string }>;
  };
  // Match against both phone formats Supabase has historically stored
  // (with + and without). If multiple rows match (e.g. an old ghost
  // row created before we hardened the signup path), prefer the one
  // with an email - that's the usable account. The previous
  // "first match wins" behaviour picked the newest row, which was
  // often the email-less ghost.
  const candidates = (lookupData.users || []).filter((u) =>
    u.phone === normPhone || u.phone === normPhone.replace(/^\+/, "")
  );
  const user = candidates.find((u) => !!u.email) ?? candidates[0];

  // EXISTING USER → login
  if (user) {
    if (!user.email) return json({ error: "user_missing_email", phone: normPhone }, 422);
    const session = await mintSession(admin, user.email);
    if (!session) return json({ error: "session_mint_failed" }, 500);
    return json({ ...session, user_id: user.id, is_new_user: false });
  }

  // ─ 3. No auth user for this phone ──────────────────────────────────
  // Resolve the email + name we'll provision with. On the signup path
  // Signup.tsx sends them. On the LOGIN path they're absent — but the
  // phone may belong to a LEGACY TagMango student we already hold. Those
  // are existing, paying customers; they must log in seamlessly, NOT be
  // bounced to "create an account". legacy_enrolments carries their email
  // + full_name (TagMango orders had both), so we provision from that and
  // the users_claim_legacy_enrolments trigger grants their entitlements
  // automatically on insert.
  let signupEmail: string | null = body.email?.trim() || null;
  let signupName: string | null = body.full_name?.trim() || null;
  let isLegacy = false;

  if (!signupEmail || !signupName) {
    // legacy_enrolments stores phone normalised to +91XXXXXXXXXX, but
    // match a few historical formats defensively.
    const phoneVariants = [
      normPhone,                      // +919788385577
      normPhone.replace(/^\+/, ""),   // 919788385577
      normPhone.replace(/^\+91/, ""), // 9788385577
    ];
    const { data: legacyRows } = await admin
      .from("legacy_enrolments")
      .select("email, full_name")
      .in("phone", phoneVariants);
    // Prefer a row that actually has an email (we need it to mint a
    // session); fall back to any matching row for the name.
    const legacy =
      (legacyRows || []).find((r) => r.email) ?? (legacyRows || [])[0];
    if (legacy?.email) {
      signupEmail = signupEmail || legacy.email;
      signupName = signupName || (legacy.full_name?.trim() || "LevelUp Student");
      isLegacy = true;
    }
  }

  // Genuinely unknown number with nothing to provision from → ask
  // Signup.tsx for email + name.
  if (!signupEmail || !signupName) {
    return json(
      { error: "signup_requires_email_and_name", reason: "no_account_for_phone" },
      404,
    );
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: signupEmail,
    phone: normPhone,
    phone_confirm: true,
    email_confirm: false,
    user_metadata: { full_name: signupName, phone: normPhone },
  });

  if (createErr || !created?.user) {
    // The email may already belong to an existing auth account — e.g. a
    // legacy student who registered by email before and is now logging in
    // by phone for the first time (so the phone lookup above missed them).
    // Recover by finding that account, attaching this phone, and logging
    // them in, instead of failing with the opaque create error.
    const existing = await findUserByEmail(admin, signupEmail);
    if (existing) {
      await admin.auth.admin
        .updateUserById(existing.id, {
          phone: normPhone,
          phone_confirm: true,
          user_metadata: { ...(existing.user_metadata || {}), phone: normPhone },
        })
        .catch(() => {});
      const session = await mintSession(admin, signupEmail);
      if (!session) return json({ error: "session_mint_failed" }, 500);
      return json({ ...session, user_id: existing.id, is_new_user: false, is_legacy: isLegacy });
    }
    return json({ error: "create_user_failed", detail: createErr?.message }, 500);
  }

  // Best-effort: tag legacy provenance for admin segmentation. Never let
  // a failure here block the login.
  if (isLegacy) {
    await admin
      .from("users")
      .update({ is_legacy: true, legacy_source: "tagmango" })
      .eq("id", created.user.id)
      .then(undefined, () => {});
  }

  const session = await mintSession(admin, signupEmail);
  if (!session) return json({ error: "session_mint_failed" }, 500);
  return json({ ...session, user_id: created.user.id, is_new_user: true, is_legacy: isLegacy });
});

// Find an existing auth user by exact email via the GoTrue admin API.
// Mirrors the phone lookup above (filter server-side, then verify in JS).
async function findUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string; email?: string; user_metadata?: Record<string, unknown> } | null> {
  const resp = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  );
  if (!resp.ok) return null;
  const data = (await resp.json().catch(() => ({}))) as {
    users?: Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>;
  };
  const lower = email.toLowerCase();
  return (data.users || []).find((u) => (u.email || "").toLowerCase() === lower) ?? null;
}

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

// Last 10 digits of a phone string — the subscriber part, stable across
// "+919788385577" / "919788385577" / "9788385577". "" if < 10 digits.
function last10(s: string): string {
  const d = (s || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

// Does the phone MSG91 actually verified match the phone the caller
// claims (normPhone)? We gather every phone-like value MSG91 vouched for
// — the verify response `message` (which carries the mobile on success)
// plus any mobile/phone/msisdn claim inside the access-token JWT — and
// compare on the last-10 subscriber digits.
//   "match"    — a recovered identifier equals the caller's phone
//   "mismatch" — we recovered ≥1 identifier and NONE match → takeover
//   "unknown"  — nothing phone-like recoverable (caller proceeds; logged)
// Note: we ONLY inspect phone-named JWT claims, never iat/exp/nbf, so a
// 10-digit Unix timestamp can't masquerade as a phone and produce a
// false mismatch that would block a legitimate login.
function phoneBinding(
  normPhone: string,
  verifyData: { message?: string; type?: string },
  accessToken: string,
): "match" | "mismatch" | "unknown" {
  const want = last10(normPhone);
  if (!want) return "unknown";

  const candidates: string[] = [];
  if (verifyData?.message) candidates.push(String(verifyData.message));

  // Best-effort decode of the JWT payload (middle base64url segment).
  try {
    const seg = (accessToken || "").split(".")[1];
    if (seg) {
      const b64 = seg.replace(/-/g, "+").replace(/_/g, "/")
        .padEnd(Math.ceil(seg.length / 4) * 4, "=");
      const claims = JSON.parse(atob(b64)) as Record<string, unknown>;
      for (const [k, v] of Object.entries(claims)) {
        if ((typeof v === "string" || typeof v === "number") &&
            /mobile|phone|msisdn/i.test(k)) {
          candidates.push(String(v));
        }
      }
    }
  } catch { /* not a decodable JWT — rely on `message` */ }

  const phoneLike = candidates.map(last10).filter(Boolean);
  if (phoneLike.length === 0) return "unknown";
  return phoneLike.includes(want) ? "match" : "mismatch";
}
