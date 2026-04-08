// Shared CORS helper — pins Access-Control-Allow-Origin to SITE_URL
// (defaults to https://app.leveluplearning.in) instead of the wildcard
// "*" we used to ship with, so random origins can't invoke our edge
// functions from a browser using a user's session cookie.
//
// Webhook-style endpoints that are invoked server-to-server (e.g.
// razorpay-webhook, auth-email-hook, process-email-queue) don't need to
// use this — CORS doesn't apply to them — but every browser-facing
// function should import from here.

export const ALLOWED_ORIGIN =
  Deno.env.get("SITE_URL") ?? "https://app.leveluplearning.in";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
};
