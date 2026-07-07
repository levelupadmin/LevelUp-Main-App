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
  // Restrict the selectable countries. Surfaces whose downstream validation
  // only honors one region (guest checkout is +91-only end to end: client,
  // useGuestCheckout, and server normalizePhone all reject non-IN) MUST pass
  // countries={["IN"]} so the flag switcher can't offer a dead-end the flow
  // cannot accept. Login/signup omit it and stay fully international.
  countries?: Country[];
  // Lands on the real focusable number input (react-phone-number-input
  // spreads unconsumed props there) — callers must NOT wrap this component
  // in a blurring container instead: focusout bubbles from the country
  // select too, which marks fields "touched" while the user is still
  // mid-entry.
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
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
  countries,
  onBlur,
}: Props) {
  return (
    <PhoneInputBase
      international
      defaultCountry={DEFAULT_COUNTRY}
      countries={countries}
      addInternationalOption={countries ? false : undefined}
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
      onBlur={onBlur}
    />
  );
}
