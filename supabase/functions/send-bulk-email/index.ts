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

    // ── AUTH: admin session OR service_role ───────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.slice("bearer ".length).trim();

    const isServiceRole = constantTimeEquals(token, serviceKey);
    let adminUserId: string | null = null;

    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userRes, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userRes?.user) return jsonRes({ error: "Unauthorized" }, 401);

      const adminDb = createClient(supabaseUrl, serviceKey);
      const { data: prof } = await adminDb
        .from("users")
        .select("role")
        .eq("id", userRes.user.id)
        .maybeSingle();
      if (prof?.role !== "admin") return jsonRes({ error: "Forbidden" }, 403);
      adminUserId = userRes.user.id;
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ── Input validation ─────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonRes({ error: "Bad request" }, 400);

    const campaign_id = typeof body.campaign_id === "string" ? body.campaign_id : null;
    if (!campaign_id || !UUID_RE.test(campaign_id)) {
      return jsonRes({ error: "Valid campaign_id required" }, 400);
    }

    // ── Look up campaign ─────────────────────────────────────────
    const { data: campaign } = await admin
      .from("email_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .maybeSingle();

    if (!campaign) return jsonRes({ error: "Campaign not found" }, 404);

    // ── Resolve audience ─────────────────────────────────────────
    let recipients: { id: string; email: string; full_name: string | null }[] = [];

    if (campaign.audience_type === "all") {
      const { data } = await admin
        .from("users")
        .select("id, email, full_name")
        .not("email", "is", null)
        .limit(50000);
      recipients = (data || []) as typeof recipients;
    } else if (campaign.audience_type === "cohort" && campaign.audience_id) {
      // cohort_batches -> enrolments -> users
      const { data: enrolments } = await admin
        .from("enrolments")
        .select("user_id")
        .eq("cohort_batch_id", campaign.audience_id)
        .eq("status", "active")
        .limit(50000);
      const userIds = [...new Set((enrolments || []).map((e: any) => e.user_id))];
      if (userIds.length > 0) {
        const { data } = await admin
          .from("users")
          .select("id, email, full_name")
          .in("id", userIds)
          .not("email", "is", null);
        recipients = (data || []) as typeof recipients;
      }
    } else if (campaign.audience_type === "course" && campaign.audience_id) {
      // offering_courses -> offerings -> enrolments -> users
      const { data: offeringCourses } = await admin
        .from("offering_courses")
        .select("offering_id")
        .eq("course_id", campaign.audience_id);
      const offeringIds = (offeringCourses || []).map((oc: any) => oc.offering_id);
      if (offeringIds.length > 0) {
        const { data: enrolments } = await admin
          .from("enrolments")
          .select("user_id")
          .in("offering_id", offeringIds)
          .eq("status", "active")
          .limit(50000);
        const userIds = [...new Set((enrolments || []).map((e: any) => e.user_id))];
        if (userIds.length > 0) {
          const { data } = await admin
            .from("users")
            .select("id, email, full_name")
            .in("id", userIds)
            .not("email", "is", null);
          recipients = (data || []) as typeof recipients;
        }
      }
    }

    // ── Fetch suppressed emails ──────────────────────────────────
    const recipientEmails = recipients.map((r) => r.email);
    const suppressedSet = new Set<string>();
    if (recipientEmails.length > 0) {
      // Batch check in chunks of 500
      for (let i = 0; i < recipientEmails.length; i += 500) {
        const chunk = recipientEmails.slice(i, i + 500);
        const { data: suppressed } = await admin
          .from("suppressed_emails")
          .select("email")
          .in("email", chunk);
        (suppressed || []).forEach((s: any) => suppressedSet.add(s.email));
      }
    }

    // ── Enqueue emails ───────────────────────────────────────────
    let enqueued = 0;
    const run_id = crypto.randomUUID();

    for (const recipient of recipients) {
      if (suppressedSet.has(recipient.email)) continue;

      const studentName = sanitizeVar(recipient.full_name || "Learner", 100);
      const renderedSubject = campaign.subject.replaceAll("{{student_name}}", studentName);
      const renderedHtml = campaign.html_body.replaceAll("{{student_name}}", studentName);
      const renderedText = (campaign.text_body || "").replaceAll("{{student_name}}", studentName);

      const message_id = crypto.randomUUID();
      const idempotency_key = `campaign:${campaign_id}:${recipient.id}:${message_id}`;

      const payload = {
        run_id,
        to: recipient.email,
        from: "LevelUp Learning <noreply@leveluplearning.in>",
        sender_domain: "leveluplearning.in",
        subject: renderedSubject,
        html: renderedHtml,
        text: renderedText,
        purpose: "transactional",
        label: `campaign:${campaign_id}`,
        idempotency_key,
        message_id,
        queued_at: new Date().toISOString(),
      };

      const { error: enqueueErr } = await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload,
      });

      if (enqueueErr) {
        console.error(`Failed to enqueue email for ${recipient.email}:`, enqueueErr);
        continue;
      }

      enqueued++;
    }

    // ── Update campaign ──────────────────────────────────────────
    await admin
      .from("email_campaigns")
      .update({
        total_recipients: recipients.length,
        sent_count: enqueued,
        status: enqueued > 0 ? "sending" : "failed",
        sent_at: new Date().toISOString(),
      })
      .eq("id", campaign_id);

    // ── Audit log ────────────────────────────────────────────────
    const auditUserId = adminUserId || campaign.sent_by;
    if (auditUserId) {
      await admin.from("admin_audit_logs").insert({
        admin_user_id: auditUserId,
        action: "send_bulk_email",
        entity_type: "email_campaign",
        entity_id: campaign_id,
        details: {
          subject: campaign.subject,
          audience_type: campaign.audience_type,
          total_recipients: recipients.length,
          enqueued,
          suppressed: suppressedSet.size,
        },
      });
    }

    console.log(`[bulk-email] Campaign ${campaign_id}: enqueued ${enqueued}/${recipients.length}`);

    return jsonRes({ success: true, enqueued });
  } catch (err) {
    console.error("send-bulk-email error:", err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
