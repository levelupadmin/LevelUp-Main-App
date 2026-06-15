import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  e164,
  last10,
  phoneVariants,
  syntheticEmail,
  phoneBinding,
} from "@shared/phone";

/** base64url-encode a JWT payload the way MSG91's access token carries one. */
function jwtWith(payload: Record<string, unknown>): string {
  const b64url = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `eyJhbGciOiJIUzI1NiJ9.${b64url}.sig`;
}

describe("normalizePhone", () => {
  it("accepts a bare 10-digit number", () => {
    expect(normalizePhone("9788385577")).toBe("9788385577");
  });
  it("strips +91 / 91 country codes", () => {
    expect(normalizePhone("+919788385577")).toBe("9788385577");
    expect(normalizePhone("919788385577")).toBe("9788385577");
  });
  it("ignores spaces and punctuation", () => {
    expect(normalizePhone("+91 97883 85577")).toBe("9788385577");
  });
  it("rejects anything that isn't a 10- or 12-digit form", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("09788385577")).toBeNull(); // 11 digits
    expect(normalizePhone("")).toBeNull();
  });
});

describe("e164", () => {
  it("keeps an already-prefixed number", () => {
    expect(e164("+919788385577")).toBe("+919788385577");
  });
  it("adds a leading + and drops leading zeros", () => {
    expect(e164("919788385577")).toBe("+919788385577");
    expect(e164("00919788385577")).toBe("+919788385577");
  });
});

describe("last10", () => {
  it("returns the 10-digit subscriber part across formats", () => {
    expect(last10("+919788385577")).toBe("9788385577");
    expect(last10("919788385577")).toBe("9788385577");
    expect(last10("9788385577")).toBe("9788385577");
  });
  it("returns empty when there aren't 10 digits", () => {
    expect(last10("12345")).toBe("");
    expect(last10("")).toBe("");
  });
});

describe("phoneVariants", () => {
  it("lists the historical formats legacy_enrolments may hold", () => {
    expect(phoneVariants("+919788385577")).toEqual([
      "+919788385577",
      "919788385577",
      "9788385577",
    ]);
  });
});

describe("syntheticEmail", () => {
  it("derives a deterministic placeholder address from the digits", () => {
    expect(syntheticEmail("+919788385577")).toBe("919788385577@phone.leveluplearning.in");
  });
});

describe("phoneBinding — the account-takeover guard", () => {
  const PHONE = "+919788385577";

  it("matches when MSG91's success message carries the same number", () => {
    expect(phoneBinding(PHONE, { message: "919788385577 verified", type: "success" }, ""))
      .toBe("match");
  });

  it("matches when a phone-named JWT claim carries the same number", () => {
    expect(phoneBinding(PHONE, {}, jwtWith({ mobile: "919788385577" }))).toBe("match");
  });

  it("MISMATCHES when a recovered identifier is a different number (takeover)", () => {
    expect(phoneBinding(PHONE, { message: "919999999999 verified" }, "")).toBe("mismatch");
    expect(phoneBinding(PHONE, {}, jwtWith({ mobile: "919999999999" }))).toBe("mismatch");
  });

  it("returns 'unknown' (not mismatch) when nothing phone-like is recoverable", () => {
    expect(phoneBinding(PHONE, {}, "")).toBe("unknown");
  });

  it("never treats iat/exp timestamps as a phone — a 10-digit ts can't false-block a login", () => {
    expect(phoneBinding(PHONE, {}, jwtWith({ iat: 1700000000, exp: 1700003600 })))
      .toBe("unknown");
  });

  it("returns 'unknown' when the caller phone has no 10 digits", () => {
    expect(phoneBinding("123", { message: "anything" }, "")).toBe("unknown");
  });

  it("matches if EITHER source carries the right number (OR-of-candidates)", () => {
    // message wrong but JWT right → match
    expect(phoneBinding(PHONE, { message: "919999999999 verified" }, jwtWith({ mobile: "919788385577" })))
      .toBe("match");
    // message right but JWT wrong → still match
    expect(phoneBinding(PHONE, { message: "919788385577 ok" }, jwtWith({ mobile: "919999999999" })))
      .toBe("match");
  });
});
