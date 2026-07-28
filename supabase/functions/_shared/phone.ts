/**
 * Pure phone-number + OTP-binding helpers shared by the auth/order edge
 * functions (verify-msg91-otp, guest-create-order). Extracted so the login
 * path's security logic — especially phoneBinding, the account-takeover guard —
 * is defined once and can be unit-tested directly.
 *
 * Dependency-free: no imports, and only globals that exist in every target
 * (Deno, Node, jsdom) — atob, JSON, TextEncoder. Safe to bundle anywhere.
 */

/** Strip to the 10-digit Indian subscriber number, or null if not a 10/12-digit form. */
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
}

/** Normalise any incoming phone to E.164 with a leading + (drops leading zeros on bare numbers). */
export function e164(phone: string): string {
  return phone.startsWith("+") ? phone : `+${phone.replace(/^0+/, "")}`;
}

/** Last 10 digits — the subscriber part, stable across "+9197…", "9197…", "97…". "" if < 10 digits. */
export function last10(s: string): string {
  const d = (s || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

/** Historical phone formats legacy_enrolments may have stored, for an E.164 +91 number. */
export function phoneVariants(normPhone: string): string[] {
  return [
    normPhone,                      // +919788385577
    normPhone.replace(/^\+/, ""),   // 919788385577
    normPhone.replace(/^\+91/, ""), // 9788385577
  ];
}

/**
 * The domain every synthetic placeholder address is minted on. One spelling, so
 * `syntheticEmail` (which mints them) and `isSyntheticEmail` (which refuses to
 * treat them as real addresses) can never drift apart.
 */
const SYNTHETIC_EMAIL_DOMAIN = "@phone.leveluplearning.in";

/**
 * Deterministic placeholder email for a phone-only (no-email) account. The
 * domain carries no MX record so nothing is delivered; it exists only so
 * GoTrue's email-based magiclink can mint a session for a phone-only user.
 */
export function syntheticEmail(normPhone: string): string {
  return `${normPhone.replace(/\D/g, "")}${SYNTHETIC_EMAIL_DOMAIN}`;
}

/**
 * Is this address the placeholder above rather than something a person typed?
 *
 * Callers that JOIN on email must ask, because a synthetic address is an artefact
 * of our own login path: it identifies a phone, so matching on it as "the
 * applicant's email" is matching on the phone key while pretending otherwise, and
 * treating it as a real address hides that the phone key is the one that had to
 * work.
 */
export function isSyntheticEmail(email: string): boolean {
  return (email || "").trim().toLowerCase().endsWith(SYNTHETIC_EMAIL_DOMAIN);
}

/**
 * The subscriber digits carried INSIDE a synthetic placeholder address, or null
 * when the address is a real one. `919788385577@phone.leveluplearning.in` →
 * `9788385577`.
 *
 * It exists so an external system that was handed a phone-only account's
 * placeholder address (Calendly prefilled from the profile, say) can be resolved
 * on the PRIMARY key it really carries — the phone — instead of failing an email
 * join against a mailbox that does not exist.
 */
export function phoneFromSyntheticEmail(email: string): string | null {
  if (!isSyntheticEmail(email)) return null;
  const trimmed = (email || "").trim();
  const local = trimmed.slice(0, trimmed.lastIndexOf("@"));
  return last10(local) || null;
}

/**
 * SQL `LIKE` patterns that find a stored phone WHATEVER SEPARATORS IT CARRIES,
 * ordered tightest first. Empty when the input holds no 10-digit subscriber number.
 *
 * WHY THIS EXISTS: the intake chain writes the phone VERBATIM as the applicant
 * typed it into Tally, so the column legitimately holds "+91 98765 43210",
 * "+919876543210", "98765 43210" and "9876543210" for the same person. A single
 * `LIKE '%9876543210'` probe — the obvious one — matches only the last of those,
 * which is how a phone-PRIMARY join key can be inert against real data while
 * looking correct in review.
 *
 *   1. `%<10 digits>`            — the stored value ends in the clean subscriber run
 *   2. `%9%8%7%…%0%`             — the ten digits IN ORDER with any separators
 *                                  (spaces, hyphens, brackets) between them
 *
 * Pattern 2 is deliberately WIDE, and that is safe only because it is a candidate
 * FILTER, never a decision: every caller must re-check each candidate exactly (
 * `last10(row.phone) === last10(phone)`) before binding anything to it, and refuse
 * when more than one distinct candidate survives. Widening the SQL net can only add
 * candidates for that exact check to reject; it can never, on its own, bind a row.
 */
export function phoneLikePatterns(phone: string): string[] {
  const subscriber = last10(phone);
  if (subscriber === "") return [];
  return [`%${subscriber}`, `%${subscriber.split("").join("%")}%`];
}

/**
 * Does the phone MSG91 actually verified match the phone the caller claims?
 * verifyAccessToken only proves the token is REAL, not that it was issued for
 * this phone — without this check, an attacker who completes a genuine OTP for
 * their own number could replay that token with a victim's phone and take over
 * the account.
 *
 *   "match"    – a recovered identifier equals the caller's phone
 *   "mismatch" – ≥1 identifier recovered and NONE match → takeover attempt
 *   "unknown"  – nothing phone-like recoverable (caller proceeds; logs loudly)
 *
 * We recover identifiers from MSG91's success `message` and from phone-named
 * claims inside the access-token JWT, and compare on the last-10 subscriber
 * digits. Only phone-named JWT claims are inspected, never iat/exp/nbf, so a
 * 10-digit timestamp can't masquerade as a phone and false-block a real login.
 */
export function phoneBinding(
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
