// Shared HMAC-SHA256 + constant-time-compare helpers for edge-function
// signature verification. Previously each webhook/verify function carried its
// own copy of the timing-safe compare and the crypto.subtle HMAC dance; this
// is the single audited home for both.
//
//   - Razorpay signatures are lowercase hex  -> hmacSha256Hex
//   - Tally signatures are base64            -> hmacSha256Base64

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** HMAC-SHA256(message, secret) encoded as lowercase hex (Razorpay format). */
export async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256(message, secret) encoded as base64 (Tally webhook format). */
export async function hmacSha256Base64(message: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Constant-time string comparison. Both HMAC encodings above are fixed-length
 * for a given algorithm, so the length-mismatch early return leaks nothing
 * useful in practice. Use this instead of `===` for any signature check.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
