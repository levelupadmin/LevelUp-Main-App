// Shared CORS helper.
//
// We pin Access-Control-Allow-Origin to a small allowlist instead of the
// wildcard "*" we used to ship, so random origins can't invoke our edge
// functions from a browser using a user's session. The allowlist also covers
// the Capacitor NATIVE shells:
//   • Android serves the bundle from https://app.leveluplearning.in
//     (androidScheme:"https" + server.hostname) so its origin already matches
//     the web origin, which is why Android playback worked.
//   • iOS has no iosScheme set, so it uses Capacitor's default `capacitor`
//     scheme: its origin is capacitor://app.leveluplearning.in. Before this
//     allowlist that origin was rejected, so EVERY edge-function call from the
//     iOS app (notably the VdoCipher OTP mint) was CORS-blocked, so the fetch
//     threw and surfaced as a misleading "couldn't start playback (network)".
//
// Webhook-style endpoints invoked server-to-server (razorpay-webhook,
// auth-email-hook, process-email-queue) don't need CORS at all.
//
// Browser/native-facing functions should use corsHeadersFor(req) so the
// response echoes the caller's origin when it's allowlisted. The static
// corsHeaders (web origin only) remains for functions not yet migrated.

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://app.leveluplearning.in";

export const ALLOWED_ORIGIN = SITE_URL;

const ALLOWED_ORIGINS = new Set<string>([
  SITE_URL,
  "https://app.leveluplearning.in",
  "https://leveluplearning.in",
  // Capacitor native shells:
  "capacitor://app.leveluplearning.in", // iOS (capacitor scheme + server.hostname)
  "capacitor://localhost", // iOS fallback if hostname isn't applied
  "https://localhost", // Android/WebView fallback
]);

const BASE_HEADERS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
};

/**
 * Origin-aware CORS headers: echoes the request's Origin when it's on the
 * allowlist, otherwise falls back to the canonical web origin. Use this for
 * ANY function invoked from the browser or the iOS/Android native shell.
 */
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : ALLOWED_ORIGIN,
    ...BASE_HEADERS,
  };
}

/**
 * Static web-origin headers. Back-compat for functions not yet migrated to
 * corsHeadersFor(req). Does NOT cover the iOS native origin; any function
 * the iOS app calls must use corsHeadersFor(req) instead.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  ...BASE_HEADERS,
};
