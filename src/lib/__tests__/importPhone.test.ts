import { describe, it, expect } from "vitest";
import { resolveImportPhone } from "@shared/phone";

/**
 * `resolveImportPhone` is what the admin CSV import uses to turn a CRM row's
 * (phone, country_code) pair into the E.164 digits an account is created on.
 * A wrong answer here does not throw — it mints an account on someone else's
 * number and the student silently never receives their login OTP. So the pairs
 * below pin the exact precedence rule rather than a sample of happy paths.
 */
describe("resolveImportPhone", () => {
  describe("no country-code column — the pre-existing India default", () => {
    it("treats a bare 10-digit number as Indian", () => {
      expect(resolveImportPhone("9876543210")).toBe("919876543210");
    });

    it("drops a trunk 0 on an 11-digit Indian number", () => {
      expect(resolveImportPhone("09876543210")).toBe("919876543210");
    });

    it("passes an 11-15 digit number through as already-coded", () => {
      expect(resolveImportPhone("919876543210")).toBe("919876543210");
      expect(resolveImportPhone("447911123456")).toBe("447911123456");
    });

    it("ignores separators the CRM exported", () => {
      expect(resolveImportPhone("+91 98765-43210")).toBe("919876543210");
      expect(resolveImportPhone("(98765) 43210")).toBe("919876543210");
    });
  });

  describe("country-code column present — the number is a national one", () => {
    it("prepends the code instead of assuming India", () => {
      expect(resolveImportPhone("7911123456", "44")).toBe("447911123456");
      expect(resolveImportPhone("4155551234", "1")).toBe("14155551234");
      expect(resolveImportPhone("501234567", "971")).toBe("971501234567");
    });

    it("accepts the code written as +44, 0044 or 44", () => {
      expect(resolveImportPhone("7911123456", "+44")).toBe("447911123456");
      expect(resolveImportPhone("7911123456", "0044")).toBe("447911123456");
      expect(resolveImportPhone("7911123456", "44")).toBe("447911123456");
    });

    it("drops the national trunk 0 before joining", () => {
      expect(resolveImportPhone("07911123456", "44")).toBe("447911123456");
    });

    it("does not double-prefix a number that already repeats the code", () => {
      expect(resolveImportPhone("447911123456", "44")).toBe("447911123456");
      expect(resolveImportPhone("919876543210", "91")).toBe("919876543210");
    });

    it("still prefixes a national number that merely STARTS with the code", () => {
      // Regression: 9102534444 is a real 10-digit Indian mobile beginning "91".
      // Reading it as already-qualified produced a 10-digit "E.164" that is not
      // a phone number at all, so the account was created on a broken value and
      // the student could never receive an OTP.
      expect(resolveImportPhone("9102534444", "91")).toBe("919102534444");
      expect(resolveImportPhone("9198765432", "91")).toBe("919198765432");
      // …while the genuinely-qualified form of the same number is left alone.
      expect(resolveImportPhone("919102534444", "91")).toBe("919102534444");
    });

    it("still works for India when the column is filled in", () => {
      expect(resolveImportPhone("9876543210", "91")).toBe("919876543210");
    });
  });

  describe("a leading + wins over the country-code column", () => {
    it("keeps the number's own code when the two disagree", () => {
      // The classic bad export: every row carries a default cc of 91, but the
      // phone itself is already fully qualified. Trusting cc would corrupt it.
      expect(resolveImportPhone("+447911123456", "91")).toBe("447911123456");
      expect(resolveImportPhone("+1 415 555 1234", "91")).toBe("14155551234");
    });
  });

  describe("rejects what cannot be a phone number", () => {
    it.each([
      ["empty", "", undefined],
      ["blank", "   ", undefined],
      ["no digits", "n/a", undefined],
      ["null", null, undefined],
      ["too short with no code", "12345", undefined],
      ["9 digits with no code", "987654321", undefined],
      ["longer than E.164 allows", "1234567890123456", undefined],
    ])("rejects %s", (_label, phone, cc) => {
      expect(resolveImportPhone(phone as string | null, cc)).toBeNull();
    });

    it("rejects an over-long number even when a code is given", () => {
      expect(resolveImportPhone("12345678901234", "44")).toBeNull();
    });
  });
});
