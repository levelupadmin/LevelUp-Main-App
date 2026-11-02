/**
 * Who is buying, for the checkout's INTERNATIONAL path (pure, no imports).
 *
 * Indian numbers sign in with an SMS code (verify-msg91-otp), where the phone
 * alone decides the account. A number outside India cannot get our SMS, so the
 * buyer gives an email too and proves it with an email code
 * (checkout-email-identity). These rules decide, before and after that code,
 * whether the email and the number belong to the same person.
 */

export interface AccountRef {
  id: string;
  /** Real address on the account, or null (none, or a phone placeholder). */
  email: string | null;
  /** E.164 phone on the account, or null. */
  phone: string | null;
}

export type IdentityStatus =
  /** Neither the email nor the number has an account: a new one is made. */
  | "new"
  /** The email's account, with this number or with no number yet. */
  | "match"
  /** The email has an account with a different number. */
  | "email_other_phone"
  /** The number has an account under a different (or no) email. */
  | "phone_other_email"
  /** The email and the number belong to two different accounts. */
  | "split";

/**
 * An international number in E.164 ("+447919414508"), or null when it is not
 * one: no leading +, fewer than 8 or more than 15 digits, or an Indian (+91)
 * number, which takes the SMS path instead.
 */
export function internationalE164(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s.startsWith("+")) return null;
  const digits = s.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith("91")) return null;
  return `+${digits}`;
}

const digitsOf = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "");

/** Same number: full digits for international numbers, never a last-10 match (a +44 and a +91 can share 10 digits). */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = digitsOf(a), db = digitsOf(b);
  return da.length >= 8 && da === db;
}

export function classifyIdentity(
  phone: string,
  emailAcct: AccountRef | null,
  phoneAcct: AccountRef | null,
): IdentityStatus {
  if (emailAcct && phoneAcct) return emailAcct.id === phoneAcct.id ? "match" : "split";
  if (emailAcct) return !emailAcct.phone || samePhone(emailAcct.phone, phone) ? "match" : "email_other_phone";
  if (phoneAcct) return "phone_other_email";
  return "new";
}

/** "+44 ••••• 4508": enough for the owner to recognise, not enough to dial. */
export function maskPhone(phone: string | null | undefined): string {
  const d = digitsOf(phone);
  if (d.length < 8) return "a different number";
  return `+${d.slice(0, d.length - 10 > 0 ? d.length - 10 : 2)} ••••• ${d.slice(-4)}`;
}

/** "a•••@gmail.com". */
export function maskAddress(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  const at = e.indexOf("@");
  if (at < 1) return "a different email";
  return `${e[0]}•••${e.slice(at)}`;
}
