import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, fireEvent } from "@testing-library/react";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { normalizePhone, e164 } from "@shared/phone";

/**
 * P3-T9 revenue guard: swapping the hand-rolled "+91 + bare digits" guest field
 * for the app's PhoneInput must NOT change the identity the guest-create-order /
 * verify-razorpay-payment edge functions mint for a +91 number.
 *
 * The old field stored bare digits ("9876543210") behind a fixed +91 label and
 * sent them as `guest_phone`. PhoneInput (defaultCountry IN) emits canonical
 * E.164 ("+919876543210"), which CheckoutPage sends verbatim as `guest_phone`
 * (the payload does `guest_phone: guestPhone.trim()`). The server normalises
 * both to the same 10-digit subscriber number, so the two payloads are
 * E.164-identical after normalisation — the account created is unchanged.
 */

// Mirrors how CheckoutPage holds the guest phone: a controlled string that
// becomes the `guest_phone` payload field verbatim.
function PhoneHarness({ onValue }: { onValue: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <PhoneInput
      value={v}
      onChange={(x) => {
        setV(x);
        onValue(x);
      }}
    />
  );
}

describe("CheckoutPage guest phone payload (P3-T9)", () => {
  it("submits an E.164 +91 payload equivalent to the legacy bare-digit path", () => {
    const onValue = vi.fn();
    const { container } = render(<PhoneHarness onValue={onValue} />);
    const input = container.querySelector('input[type="tel"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    // Enter the same 10-digit national number the old hand-rolled +91 field took.
    fireEvent.change(input, { target: { value: "9876543210" } });

    const emitted = onValue.mock.calls.at(-1)?.[0] as string;
    // PhoneInput yields canonical E.164 for a default-country-IN entry.
    expect(emitted).toBe("+919876543210");

    // The submit payload uses the raw controlled value (`.trim()` is a no-op here).
    const newPayload = { guest_phone: emitted.trim() };
    // The legacy hand-rolled field stored bare digits behind a fixed +91 prefix.
    const legacyPayload = { guest_phone: "9876543210" };

    // guest-create-order normalises both to the same subscriber identity, so the
    // account minted on payment verify is byte-identical across the two paths.
    expect(normalizePhone(newPayload.guest_phone)).toBe(
      normalizePhone(legacyPayload.guest_phone),
    );
    expect(normalizePhone(newPayload.guest_phone)).toBe("9876543210");

    // And the E.164 form the server derives from the legacy digits is identical
    // to what the new payload already carries.
    expect(e164(`91${normalizePhone(legacyPayload.guest_phone)}`)).toBe(emitted);
  });

  // P3-T9 a11y: CheckoutPage wires an htmlFor="guest-phone" label plus an
  // inline #guest-phone-error node onto the phone field. PhoneInput must forward
  // id/aria-invalid/aria-describedby onto the real focusable <input> (parity with
  // the name/email <Input>s) or the label is dangling and the error is never
  // announced — so assert the forwarding lands on the tel input itself.
  it("forwards id/aria-invalid/aria-describedby onto the underlying phone input", () => {
    const { container } = render(
      <PhoneInput
        id="guest-phone"
        value=""
        onChange={() => {}}
        aria-invalid
        aria-describedby="guest-phone-error"
      />,
    );
    const input = container.querySelector('input[type="tel"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.id).toBe("guest-phone");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("guest-phone-error");
  });
});
