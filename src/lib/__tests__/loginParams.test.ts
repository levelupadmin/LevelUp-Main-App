import { describe, it, expect } from "vitest";
import { prefillPhoneParam, resolveLoginRedirect } from "@/lib/loginParams";

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
