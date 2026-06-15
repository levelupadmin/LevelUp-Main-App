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
 * Deterministic placeholder email for a phone-only (no-email) account. The
 * domain carries no MX record so nothing is delivered; it exists only so
 * GoTrue's email-based magiclink can mint a session for a phone-only user.
 */
export function syntheticEmail(normPhone: string): string {
  return `${normPhone.replace(/\D/g, "")}@phone.leveluplearning.in`;
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
