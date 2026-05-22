// Supabase Auth "Send SMS Hook" -> MSG91 v5 OTP API.
//
// Supabase generates and stores the OTP, then POSTs to us with payload:
//   { user: { id, phone, user_metadata, ... }, sms: { otp, type } }
// We forward the OTP via MSG91 (DLT-compliant SMS for +91, otherwise
// the same SMS route — MSG91 handles international routing).
//
// Channel selection (SMS vs WhatsApp) is read from
// user_metadata.next_otp_channel which the client sets before calling
// signInWithOtp. Default = "sms". Set to "whatsapp" via the WhatsApp
// button on the OTP entry screen.

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const MSG91_AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY") ?? "";
const MSG91_TEMPLATE_ID = Deno.env.get("MSG91_TEMPLATE_ID") ?? "";
const HOOK_SECRET = Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, webhook-id, webhook-signature, webhook-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SmsHookPayload {
  user: {
    id: string;
    phone?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
  sms: {
    otp: string;
    type?: string;
  };
}

async function sendViaMsg91(opts: {
  phone: string;
  otp: string;
  channel: "sms" | "whatsapp";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!MSG91_AUTH_KEY) return { ok: false, error: "MSG91_AUTH_KEY not configured" };

  const mobile = opts.phone.replace(/^\+/, "").replace(/\D/g, "");
  if (!mobile) return { ok: false, error: "invalid phone" };

  const body: Record<string, unknown> = {
    mobile,
    otp: opts.otp,
    otp_length: opts.otp.length,
  };
  if (MSG91_TEMPLATE_ID) body.template_id = MSG91_TEMPLATE_ID;
  if (opts.channel === "whatsapp") body.via = "whatsapp";

  try {
    const res = await fetch("https://control.msg91.com/api/v5/otp", {
      method: "POST",
      headers: {
        authkey: MSG91_AUTH_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.type !== "success") {
      return { ok: false, error: `MSG91 ${res.status}: ${JSON.stringify(data)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();
  let payload: SmsHookPayload;

  if (HOOK_SECRET) {
    try {
      const wh = new Webhook(HOOK_SECRET);
      payload = wh.verify(rawBody, Object.fromEntries(req.headers)) as SmsHookPayload;
    } catch (e) {
      console.error("hook signature verification failed", e);
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("SEND_SMS_HOOK_SECRET not configured — signature check disabled");
    try {
      payload = JSON.parse(rawBody) as SmsHookPayload;
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const phone = payload.user?.phone;
  const otp = payload.sms?.otp;
  if (!phone || !otp) {
    return new Response(JSON.stringify({ error: "missing phone or otp" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const channel =
    (payload.user.user_metadata?.next_otp_channel as "sms" | "whatsapp" | undefined) ||
    "sms";

  const result = await sendViaMsg91({ phone, otp, channel });

  if (!result.ok) {
    console.error("MSG91 send failed", { error: result.error });
    return new Response(JSON.stringify({ error: result.error }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const masked = phone.slice(0, 4) + "***" + phone.slice(-2);
  console.log(`OTP sent via ${channel} to ${masked}`);
  return new Response(JSON.stringify({ success: true, channel }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
