import { describe, it, expect } from "vitest";
import { hmacSha256Hex, hmacSha256Base64, timingSafeEqual } from "@shared/crypto";

/**
 * Signature verification underpins every Razorpay payment + Tally webhook. If
 * these helpers regress, forged payloads could be accepted or genuine ones
 * rejected — so we pin a known HMAC vector and the encoding invariants.
 */

function hexToBase64(hex: string): string {
  const bytes = (hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16));
  return btoa(String.fromCharCode(...bytes));
}

describe("timingSafeEqual", () => {
  it("is true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
    expect(timingSafeEqual("", "")).toBe(true);
  });
  it("is false for same-length but different strings", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });
  it("is false for different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("hmacSha256Hex", () => {
  // Published HMAC-SHA256 test vector (key="key", msg="The quick brown fox…").
  const MSG = "The quick brown fox jumps over the lazy dog";
  const KEY = "key";
  const EXPECTED = "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";

  it("matches the known vector", async () => {
    expect(await hmacSha256Hex(MSG, KEY)).toBe(EXPECTED);
  });
  it("is deterministic and lowercase hex", async () => {
    const a = await hmacSha256Hex("order_xyz|pay_abc", "secret");
    const b = await hmacSha256Hex("order_xyz|pay_abc", "secret");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes when the secret changes", async () => {
    const a = await hmacSha256Hex("same-message", "secret-A");
    const b = await hmacSha256Hex("same-message", "secret-B");
    expect(a).not.toBe(b);
  });
});

describe("hmacSha256Base64", () => {
  it("is the base64 encoding of the same digest the hex helper produces", async () => {
    for (const [msg, secret] of [
      ["The quick brown fox jumps over the lazy dog", "key"],
      ["form-payload", "tally-secret"],
    ] as const) {
      const hex = await hmacSha256Hex(msg, secret);
      const b64 = await hmacSha256Base64(msg, secret);
      expect(b64).toBe(hexToBase64(hex));
    }
  });
});
