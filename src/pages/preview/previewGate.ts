/**
 * Who may open the Creator Studio prototype.
 *
 * 🔴 WHY AN ALLOWLIST AND NOT THE `admin` ROLE. The prototype is deliberately
 * unfinished — dead buttons, invented numbers, half-designed screens. An admin
 * stumbling into it would reasonably read it as a broken product and file a bug,
 * or worse, quote its fake numbers. The allowlist keeps it to the people who
 * asked for it until it graduates.
 *
 * 🔴 WHY BOTH ID AND EMAIL. The first version matched on email alone and locked
 * the founder out of his own prototype: this app's primary login is phone OTP,
 * and which of `user.email` / `profile.email` is populated depends on the path
 * taken through `verify-msg91-otp`. The auth user id is the one identifier that
 * is always present and never rewritten, so it leads; email stays as a fallback
 * for a session where the id has not resolved yet.
 *
 * This gate is a UX guard, NOT a security boundary — the prototype reads no
 * data, writes no data, and exposes nothing that is not hard-coded in
 * `previewData.ts`, so there is nothing here to protect. Access control that
 * matters lives in RLS, as it does everywhere else in this app.
 */
const PREVIEW_USER_IDS: readonly string[] = [
  "5c25205d-bc27-45d6-b6a0-19478ef68560", // Avinash — owner
];

const PREVIEW_EMAILS: readonly string[] = ["avinash@leveluplearning.in"];

export function canSeePreview(
  identity: { id?: string | null; email?: string | null } | null | undefined,
): boolean {
  if (!identity) return false;
  if (identity.id && PREVIEW_USER_IDS.includes(identity.id)) return true;
  const email = identity.email?.trim().toLowerCase();
  return !!email && PREVIEW_EMAILS.includes(email);
}
