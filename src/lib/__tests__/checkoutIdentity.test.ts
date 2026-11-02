import { describe, it, expect } from "vitest";
import { classifyIdentity, internationalE164, maskAddress, maskPhone, samePhone } from "@shared/checkoutIdentity";

const acct = (id: string, email: string | null, phone: string | null) => ({ id, email, phone });

describe("internationalE164", () => {
  it("accepts a foreign number with its country code", () => {
    expect(internationalE164("+44 7919 414508")).toBe("+447919414508");
    expect(internationalE164("+1 (408) 242-3561")).toBe("+14082423561");
  });
  it("refuses Indian numbers, which take the SMS path", () => {
    expect(internationalE164("+91 98765 43210")).toBeNull();
  });
  it("refuses numbers without a country code or of the wrong length", () => {
    expect(internationalE164("7919414508")).toBeNull();
    expect(internationalE164("+44 12")).toBeNull();
  });
});

describe("samePhone", () => {
  it("never matches a +44 to a +91 on the last 10 digits", () => {
    expect(samePhone("+449876543210", "+919876543210")).toBe(false);
    expect(samePhone("+447919414508", "447919414508")).toBe(true);
  });
});

describe("classifyIdentity", () => {
  const phone = "+447919414508";
  it("is new when neither has an account", () => {
    expect(classifyIdentity(phone, null, null)).toBe("new");
  });
  it("matches the email's account with the same number or with none", () => {
    expect(classifyIdentity(phone, acct("a", "x@y.com", phone), null)).toBe("match");
    expect(classifyIdentity(phone, acct("a", "x@y.com", null), null)).toBe("match");
    expect(classifyIdentity(phone, acct("a", "x@y.com", phone), acct("a", "x@y.com", phone))).toBe("match");
  });
  it("flags an email that already has a different number", () => {
    expect(classifyIdentity(phone, acct("a", "x@y.com", "+447919414505"), null)).toBe("email_other_phone");
  });
  it("flags a number that already belongs to another email", () => {
    expect(classifyIdentity(phone, null, acct("b", "z@y.com", phone))).toBe("phone_other_email");
  });
  it("flags an email and a number on two different accounts", () => {
    expect(classifyIdentity(phone, acct("a", "x@y.com", null), acct("b", "z@y.com", phone))).toBe("split");
  });
});

describe("masking", () => {
  it("shows the country code and last 4 digits only", () => {
    expect(maskPhone("+447919414508")).toBe("+44 ••••• 4508");
    expect(maskPhone("+14082423561")).toBe("+1 ••••• 3561");
  });
  it("shows the first letter and the domain only", () => {
    expect(maskAddress("avinash@gmail.com")).toBe("a•••@gmail.com");
  });
});
