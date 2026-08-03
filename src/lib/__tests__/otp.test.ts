import { describe, it, expect } from "vitest";
import {
  generateOtpCode,
  hashOtpCode,
  isOtpCodeShaped,
  isResendSuppressed,
  maskEmail,
  msUntilFloor,
  normalizeEmail,
  otpExpiresAt,
  verifyOtpRecord,
  OTP_FAIL_MAX_PER_DAY,
  OTP_FAIL_MAX_PER_WINDOW,
  OTP_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_SEND_FLOOR_MS,
  OTP_SEND_MAX_PER_DAY,
  OTP_SEND_MAX_PER_WINDOW,
  OTP_TTL_SECONDS,
  OTP_VERIFY_MAX_PER_IP_WINDOW,
  type OtpIssueRow,
  type OtpRecord,
} from "@shared/otp";

/**
 * These helpers ARE the email login path's security. A regression here is a
 * regression in who can mint a session, so every rejection branch and the
 * enumeration-safety ordering are pinned directly rather than through the edge
 * function (which needs a network and a database).
 */

const PEPPER = "test-pepper-not-a-real-secret";
const EMAIL = "learner@example.com";
const NOW = Date.UTC(2026, 6, 27, 12, 0, 0); // 2026-07-27T12:00:00Z

/** A stored row with a real hash of `code`, defaulted to fresh + unused. */
async function recordFor(code: string, over: Partial<OtpRecord> = {}): Promise<OtpRecord> {
  return {
    code_hash: await hashOtpCode(EMAIL, code, PEPPER),
    expires_at: otpExpiresAt(NOW),
    consumed_at: null,
    ...over,
  };
}

describe("normalizeEmail", () => {
  it("trims and lowercases so send and verify resolve to one code", () => {
    expect(normalizeEmail("  Foo.Bar@Example.COM ")).toBe("foo.bar@example.com");
  });
  it("accepts the synthetic phone-only address", () => {
    expect(normalizeEmail("919788385577@phone.leveluplearning.in")).toBe(
      "919788385577@phone.leveluplearning.in",
    );
  });
  it("rejects anything that isn't email-shaped", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("no@tld")).toBeNull();
    expect(normalizeEmail("two parts@example.com")).toBeNull();
    expect(normalizeEmail("<script>@example.com")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });
  it("rejects non-strings and absurd lengths", () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail(`${"a".repeat(200)}@example.com`)).toBeNull();
  });
});

describe("isOtpCodeShaped", () => {
  it("accepts exactly OTP_LENGTH digits, leading zeros included", () => {
    expect(isOtpCodeShaped("123456")).toBe(true);
    expect(isOtpCodeShaped("000042")).toBe(true);
  });
  it("rejects wrong lengths, non-digits and non-strings", () => {
    expect(isOtpCodeShaped("12345")).toBe(false);
    expect(isOtpCodeShaped("1234567")).toBe(false);
    expect(isOtpCodeShaped("12345a")).toBe(false);
    expect(isOtpCodeShaped(" 123456")).toBe(false);
    expect(isOtpCodeShaped(123456)).toBe(false);
    expect(isOtpCodeShaped(null)).toBe(false);
  });
});

describe("generateOtpCode", () => {
  it("is always OTP_LENGTH digits", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
      expect(isOtpCodeShaped(code)).toBe(true);
    }
  });
  it("zero-pads, so the space really is 10^OTP_LENGTH", () => {
    expect(generateOtpCode(() => 42)).toBe("000042");
    expect(generateOtpCode(() => 0)).toBe("000000");
  });
  it("rejects biased draws instead of folding them in with a modulo", () => {
    // 4_294_000_000 is above the largest multiple of 1e6 that fits in a uint32,
    // so it must be discarded and the next draw used.
    const draws = [4_294_000_000, 7];
    let i = 0;
    expect(generateOtpCode(() => draws[i++])).toBe("000007");
    expect(i).toBe(2);
  });
  it("does not return the same code every call", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateOtpCode()));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("hashOtpCode", () => {
  it("never returns the plaintext code", async () => {
    const hash = await hashOtpCode(EMAIL, "123456", PEPPER);
    expect(hash).not.toContain("123456");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is deterministic for the same address, code and pepper", async () => {
    expect(await hashOtpCode(EMAIL, "123456", PEPPER))
      .toBe(await hashOtpCode(EMAIL, "123456", PEPPER));
  });
  it("is peppered, so a stolen hash is not a rainbow-table lookup", async () => {
    expect(await hashOtpCode(EMAIL, "123456", PEPPER))
      .not.toBe(await hashOtpCode(EMAIL, "123456", "other"));
  });
  it("separates neighbouring codes", async () => {
    expect(await hashOtpCode(EMAIL, "123456", PEPPER))
      .not.toBe(await hashOtpCode(EMAIL, "123457", PEPPER));
  });
  // Without this, every account with the same six digits in flight stores the
  // SAME hash, and anyone who can read the table recovers a live code for any
  // address by requesting one for an address they control and matching hashes.
  it("is domain-separated by address, so one row never matches another account", async () => {
    expect(await hashOtpCode(EMAIL, "123456", PEPPER))
      .not.toBe(await hashOtpCode("someone.else@example.com", "123456", PEPPER));
  });
  it("cannot be confused by an address that contains the separator", async () => {
    expect(await hashOtpCode("a:b@example.com", "123456", PEPPER))
      .not.toBe(await hashOtpCode("a", "b@example.com:123456", PEPPER));
  });
});

describe("otpExpiresAt", () => {
  it("is TTL seconds after the supplied clock", () => {
    expect(otpExpiresAt(NOW)).toBe(new Date(NOW + OTP_TTL_SECONDS * 1000).toISOString());
  });
  it("honours an explicit ttl", () => {
    expect(otpExpiresAt(NOW, 60)).toBe(new Date(NOW + 60_000).toISOString());
  });
});

describe("maskEmail", () => {
  it("never returns the local part, so a log line is not the address", () => {
    expect(maskEmail("rahul.srinivas@leveluplearning.in")).toBe("r***@leveluplearning.in");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
  });
  it("still shows the domain, so a synthetic phone-only address is recognisable", () => {
    expect(maskEmail("919788385577@phone.leveluplearning.in"))
      .toBe("9***@phone.leveluplearning.in");
  });
  it("degrades to *** rather than echoing something unexpected", () => {
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
    expect(maskEmail("")).toBe("***");
    expect(maskEmail(null)).toBe("***");
    expect(maskEmail(42)).toBe("***");
  });
});

describe("msUntilFloor", () => {
  it("pads a fast request up to the shared floor", () => {
    expect(msUntilFloor(1_000, 1_050, 750)).toBe(700);
  });
  it("is zero once the floor is already reached, never negative", () => {
    expect(msUntilFloor(1_000, 1_750, 750)).toBe(0);
    expect(msUntilFloor(1_000, 9_999, 750)).toBe(0);
  });
  it("defaults to OTP_SEND_FLOOR_MS", () => {
    expect(msUntilFloor(1_000, 1_000)).toBe(OTP_SEND_FLOOR_MS);
  });
  it("never stalls on a nonsense clock", () => {
    expect(msUntilFloor(Number.NaN, 1_000)).toBe(0);
  });
});

describe("isResendSuppressed", () => {
  const row = (over: Partial<OtpIssueRow> = {}): OtpIssueRow => ({
    created_at: new Date(NOW).toISOString(),
    expires_at: otpExpiresAt(NOW),
    consumed_at: null,
    ...over,
  });

  it("suppresses a second send while a fresh code is still in flight", () => {
    expect(isResendSuppressed(row(), NOW + 5_000)).toBe(true);
  });

  it("allows a resend once the cooldown has passed", () => {
    expect(isResendSuppressed(row(), NOW + OTP_RESEND_COOLDOWN_SECONDS * 1000)).toBe(false);
  });

  it("allows a resend when the live code was already used", () => {
    expect(isResendSuppressed(row({ consumed_at: new Date(NOW).toISOString() }), NOW + 1_000))
      .toBe(false);
  });

  it("allows a resend when the code has expired, however recently issued", () => {
    const stale = row({ expires_at: new Date(NOW).toISOString() });
    expect(isResendSuppressed(stale, NOW + 1_000)).toBe(false);
  });

  it("does not suppress when there is nothing on file", () => {
    expect(isResendSuppressed(null, NOW)).toBe(false);
    expect(isResendSuppressed(undefined, NOW)).toBe(false);
  });

  it("fails OPEN on an unreadable timestamp — one extra email beats none ever", () => {
    expect(isResendSuppressed(row({ created_at: "not-a-date" }), NOW)).toBe(false);
    expect(isResendSuppressed(row({ expires_at: "not-a-date" }), NOW)).toBe(false);
  });
});

describe("the ceilings the handler is documented to enforce", () => {
  it("caps failed guesses below the number of verify submissions allowed", () => {
    // The per-address failure budget is the ONLY brute-force ceiling (there is
    // no per-address submission cap, because that one is spendable by an
    // attacker to lock its own user out). It therefore has to be tighter than
    // the request-shaped per-IP cap, or it never binds.
    expect(OTP_FAIL_MAX_PER_WINDOW).toBeLessThan(OTP_VERIFY_MAX_PER_IP_WINDOW);
    expect(OTP_FAIL_MAX_PER_DAY).toBeLessThan(OTP_VERIFY_MAX_PER_IP_WINDOW * 24);
  });
  it("caps a day of sends below a day of the burst window, so the burst cannot drip", () => {
    expect(OTP_SEND_MAX_PER_DAY).toBeLessThan(OTP_SEND_MAX_PER_WINDOW * 96);
  });
  it("keeps the resend cooldown inside the code's own lifetime", () => {
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBeLessThan(OTP_TTL_SECONDS);
  });
});

describe("verifyOtpRecord", () => {
  it("accepts a fresh, unused, correct code", async () => {
    expect(verifyOtpRecord(await recordFor("123456"), await hashOtpCode(EMAIL, "123456", PEPPER), NOW))
      .toBe("valid");
  });

  it("rejects a wrong code", async () => {
    expect(verifyOtpRecord(await recordFor("123456"), await hashOtpCode(EMAIL, "654321", PEPPER), NOW))
      .toBe("invalid_code");
  });

  it("rejects the right digits issued for a DIFFERENT address", async () => {
    // The stored hash binds the address, so another account's row can never be
    // satisfied by a code the caller legitimately holds for their own.
    const rec = await recordFor("123456");
    expect(verifyOtpRecord(rec, await hashOtpCode("someone.else@example.com", "123456", PEPPER), NOW))
      .toBe("invalid_code");
  });

  it("rejects an expired code", async () => {
    const rec = await recordFor("123456");
    expect(
      verifyOtpRecord(rec, await hashOtpCode(EMAIL, "123456", PEPPER), NOW + OTP_TTL_SECONDS * 1000),
    ).toBe("expired");
  });

  it("rejects a code at the exact expiry instant", async () => {
    const rec = await recordFor("123456", { expires_at: new Date(NOW).toISOString() });
    expect(verifyOtpRecord(rec, await hashOtpCode(EMAIL, "123456", PEPPER), NOW)).toBe("expired");
  });

  it("rejects an unparseable expiry rather than trusting it", async () => {
    const rec = await recordFor("123456", { expires_at: "not-a-date" });
    expect(verifyOtpRecord(rec, await hashOtpCode(EMAIL, "123456", PEPPER), NOW)).toBe("expired");
  });

  it("rejects a reused code", async () => {
    const rec = await recordFor("123456", { consumed_at: new Date(NOW).toISOString() });
    expect(verifyOtpRecord(rec, await hashOtpCode(EMAIL, "123456", PEPPER), NOW)).toBe("consumed");
  });

  // The counter that used to reject here is gone ON PURPOSE. Since the compare
  // runs first, a wrong guess can never be told it burned the code — so a
  // per-code ceiling could only ever reject the person holding the RIGHT one,
  // i.e. five anonymous guesses would brick the real owner's in-flight code and
  // cost the attacker nothing. Guesses are capped per ADDRESS in the handler
  // instead (OTP_FAIL_*), where a resend cannot reset the number.
  it("still accepts the correct code after a run of wrong guesses against it", async () => {
    const rec = await recordFor("123456");
    const wrong = await hashOtpCode(EMAIL, "999999", PEPPER);
    for (let i = 0; i < 10; i++) expect(verifyOtpRecord(rec, wrong, NOW)).toBe("invalid_code");
    expect(verifyOtpRecord(rec, await hashOtpCode(EMAIL, "123456", PEPPER), NOW)).toBe("valid");
  });

  it("returns not_found when the address has no code on file", async () => {
    expect(verifyOtpRecord(null, await hashOtpCode(EMAIL, "123456", PEPPER), NOW)).toBe("not_found");
    expect(verifyOtpRecord(undefined, await hashOtpCode(EMAIL, "123456", PEPPER), NOW))
      .toBe("not_found");
  });

  // ── Enumeration safety: the ORDER of the checks is the property ──
  it("never leaks state to a caller holding the wrong code", async () => {
    const wrong = await hashOtpCode(EMAIL, "999999", PEPPER);
    const expired = await recordFor("123456", { expires_at: new Date(NOW - 1000).toISOString() });
    const consumed = await recordFor("123456", { consumed_at: new Date(NOW).toISOString() });

    // Every one of these would otherwise reveal that this address HAS an
    // account with a code in flight. All must look like a plain wrong guess.
    expect(verifyOtpRecord(expired, wrong, NOW)).toBe("invalid_code");
    expect(verifyOtpRecord(consumed, wrong, NOW)).toBe("invalid_code");
    // ...and identical to the no-account case once the handler maps them:
    // "not_found" and "invalid_code" both return the same body.
    expect(verifyOtpRecord(null, wrong, NOW)).toBe("not_found");
  });
});
