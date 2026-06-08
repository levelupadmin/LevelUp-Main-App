import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/crypto.ts";
import {
  emailCorsHeaders,
  emailJsonRes as jsonRes,
  enqueueEmail,
  isEmailSuppressed,
  sanitizeVar,
  UUID_RE,
} from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: emailCorsHeaders() });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── AUTH: service_role only ──────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.slice("bearer ".length).trim();
    if (!timingSafeEqual(token, serviceKey)) {
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
    if (await isEmailSuppressed(admin, userRow.email)) {
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

    const { error: enqueueErr } = await enqueueEmail(admin, {
      runId: run_id,
      to: userRow.email,
      subject,
      html: htmlBody,
      text: textBody,
      label: template_key,
      idempotencyKey: idempotency_key,
      messageId: message_id,
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
