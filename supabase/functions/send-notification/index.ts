import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Lock CORS to the production site. The Supabase dashboard and
// server-to-server calls don't need a matching Origin header — they
// send the Authorization token directly and CORS preflight is skipped.
const ALLOWED_ORIGIN = Deno.env.get("SITE_URL") ?? "https://app.leveluplearning.in";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Strip anything that could turn a plain-text template variable into
// HTML, a clickable URL, or an email-header injection. We are not
// trying to be a full sanitizer — we're ensuring attacker-controlled
// values can't inject links/scripts/headers into transactional emails.
function sanitizeVar(v: unknown, maxLen = 500): string {
  if (v == null) return "";
  const s = String(v).slice(0, maxLen);
  return s
    .replace(/[\r\n]+/g, " ")        // block header injection
    .replace(/[<>]/g, "")             // block HTML tags
    .replace(/https?:\/\/\S+/gi, ""); // block arbitrary links
}

// Constant-time string compare for service-role token check.
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
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

    // ── AUTH ──────────────────────────────────────────────────────
    // Require EITHER a direct service-role token (internal cron/RPC
    // callers) OR an authenticated admin session. Previously this
    // function had NO auth at all — any internet caller could POST
    // and insert notifications under any user_id, enumerate templates
    // via PostgREST filter injection, and cause arbitrary content to
    // be rendered into transactional emails/WhatsApp messages.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.slice("bearer ".length).trim();

    const isServiceRole = constantTimeEquals(token, serviceKey);
    let callerIsAdmin = false;
    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userRes, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userRes?.user) return jsonRes({ error: "Unauthorized" }, 401);

      const admin = createClient(supabaseUrl, serviceKey);
      const { data: prof } = await admin
        .from("users")
        .select("role")
        .eq("id", userRes.user.id)
        .maybeSingle();
      callerIsAdmin = prof?.role === "admin";
      if (!callerIsAdmin) return jsonRes({ error: "Forbidden" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ── Input validation ──────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonRes({ error: "Bad request" }, 400);

    const trigger_type = typeof body.trigger_type === "string" ? body.trigger_type : null;
    const user_id = typeof body.user_id === "string" ? body.user_id : null;
    const course_id = typeof body.course_id === "string" ? body.course_id : null;
    const data = (body.data && typeof body.data === "object") ? body.data : {};

    if (!trigger_type || !user_id) return jsonRes({ error: "trigger_type and user_id required" }, 400);
    if (!UUID_RE.test(user_id)) return jsonRes({ error: "Invalid user_id" }, 400);
    if (course_id && !UUID_RE.test(course_id)) {
      // Reject rather than interpolate — previously this was spliced
      // straight into a PostgREST .or() filter and was a filter-injection
      // vector that could leak every template row.
      return jsonRes({ error: "Invalid course_id" }, 400);
    }
    if (trigger_type.length > 100) return jsonRes({ error: "Invalid trigger_type" }, 400);

    // ── Rate limit: max 100 notifications per user per hour ─────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await admin
      .from("scheduled_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .gte("scheduled_for", oneHourAgo);
    if ((recentCount ?? 0) >= 100)
      return jsonRes({ error: "Rate limited — too many notifications for this user" }, 429);

    // ── Profile lookup ────────────────────────────────────────────
    const { data: profile } = await admin
      .from("users")
      .select("full_name")
      .eq("id", user_id)
      .maybeSingle();

    // ── Template lookup (course_id now validated as UUID above) ──
    const orFilter = course_id
      ? `course_id.eq.${course_id},course_id.is.null`
      : "course_id.is.null";
    const { data: template } = await admin
      .from("notification_templates")
      .select("*")
      .eq("trigger_type", trigger_type)
      .eq("is_active", true)
      .or(orFilter)
      .order("course_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!template) {
      return jsonRes({ message: "No active template found", trigger_type });
    }

    // ── Variable substitution (sanitized) ─────────────────────────
    let rendered = template.template_body as string;
    let subject = (template.subject as string) || "Notification";

    const vars: Record<string, string> = {
      "{{user_name}}":    sanitizeVar(profile?.full_name ?? "Learner", 100),
      "{{course_title}}": sanitizeVar(data.course_title, 200),
      "{{lesson_title}}": sanitizeVar(data.lesson_title, 200),
      "{{score}}":        sanitizeVar(data.score, 20),
      "{{feedback}}":     sanitizeVar(data.feedback, 1000),
      "{{date}}":         new Date().toLocaleDateString("en-IN"),
      "{{zoom_link}}":    // zoom_link is a URL, so we only allow https:// + strict charset
        typeof data.zoom_link === "string" && /^https:\/\/[a-zA-Z0-9._\-\/?=&%#]+$/.test(data.zoom_link)
          ? data.zoom_link.slice(0, 500)
          : "",
    };

    for (const [key, val] of Object.entries(vars)) {
      rendered = rendered.replaceAll(key, val);
      subject  = subject.replaceAll(key, val);
    }

    // ── Log row ──
    // We now write scheduled_for = now() but leave sent_at NULL until
    // the downstream email/WhatsApp provider actually confirms delivery.
    // Previously both were set at enqueue time which made the log
    // misleading for debugging failed sends.
    const { error: insertError } = await admin
      .from("scheduled_notifications")
      .insert({
        user_id,
        channel: template.channel,
        template_id: template.id,
        scheduled_for: new Date().toISOString(),
        sent_at: null,
      });

    if (insertError) console.error("Failed to log notification:", insertError);

    console.log(`[${template.channel}] ${trigger_type} notification to ${user_id}: ${subject}`);

    return jsonRes({
      success: true,
      trigger_type,
      channel: template.channel,
      subject,
      body_preview: rendered.substring(0, 100),
    });
  } catch (err) {
    console.error("Notification error:", err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
