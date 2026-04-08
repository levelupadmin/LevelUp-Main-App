import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

// Lock CORS to the production site.
const ALLOWED_ORIGIN = Deno.env.get("SITE_URL") ?? "https://app.leveluplearning.in";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return digits;
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonRes({ error: "Bad request" }, 400);

    const { email, phone, offering_id } = body as {
      email?: string; phone?: string; offering_id?: string;
    };

    // ── Input validation ──────────────────────────────────────────
    // Previously this function accepted { email, phone } from any
    // internet caller with no rate limit and no proof of intent,
    // making it a public email+phone enumeration oracle against the
    // entire user base. We now require:
    //   1. A valid email / phone format
    //   2. A valid active public offering_id (proof the caller is
    //      actually trying to check out, not just scraping)
    //   3. A rate limit of 10 calls per 15 minutes per (ip, offering_id)
    //
    // The returned scenario labels are unchanged so the PublicOffering
    // guest flow still works.
    if (!email || !phone || !offering_id) {
      return jsonRes({ error: "email, phone and offering_id are required" }, 400);
    }
    if (typeof email !== "string" || !EMAIL_RE.test(email) || email.length > 200) {
      return jsonRes({ error: "Invalid email" }, 400);
    }
    if (typeof phone !== "string" || phone.length > 20) {
      return jsonRes({ error: "Invalid phone" }, 400);
    }
    if (typeof offering_id !== "string" || !UUID_RE.test(offering_id)) {
      return jsonRes({ error: "Invalid offering_id" }, 400);
    }

    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length !== 10) {
      return jsonRes({ error: "Invalid phone" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Proof of intent: offering must exist and be publicly active ──
    const { data: offering } = await admin
      .from("offerings")
      .select("id, status")
      .eq("id", offering_id)
      .maybeSingle();
    if (!offering || offering.status !== "active") {
      return jsonRes({ error: "Offering not available" }, 404);
    }

    // ── Rate limit: 10 calls per 15 min per (ip, offering) ──
    const ip = getClientIp(req);
    const { data: allowed, error: rlErr } = await admin.rpc(
      "check_and_increment_rate_limit",
      {
        p_key: `check-user-exists:${ip}:${offering_id}`,
        p_max_count: 10,
        p_window_seconds: 900,
      }
    );
    if (rlErr) {
      console.error("rate-limit rpc failed:", rlErr);
      return jsonRes({ error: "Internal error" }, 500);
    }
    if (allowed === false) {
      return jsonRes({ error: "Too many requests" }, 429);
    }

    // ── Lookups ──
    const { data: emailUser } = await admin
      .from("users")
      .select("id, phone")
      .eq("email", email)
      .maybeSingle();

    const { data: phoneUser } = await admin
      .from("users")
      .select("id, email")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (emailUser) {
      if (!emailUser.phone || normalizePhone(emailUser.phone) === normalizedPhone) {
        return jsonRes({ scenario: "A", user_id: emailUser.id });
      }
      return jsonRes({ scenario: "C", user_id: null });
    }

    if (phoneUser) {
      return jsonRes({ scenario: "C", user_id: null });
    }

    return jsonRes({ scenario: "B", user_id: null });
  } catch (err) {
    console.error("check-user-exists error:", err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
