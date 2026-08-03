/**
 * Pure code-generation / verification / expiry logic for the EMAIL OTP login
 * path (`verify-email-otp`). Extracted so the security-critical decisions —
 * how a code is drawn, how it is hashed at rest, and exactly which conditions
 * reject it — are defined once and unit-testable without a network, a
 * database, or a Deno runtime (vitest imports this via `@shared/otp`).
 *
 * DEPENDENCIES: only `./crypto.ts`, which is itself import-free. We reuse its
 * audited `hmacSha256Hex` + `timingSafeEqual` rather than growing a second
 * hashing/compare implementation in the codebase. Nothing here touches the
 * network, `Deno.env`, or a Supabase client — the caller supplies the pepper
 * and the clock.
 *
 * WHY THE PHONE PATH HAS NO EQUIVALENT: `verify-msg91-otp` keeps no local OTP
 * state at all — the MSG91 widget owns the code inside MSG91's infrastructure,
 * which is why `phone_otp_attempts` was dropped in 20260524110000. The email
 * channel has no such third party, so the storage, the expiry and the ceilings
 * are ours to define. These constants ARE that definition.
 *
 * ONE RULE RUNS THROUGH ALL OF THEM: a limit keyed on an address must be
 * spendable only by something an attacker cannot do for free. Guesses and
 * delivered mail qualify; merely POSTing someone else's address does not, or
 * the limiter becomes a way to lock its own user out.
 */

import { hmacSha256Hex, timingSafeEqual } from "./crypto.ts";

/** Digits in a code. Six is the parity target with what MSG91 sends by SMS. */
export const OTP_LENGTH = 6;

/** How long a freshly-issued code stays usable. */
export const OTP_TTL_SECONDS = 600; // 10 minutes

/**
 * Wrong guesses against ONE issued code that are worth a log line, and NOTHING
 * ELSE. This is deliberately not a rejection rule.
 *
 * A per-code ceiling reads like defence and is in fact pure denial of service.
 * `verifyOtpRecord` compares the hash FIRST (it has to: any verdict that
 * distinguishes "burned" from "wrong" hands an attacker a state oracle), so a
 * wrong guess can never be told it exhausted the counter — it just gets
 * `invalid_code`. The counter therefore costs the attacker nothing and, if it
 * rejected, would kill the victim's in-flight code: five anonymous guesses and
 * the real owner's CORRECT digits come back 429, with no remedy except a code
 * they were never told to request.
 *
 * The ceiling that actually binds brute force is OTP_FAIL_* below. It is keyed
 * on the address rather than on the row (so a resend cannot reset it), it is
 * spent only by guesses (so an honest correct submission never trips it), and
 * it is time-windowed (so waiting genuinely does help).
 */
export const OTP_ATTEMPT_ALERT_THRESHOLD = 5;

/**
 * THE BINDING BRUTE-FORCE CEILING. A per-address budget of FAILED verifies,
 * counted in the shared `public.check_and_increment_rate_limit` bucket rather
 * than in the code row, which is what makes it survive a supersede: issuing a
 * new code does not hand the attacker a new budget.
 *
 * Two horizons, same reason the send path has two: the hourly cap stops a
 * burst, the daily cap stops a patient grinder. 15 guesses a day against a
 * 10^6 space is ~5.5e3 guesses a year, i.e. a ~0.5% chance of ever landing one
 * against a targeted address — versus ~40% for an attacker bounded only by a
 * per-code counter, which a fresh `send` resets for free.
 *
 * Only a guess (`invalid_code` / `not_found`) spends this budget. A correct
 * code that is merely stale or already used does not, so a real user whose
 * code expired is never locked out by their own honest retry.
 */
export const OTP_FAIL_MAX_PER_WINDOW = 5;
export const OTP_FAIL_WINDOW_SECONDS = 3600; // 1 hour
export const OTP_FAIL_MAX_PER_DAY = 15;

/**
 * Send-path ceiling, counted in codes actually DELIVERED for an address — not
 * in requests made for it. The distinction is the whole point: a request-shaped
 * per-address cap is spendable by anyone who knows the address, so five (or
 * fifteen) anonymous POSTs would lock the real owner out of email sign-in for
 * the window. Charging the budget at the moment we hand mail to the queue means
 * an attacker has to actually produce the mail — through the resend cooldown,
 * one message a minute, into the victim's own visible inbox — to spend it.
 *
 * The residue is honest and bounded: an attacker willing to send a victim 15
 * real emails can still stop that address getting a NEW code for the rest of
 * the day. Email is the second login channel; the untouched MSG91 phone path is
 * unaffected, and a code already in flight still verifies.
 */
export const OTP_SEND_MAX_PER_WINDOW = 5;
export const OTP_SEND_WINDOW_SECONDS = 900; // 15 minutes

/** Request-shaped, IP-keyed: bounds the work one caller can make us do. */
export const OTP_SEND_MAX_PER_IP_WINDOW = 20;

/**
 * Second, longer horizon on delivered mail. Without it the 15-minute cap still
 * lets a caller mail a victim 480 real messages a day, on the shared
 * transactional sender domain that also carries receipts and cohort
 * notifications — a sender-reputation risk to every other LevelUp email, not
 * just a nuisance to the victim.
 */
export const OTP_SEND_MAX_PER_DAY = 15;
/** Request-shaped, IP-keyed, second horizon. */
export const OTP_SEND_MAX_PER_IP_DAY = 60;
export const OTP_DAY_SECONDS = 86_400;

/**
 * Minimum gap between two DELIVERED codes for one address. Inside the gap a
 * repeat `send` is answered from the code already in flight: same generic
 * response, no new row, no second email. Costless retries are what turn a
 * login endpoint into an email cannon.
 */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Floor, in milliseconds, that EVERY send response is held to — known address
 * and unknown address alike. The known path does strictly more work (an
 * identity lookup, a mirror-address check, a supersede, an insert), and that
 * difference is a single-request account-enumeration oracle if the response is
 * returned as soon as the work finishes. Padding both branches up to a common
 * floor removes the signal without mailing a decoy to anyone.
 *
 * This is a floor, not a constant-time guarantee: a pathologically slow known
 * path can still overshoot it. Combined with the per-IP send cap (a couple of
 * dozen samples per window) that residue is not a practical classifier.
 */
export const OTP_SEND_FLOOR_MS = 750;

/**
 * Verify-path rate limit: submissions per IP per window, and ONLY per IP.
 * There is deliberately no per-address submission cap. Such a cap adds nothing
 * to the brute-force ceiling — OTP_FAIL_* already binds guesses per address and
 * is the tighter number — while letting anyone who knows an address hold that
 * bucket exhausted so its owner can never submit the code they were just sent.
 */
export const OTP_VERIFY_MAX_PER_IP_WINDOW = 60;
export const OTP_VERIFY_WINDOW_SECONDS = 900; // 15 minutes

// Deliberately conservative: one dot-separated domain label set, no spaces, no
// angle brackets. Same shape the other public endpoints validate against.
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const EMAIL_MAX_LEN = 200;

/**
 * Trim + lowercase an incoming address, or null when it is not a plausible
 * email. The lowercased form is the join key everywhere downstream
 * (`find_login_identity` matches case-insensitively, and the OTP rows are
 * keyed on this same normalised value) so a user who types "Foo@Bar.com" on
 * send and "foo@bar.com" on verify still resolves to one code.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > EMAIL_MAX_LEN) return null;
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

/**
 * The ONLY form of an address that may reach a log line. Edge-function logs are
 * not access-controlled the way the auth schema is — `find_login_identity` is
 * service_role-only and commented as PII-sensitive precisely to keep addresses
 * out of general reach (20260603120000), and echoing them into a log sink would
 * undo part of that. The first character plus the domain is enough to correlate
 * a report with a run (and to recognise the synthetic phone-only domain) while
 * not being the address itself.
 */
export function maskEmail(email: unknown): string {
  if (typeof email !== "string") return "***";
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/** Is this exactly OTP_LENGTH digits? Shape check only, never a secret compare. */
export function isOtpCodeShaped(code: unknown): code is string {
  return typeof code === "string" && new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

const OTP_SPACE = 10 ** OTP_LENGTH; // 1_000_000
const UINT32_LIMIT = 2 ** 32;
// Largest multiple of OTP_SPACE that fits in a uint32. Draws at or above this
// are discarded rather than folded in with a modulo, which would make the
// lowest ~4,295 codes marginally likelier than the rest.
const REJECT_AT_OR_ABOVE = Math.floor(UINT32_LIMIT / OTP_SPACE) * OTP_SPACE;

function cryptoRandomUint32(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/**
 * A uniformly-drawn OTP_LENGTH-digit code, zero-padded so "000042" is a legal
 * code and the space really is 10^OTP_LENGTH. The source of randomness is
 * injectable so the rejection branch and the padding are testable without
 * relying on luck; production always uses `crypto.getRandomValues`.
 */
export function generateOtpCode(randomUint32: () => number = cryptoRandomUint32): string {
  let draw = randomUint32();
  // Bounded so a pathological generator can never spin here forever; after the
  // guard we fall through to the modulo, whose bias is ~1e-6 relative.
  for (let i = 0; draw >= REJECT_AT_OR_ABOVE && i < 32; i++) draw = randomUint32();
  return String(Math.abs(Math.trunc(draw)) % OTP_SPACE).padStart(OTP_LENGTH, "0");
}

/**
 * The value we actually store. The plaintext code never touches the database:
 * a leaked backup or an over-broad read would otherwise be a live session for
 * every account with a code in flight. HMAC (not a bare digest) because a
 * 6-digit space is exhaustively rainbow-tableable without a secret key.
 *
 * DOMAIN-SEPARATED BY ADDRESS. Hashing the code alone would give every account
 * holding the same six digits an IDENTICAL `code_hash`, so anyone who could
 * READ the table (a backup, a future analytics view, a mis-scoped grant) could
 * recover a live code for any address by requesting one for an address they
 * control and matching hashes — no attack on the pepper needed at all. Binding
 * the normalised email into the message removes that whole class: a stolen row
 * is only ever comparable with a code issued for the SAME address.
 *
 * The address is length-prefixed so the message parses one way only. `:` is a
 * legal character in a local part, and without the prefix ("a:b@x.com", code)
 * and ("a", "b@x.com:code") would hash identically — an equivalence an
 * attacker chooses the inputs to, which is exactly the confusion the domain
 * separation is here to prevent.
 */
export function hashOtpCode(email: string, code: string, pepper: string): Promise<string> {
  return hmacSha256Hex(`${OTP_LENGTH}:${email.length}:${email}:${code}`, pepper);
}

/** ISO timestamp at which a code issued at `nowMs` stops being usable. */
export function otpExpiresAt(nowMs: number = Date.now(), ttlSeconds: number = OTP_TTL_SECONDS): string {
  return new Date(nowMs + ttlSeconds * 1000).toISOString();
}

/**
 * How much longer the send path must wait before answering, so that a known
 * address and an unknown one take the same visible time (OTP_SEND_FLOOR_MS).
 * Never negative, so an already-slow request is answered immediately rather
 * than being made slower still.
 */
export function msUntilFloor(
  startedAtMs: number,
  nowMs: number = Date.now(),
  floorMs: number = OTP_SEND_FLOOR_MS,
): number {
  const elapsed = nowMs - startedAtMs;
  if (!Number.isFinite(elapsed)) return 0;
  return Math.max(0, Math.round(floorMs - elapsed));
}

/** The subset of a stored row the resend decision needs. */
export interface OtpIssueRow {
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

/**
 * Should this `send` be answered from the code already in flight instead of
 * mailing a new one? True only when the newest row for the address is still
 * usable (unconsumed, unexpired) AND was issued within the cooldown. An
 * unparseable timestamp is treated as "do not suppress": failing open here
 * costs one extra email, failing closed would silently stop a real user from
 * ever getting one.
 */
export function isResendSuppressed(
  row: OtpIssueRow | null | undefined,
  nowMs: number = Date.now(),
  cooldownSeconds: number = OTP_RESEND_COOLDOWN_SECONDS,
): boolean {
  if (!row || row.consumed_at) return false;
  const expiry = Date.parse(row.expires_at);
  if (!Number.isFinite(expiry) || nowMs >= expiry) return false;
  const created = Date.parse(row.created_at);
  if (!Number.isFinite(created)) return false;
  return nowMs - created < cooldownSeconds * 1000;
}

/**
 * The stored shape this decision needs, a subset of `public.email_otp_codes`.
 * `attempt_count` is NOT part of it: the column exists for forensics (see
 * OTP_ATTEMPT_ALERT_THRESHOLD) and is not an input to any rejection.
 */
export interface OtpRecord {
  code_hash: string;
  expires_at: string;
  consumed_at: string | null;
}

export type OtpVerdict =
  | "valid"
  | "not_found"
  | "invalid_code"
  | "consumed"
  | "expired";

/**
 * The whole rejection decision, as a pure function of the stored row, the
 * candidate's hash, and the clock.
 *
 * ORDERING IS THE SECURITY PROPERTY, not an implementation detail. The hash
 * compare runs FIRST, so every verdict other than `valid` that says anything
 * specific ("expired", "consumed") is reachable only by a caller who already
 * holds the correct code. A caller who does not — including one probing an
 * address that has no account at all — always gets `not_found`/`invalid_code`,
 * which the handler maps to one identical response. That is what keeps the
 * verify path free of account enumeration while still telling a real user their
 * real code has simply gone stale.
 *
 * NO ATTEMPT-COUNT REJECTION LIVES HERE, and that is a decision rather than an
 * omission. Because the compare comes first, a counter checked after it can
 * only ever reject someone holding the RIGHT code — so it would punish the
 * victim of a guessing run and nobody else. The brute-force ceiling is the
 * per-address OTP_FAIL_* budget the handler spends on every guess: outside the
 * row, unresettable by a resend, and never charged to a correct submission.
 */
export function verifyOtpRecord(
  record: OtpRecord | null | undefined,
  candidateHash: string,
  nowMs: number = Date.now(),
): OtpVerdict {
  if (!record) return "not_found";
  if (!timingSafeEqual(record.code_hash, candidateHash)) return "invalid_code";
  if (record.consumed_at) return "consumed";
  const expiry = Date.parse(record.expires_at);
  if (!Number.isFinite(expiry) || nowMs >= expiry) return "expired";
  return "valid";
}
