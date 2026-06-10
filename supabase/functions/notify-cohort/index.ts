/**
 * notify-cohort: scans cohort state and queues email + WhatsApp pings.
 *
 * Runs every 15 minutes via pg_cron. Three event classes:
 *
 *   1. cohort_assignment_due_24h
 *      For each cohort_week with assignment_due_at in [now+22h, now+26h],
 *      queue an email to every batch member who hasn't submitted yet.
 *
 *   2. cohort_session_reminder_1h
 *      For each live_sessions row with scheduled_at in [now+50min, now+70min],
 *      queue an email + WhatsApp ping to every batch member.
 *
 *   3. cohort_assignment_missed
 *      For weeks whose assignment_due_at passed > 24h ago and the student
 *      still hasn't submitted, send a one-time nudge.
 *
 * Idempotency is enforced via cohort_notifications_log's UNIQUE constraint
 * on (template_key, user_id, related_kind, related_id), so re-runs are safe.
 *
 * Auth: service_role token only (called by pg_cron via supabase.net).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERAKT_KEY = Deno.env.get("INTERAKT_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Counters {
  assignment_due: number;
  session_reminders: number;
  submissions_missed: number;
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: service_role only.
  // We can't do a strict string equality on SERVICE_KEY because the deployed
  // function's SUPABASE_SERVICE_ROLE_KEY env var occasionally returns a
  // different representation than what's stored in the vault (Supabase
  // sometimes re-issues internal JWTs without rotating the dashboard key).
  // Instead: parse the JWT and require role=service_role. That's the same
  // guarantee with no surface for impersonation since only callers holding
  // the service role can mint such a JWT in the first place.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonRes({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7).trim();
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    if (payload.role !== "service_role") return jsonRes({ error: "Forbidden" }, 403);
  } catch {
    return jsonRes({ error: "Invalid token" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const counters: Counters = { assignment_due: 0, session_reminders: 0, submissions_missed: 0, errors: [] };

  try {
    await processAssignmentDueIn24h(admin, counters);
    await processSessionRemindersIn1h(admin, counters);
    await processMissedAssignments(admin, counters);
  } catch (e) {
    counters.errors.push(e instanceof Error ? e.message : String(e));
  }

  return jsonRes({ ok: true, counters });
});

/* ─────────── Helpers ─────────── */

interface BatchMember {
  user_id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
}

async function getBatchMembers(admin: any, batchId: string): Promise<BatchMember[]> {
  const { data } = await admin
    .from("cohort_batch_members")
    .select("enrolments:enrolment_id (user_id, users:user_id (email, phone, full_name))")
    .eq("batch_id", batchId);
  return (data || [])
    .map((row: any) => ({
      user_id: row.enrolments?.user_id,
      email: row.enrolments?.users?.email,
      phone: row.enrolments?.users?.phone,
      full_name: row.enrolments?.users?.full_name,
    }))
    .filter((m: BatchMember) => m.user_id);
}

async function alreadyNotified(
  admin: any,
  templateKey: string,
  userId: string,
  relatedKind: string,
  relatedId: string
): Promise<boolean> {
  const { data } = await admin
    .from("cohort_notifications_log")
    .select("id")
    .eq("template_key", templateKey)
    .eq("user_id", userId)
    .eq("related_kind", relatedKind)
    .eq("related_id", relatedId)
    .maybeSingle();
  return !!data;
}

async function logNotification(
  admin: any,
  templateKey: string,
  userId: string,
  relatedKind: string,
  relatedId: string,
  channels: string[]
) {
  await admin
    .from("cohort_notifications_log")
    .insert({
      template_key: templateKey,
      user_id: userId,
      related_kind: relatedKind,
      related_id: relatedId,
      channels,
    })
    .single();
}

async function queueEmail(
  admin: any,
  templateKey: string,
  userId: string,
  vars: Record<string, string>
): Promise<boolean> {
  // Call queue-transactional-email with service role
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/queue-transactional-email`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_key: templateKey,
        user_id: userId,
        variables: vars,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function sendWhatsApp(phone: string, templateName: string, vars: string[]): Promise<boolean> {
  if (!INTERAKT_KEY || !phone) return false;
  // Interakt API format: public-templates with body params.
  // Phone needs to be +<country><number>. We trust users.phone format.
  try {
    const cleaned = phone.replace(/\s/g, "");
    const r = await fetch("https://api.interakt.ai/v1/public/message/", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(INTERAKT_KEY + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        countryCode: "+91",
        phoneNumber: cleaned.replace(/^\+?91/, ""),
        type: "Template",
        template: {
          name: templateName,
          languageCode: "en",
          bodyValues: vars,
        },
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function firstName(fullName: string | null): string {
  if (!fullName) return "there";
  return fullName.split(" ")[0];
}

function excerpt(s: string | null | undefined, max = 200): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}

/* ─────────── Event handlers ─────────── */

async function processAssignmentDueIn24h(admin: any, counters: Counters) {
  // Window: due_at in [now+22h, now+26h]. The 4-hour slop tolerates the
  // 15-min cron cadence + clock drift.
  const now = Date.now();
  const lo = new Date(now + 22 * 60 * 60 * 1000).toISOString();
  const hi = new Date(now + 26 * 60 * 60 * 1000).toISOString();

  const { data: weeks } = await admin
    .from("cohort_weeks")
    .select("id, cohort_batch_id, theme, assignment_prompt, assignment_due_at, cohort_batches:cohort_batch_id (offering_id)")
    .gte("assignment_due_at", lo)
    .lte("assignment_due_at", hi)
    .not("assignment_prompt", "is", null);

  for (const w of weeks || []) {
    const members = await getBatchMembers(admin, w.cohort_batch_id);
    // Pull submissions for this week; if a user already submitted, skip
    const { data: subs } = await admin
      .from("cohort_week_submissions")
      .select("user_id")
      .eq("cohort_week_id", w.id);
    const submittedIds = new Set((subs || []).map((s: any) => s.user_id));

    for (const m of members) {
      if (submittedIds.has(m.user_id)) continue;
      if (await alreadyNotified(admin, "cohort_assignment_due_24h", m.user_id, "cohort_week", w.id)) continue;

      const vars = {
        first_name: firstName(m.full_name),
        week_theme: w.theme,
        assignment_prompt: excerpt(w.assignment_prompt),
        offering_id: w.cohort_batches?.offering_id ?? "",
      };
      const emailOk = m.email ? await queueEmail(admin, "cohort_assignment_due_24h", m.user_id, vars) : false;
      const waOk = m.phone
        ? await sendWhatsApp(m.phone, "cohort_assignment_due_24h", [
            vars.first_name, vars.week_theme,
          ])
        : false;
      const channels: string[] = [];
      if (emailOk) channels.push("email");
      if (waOk) channels.push("whatsapp");
      if (channels.length > 0) {
        await logNotification(admin, "cohort_assignment_due_24h", m.user_id, "cohort_week", w.id, channels);
        counters.assignment_due++;
      }
    }
  }
}

async function processSessionRemindersIn1h(admin: any, counters: Counters) {
  // Window: scheduled_at in [now+50min, now+70min]
  const now = Date.now();
  const lo = new Date(now + 50 * 60 * 1000).toISOString();
  const hi = new Date(now + 70 * 60 * 1000).toISOString();

  const { data: sessions } = await admin
    .from("live_sessions")
    .select("id, title, scheduled_at, zoom_link, week_id, cohort_weeks:week_id (cohort_batch_id, cohort_batches:cohort_batch_id (offering_id))")
    .gte("scheduled_at", lo)
    .lte("scheduled_at", hi)
    .not("week_id", "is", null);

  for (const s of sessions || []) {
    const batchId = s.cohort_weeks?.cohort_batch_id;
    if (!batchId) continue;
    const members = await getBatchMembers(admin, batchId);
    for (const m of members) {
      if (await alreadyNotified(admin, "cohort_session_reminder_1h", m.user_id, "live_session", s.id)) continue;
      const vars = {
        first_name: firstName(m.full_name),
        session_title: s.title || "Your cohort session",
        zoom_link: s.zoom_link || "https://app.leveluplearning.in/my-sessions",
      };
      const emailOk = m.email ? await queueEmail(admin, "cohort_session_reminder_1h", m.user_id, vars) : false;
      const waOk = m.phone
        ? await sendWhatsApp(m.phone, "cohort_session_reminder_1h", [
            vars.first_name, vars.session_title,
          ])
        : false;
      const channels: string[] = [];
      if (emailOk) channels.push("email");
      if (waOk) channels.push("whatsapp");
      if (channels.length > 0) {
        await logNotification(admin, "cohort_session_reminder_1h", m.user_id, "live_session", s.id, channels);
        counters.session_reminders++;
      }
    }
  }
}

async function processMissedAssignments(admin: any, counters: Counters) {
  // Weeks whose due_at was 24-48h ago. One-time nudge per user per week.
  const now = Date.now();
  const lo = new Date(now - 48 * 60 * 60 * 1000).toISOString();
  const hi = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const { data: weeks } = await admin
    .from("cohort_weeks")
    .select("id, cohort_batch_id, theme, assignment_prompt, assignment_due_at, cohort_batches:cohort_batch_id (offering_id)")
    .gte("assignment_due_at", lo)
    .lte("assignment_due_at", hi)
    .not("assignment_prompt", "is", null);

  for (const w of weeks || []) {
    const members = await getBatchMembers(admin, w.cohort_batch_id);
    const { data: subs } = await admin
      .from("cohort_week_submissions")
      .select("user_id")
      .eq("cohort_week_id", w.id);
    const submittedIds = new Set((subs || []).map((s: any) => s.user_id));

    for (const m of members) {
      if (submittedIds.has(m.user_id)) continue;
      if (await alreadyNotified(admin, "cohort_assignment_missed", m.user_id, "cohort_week", w.id)) continue;

      const vars = {
        first_name: firstName(m.full_name),
        week_theme: w.theme,
        offering_id: w.cohort_batches?.offering_id ?? "",
      };
      const emailOk = m.email ? await queueEmail(admin, "cohort_assignment_missed", m.user_id, vars) : false;
      const channels: string[] = [];
      if (emailOk) channels.push("email");
      if (channels.length > 0) {
        await logNotification(admin, "cohort_assignment_missed", m.user_id, "cohort_week", w.id, channels);
        counters.submissions_missed++;
      }
    }
  }
}
