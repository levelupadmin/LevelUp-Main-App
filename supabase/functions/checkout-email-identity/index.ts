/**
 * checkout-email-identity: sign-in at checkout for buyers OUTSIDE India.
 *
 * Indian numbers verify by SMS (verify-msg91-otp) and the phone decides the
 * account. A foreign number cannot get our SMS, so the checkout asks for an
 * email too and proves it with a code sent to that email. Three actions:
 *
 *   { action: "check",  email, phone }               -> do they belong together?
 *   { action: "send",   email }                       -> mail a 6-digit code
 *   { action: "verify", email, code, phone, name }    -> sign in, or create the account
 *
 * WHY A SEPARATE FUNCTION. verify-email-otp only ever mails an address that
 * already has an account and never writes; that is right for sign-in and stays
 * untouched. Here a brand-new international buyer has no account yet, so the
 * code goes to the typed address directly (as claim-application does), under a
 * SCOPED key ("checkout <email>", with a space, so normalizeEmail rejects it):
 * a checkout code can never sign anyone in through verify-email-otp, and a
 * sign-in code can never satisfy this function.
 *
 * WHAT "check" REVEALS (accepted by the founder, 2026-11-02). It says whether
 * the email and the number already belong to different people, with the other
 * side masked ("+44 ••••• 4508", "a•••@gmail.com"), so a returning buyer can fix
 * a typo before paying. It never says what anyone bought. Request caps are per
 * IP, through the shared check_and_increment_rate_limit RPC.
 *
 * WHAT "verify" DECIDES, server-side, whatever "check" said:
 *   - the email has an account  -> sign in to it (the code proves the email);
 *                                  a missing profile phone is filled in.
 *   - no account, number free   -> create one: email confirmed, name, and the
 *                                  number on the profile only (it is unproven,
 *                                  so it never becomes the login phone).
 *   - no account, number taken  -> refuse, so one person never gets two accounts.
 *
 * STAGING. On a project that is not production, STAGING_TEST_LOGIN_CODE stands
 * in for the emailed code (no mail service there), with the same locks as
 * verify-msg91-otp: ignored on the production ref, and unset in production.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { enqueueEmail, isEmailSuppressed } from "../_shared/email.ts";
import { isSyntheticEmail } from "../_shared/phone.ts";
import {
  classifyIdentity,
  internationalE164,
  maskAddress,
  maskPhone,
  type AccountRef,
} from "../_shared/checkoutIdentity.ts";
import {
  generateOtpCode,
  hashOtpCode,
  isOtpCodeShaped,
  isResendSuppressed,
  normalizeEmail,
  otpExpiresAt,
  verifyOtpRecord,
  OTP_DAY_SECONDS,
  OTP_FAIL_MAX_PER_DAY,
  OTP_FAIL_MAX_PER_WINDOW,
  OTP_FAIL_WINDOW_SECONDS,
  OTP_SEND_MAX_PER_DAY,
  OTP_SEND_MAX_PER_IP_DAY,
  OTP_SEND_MAX_PER_IP_WINDOW,
  OTP_SEND_MAX_PER_WINDOW,
  OTP_SEND_WINDOW_SECONDS,
  OTP_TTL_SECONDS,
  OTP_VERIFY_MAX_PER_IP_WINDOW,
  OTP_VERIFY_WINDOW_SECONDS,
  type OtpIssueRow,
  type OtpRecord,
} from "../_shared/otp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OTP_PEPPER = Deno.env.get("EMAIL_OTP_PEPPER") ?? "";
const PRODUCTION_REF = "ivkvluezuiojovpotlyb";
const STAGING_TEST_LOGIN_CODE = SUPABASE_URL.includes(PRODUCTION_REF)
  ? undefined
  : Deno.env.get("STAGING_TEST_LOGIN_CODE");

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Body {
  action?: string;
  email?: string;
  phone?: string;
  name?: string;
  code?: string;
}

const codeKey = (email: string) => `checkout ${email}`;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = String(body.action ?? "").trim().toLowerCase();
  const email = normalizeEmail(body.email);
  if (!email || isSyntheticEmail(email)) return json({ error: "invalid_email" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ip = clientIp(req);

  if (action === "check") {
    const phone = internationalE164(body.phone);
    if (!phone) return json({ error: "invalid_phone" }, 400);
    const allowed = await withinRateLimit(admin, `checkout-identity-check-ip:${ip}`, 30, OTP_SEND_WINDOW_SECONDS);
    if (allowed === null) return json({ error: "rate_limit_unavailable" }, 500);
    if (!allowed) return json({ error: "too_many_requests" }, 429);

    const [emailAcct, phoneAcct] = await Promise.all([accountByEmail(admin, email), accountByPhone(admin, phone)]);
    const status = classifyIdentity(phone, emailAcct, phoneAcct);
    return json({
      status,
      // Only the OTHER side of a conflict, masked.
      ...(status === "email_other_phone" ? { hint: maskPhone(emailAcct?.phone) } : {}),
      ...(status === "phone_other_email" || status === "split" ? { hint: maskAddress(phoneAcct?.email) } : {}),
    });
  }

  if (action === "send") {
    for (const [key, max, window] of [
      [`checkout-email-send-ip:${ip}`, OTP_SEND_MAX_PER_IP_WINDOW, OTP_SEND_WINDOW_SECONDS],
      [`checkout-email-send-ip-day:${ip}`, OTP_SEND_MAX_PER_IP_DAY, OTP_DAY_SECONDS],
    ] as const) {
      const ok = await withinRateLimit(admin, key, max, window);
      if (ok === null) return json({ error: "rate_limit_unavailable" }, 500);
      if (!ok) return json({ error: "too_many_requests" }, 429);
    }
    if (!OTP_PEPPER && !STAGING_TEST_LOGIN_CODE) return json({ error: "otp_unconfigured" }, 503);
    if (OTP_PEPPER) await issueCode(admin, email);
    return json({ status: "sent" });
  }

  if (action === "verify") {
    const allowed = await withinRateLimit(admin, `checkout-email-verify-ip:${ip}`, OTP_VERIFY_MAX_PER_IP_WINDOW, OTP_VERIFY_WINDOW_SECONDS);
    if (allowed === null) return json({ error: "rate_limit_unavailable" }, 500);
    if (!allowed) return json({ error: "too_many_requests" }, 429);

    const phone = internationalE164(body.phone);
    if (!phone) return json({ error: "invalid_phone" }, 400);
    const code = String(body.code ?? "").trim();

    const testCode = !!STAGING_TEST_LOGIN_CODE && code === STAGING_TEST_LOGIN_CODE;
    if (!testCode) {
      if (!OTP_PEPPER) return json({ error: "otp_unconfigured" }, 503);
      if (!isOtpCodeShaped(code)) return json({ error: "invalid_code_format" }, 400);
      const verdict = await consumeCode(admin, email, code);
      if (verdict !== "valid") return json({ error: verdict }, verdict === "rate_limit_unavailable" ? 500 : 401);
    }

    const [emailAcct, phoneAcct] = await Promise.all([accountByEmail(admin, email), accountByPhone(admin, phone)]);

    if (emailAcct) {
      // The code proves the email, so its account is theirs. Fill a missing
      // profile phone only when no other account holds the number.
      if (!emailAcct.phone && !phoneAcct) {
        await admin.from("users").update({ phone }).eq("id", emailAcct.id).then(undefined, () => {});
      }
      const loginEmail = await authEmailOf(admin, emailAcct.id);
      const session = loginEmail ? await mintSession(admin, loginEmail) : null;
      if (!session) return json({ error: "session_mint_failed" }, 500);
      return json({ ...session, user_id: emailAcct.id, is_new_user: false });
    }

    if (phoneAcct) {
      return json({ error: "phone_other_email", hint: maskAddress(phoneAcct.email) }, 409);
    }

    const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!name) return json({ error: "name_required" }, 400);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name, phone },
    });
    if (createErr || !created?.user) {
      console.error("checkout-email-identity: createUser failed", createErr?.message);
      return json({ error: "create_user_failed" }, 500);
    }
    // handle_new_user makes the profile row; set the details on it explicitly.
    await admin.from("users").update({ full_name: name, phone, email }).eq("id", created.user.id)
      .then(undefined, () => {});
    const session = await mintSession(admin, email);
    if (!session) return json({ error: "session_mint_failed" }, 500);
    return json({ ...session, user_id: created.user.id, is_new_user: true });
  }

  return json({ error: "invalid_action" }, 400);
});

/** The account an email belongs to: the login email first, else a profile email held by exactly one account. */
async function accountByEmail(admin: Admin, email: string): Promise<AccountRef | null> {
  const { data } = await admin.rpc("find_login_identity", { p_phone: null, p_email: email });
  const row = (Array.isArray(data) ? data[0] : data) as { id: string } | undefined;
  let id = row?.id ?? null;
  if (!id) {
    const { data: profiles } = await admin.from("users").select("id").ilike("email", email).is("deleted_at", null).limit(2);
    if (profiles && profiles.length === 1) id = profiles[0].id;
  }
  if (!id) return null;
  return await accountRef(admin, id);
}

/** The account holding this exact international number (login or profile phone; full digits, never last-10). */
async function accountByPhone(admin: Admin, phone: string): Promise<AccountRef | null> {
  const bare = phone.replace(/^\+/, "");
  const { data: profiles } = await admin.from("users").select("id").in("phone", [phone, bare]).is("deleted_at", null).limit(1);
  if (profiles?.[0]?.id) return await accountRef(admin, profiles[0].id);
  const { data } = await admin.rpc("find_login_identity", { p_phone: phone, p_email: null });
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; phone?: string | null } | undefined;
  // find_login_identity matches the last 10 digits; keep it only on a full-number match.
  if (row?.id && (row.phone ?? "").replace(/\D/g, "") === bare) return await accountRef(admin, row.id);
  return null;
}

async function accountRef(admin: Admin, id: string): Promise<AccountRef> {
  const [{ data: profile }, { data: authRow }] = await Promise.all([
    admin.from("users").select("email, phone").eq("id", id).maybeSingle(),
    admin.auth.admin.getUserById(id),
  ]);
  const realEmail = (e: string | null | undefined) => (e && !isSyntheticEmail(e) ? e : null);
  const authUser = authRow?.user;
  return {
    id,
    email: realEmail(profile?.email) ?? realEmail(authUser?.email),
    phone: (profile?.phone || (authUser?.phone ? `+${authUser.phone.replace(/^\+/, "")}` : "")) || null,
  };
}

async function authEmailOf(admin: Admin, id: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(id);
  return data?.user?.email ?? null;
}

async function issueCode(admin: Admin, email: string): Promise<void> {
  const key = codeKey(email);
  const { data: live } = await admin
    .from("email_otp_codes")
    .select("created_at, expires_at, consumed_at")
    .eq("email", key)
    .order("created_at", { ascending: false })
    .limit(1);
  if (isResendSuppressed((live?.[0] ?? null) as OtpIssueRow | null)) return;
  if (await isEmailSuppressed(admin, email)) return;

  // One unit of the per-address delivery budget per code actually sent.
  const hourly = await withinRateLimit(admin, `checkout-email-deliver:${email}`, OTP_SEND_MAX_PER_WINDOW, OTP_SEND_WINDOW_SECONDS);
  const daily = await withinRateLimit(admin, `checkout-email-deliver-day:${email}`, OTP_SEND_MAX_PER_DAY, OTP_DAY_SECONDS);
  if (!hourly || !daily) return;

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(key, code, OTP_PEPPER);
  await admin.from("email_otp_codes").update({ consumed_at: new Date().toISOString() }).eq("email", key).is("consumed_at", null);
  const { error: insertErr } = await admin.from("email_otp_codes").insert({ email: key, code_hash: codeHash, expires_at: otpExpiresAt() });
  if (insertErr) {
    console.error("checkout-email-identity: failed to store code", insertErr.message);
    return;
  }
  const minutes = String(Math.round(OTP_TTL_SECONDS / 60));
  const { error: mailErr } = await enqueueEmail(admin, {
    runId: crypto.randomUUID(),
    to: email,
    subject: `${code} is your LevelUp code`,
    html:
      `<p>Use this code to continue to your LevelUp purchase:</p>` +
      `<p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p>` +
      `<p>It expires in ${minutes} minutes. If you did not ask for it, ignore this email.</p>`,
    text: `Use this code to continue to your LevelUp purchase: ${code}\n\nIt expires in ${minutes} minutes. If you did not ask for it, ignore this email.`,
    label: "checkout_email_otp",
    idempotencyKey: `checkout-otp:${codeHash}`,
    messageId: crypto.randomUUID(),
  });
  if (mailErr) console.error("checkout-email-identity: enqueue failed", mailErr.message);
}

type ConsumeVerdict = "valid" | "invalid_code" | "code_expired" | "code_already_used" | "too_many_attempts" | "rate_limit_unavailable";

async function consumeCode(admin: Admin, email: string, code: string): Promise<ConsumeVerdict> {
  const key = codeKey(email);
  const candidate = await hashOtpCode(key, code, OTP_PEPPER);
  const { data: rows } = await admin
    .from("email_otp_codes")
    .select("id, code_hash, expires_at, consumed_at")
    .eq("email", key)
    .order("created_at", { ascending: false })
    .limit(1);
  const record = (rows?.[0] ?? null) as (OtpRecord & { id: string }) | null;
  const verdict = verifyOtpRecord(record, candidate);
  if (verdict === "invalid_code" || verdict === "not_found") {
    // Failed guesses spend a per-address budget a resend cannot reset.
    const hourly = await withinRateLimit(admin, `checkout-email-fail:${email}`, OTP_FAIL_MAX_PER_WINDOW, OTP_FAIL_WINDOW_SECONDS);
    const daily = await withinRateLimit(admin, `checkout-email-fail-day:${email}`, OTP_FAIL_MAX_PER_DAY, OTP_DAY_SECONDS);
    if (hourly === null || daily === null) return "rate_limit_unavailable";
    if (!hourly || !daily) return "too_many_attempts";
    return "invalid_code";
  }
  if (verdict === "consumed") return "code_already_used";
  if (verdict === "expired") return "code_expired";
  if (!record) return "invalid_code";
  const { data: claimed } = await admin
    .from("email_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", record.id)
    .is("consumed_at", null)
    .select("id");
  return claimed && claimed.length > 0 ? "valid" : "code_already_used";
}

async function withinRateLimit(admin: Admin, key: string, max: number, windowSeconds: number): Promise<boolean | null> {
  const { data, error } = await admin.rpc("check_and_increment_rate_limit", {
    p_key: key,
    p_max_count: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("checkout-email-identity: rate-limit rpc failed", error.message);
    return null;
  }
  return data !== false;
}

async function mintSession(admin: Admin, email: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties) return null;
  const { email_otp, verification_type } = data.properties as { email_otp?: string; verification_type?: string };
  if (!email_otp) return null;
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    email,
    token: email_otp,
    type: (verification_type || "magiclink") as "magiclink",
  });
  if (verifyErr || !verified.session) return null;
  return { access_token: verified.session.access_token, refresh_token: verified.session.refresh_token };
}
