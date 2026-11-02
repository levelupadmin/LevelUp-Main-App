import { describe, it, expect } from "vitest";
import { nationalMobileDigits, prefillPhoneParam, resolveLoginRedirect } from "@/lib/loginParams";

describe("resolveLoginRedirect", () => {
  it("prefers RequireAuth's state.from over ?next=", () => {
    expect(resolveLoginRedirect("/my-courses", "/thank-you/po-1")).toBe("/my-courses");
  });
  it("uses ?next= when there is no state (guest checkout hand-off)", () => {
    expect(resolveLoginRedirect(undefined, "/thank-you/po-1")).toBe("/thank-you/po-1");
  });
  it("falls back to /home when nothing is given", () => {
    expect(resolveLoginRedirect(null, null)).toBe("/home");
  });
  it("refuses open redirects", () => {
    expect(resolveLoginRedirect(null, "https://evil.example")).toBe("/home");
    expect(resolveLoginRedirect(null, "//evil.example/x")).toBe("/home");
    expect(resolveLoginRedirect(null, "/ok?u=https://a.b")).toBe("/ok?u=https://a.b");
    expect(resolveLoginRedirect(null, "javascript:alert(1)")).toBe("/home");
  });
});

describe("prefillPhoneParam", () => {
  it("accepts strict E.164 only", () => {
    expect(prefillPhoneParam("+919876543210")).toBe("+919876543210");
    expect(prefillPhoneParam("+91 98765 43210")).toBe("+919876543210");
    expect(prefillPhoneParam("9876543210")).toBe("");
    expect(prefillPhoneParam("+91abc")).toBe("");
    expect(prefillPhoneParam(null)).toBe("");
  });
});

describe("nationalMobileDigits (the Stage +91 field)", () => {
  it("keeps a plain 10-digit number, with or without spaces and dashes", () => {
    expect(nationalMobileDigits("9876543210")).toBe("9876543210");
    expect(nationalMobileDigits("98765 43210")).toBe("9876543210");
    expect(nationalMobileDigits("98765-43210")).toBe("9876543210");
    expect(nationalMobileDigits("(987) 654-3210")).toBe("9876543210");
  });

  it("drops the country code or trunk zero from pasted and autofilled numbers", () => {
    expect(nationalMobileDigits("+91 98765 43210")).toBe("9876543210");
    expect(nationalMobileDigits("+919876543210")).toBe("9876543210");
    expect(nationalMobileDigits("919876543210")).toBe("9876543210");
    expect(nationalMobileDigits("+91-98765-43210")).toBe("9876543210");
    expect(nationalMobileDigits("09876543210")).toBe("9876543210");
    expect(nationalMobileDigits("098765 43210")).toBe("9876543210");
    expect(nationalMobileDigits("0091 98765 43210")).toBe("9876543210");
    expect(nationalMobileDigits("+91 (0) 98765 43210")).toBe("9876543210");
    expect(nationalMobileDigits(" +91 98765 43210 ")).toBe("9876543210");
  });

  it("never eats a real number that starts with 91 or 0", () => {
    expect(nationalMobileDigits("9123456789")).toBe("9123456789");
    expect(nationalMobileDigits("+91 91234 56789")).toBe("9123456789");
    expect(nationalMobileDigits("919123456789")).toBe("9123456789");
    expect(nationalMobileDigits("09123456789")).toBe("9123456789");
  });

  it("keeps partial input as typed", () => {
    expect(nationalMobileDigits("")).toBe("");
    expect(nationalMobileDigits(null)).toBe("");
    expect(nationalMobileDigits(undefined)).toBe("");
    expect(nationalMobileDigits("9")).toBe("9");
    expect(nationalMobileDigits("98765 4")).toBe("987654");
    expect(nationalMobileDigits("0")).toBe("0");
    expect(nationalMobileDigits("+91")).toBe("91");
    expect(nationalMobileDigits("+91 9876")).toBe("919876");
  });

  it("ignores a stray extra keystroke after a complete number, as before", () => {
    expect(nationalMobileDigits("98765 432101")).toBe("9876543210");
    expect(nationalMobileDigits("987654321099999")).toBe("9876543210");
  });

  it("holds 11 digits starting with 91 so a typed country code can complete", () => {
    // Typing 9,1,9,8,7,6,5,4,3,2,1,0 one key at a time, each keystroke landing
    // on the field's own formatted value.
    let held = "";
    for (const key of "919876543210") {
      const shown = held.length > 5 ? `${held.slice(0, 5)} ${held.slice(5)}` : held;
      held = nationalMobileDigits(shown + key);
    }
    expect(held).toBe("9876543210");
    // The in-between state is not 10 digits, so it cannot be sent.
    expect(nationalMobileDigits("91987654321")).toBe("91987654321");
    expect(nationalMobileDigits("91987654321").length).not.toBe(10);
  });

  it("completes a typed trunk zero the same way", () => {
    let held = "";
    for (const key of "09876543210") {
      const shown = held.length > 5 ? `${held.slice(0, 5)} ${held.slice(5)}` : held;
      held = nationalMobileDigits(shown + key);
    }
    expect(held).toBe("9876543210");
  });
});
