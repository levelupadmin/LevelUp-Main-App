/**
 * claim-application: the SERVER half of the interactive claim (PHASE SP / S-4).
 *
 * Provisioning (`_shared/identity.ts`, called from the Tally poller) never
 * silent-merges. When an application's email belongs to one auth user and its
 * phone to another — or one of the two is already taken — the row is parked
 * with `user_id` NULL + `pending_claim = true` and nothing is created. The tie
 * is broken here, by the only party who can prove it: the human, at their next
 * interactive sign-in, with ONE additional OTP on the SECOND channel. No admin
 * or support action is part of that path, which is the S-4 acceptance criterion.
 *
 * TWO ACTIONS, ONE ENDPOINT — both require the caller's own session JWT:
 *   { application_id, action: "send",  channel: "email", email }
 *   { application_id, action: "claim", channel: "email", email, code }
 *   { application_id, action: "claim", channel: "phone", phone, access_token }
 *
 * WHY THE SEND PATH CANNOT REUSE `verify-email-otp`. That endpoint only ever
 * mails an address which ALREADY resolves to an auth user, because it queues by
 * uid through `queue-transactional-email`. The `phone_taken` collision is
 * exactly the case where the application's email has no account at all, so the
 * code has to be addressed directly. `_shared/email.ts#enqueueEmail` takes a
 * literal `to`, which is what makes that possible without a second mailer.
 *
 * THE PROPERTIES THAT MATTER
 *
 * 1. THE SECOND CHANNEL IS RE-DERIVED HERE, FROM THE JWT. `canClaim` in
 *    `_shared/identity.ts` documents at length that it CANNOT tell a
 *    second-channel proof from a replay of the first, and that the caller must
 *    pass the channel it has not yet proved. The client derives that too, but
 *    only to decide what to render. This function ignores the client's opinion
 *    entirely: it reads the caller's own `auth.users` row, works out which of
 *    the application's two channels that identity ALREADY matches, and will
 *    only accept an OTP on the other one. A caller who matches BOTH channels is
 *    refused — there is no unproven channel left, so there is no proof to give.
 *
 * 2. THE CLAIM'S CODES CANNOT SIGN ANYONE IN. They share the
 *    `email_otp_codes` table with the sign-in path but are stored under a
 *    SCOPED key (`claim <application_id> <email>`) that contains spaces, so
 *    `normalizeEmail` rejects it and `verify-email-otp` can neither read nor
 *    write those rows. The isolation runs both ways: a sign-in code is stored
 *    under the bare address and can never satisfy a claim either.
 *
 * 3. THE ATTACH IS CONDITIONAL. `user_id` is stamped with
 *    `WHERE pending_claim AND user_id IS NULL`, so two racing claims cannot
 *    both win and an already-claimed row cannot be re-claimed. Nothing is ever
 *    merged: exactly one column on exactly one application row changes owner.
 *    A rejection writes nothing at all, and an abandoned attempt writes nothing
 *    at all, so the row simply stays parked and surfaces again next sign-in.
 *
 * 4. ONE REJECTION SHAPE. Wrong code, right code on someone else's row, no
 *    such row, already claimed and wrong-channel all answer `{ error:
 *    "claim_rejected" }` with 401, so this endpoint is not an oracle for "does
 *    this identifier own that application". Configuration failures (503) and
 *    lookup failures (500) are distinct on purpose: the client tells the user
 *    the truth about an unreachable server rather than blaming their digits.
 *
 * 5. NO PASSWORD, NO SIGNUP, NO NEW AUTH USER. This function creates nothing in
 *    `auth`. It only ever binds an existing application row to the already
 *    signed-in caller.
 *
 * SECRETS, BY NAME: `EMAIL_OTP_PEPPER` (shared with `verify-email-otp`; the
 * HMAC key for the at-rest code hash — the function fails closed with 503 while
 * it is unset), `MSG91_AUTH_KEY` (shared with `verify-msg91-otp`, for the phone
 * channel's access-token check), plus the platform-injected SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * `verify-msg91-otp` and `verify-email-otp` are NOT touched by this file.
 */

// Same specifier as `_shared/email.ts`. Pinning a different patch here would
// mint a SECOND SupabaseClient class, and the `enqueueEmail`/`isEmailSuppressed`
// helpers would then reject this client on a protected-member identity check.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { canClaim, identityKeys } from "../_shared/identity.ts";
import { e164, phoneBinding } from "../_shared/phone.ts";
import { enqueueEmail, isEmailSuppressed } from "../_shared/email.ts";
import {
  generateOtpCode,
  hashOtpCode,
  isOtpCodeShaped,
  isResendSuppressed,
  maskEmail,
  normalizeEmail,
  otpExpiresAt,
  OTP_DAY_SECONDS,
  OTP_FAIL_MAX_PER_DAY,
  OTP_FAIL_MAX_PER_WINDOW,
  OTP_FAIL_WINDOW_SECONDS,
  OTP_SEND_MAX_PER_DAY,
  OTP_SEND_MAX_PER_WINDOW,
  OTP_SEND_WINDOW_SECONDS,
  OTP_TTL_SECONDS,
  OTP_VERIFY_WINDOW_SECONDS,
  verifyOtpRecord,
  type OtpIssueRow,
  type OtpRecord,
} from "../_shared/otp.ts";

/**
 * Submissions per caller per application per window. Local rather than
 * imported: `_shared/otp.ts` publishes a per-ADDRESS and a per-IP verify cap
 * for the sign-in endpoint, and neither key fits here — the claim is
 * authenticated, so the caller's uid is both a better key and one an attacker
 * cannot rotate. The horizon is shared so the two paths stay comparable, and
 * the ceiling that actually binds is the OTP_FAIL_* budget below.
 */
const CLAIM_VERIFY_MAX_PER_WINDOW = 15;

/**
 * Send REQUESTS per caller per application per window, as opposed to codes
 * actually mailed (`OTP_SEND_MAX_PER_WINDOW`, charged further down only when an
 * address matches and mail is about to be produced). Two ceilings because they
 * bound two different things: this one bounds the work an authenticated caller
 * can make us do, the other bounds the mail a mailbox receives. Deliberately
 * far above it, so a claimant who mistypes their own address — the only hint
 * the UI can give them is a mask — can never spend their own mail budget on
 * typos and lock themselves out of a flow that is supposed to need no operator.
 */
const CLAIM_SEND_MAX_REQUESTS_PER_WINDOW = 30;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OTP_PEPPER = Deno.env.get("EMAIL_OTP_PEPPER") ?? "";
const MSG91_AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY") ?? "";

// Same rationale as verify-email-otp's local alias: the concrete generic shape
// of `createClient(url, key)` differs from a bare `ReturnType<typeof
// createClient>`, so helpers take the permissive form. Types only.
// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** THE single rejection literal. See property 4 in the header. */
const CLAIM_REJECTED = { error: "claim_rejected" } as const;

/** THE single send-path literal, identical whatever the send actually did. */
const SEND_ACCEPTED = { status: "sent" } as const;

type Channel = "email" | "phone";

interface Body {
  application_id?: string;
  action?: string;
  channel?: string;
  email?: string;
  phone?: string;
  code?: string;
  access_token?: string;
}

interface PendingRow {
  id: string;
  email: string | null;
  phone: string | null;
}

/**
 * The key a claim code is stored under in `email_otp_codes`. The spaces are
 * load-bearing: `normalizeEmail` rejects anything containing whitespace, so
 * `verify-email-otp` cannot address these rows and a claim code can never be
 * redeemed for a session. See property 2 in the header.
 */
const claimCodeKey = (applicationId: string, email: string) =>
  `claim ${applicationId} ${email}`;

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Fail closed rather than key claim codes on the service-role key — same
  // rule, and the same secret, as verify-email-otp.
  if (!OTP_PEPPER) {
    console.error("claim-application: EMAIL_OTP_PEPPER is not set; the claim flow is disabled");
    return json({ error: "otp_unconfigured" }, 503);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const applicationId = typeof body.application_id === "string" ? body.application_id.trim() : "";
  if (!applicationId) return json({ error: "missing_application_id" }, 400);

  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  if (action !== "send" && action !== "claim") return json({ error: "invalid_action" }, 400);

  const channel = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "";
  if (channel !== "email" && channel !== "phone") return json({ error: "invalid_channel" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ─ 1. WHO IS CALLING ─────────────────────────────────────────────────
  // The gateway already validated the JWT (verify_jwt = true in config.toml);
  // this resolves it to the auth row, which is the identity everything below is
  // decided against. Never a client-supplied identifier.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return json({ error: "unauthenticated" }, 401);

  const { data: userData, error: userErr } = await admin.auth.getUser(bearer);
  const caller = userData?.user;
  if (userErr || !caller?.id) return json({ error: "unauthenticated" }, 401);

  // ─ 2. THE PARKED ROW ─────────────────────────────────────────────────
  const { data: rows, error: rowErr } = await admin
    .from("cohort_applications")
    .select("id, email, phone")
    .eq("id", applicationId)
    .eq("pending_claim", true)
    .is("user_id", null)
    .limit(1);

  if (rowErr) {
    console.error("claim-application: application lookup failed", rowErr);
    return json({ error: "lookup_failed" }, 500);
  }
  const pending = (rows?.[0] ?? null) as PendingRow | null;
  // Already claimed, never parked, or no such row: one shape for all three.
  if (!pending) return json(CLAIM_REJECTED, 401);

  // ─ 3. WHICH CHANNEL IS STILL UNPROVEN ────────────────────────────────
  // Derived from the CALLER'S OWN auth identity, not from anything in the
  // request. This is the check `canClaim` explicitly refuses to make for us.
  const unproven = unprovenChannel(pending, { email: caller.email, phone: caller.phone });
  if (!unproven) {
    // Either the caller matches neither channel (not their row) or they match
    // both (nothing left to prove, so no OTP could add anything). Same shape.
    return json(CLAIM_REJECTED, 401);
  }
  if (channel !== unproven) return json(CLAIM_REJECTED, 401);

  // ─ 4. SEND (email channel only) ──────────────────────────────────────
  if (action === "send") {
    if (channel !== "email") return json({ error: "invalid_channel" }, 400);

    const requested = normalizeEmail(body.email);
    if (!requested) return json({ error: "invalid_email" }, 400);

    // Request-shaped ceiling, charged to every send whatever it does. It bounds
    // the work one authenticated caller can make us do; it is NOT the mail
    // budget, and it is set well above it so a legitimate claimant cannot walk
    // into it by mistyping their own address.
    const requestsAllowed = await withinRateLimit(
      admin,
      `claim-otp-request:${caller.id}:${applicationId}`,
      CLAIM_SEND_MAX_REQUESTS_PER_WINDOW,
      OTP_SEND_WINDOW_SECONDS,
    );
    if (requestsAllowed === null) return json({ error: "rate_limit_unavailable" }, 500);
    if (!requestsAllowed) return json({ error: "too_many_requests" }, 429);

    // The address is only ever the one ON THE ROW. A caller who types anything
    // else gets SEND_ACCEPTED and no mail: telling them "wrong address" would
    // turn this into a guess-the-applicant's-email oracle, and mailing it would
    // make the endpoint a spam relay.
    //
    // THE MATCH COMES BEFORE THE MAIL BUDGET, and that ordering is the fix for a
    // self-lockout: the only hint the UI can give is a mask ("a•••@domain"), so
    // a legitimate claimant guessing between two of their own addresses is
    // expected. Charging the delivery budget for a mismatch — which mails
    // nothing — spent five of five on typos and left the real claimant 429'd
    // for fifteen minutes, on a flow whose whole promise is that no operator is
    // needed to finish it. `_shared/otp.ts` states the rule this now obeys: a
    // send budget is charged at the moment mail is handed to the queue, never
    // for merely asking.
    if (canClaim({ email: pending.email, phone: pending.phone }, {
      channel: "email",
      value: requested,
    })) {
      for (const bucket of [
        {
          key: `claim-otp-send:${caller.id}:${applicationId}`,
          max: OTP_SEND_MAX_PER_WINDOW,
          window: OTP_SEND_WINDOW_SECONDS,
        },
        {
          key: `claim-otp-send-day:${caller.id}`,
          max: OTP_SEND_MAX_PER_DAY,
          window: OTP_DAY_SECONDS,
        },
      ]) {
        const allowed = await withinRateLimit(admin, bucket.key, bucket.max, bucket.window);
        if (allowed === null) return json({ error: "rate_limit_unavailable" }, 500);
        if (!allowed) return json({ error: "too_many_requests" }, 429);
      }
      await issueClaimCode(admin, applicationId, requested);
    }
    return json(SEND_ACCEPTED);
  }

  // ─ 5. CLAIM ──────────────────────────────────────────────────────────
  const verifyAllowed = await withinRateLimit(
    admin,
    `claim-otp-verify:${caller.id}:${applicationId}`,
    CLAIM_VERIFY_MAX_PER_WINDOW,
    OTP_VERIFY_WINDOW_SECONDS,
  );
  if (verifyAllowed === null) return json({ error: "rate_limit_unavailable" }, 500);
  if (!verifyAllowed) return json({ error: "too_many_requests" }, 429);

  let provedValue: string;

  if (channel === "email") {
    const requested = normalizeEmail(body.email);
    if (!requested) return json({ error: "invalid_email" }, 400);
    if (!isOtpCodeShaped(body.code)) return json({ error: "invalid_code_format" }, 400);

    const budget = await withinFailureBudget(admin, caller.id);
    if (budget === null) return json({ error: "rate_limit_unavailable" }, 500);
    if (!budget) return json({ error: "too_many_requests" }, 429);

    const key = claimCodeKey(applicationId, requested);
    // The stored key is what the hash is domain-separated by, so a sign-in code
    // and a claim code for the same address are not even comparable at rest.
    const candidateHash = await hashOtpCode(key, body.code, OTP_PEPPER);

    const { data: codeRows, error: codeErr } = await admin
      .from("email_otp_codes")
      .select("id, code_hash, expires_at, consumed_at")
      .eq("email", key)
      .order("created_at", { ascending: false })
      .limit(1);
    if (codeErr) {
      console.error("claim-application: code lookup failed", codeErr);
      return json({ error: "lookup_failed" }, 500);
    }

    // Every rejection is one shape. There is no per-row attempt counter to
    // burn: `verifyOtpRecord` compares the hash first, so a counter could only
    // ever reject someone holding the RIGHT code. The ceiling is the per-caller
    // OTP_FAIL_* budget spent above, which no resend can reset.
    const record = (codeRows?.[0] ?? null) as (OtpRecord & { id: string }) | null;
    if (verifyOtpRecord(record, candidateHash) !== "valid" || !record) {
      return json(CLAIM_REJECTED, 401);
    }

    // Single-use, conditionally, so two racing claims cannot both consume it.
    const { data: consumed, error: consumeErr } = await admin
      .from("email_otp_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", record.id)
      .is("consumed_at", null)
      .select("id");
    if (consumeErr) {
      console.error("claim-application: consume failed", consumeErr);
      return json({ error: "lookup_failed" }, 500);
    }
    if (!consumed || consumed.length === 0) return json(CLAIM_REJECTED, 401);

    provedValue = requested;
  } else {
    // Phone channel: the proof is a MSG91 widget access token, checked exactly
    // the way verify-msg91-otp checks one (that file is not touched).
    if (!MSG91_AUTH_KEY) {
      console.error("claim-application: MSG91_AUTH_KEY is not set; the phone claim is disabled");
      return json({ error: "otp_unconfigured" }, 503);
    }
    const accessToken = typeof body.access_token === "string" ? body.access_token : "";
    if (!accessToken || !body.phone) return json({ error: "missing_access_token_or_phone" }, 400);

    const normPhone = e164(body.phone);
    const ok = await verifyMsg91Token(accessToken, normPhone);
    if (!ok) return json(CLAIM_REJECTED, 401);

    provedValue = normPhone;
  }

  // ─ 6. DOES THE PROOF ENTITLE THEM TO THE ROW ─────────────────────────
  // `channel` is already known to be the unproven one (step 3), so this is the
  // second-channel check the whole design turns on, run on the pure primitive.
  if (!canClaim({ email: pending.email, phone: pending.phone }, {
    channel: channel as Channel,
    value: provedValue,
  })) {
    return json(CLAIM_REJECTED, 401);
  }

  // ─ 7. ATTACH ─────────────────────────────────────────────────────────
  // Exactly one row, exactly one owner, conditional on it still being parked.
  const { data: attached, error: attachErr } = await admin
    .from("cohort_applications")
    .update({ user_id: caller.id, pending_claim: false })
    .eq("id", applicationId)
    .eq("pending_claim", true)
    .is("user_id", null)
    .select("id");

  if (attachErr) {
    console.error("claim-application: attach failed", attachErr);
    return json({ error: "attach_failed" }, 500);
  }
  if (!attached || attached.length === 0) return json(CLAIM_REJECTED, 401);

  console.log("claim-application: application attached", {
    application_id: applicationId,
    user_id: caller.id,
    channel,
  });
  return json({ claimed: true });
});

/**
 * Which of the application's two channels has this caller NOT already proved?
 *
 * Returns null when the caller matches neither channel (RLS should already have
 * hidden the row from them) and, importantly, ALSO when they match both: there
 * is then no unproven channel, so no OTP could be a second-channel proof, and
 * accepting one would be the replay `_shared/identity.ts#canClaim` warns about.
 */
function unprovenChannel(
  row: { email: string | null; phone: string | null },
  caller: { email?: string | null; phone?: string | null },
): Channel | null {
  const rowKeys = identityKeys({ email: row.email, phone: row.phone });
  const callerKeys = identityKeys({ email: caller.email, phone: caller.phone });

  const provenEmail = rowKeys.email !== null && rowKeys.email === callerKeys.email;
  const provenPhone = rowKeys.phone !== null && rowKeys.phone === callerKeys.phone;

  if (provenEmail && provenPhone) return null;
  if (provenEmail && rowKeys.phone !== null) return "phone";
  if (provenPhone && rowKeys.email !== null) return "email";
  return null;
}

/**
 * Issue and mail one claim code. Returns void and swallows everything: the
 * caller answers with a single fixed literal, so nothing in here may change its
 * shape. Only ever called for the address that is already known to match the
 * parked row.
 */
async function issueClaimCode(admin: Admin, applicationId: string, email: string): Promise<void> {
  const key = claimCodeKey(applicationId, email);

  // A live code stays in flight rather than being re-issued, so a repeat
  // request inside the cooldown costs no extra mail.
  const { data: liveRows, error: liveErr } = await admin
    .from("email_otp_codes")
    .select("created_at, expires_at, consumed_at")
    .eq("email", key)
    .order("created_at", { ascending: false })
    .limit(1);
  if (liveErr) {
    console.error("claim-application: live-code lookup failed", liveErr);
  } else if (isResendSuppressed((liveRows?.[0] ?? null) as OtpIssueRow | null)) {
    return;
  }

  if (await isEmailSuppressed(admin, email)) {
    console.error("claim-application: CLAIM CODE BLOCKED — address is on suppressed_emails", {
      application_id: applicationId,
      email: maskEmail(email),
    });
    return;
  }

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(key, code, OTP_PEPPER);

  // Supersede anything still live for this application+address pair, so exactly
  // one code works at a time and a resend invalidates the previous mail.
  await admin
    .from("email_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("email", key)
    .is("consumed_at", null);

  const { error: insertErr } = await admin.from("email_otp_codes").insert({
    email: key,
    code_hash: codeHash,
    expires_at: otpExpiresAt(),
  });
  if (insertErr) {
    console.error("claim-application: failed to store claim code", insertErr);
    return;
  }

  const minutes = String(Math.round(OTP_TTL_SECONDS / 60));
  const { error: mailErr } = await enqueueEmail(admin, {
    runId: crypto.randomUUID(),
    to: email,
    subject: `${code} is your LevelUp confirmation code`,
    html:
      `<p>Use this code to link your application to your LevelUp account:</p>` +
      `<p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p>` +
      `<p>It expires in ${minutes} minutes. If you did not ask for it, ignore this email. ` +
      `Nothing changes until the code is used.</p>`,
    text:
      `Use this code to link your application to your LevelUp account: ${code}\n\n` +
      `It expires in ${minutes} minutes. If you did not ask for it, ignore this email. ` +
      `Nothing changes until the code is used.`,
    label: "claim_application_otp",
    idempotencyKey: `claim-otp:${applicationId}:${codeHash}`,
    messageId: crypto.randomUUID(),
  });
  if (mailErr) {
    console.error("claim-application: enqueue failed", mailErr);
  }
}

/**
 * The MSG91 widget access-token check, in the same two steps verify-msg91-otp
 * uses: the token must be real, AND it must be bound to the number being
 * claimed. Without the binding step a caller could complete a genuine OTP on
 * their own number and post that token alongside somebody else's.
 */
async function verifyMsg91Token(accessToken: string, normPhone: string): Promise<boolean> {
  try {
    const resp = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authkey: MSG91_AUTH_KEY, "access-token": accessToken }),
    });
    const data = (await resp.json().catch(() => ({}))) as { type?: string; message?: string };
    const verified = data.type === "success" ||
      String(data.message || "").toLowerCase().includes("already verif");
    if (!verified) return false;

    const binding = phoneBinding(normPhone, data, accessToken);
    if (binding === "mismatch") return false;
    if (binding === "unknown") {
      console.warn(
        "claim-application: no verified phone recoverable from MSG91; proceeding without strict token-phone binding",
        { phone: normPhone },
      );
    }
    return true;
  } catch (err) {
    console.error("claim-application: MSG91 verify threw", err);
    return false;
  }
}

/**
 * The existing public rate-limit bucket (20260408151400). True = allowed,
 * false = over cap, null = the RPC itself failed and the caller must refuse
 * rather than proceed unlimited.
 */
async function withinRateLimit(
  admin: Admin,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean | null> {
  const { data, error } = await admin.rpc("check_and_increment_rate_limit", {
    p_key: key,
    p_max_count: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("claim-application: rate-limit rpc failed", error);
    return null;
  }
  return data !== false;
}

/**
 * The binding brute-force ceiling for the email channel, keyed on the CALLER
 * rather than on the code row, so issuing a fresh code cannot reset it. Same
 * two horizons and same constants as the sign-in path.
 */
async function withinFailureBudget(admin: Admin, userId: string): Promise<boolean | null> {
  const hourly = await withinRateLimit(
    admin,
    `claim-otp-fail:${userId}`,
    OTP_FAIL_MAX_PER_WINDOW,
    OTP_FAIL_WINDOW_SECONDS,
  );
  if (hourly === null) return null;
  const daily = await withinRateLimit(
    admin,
    `claim-otp-fail-day:${userId}`,
    OTP_FAIL_MAX_PER_DAY,
    OTP_DAY_SECONDS,
  );
  if (daily === null) return null;
  return hourly && daily;
}
