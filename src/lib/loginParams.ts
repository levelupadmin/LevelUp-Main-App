/**
 * Pure helpers for /login's entry parameters.
 *
 * `?next=` — where to go after a successful sign-in. Same-origin paths only:
 * must start with a single "/" (no "//", no scheme) so the page can never be
 * used as an open redirect. Router `state.from` (set by RequireAuth) wins over
 * the query param when both are present.
 *
 * `?phone=` — prefill for the phone field, used by guest checkout after a
 * successful payment so the buyer's one OTP goes to the number the purchase is
 * attached to. Accepted only as strict E.164 ("+" then 8–15 digits).
 */

export function resolveLoginRedirect(
  stateFrom: string | null | undefined,
  nextParam: string | null | undefined,
  fallback = "/home",
): string {
  const candidate = (stateFrom || nextParam || "").trim();
  if (!candidate) return fallback;
  // A leading single "/" already rules out schemes ("https:", "javascript:").
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  if (/[\r\n\\]/.test(candidate)) return fallback;
  return candidate;
}

export function prefillPhoneParam(param: string | null | undefined): string {
  const s = (param ?? "").trim().replace(/\s+/g, "");
  return /^\+\d{8,15}$/.test(s) ? s : "";
}

/**
 * The Stage sign-in's +91 field: whatever was typed, pasted or autofilled →
 * the digits the field holds. The number is complete (and can be sent) when
 * exactly 10 are held.
 *
 * Pastes and autofill often carry the country code or the trunk zero
 * ("+91 98765 43210", "919876543210", "09876543210", "0091 98765 43210").
 * Keeping the first 10 digits of those gives a wrong number, so a leading
 * 0091 / 91 / 0 is dropped, but only while what is left is still at least
 * 10 digits. That keeps typing safe: a real number that starts with 91 or 0
 * never loses a digit.
 *
 * Anything still longer than 10 is cut to 10 (a stray extra keystroke is
 * ignored, as before), with one exception: 11 digits starting with 91 are
 * held as they are, because that is someone typing the country code before
 * the number. The next digit completes it; until then the field is not 10
 * digits, so it cannot be sent.
 */
export function nationalMobileDigits(raw: string | null | undefined): string {
  let d = (raw ?? "").replace(/\D/g, "");
  for (;;) {
    if (d.length >= 14 && d.startsWith("0091")) d = d.slice(4);
    else if (d.length >= 12 && d.startsWith("91")) d = d.slice(2);
    else if (d.length >= 11 && d.startsWith("0")) d = d.slice(1);
    else break;
  }
  if (d.length === 11 && d.startsWith("91")) return d;
  return d.slice(0, 10);
}
