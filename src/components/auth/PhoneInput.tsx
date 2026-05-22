import { useEffect, useState } from "react";
import PhoneInputBase, { type Country } from "react-phone-number-input";
import { Input } from "@/components/ui/input";
import "react-phone-number-input/style.css";

const TZ_COUNTRY: Record<string, Country> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Singapore": "SG",
  "Asia/Dubai": "AE",
  "Asia/Tokyo": "JP",
  "Asia/Hong_Kong": "HK",
  "Asia/Bangkok": "TH",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Manila": "PH",
  "Asia/Jakarta": "ID",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Colombo": "LK",
  "America/New_York": "US",
  "America/Los_Angeles": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Berlin": "DE",
  "Europe/Paris": "FR",
  "Europe/Amsterdam": "NL",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Pacific/Auckland": "NZ",
};

function detectCountry(): Country {
  try {
    return TZ_COUNTRY[Intl.DateTimeFormat().resolvedOptions().timeZone] || "IN";
  } catch {
    return "IN";
  }
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
}

export function PhoneInput({ value, onChange, disabled, autoFocus, className, placeholder }: Props) {
  const [country, setCountry] = useState<Country>("IN");
  useEffect(() => {
    setCountry(detectCountry());
  }, []);

  return (
    <PhoneInputBase
      international
      defaultCountry={country}
      value={value}
      onChange={(v) => onChange(v || "")}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      inputComponent={Input as never}
      className={className}
      countryCallingCodeEditable={false}
    />
  );
}
