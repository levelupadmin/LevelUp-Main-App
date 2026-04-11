import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("SITE_URL") ?? "https://app.leveluplearning.in";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function sanitizeVar(v: unknown, maxLen = 500): string {
  if (v == null) return "";
  const s = String(v).slice(0, maxLen);
  return s
    .replace(/[\r\n]+/g, " ")
    .replace(/[<>]/g, "")
    .replace(/https?:\/\/\S+/gi, "");
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── AUTH: service_role only ──────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.slice("bearer ".length).trim();
    if (!constantTimeEquals(token, serviceKey)) {
      return jsonRes({ error: "Forbidden" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ── Input validation ─────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonRes({ error: "Bad request" }, 400);

    const template_key = typeof body.template_key === "string" ? body.template_key : null;
    const user_id = typeof body.user_id === "string" ? body.user_id : null;
    const variables: Record<string, string> = body.variables && typeof body.variables === "object" ? body.variables : {};

    if (!template_key || !user_id) {
      return jsonRes({ error: "template_key and user_id required" }, 400);
    }
    if (!UUID_RE.test(user_id)) return jsonRes({ error: "Invalid user_id" }, 400);
    if (template_key.length > 100) return jsonRes({ error: "Invalid template_key" }, 400);

    // ── Look up user email ───────────────────────────────────────
    const { data: userRow } = await admin
      .from("users")
      .select("email, full_name")
      .eq("id", user_id)
      .maybeSingle();

    if (!userRow?.email) {
      return jsonRes({ error: "User not found or has no email" }, 404);
    }

    // ── Check suppressed_emails ──────────────────────────────────
    const { data: suppressed } = await admin
      .from("suppressed_emails")
      .select("id")
      .eq("email", userRow.email)
      .maybeSingle();

    if (suppressed) {
      return jsonRes({ message: "Email suppressed", user_id });
    }

    // ── Look up template ─────────────────────────────────────────
    const { data: template } = await admin
      .from("email_templates")
      .select("*")
      .eq("template_key", template_key)
      .eq("is_active", true)
      .maybeSingle();

    if (!template) {
      return jsonRes({ error: "No active template found", template_key }, 404);
    }

    // ── Render template ──────────────────────────────────────────
    // Build merged variable map: user-supplied + auto-populated
    const appUrl = Deno.env.get("SITE_URL") ?? "https://app.leveluplearning.in";
    const allVars: Record<string, string> = {
      student_name: userRow.full_name || "Learner",
      app_url: appUrl,
      ...variables,
    };

    let subject = template.subject as string;
    let htmlBody = template.html_body as string;
    let textBody = template.text_body as string;

    for (const [key, rawVal] of Object.entries(allVars)) {
      // app_url should pass through unsanitized (it's our own URL)
      const val = key === "app_url" ? String(rawVal).slice(0, 500) : sanitizeVar(rawVal);
      const placeholder = `{{${key}}}`;
      subject = subject.replaceAll(placeholder, val);
      htmlBody = htmlBody.replaceAll(placeholder, val);
      textBody = textBody.replaceAll(placeholder, val);
    }

    // ── Enqueue email ────────────────────────────────────────────
    const message_id = crypto.randomUUID();
    const run_id = crypto.randomUUID();
    const idempotency_key = `${template_key}:${user_id}:${message_id}`;

    const payload = {
      run_id,
      to: userRow.email,
      from: "LevelUp Learning <noreply@leveluplearning.in>",
      sender_domain: "leveluplearning.in",
      subject,
      html: htmlBody,
      text: textBody,
      purpose: "transactional",
      label: template_key,
      idempotency_key,
      message_id,
      queued_at: new Date().toISOString(),
    };

    const { error: enqueueErr } = await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload,
    });

    if (enqueueErr) {
      console.error("Failed to enqueue email:", enqueueErr);
      return jsonRes({ error: "Failed to enqueue email" }, 500);
    }

    console.log(`[transactional] Queued ${template_key} email to ${userRow.email} (${message_id})`);

    return jsonRes({ success: true, message_id });
  } catch (err) {
    console.error("queue-transactional-email error:", err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
