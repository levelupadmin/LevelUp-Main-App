import PhoneInputBase, { getCountries, getCountryCallingCode, isPossiblePhoneNumber, parsePhoneNumber, type Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { Input } from "@/components/ui/input";
import { resolveImportPhone } from "@shared/phone";

/**
 * The phone box for admins adding or editing a student: the country is its own
 * dropdown (India by default), the number goes beside it, and the code can't be
 * typed into the number (founder, 2 Nov 2026: one box with "10 digits = India,
 * else +code" let people get it wrong without noticing). The value is the full
 * number with its "+", which admin-grant-access and admin-update-user already
 * read as-is (resolveImportPhone, rule 1).
 */

/** Where our students' numbers come from, most first (live, 2 Nov 2026: 3,498
 *  Indian, a handful from these), then every other country. */
const FIRST: Country[] = ["IN", "AE", "US", "GB", "SG", "AU", "CA"];

/** A stored number as this box wants it. Profiles hold "+917550173731" or
 *  "917550173731" (1,928 on live); both open as India. Unreadable → empty. */
export function toE164(raw: string | null | undefined): string {
  const digits = resolveImportPhone(raw);
  return digits ? `+${digits}` : "";
}

/** The country a stored number opens on, so the box and its messages agree.
 *  A number the library can't place exactly (+44 is shared by the UK, Jersey,
 *  Guernsey and the Isle of Man) takes the main country for its code. */
export function countryOf(e164: string): Country {
  const parsed = e164 ? parsePhoneNumber(e164) : undefined;
  if (!parsed) return "IN";
  if (parsed.country) return parsed.country;
  const code = parsed.countryCallingCode;
  return FIRST.find((c) => getCountryCallingCode(c) === code)
    ?? getCountries().find((c) => getCountryCallingCode(c) === code)
    ?? "IN";
}

/** The number, or "" while the box holds only the country code: picking a
 *  country puts "+44" in the box before anything is typed. */
export function typedNumber(value: string, country: Country | undefined): string {
  if (!value) return "";
  return country && value.replace(/\D/g, "") === getCountryCallingCode(country) ? "" : value;
}

const regionName = (c: Country): string => {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c; } catch { return c; }
};

/** What's wrong with the number, naming the country, or null when it's fine or empty. */
export function phoneProblem(value: string, country: Country | undefined): string | null {
  const typed = typedNumber(value, country);
  if (!typed || isPossiblePhoneNumber(typed)) return null;
  return country ? `Not a valid number for ${regionName(country)}` : "Not a valid number";
}

export default function AdminPhoneInput({ value, onChange, onCountryChange, disabled, id }: {
  value: string;
  onChange: (value: string) => void;
  onCountryChange?: (country: Country | undefined) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <PhoneInputBase
      international
      defaultCountry="IN"
      countryOptionsOrder={[...FIRST, "|", "..."]}
      countryCallingCodeEditable={false}
      value={value || undefined}
      onChange={(v) => onChange(v || "")}
      onCountryChange={onCountryChange}
      inputComponent={Input as never}
      disabled={disabled}
      id={id}
      placeholder="Mobile number"
    />
  );
}
