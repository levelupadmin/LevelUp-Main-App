/**
 * Who may open the Creator Studio prototype.
 *
 * 🔴 WHY AN EMAIL ALLOWLIST AND NOT THE `admin` ROLE. The prototype is
 * deliberately unfinished — dead buttons, invented numbers, half-designed
 * screens. An admin stumbling into it would reasonably read it as a broken
 * product and file a bug, or worse, quote its fake numbers. The allowlist keeps
 * it to the people who asked for it until it graduates.
 *
 * This gate is a UX guard, NOT a security boundary — the prototype reads no
 * data, writes no data, and exposes nothing that isn't hard-coded in
 * `previewData.ts`, so there is nothing here to protect. Access control that
 * matters lives in RLS, as it does everywhere else in this app.
 */
const PREVIEW_EMAILS = ["avinash@leveluplearning.in"] as const;

export function canSeePreview(email: string | null | undefined): boolean {
  if (!email) return false;
  return PREVIEW_EMAILS.includes(email.trim().toLowerCase() as (typeof PREVIEW_EMAILS)[number]);
}
