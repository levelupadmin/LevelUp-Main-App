/**
 * send-sms-otp — Generate a 4-digit OTP, hash + store it, then dispatch
 * the plain OTP via MSG91 Flow API. The DLT template (id in
 * MSG91_OTP_TEMPLATE_ID) uses the variable name `var` for the OTP slot,
 * and a Jio-registered LVLUP sender header.
 *
 * Why we send via Flow API and not the MSG91 OTP widget:
 *   - Widget runs in the browser, requires custom-element mounting +
 *     captcha host + token; per-IP throttles can block during testing.
 *   - Flow API is a clean server-to-server call. Each request originates
 *     from a Supabase Edge datacenter IP, which rotates and is not
 *     subject to per-IP rate-limits at MSG91.
 *   - We own OTP generation and verification, so the entire flow lives
 *     inside our Supabase tenant; MSG91 is just a transport.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MSG91_AUTH_KEY        = Deno.env.get("MSG91_AUTH_KEY")!;
const MSG91_TEMPLATE_ID     = Deno.env.get("MSG91_OTP_TEMPLATE_ID")!;
const MSG91_SENDER_ID       = Deno.env.get("MSG91_SENDER_ID") || "LVLUP";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { phone?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.phone) return json({ error: "missing_phone" }, 400);

  // Normalise to E.164 with leading +
  const normPhone = body.phone.startsWith("+")
    ? body.phone
    : `+${body.phone.replace(/^0+/, "")}`;

  // Server-side OTP generation
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  const otpHash = await sha256Hex(`${normPhone}:${otp}`);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Invalidate any prior pending OTPs for this phone (single in-flight
  // OTP at a time keeps the verify path simple).
  await admin.from("phone_otp_attempts").delete().eq("phone", normPhone);

  // Store the hash with a 10-minute TTL.
  const { error: insertErr } = await admin.from("phone_otp_attempts").insert({
    phone: normPhone,
    otp_hash: otpHash,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (insertErr) {
    return json({ error: "db_error", detail: insertErr.message }, 500);
  }

  // Send via MSG91 Flow API.
  // mobiles: digits only with country code, no leading +
  const mobileNum = normPhone.replace(/^\+/, "");
  const msgResp = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { authkey: MSG91_AUTH_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      flow_id: MSG91_TEMPLATE_ID,
      sender: MSG91_SENDER_ID,
      mobiles: mobileNum,
      var: otp,
    }),
  });
  const msgData = (await msgResp.json()) as { type?: string; message?: string };
  if (!msgResp.ok || msgData.type !== "success") {
    // Rollback the stored hash so the user can retry immediately.
    await admin.from("phone_otp_attempts").delete().eq("phone", normPhone);
    return json({ error: "msg91_send_failed", detail: msgData }, 502);
  }

  return json({ success: true, request_id: msgData.message });
});
