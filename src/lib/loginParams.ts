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
