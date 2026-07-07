import PhoneInputBase, { type Country } from "react-phone-number-input";
import { Input } from "@/components/ui/input";
import "react-phone-number-input/style.css";

// India-first by design. The signup/login copy promises "+91 by default",
// the audience is "12,000+ Indian creators", and every legacy enrolment is
// stored as a +91 number, so an Indian (or NRI) student should never have to
// fix the country code to log in. Anyone outside India taps the flag to switch
// (the on-screen helper text says exactly that).
//
// We deliberately do NOT timezone-detect the country. A TZ map (Asia/Singapore
// → SG, Asia/Dubai → AE, …) contradicted the on-screen "+91 by default" promise
// and, worse, pushed NRI/legacy users (whose LevelUp accounts ARE +91 numbers)
// onto a foreign calling code, adding friction to the exact login path we want
// to keep seamless.
const DEFAULT_COUNTRY: Country = "IN";

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
  // Forwarded verbatim onto the underlying <input>. react-phone-number-input
  // spreads any prop it doesn't consume itself onto the number input, so a
  // caller's `htmlFor` label, aria-invalid state, and error-node association
  // all land on the real focusable element (parity with a plain <Input>).
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function PhoneInput({
  value,
  onChange,
  disabled,
  autoFocus,
  className,
  placeholder,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: Props) {
  return (
    <PhoneInputBase
      international
      defaultCountry={DEFAULT_COUNTRY}
      value={value}
      onChange={(v) => onChange(v || "")}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      inputComponent={Input as never}
      className={className}
      countryCallingCodeEditable={false}
      id={id}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedby}
    />
  );
}
