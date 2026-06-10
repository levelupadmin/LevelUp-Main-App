/**
 * verify-msg91-otp: Validate a MSG91 widget access token and mint a
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
  // verifyAccessToken only proves the token is REAL, not that it was
  // issued for body.phone. Without this, an attacker who completes a
  // genuine OTP for THEIR OWN number can POST that valid token together
  // with any victim's phone and we'd mint the victim's session (full
  // account takeover; phone numbers are low-entropy/public). MSG91
  // returns the verified mobile in the success `message` and/or inside
  // the access-token JWT, so we recover it and require it to match.
  //
  // We hard-reject only on a *definite* mismatch. If no identifier can be
  // recovered ("unknown") we proceed but log loudly; a legitimate login
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

  // Deterministic auth-user lookup, keyed ONLY on the phone the caller just
  // OTP-verified. We deliberately do NOT use GoTrue's
  // GET /auth/v1/admin/users?phone= list endpoint: that param is not honoured
  // as a server-side filter (it returns the first page of ALL users), so
  // every returning user past page 1 (i.e. essentially every one of the ~74k
  // legacy customers) was misclassified as brand new and could not log in.
  // find_login_identity() queries auth.users directly by the last-10 phone
  // digits and returns the single canonical row. It is service_role-only.
  // We pass p_email=null here on purpose: matching-and-logging-in by a
  // user-supplied email would be account takeover (the OTP only proves the
  // PHONE). Email is only used later, and only when it is phone-paired/trusted.
  const { data: identityRows, error: lookupErr } = await admin.rpc("find_login_identity", {
    p_phone: normPhone,
    p_email: null,
  });
  if (lookupErr) {
    console.error("verify-msg91-otp: find_login_identity failed", lookupErr);
    return json({ error: "lookup_failed", detail: lookupErr.message }, 500);
  }
  const user = (Array.isArray(identityRows) ? identityRows[0] : identityRows) as
    | { id: string; email?: string | null; phone?: string | null }
    | undefined;

  // EXISTING USER → login
  if (user) {
    // Almost every account has an email and mints a magiclink session
    // directly. A phone-only auth user (no email on file) can't, since GoTrue has
    // no phone-link grant, so provision a placeholder email we control and
    // mint against that, instead of dead-ending them on a 422.
    let loginEmail = (user.email || "").trim() || null;
    if (!loginEmail) {
      loginEmail = await ensureSyntheticEmail(admin, user.id, normPhone);
      if (!loginEmail) return json({ error: "session_mint_failed" }, 500);
    }
    const session = await mintSession(admin, loginEmail);
    if (!session) return json({ error: "session_mint_failed" }, 500);
    return json({ ...session, user_id: user.id, is_new_user: false });
  }

  // ─ 3. No auth user for this phone ──────────────────────────────────
  // Resolve the email + name we'll provision with. On the signup path
  // Signup.tsx sends them. On the LOGIN path they're absent, but the
  // phone may belong to a LEGACY TagMango student we already hold. Those
  // are existing, paying customers; they must log in seamlessly, NOT be
  // bounced to "create an account". legacy_enrolments carries their email
  // + full_name (TagMango orders had both), so we provision from that and
  // the users_claim_legacy_enrolments trigger grants their entitlements
  // automatically on insert.
  let signupEmail: string | null = body.email?.trim() || null;
  let signupName: string | null = body.full_name?.trim() || null;
  let isLegacy = false;
  let legacyMatched = false;
  // Provenance of signupEmail. "user" = typed into the signup form (NOT proven
  // to belong to the caller). "legacy" = sourced from legacy_enrolments keyed
  // by the OTP-verified phone (TagMango paired this phone with this email →
  // trusted) or our own synthetic address. We only ever log a caller INTO an
  // existing account when the email is "legacy", never a typed one, so a
  // signer cannot take over a stranger's account by typing their email.
  let emailProvenance: "user" | "legacy" | null = signupEmail ? "user" : null;

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
    legacyMatched = !!(legacyRows && legacyRows.length > 0);
    // Prefer a row that actually has an email (we need it to mint a
    // session); fall back to any matching row for the name.
    const legacy =
      (legacyRows || []).find((r) => r.email) ?? (legacyRows || [])[0];
    if (legacy) {
      if (!signupEmail && legacy.email) {
        signupEmail = legacy.email;
        emailProvenance = "legacy";
      }
      signupName = signupName || (legacy.full_name?.trim() || "LevelUp Student");
      isLegacy = true;
    }
  }

  // Phone belongs to a known legacy customer but no email anywhere (some
  // TagMango orders carried only a phone). They are a paying customer and must
  // still get in, so provision a placeholder email we control so the magiclink
  // session can be minted; the app can prompt them for a real email later.
  if (!signupEmail && legacyMatched) {
    signupEmail = syntheticEmail(normPhone);
    emailProvenance = "legacy";
    signupName = signupName || "LevelUp Student";
    isLegacy = true;
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
    // The email already belongs to an existing auth account. Whether we may
    // log the caller INTO it depends on provenance:
    //   • "legacy": the email is phone-paired (came from legacy_enrolments
    //     keyed by the OTP-verified phone) or is our synthetic address. This
    //     is the real recovery case: a legacy student who registered by email
    //     before and is now logging in by phone for the first time. Safe to
    //     attach this phone and log them in.
    //   • "user":   the email was TYPED into the signup form and is NOT
    //     proof of ownership. Logging them in would be account takeover, so we
    //     refuse and tell them to log in instead.
    if (emailProvenance === "legacy") {
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
    } else if (await findUserByEmail(admin, signupEmail)) {
      // Typed email that already exists → never silently hijack it.
      return json(
        { error: "email_in_use", detail: "An account with this email already exists. Please log in instead." },
        409,
      );
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

// Find an existing auth user by exact email. Uses the deterministic
// find_login_identity RPC (NOT the broken GoTrue ?email= list filter, which
// ignores the param and returns page 1 of all users), then hydrates the full
// record so we can MERGE its user_metadata rather than clobber it.
async function findUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string; email?: string; user_metadata?: Record<string, unknown> } | null> {
  const { data, error } = await admin.rpc("find_login_identity", { p_phone: null, p_email: email });
  if (error) {
    console.error("verify-msg91-otp: find_login_identity (email) failed", error);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; email?: string } | undefined;
  if (!row?.id) return null;
  const { data: full } = await admin.auth.admin.getUserById(row.id);
  return {
    id: row.id,
    email: row.email,
    user_metadata: (full?.user?.user_metadata as Record<string, unknown>) || {},
  };
}

// A placeholder email we control, derived deterministically from the phone,
// for legacy customers with no email on file. The domain carries no MX record,
// so nothing is ever delivered; it exists purely so GoTrue's email-based
// magiclink can mint a session for a phone-only user. The "@phone." prefix is
// self-documenting so the app/admin can detect these and prompt for a real
// email later.
function syntheticEmail(normPhone: string): string {
  return `${normPhone.replace(/\D/g, "")}@phone.leveluplearning.in`;
}

// Attach a synthetic email to an existing phone-only auth user so we can mint a
// magiclink session for them. Marked confirmed; the address is ours and only
// needs to exist on the record for generateLink to work. Returns the email, or
// null on failure.
async function ensureSyntheticEmail(
  admin: ReturnType<typeof createClient>,
  userId: string,
  normPhone: string,
): Promise<string | null> {
  const email = syntheticEmail(normPhone);
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (error) {
    console.error("verify-msg91-otp: ensureSyntheticEmail failed", error);
    return null;
  }
  return email;
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

// Last 10 digits of a phone string, the subscriber part, stable across
// "+919788385577" / "919788385577" / "9788385577". "" if < 10 digits.
function last10(s: string): string {
  const d = (s || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

// Does the phone MSG91 actually verified match the phone the caller
// claims (normPhone)? We gather every phone-like value MSG91 vouched for
// (the verify response `message`, which carries the mobile on success,
// plus any mobile/phone/msisdn claim inside the access-token JWT) and
// compare on the last-10 subscriber digits.
//   "match":    a recovered identifier equals the caller's phone
//   "mismatch": we recovered ≥1 identifier and NONE match → takeover
//   "unknown":  nothing phone-like recoverable (caller proceeds; logged)
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
  } catch { /* not a decodable JWT, rely on `message` */ }

  const phoneLike = candidates.map(last10).filter(Boolean);
  if (phoneLike.length === 0) return "unknown";
  return phoneLike.includes(want) ? "match" : "mismatch";
}
