/**
 * verify-email-otp: the EMAIL half of passwordless sign-in. Sends a six-digit
 * code to an address we already hold, then mints a Supabase session for the
 * user that address resolves to.
 *
 * Two actions on one endpoint:
 *   { action: "send",   email }         -> issue + deliver a code
 *   { action: "verify", email, code }   -> consume the code, return a session
 * (If `action` is omitted we infer it from whether a `code` was supplied, so a
 * client that only ever sends one shape still works.)
 *
 * THIS IS ADDITIVE. `verify-msg91-otp` is the proven login path for every
 * existing user and its diff is ZERO. This function deliberately MIRRORS its
 * structure (normalise the identifier, resolve the uid through
 * find_login_identity, mint via admin.generateLink + anon verifyOtp) without
 * touching it: if email OTP is broken or disabled, phone login is unaffected.
 *
 * THE PROPERTIES THAT MATTER
 *
 * 1. NO ACCOUNT ENUMERATION, INCLUDING BY CLOCK. An unknown address gets a
 *    response BYTE-IDENTICAL to a known one: both branches `return
 *    json(SEND_ACCEPTED)` — ONE shared literal, constructed once, never rebuilt
 *    per branch. The same holds on the verify side, where "no code on file" and
 *    "wrong code" both return the single INVALID_CODE literal. The known branch
 *    also does strictly more WORK, which would be a single-request oracle on
 *    its own, so two things close it: the mail hand-off is not awaited (it runs
 *    in the background, its result was already discarded), and BOTH branches are
 *    padded up to OTP_SEND_FLOOR_MS before answering. No decoy mail is sent to
 *    anybody to achieve this. Verify rejections are held to the same floor, so
 *    "this address has a code in flight" is not readable from the clock either.
 *
 * 2. THE CODE IS NEVER STORED IN PLAINTEXT. `_shared/otp.ts` hashes it with
 *    HMAC-SHA256 (`_shared/crypto.ts`) under the EMAIL_OTP_PEPPER secret, and
 *    only the hash reaches `email_otp_codes`. Single-use is enforced by a
 *    conditional UPDATE, so two racing verifies cannot both mint a session.
 *    There is NO fallback pepper: if EMAIL_OTP_PEPPER is unset the endpoint
 *    fails closed (503) rather than quietly keying login secrets on the
 *    service-role key, which would couple a routine key rotation to
 *    invalidating every code in flight.
 *
 * 3. THE CODE IS ONLY EVER MAILED TO THE ADDRESS IT WAS ISSUED FOR, AND THIS
 *    ENDPOINT NEVER WRITES. The uid comes from auth.users (find_login_identity)
 *    but `queue-transactional-email` mails whatever `public.users.email` holds
 *    for that uid — a write-once mirror with no AFTER UPDATE trigger
 *    (20260405075530) that handle_new_user may deliberately have left NULL
 *    (20260530120000:37-42). Those two are asserted equal before anything is
 *    sent, and any other state (a different address, a NULL, the synthetic
 *    phone-only domain) is a hard stop that mails nothing. Nothing outside
 *    `email_otp_codes` is mutated on an unauthenticated call: writing the
 *    mirror here would fire users_claim_legacy_enrolments (20260524130000:152)
 *    and hand out entitlements to whoever typed the address, before any proof
 *    of control — the same trigger whose failure inside a user-write
 *    transaction caused the June legacy-login outage (20260603120000:12-18).
 *
 * 4. BRUTE-FORCE HAS A CEILING THAT A RESEND CANNOT RESET, AND IT IS NOT THE
 *    ROW COUNTER. `attempt_count` cannot be one: the hash compare has to run
 *    first (or the verdict itself is a state oracle), so a counter checked
 *    after it only ever rejects the person holding the RIGHT code — an attacker
 *    spends five guesses and the victim's real code comes back 429. So the
 *    counter is recorded for forensics and rejects nobody. What binds is a
 *    per-address FAILED-GUESS budget in the shared rate-limit bucket
 *    (OTP_FAIL_* in `_shared/otp.ts`): outside the row, so a fresh send cannot
 *    reset it; charged only to guesses, so an honest correct submission never
 *    trips it; time-windowed, so waiting actually is the remedy the client copy
 *    promises. The row counter is still bumped atomically in SQL so concurrent
 *    guesses cannot pin it.
 *
 * 5. NO NEW RATE LIMITER, AND NOTHING AN ATTACKER CAN SPEND FOR FREE. Every
 *    limit is the existing `public.check_and_increment_rate_limit` RPC
 *    (20260408151400_public_rate_limits.sql). Request-shaped caps are keyed on
 *    the client IP ONLY. The address-keyed caps are charged where the cost is
 *    real — one per code DELIVERED, one per FAILED guess — because a
 *    request-shaped per-address cap is a lockout button for anyone who knows
 *    someone's email. Residual, stated plainly: a caller willing to actually
 *    mail a victim 15 codes can still stop that address getting a NEW one for
 *    the rest of the day. Phone login is untouched by that, and a code already
 *    in flight still verifies.
 *
 * SECRETS, BY NAME: `EMAIL_OTP_PEPPER` (the HMAC key for the at-rest code hash;
 * `npx supabase secrets set EMAIL_OTP_PEPPER=<32+ random bytes>`), plus the
 * standard SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY the
 * platform injects. Rotating the pepper invalidates codes issued in the
 * previous OTP_TTL_SECONDS window and nothing else.
 *
 * DELIVERY. The existing `queue-transactional-email` function takes a USER ID,
 * not an address (queue-transactional-email/index.ts:35-54), so the send path
 * is: normalise -> find_login_identity -> assert the mirror address -> queue
 * with the uid it returned. With no uid we never call the queue at all, and
 * still return SEND_ACCEPTED.
 *
 * PHONE-ONLY LEGACY USERS carry a synthetic `<digits>@phone.leveluplearning.in`
 * address (`_shared/phone.ts` syntheticEmail) whose domain has no MX record.
 * `normalizeEmail` accepts that shape, and the mirror really does hold it
 * (verify-msg91-otp:251+266 creates the auth user with it and handle_new_user
 * copies NEW.email across), so the check for it runs BEFORE the mirror
 * comparison — behind it, every one of these would look like a perfect match
 * and we would hand the shared transactional sender a guaranteed hard bounce
 * for any caller who can type a phone number. They log in by phone; nothing is
 * mailed, and the response never branches on it.
 *
 * NO SIGNUP HAPPENS HERE. A code is only ever issued for an address that
 * already resolves to an auth user; provisioning is the intake path's job
 * (`_shared/identity.ts`, called from the Tally poller). There is no signup
 * screen and no password anywhere in this flow.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeadersFor } from "../_shared/cors.ts";
import { syntheticEmail } from "../_shared/phone.ts";
import {
  generateOtpCode,
  hashOtpCode,
  isOtpCodeShaped,
  isResendSuppressed,
  maskEmail,
  msUntilFloor,
  normalizeEmail,
  otpExpiresAt,
  OTP_ATTEMPT_ALERT_THRESHOLD,
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
  verifyOtpRecord,
  type OtpIssueRow,
  type OtpRecord,
} from "../_shared/otp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// HMAC key for the at-rest code hash. REQUIRED — see property 2 in the header.
// No fallback: the service-role key must not double as a key-derivation input.
const OTP_PEPPER = Deno.env.get("EMAIL_OTP_PEPPER") ?? "";

const TEMPLATE_KEY = "login_email_otp";

// "@phone.leveluplearning.in", derived from the one helper that mints those
// placeholder addresses so the two can never drift apart.
const SYNTHETIC_EMAIL_SUFFIX = (() => {
  const sample = syntheticEmail("9999999999");
  return sample.slice(sample.indexOf("@"));
})();

// The concrete generic shape of a Supabase client differs between a bare
// `ReturnType<typeof createClient>` (schema params default to `never`) and what
// `createClient(url, key)` actually returns ("public"), so annotating a helper
// with the former rejects the real client. Same precedent as
// `_shared/email.ts` and `reconcile-funnel-stage`. Types only; erased at runtime.
// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Supabase's edge runtime exposes `EdgeRuntime.waitUntil` to keep an isolate
// alive for work that outlives the response. It is not one of Deno's own
// globals, so it is declared here and probed with `typeof` — a bare reference
// to an undeclared global would throw.
declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;

/**
 * THE single send-path response literal. Both the known-email branch and the
 * unknown-email branch return exactly this object, so the two paths cannot
 * drift apart into an enumeration oracle. Do not inline a second copy.
 */
const SEND_ACCEPTED = {
  status: "sent",
  detail: "If that address has a LevelUp account, a sign-in code is on its way.",
} as const;

/**
 * THE single "that code does not work" literal, shared by the no-row-on-file
 * case and the wrong-code case for the same reason as SEND_ACCEPTED.
 */
const INVALID_CODE = { error: "invalid_code" } as const;

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

interface Body {
  action?: string;
  email?: string;
  code?: string;
}

interface StoredOtpRow extends OtpRecord {
  id: string;
}

/** One (key, cap, window) triple for the shared rate-limit RPC. */
interface Bucket {
  key: string;
  max: number;
  window: number;
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Fail closed rather than key login secrets on the service-role key. Uniform
  // for every caller, so it reveals nothing about any address.
  if (!OTP_PEPPER) {
    console.error("verify-email-otp: EMAIL_OTP_PEPPER is not set; email login is disabled");
    return json({ error: "otp_unconfigured" }, 503);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "invalid_email" }, 400);

  const action = typeof body.action === "string"
    ? body.action.trim().toLowerCase()
    : (body.code ? "verify" : "send");
  if (action !== "send" && action !== "verify") {
    return json({ error: "invalid_action" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ip = getClientIp(req);

  // ─ Request-shaped rate limit: IP ONLY ────────────────────────────────
  // Two horizons on send so a burst cap cannot be turned into an all-day drip.
  // An RPC failure is a hard 500, never an open door.
  //
  // DELIBERATELY NOT KEYED ON THE ADDRESS. A per-address cap on REQUESTS is
  // spendable by anyone who knows the address — a handful of anonymous POSTs
  // and the owner cannot obtain a sign-in code — while an attacker who wants
  // more requests just rotates IPs, so it buys nothing it does not also cost.
  // The address is capped where the cost is real instead: one unit per code
  // DELIVERED (issueCode) and one per FAILED guess (withinFailureBudget).
  //
  // An IP we cannot recover collapses to the single shared "unknown" bucket
  // rather than falling back to an address key. The platform sets
  // x-forwarded-for, so that is a degenerate path no caller can choose to be
  // on, and it still leaves a bound on the work an IP-less request can cause.
  const buckets: Bucket[] = action === "send"
    ? [
      { key: `email-otp-send-ip:${ip}`, max: OTP_SEND_MAX_PER_IP_WINDOW, window: OTP_SEND_WINDOW_SECONDS },
      { key: `email-otp-send-ip-day:${ip}`, max: OTP_SEND_MAX_PER_IP_DAY, window: OTP_DAY_SECONDS },
    ]
    : [
      { key: `email-otp-verify-ip:${ip}`, max: OTP_VERIFY_MAX_PER_IP_WINDOW, window: OTP_VERIFY_WINDOW_SECONDS },
    ];

  for (const bucket of buckets) {
    const allowed = await withinRateLimit(admin, bucket);
    if (allowed === null) return json({ error: "rate_limit_unavailable" }, 500);
    if (!allowed) return json({ error: "too_many_requests" }, 429);
  }

  // ─ SEND ──────────────────────────────────────────────────────────────
  if (action === "send") {
    // Everything the known-address branch does is inside this call, and all of
    // it is swallowed: no failure in here may change the response. The unknown
    // address returns from it having done one identity lookup and nothing else.
    await issueCode(admin, email);

    // Both branches leave through the SAME line, at the SAME floor.
    await holdUntilFloor(startedAt);
    return json(SEND_ACCEPTED);
  }

  // ─ VERIFY ────────────────────────────────────────────────────────────
  if (!isOtpCodeShaped(body.code)) return json({ error: "invalid_code_format" }, 400);

  // Hashed under this address, matching how it was stored: the hash is
  // domain-separated so a row for one account is never comparable with a code
  // issued for another.
  const candidateHash = await hashOtpCode(email, body.code, OTP_PEPPER);

  // Newest row for this address, consumed or not: a REUSED code must be
  // recognisable as reused rather than silently absent.
  const { data: rows, error: readErr } = await admin
    .from("email_otp_codes")
    .select("id, code_hash, expires_at, consumed_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1);

  if (readErr) {
    console.error("verify-email-otp: code lookup failed", readErr);
    return json({ error: "lookup_failed" }, 500);
  }

  const record = (rows?.[0] ?? null) as StoredOtpRow | null;
  const verdict = verifyOtpRecord(record, candidateHash);

  // `!record` only ever pairs with "not_found"; testing it here narrows the
  // type for the mint path below without a non-null assertion.
  if (verdict !== "valid" || !record) {
    // The verify path has a smaller version of the send path's timing question:
    // a wrong code against an address that HAS a row in flight costs one extra
    // (attempt-bump) round trip versus an address that has none. Every
    // rejection therefore leaves at the same floor, so that residue is not a
    // classifier either. Only rejections are padded; a correct code is answered
    // as fast as the mint allows.
    const reject = async (payload: unknown, status: number) => {
      await holdUntilFloor(startedAt);
      return json(payload, status);
    };

    // A GUESS — the two verdicts reachable without holding the right code —
    // spends the per-address failure budget. That budget is the ONLY
    // brute-force ceiling, by design: it is atomic, it is keyed on the address
    // rather than on the row (so a fresh `send` cannot reset it), and it is
    // never charged to a correct submission, so a guessing run against someone
    // else's address cannot stop them using the code they were sent.
    // "consumed" and "expired" are NOT guesses (reaching them requires the
    // correct code), so a real user retrying their own stale code never burns
    // it either.
    if (verdict === "invalid_code" || verdict === "not_found") {
      const budget = await withinFailureBudget(admin, email);
      if (budget === null) return reject({ error: "rate_limit_unavailable" }, 500);
      // Identical for an address with an account and one without: the key is
      // the address either way, so this cannot answer "does this account exist".
      if (!budget) return reject({ error: "too_many_attempts" }, 429);
    }

    if (verdict === "invalid_code" && record) {
      // Record the guess against this code, through an atomic SQL increment —
      // a read-modify-write would let N concurrent wrong guesses all write the
      // same value and pin the counter. FORENSICS ONLY: it rejects nothing (see
      // property 4), so a failure here is a lost log line, not a lost limit.
      const { data: attempts, error: bumpErr } = await admin.rpc("bump_email_otp_attempt", {
        p_id: record.id,
      });
      if (bumpErr) {
        console.error("verify-email-otp: attempt increment failed", bumpErr);
      } else if (typeof attempts === "number" && attempts >= OTP_ATTEMPT_ALERT_THRESHOLD) {
        console.warn("verify-email-otp: sustained wrong guesses against one issued code", {
          email: maskEmail(email),
          attempts,
        });
      }
    }
    if (verdict === "consumed") return reject({ error: "code_already_used" }, 401);
    if (verdict === "expired") return reject({ error: "code_expired" }, 401);
    // "not_found" and "invalid_code" share ONE literal: an address with no
    // account and an address whose owner typed the wrong digits are
    // indistinguishable from the outside.
    return reject(INVALID_CODE, 401);
  }

  // ─ The code is correct: claim it, then mint ──────────────────────────
  // Conditional on consumed_at still being NULL, so of two concurrent verifies
  // holding the same code exactly one gets a session.
  const { data: claimed, error: claimErr } = await admin
    .from("email_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", record.id)
    .is("consumed_at", null)
    .select("id");

  if (claimErr) {
    console.error("verify-email-otp: consume failed", claimErr);
    return json({ error: "lookup_failed" }, 500);
  }
  if (!claimed || claimed.length === 0) return json({ error: "code_already_used" }, 401);

  const identity = await findIdentity(admin, email);
  if (!identity) {
    // A code only exists for an address that resolved to a user, so this is a
    // race (account removed mid-flight), not an unknown address.
    console.error("verify-email-otp: verified code has no identity", { email: maskEmail(email) });
    return json(INVALID_CODE, 401);
  }

  // The OTP proves control of THIS address, so minting against the canonical
  // stored address for the row it resolved to is the same identity.
  const loginEmail = (identity.email || "").trim() || email;
  const session = await mintSession(admin, loginEmail);
  if (!session) return json({ error: "session_mint_failed" }, 500);

  return json({ ...session, user_id: identity.id, is_new_user: false });
});

/**
 * Hold the response until this request has taken at least OTP_SEND_FLOOR_MS,
 * so branches that did different amounts of work still leave at the same time.
 * A request already past the floor is not delayed at all.
 */
async function holdUntilFloor(startedAt: number): Promise<void> {
  const wait = msUntilFloor(startedAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/**
 * The whole known-address send path, and the only place a code is created.
 * Returns void and swallows every failure ON PURPOSE: the caller's response is
 * one fixed literal, so nothing in here may be allowed to change its shape,
 * its status, or (beyond the shared floor) its timing.
 */
async function issueCode(admin: Admin, email: string): Promise<void> {
  const identity = await findIdentity(admin, email);
  // No account for this address: no code row, no mail, and the caller still
  // gets SEND_ACCEPTED from the single shared return.
  if (!identity) return;

  // Never mail a code anywhere but the address it was issued for.
  if (!(await isDeliverableToRequestedAddress(admin, identity.id, email))) return;

  // A live code already in flight is re-used rather than re-issued, so a repeat
  // request inside the cooldown costs no email at all.
  const { data: liveRows, error: liveErr } = await admin
    .from("email_otp_codes")
    .select("created_at, expires_at, consumed_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1);
  if (liveErr) {
    // Fail open on the cooldown only: the per-address delivery budget below
    // still bounds how much mail this can produce, and failing closed would
    // strand a user whose read happened to error.
    console.error("verify-email-otp: live-code lookup failed", liveErr);
  } else if (isResendSuppressed((liveRows?.[0] ?? null) as OtpIssueRow | null)) {
    return;
  }

  // THE per-address ceiling, spent HERE rather than at the top of the handler:
  // one unit per code we are about to put on the wire, not one per request
  // anyone can make. So the budget measures real mail (which is what protects
  // the victim's inbox and the shared sender's reputation), and burning it
  // costs an attacker an actual delivery each time instead of a bare POST.
  // Refusing is silent — the caller's response is the same fixed literal at the
  // same floor either way, so this can neither be probed nor distinguished from
  // an address that has no account.
  if (!(await withinDeliveryBudget(admin, email))) return;

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(email, code, OTP_PEPPER);

  // Supersede anything still live for this address, so exactly one code works
  // at a time and a re-send invalidates the previous mail.
  await admin
    .from("email_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("email", email)
    .is("consumed_at", null);

  const { error: insertErr } = await admin.from("email_otp_codes").insert({
    email,
    code_hash: codeHash,
    expires_at: otpExpiresAt(),
  });

  if (insertErr) {
    // Never surface storage trouble to the caller: that would be an
    // enumeration signal AND a different body for the known path.
    console.error("verify-email-otp: failed to store code", insertErr);
    return;
  }

  // NOT awaited. The queue function does a users lookup, a suppression lookup,
  // a template lookup, a render loop and an enqueue; awaiting it here would put
  // all of that on the known-address branch only, which is exactly the timing
  // oracle the floor exists to remove.
  runInBackground(queueOtpEmail(identity.id, code));
}

/**
 * Is `public.users.email` — the address `queue-transactional-email` will
 * actually mail — the same address the caller asked for?
 *
 * That mirror is populated once by handle_new_user AFTER INSERT on auth.users
 * and never resynced (20260405075530:23-24 has no AFTER UPDATE), it is
 * deliberately left NULL when another mirror row already owns the address
 * (20260530120000:37-42), and it is sticky on conflict (:61). So "the uid
 * resolves to this address in auth.users" does NOT imply "mail to this uid goes
 * to this address" — and without this check a code issued for address A can be
 * mailed to address B and then mint a full session, proving nothing about who
 * controls A.
 *
 *   • synthetic phone-only addr -> NOT deliverable, checked FIRST (below).
 *   • mirror matches            -> deliverable.
 *   • mirror holds another addr -> NOT deliverable. Hard stop, logged loudly.
 *   • mirror is NULL/absent     -> NOT deliverable, logged for an out-of-band
 *     backfill. We do NOT repair it here. `public.users` carries an AFTER
 *     UPDATE OF phone, email trigger (users_claim_legacy_enrolments,
 *     20260524130000:152) that inserts into `enrolments` and stamps
 *     `legacy_enrolments.claimed_by_user_id`, so "repairing" the mirror from an
 *     anonymous POST would grant entitlements to whoever typed the address,
 *     before any proof they control it — and it is the same trigger that took
 *     legacy login down in June when its body drifted (20260603120000:12-18).
 *     A read-only endpoint cannot cause either. These accounts keep phone
 *     login; the log line names the uid so the mirror can be filled in from a
 *     migration or an admin action, where the write belongs.
 *
 * NOTHING IN HERE WRITES. That is the property, not an accident of the current
 * branches: keep it that way.
 */
async function isDeliverableToRequestedAddress(
  admin: Admin,
  userId: string,
  email: string,
): Promise<boolean> {
  // FIRST, before any comparison. The mirror for a phone-only legacy account
  // holds exactly this synthetic address (verify-msg91-otp creates the auth
  // user with it and handle_new_user copies it across), so behind the
  // `mirrored === email` branch this would read as a perfect match and we would
  // hand the shared transactional sender a guaranteed hard bounce — on a domain
  // with no MX record, for any caller who can type a phone number.
  if (email.endsWith(SYNTHETIC_EMAIL_SUFFIX)) return false;

  const { data: row, error } = await admin
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("verify-email-otp: mirror lookup failed", error);
    return false;
  }

  const mirrored = typeof row?.email === "string" ? row.email.trim().toLowerCase() : "";
  if (mirrored === email) return true;

  if (mirrored) {
    console.error(
      "verify-email-otp: REFUSING to send — public.users mirror holds a different address",
      { user_id: userId, requested: maskEmail(email), mirrored: maskEmail(mirrored) },
    );
    return false;
  }

  console.error(
    "verify-email-otp: REFUSING to send — public.users mirror is NULL, so this account " +
      "cannot receive email until the mirror is backfilled out of band",
    { user_id: userId, requested: maskEmail(email) },
  );
  return false;
}

/**
 * The existing public rate-limit bucket. Returns true when the call is allowed,
 * false when the cap is exceeded, and null when the RPC itself failed (the
 * caller must then refuse the request rather than proceed unlimited).
 */
async function withinRateLimit(admin: Admin, bucket: Bucket): Promise<boolean | null> {
  const { data, error } = await admin.rpc("check_and_increment_rate_limit", {
    p_key: bucket.key,
    p_max_count: bucket.max,
    p_window_seconds: bucket.window,
  });
  if (error) {
    console.error("verify-email-otp: rate-limit rpc failed", error);
    return null;
  }
  return data !== false;
}

/**
 * Spend one unit of the per-address DELIVERY budget, over both horizons. Called
 * only from `issueCode`, immediately before a code goes to the mail queue, so
 * one unit is one real message.
 *
 * Both horizons are always spent, even when the first has already refused: the
 * buckets are counters, and short-circuiting would let a caller sit above the
 * 15-minute cap all day without the daily cap ever noticing. An RPC failure is
 * treated as "do not send" — the top-level limiter already answered 500 if the
 * RPC is down, so reaching here with a broken RPC means something transient,
 * and mailing on a failed check is the one outcome that cannot be undone.
 */
async function withinDeliveryBudget(admin: Admin, email: string): Promise<boolean> {
  const perWindow = await withinRateLimit(admin, {
    key: `email-otp-send:${email}`,
    max: OTP_SEND_MAX_PER_WINDOW,
    window: OTP_SEND_WINDOW_SECONDS,
  });
  const perDay = await withinRateLimit(admin, {
    key: `email-otp-send-day:${email}`,
    max: OTP_SEND_MAX_PER_DAY,
    window: OTP_DAY_SECONDS,
  });
  return perWindow === true && perDay === true;
}

/**
 * Spend one unit of the per-address FAILED-GUESS budget, over both horizons.
 * Separate keys from the verify rate limit above: that one caps submissions
 * (including a real user's successful one), this one caps only wrong answers,
 * and it is the number an attacker actually has to work against.
 */
async function withinFailureBudget(admin: Admin, email: string): Promise<boolean | null> {
  const hourly = await withinRateLimit(admin, {
    key: `email-otp-fail:${email}`,
    max: OTP_FAIL_MAX_PER_WINDOW,
    window: OTP_FAIL_WINDOW_SECONDS,
  });
  if (hourly === null) return null;

  const daily = await withinRateLimit(admin, {
    key: `email-otp-fail-day:${email}`,
    max: OTP_FAIL_MAX_PER_DAY,
    window: OTP_DAY_SECONDS,
  });
  if (daily === null) return null;

  return hourly && daily;
}

/**
 * Deterministic auth.users lookup by email, via the same service_role-only RPC
 * the phone path uses (`verify-msg91-otp/index.ts:167-178`). We pass
 * p_phone=null: this call must resolve the EMAIL the caller just proved control
 * of, and nothing else.
 */
async function findIdentity(
  admin: Admin,
  email: string,
): Promise<{ id: string; email?: string | null } | null> {
  const { data, error } = await admin.rpc("find_login_identity", {
    p_phone: null,
    p_email: email,
  });
  if (error) {
    console.error("verify-email-otp: find_login_identity failed", error);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: string; email?: string | null }
    | undefined;
  return row?.id ? row : null;
}

/**
 * Keep a promise alive past the response. Supabase's runtime has waitUntil for
 * exactly this; where it is absent (local `supabase functions serve`, a plain
 * Deno process) the promise still runs, and the send path's floor gives it
 * several hundred milliseconds of head start either way.
 */
function runInBackground(task: Promise<void>): void {
  const settled = task.catch((err) => {
    console.error("verify-email-otp: background task threw", err);
  });
  const runtime = typeof EdgeRuntime === "undefined" ? undefined : EdgeRuntime;
  runtime?.waitUntil?.(settled);
}

/**
 * Hand the code to the EXISTING transactional email pipeline. It takes a user
 * id, looks the address up itself (already asserted equal to the requested one
 * by isDeliverableToRequestedAddress), honours the suppression list, and renders
 * the `login_email_otp` template seeded in 20260727130000_email_otp_codes.sql.
 * Delivery failure is logged and swallowed: the caller's response must not
 * change shape because our mail queue had a bad minute.
 */
async function queueOtpEmail(userId: string, code: string): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/queue-transactional-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_key: TEMPLATE_KEY,
        user_id: userId,
        variables: {
          otp_code: code,
          expiry_minutes: String(Math.round(OTP_TTL_SECONDS / 60)),
        },
      }),
    });

    if (!res.ok) {
      console.error("verify-email-otp: queue-transactional-email rejected", {
        status: res.status,
        user_id: userId,
        template_key: TEMPLATE_KEY,
      });
      return;
    }

    // A suppressed address comes back as HTTP 200 with {message:"Email
    // suppressed"} (queue-transactional-email/index.ts:57-59), so `res.ok`
    // alone would log NOTHING while the user waits forever for a code. A login
    // OTP is transactional and arguably should bypass suppression; until the
    // sender is changed to allow that, this at least makes the lockout visible
    // instead of silent.
    const payload = await res.json().catch(() => null) as { message?: string } | null;
    if (payload?.message === "Email suppressed") {
      console.error(
        "verify-email-otp: LOGIN CODE BLOCKED — address is on suppressed_emails, user cannot log in by email",
        { user_id: userId, template_key: TEMPLATE_KEY },
      );
    }
  } catch (err) {
    console.error("verify-email-otp: queue-transactional-email threw", err);
  }
}

/**
 * Mint a Supabase session for an address without emailing anyone: generate a
 * magiclink server-side, then redeem its embedded OTP with the anon client.
 * The canonical "give me a session for this user" workaround, identical in
 * shape to the phone path's helper.
 */
async function mintSession(
  admin: Admin,
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
