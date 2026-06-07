// Shared helpers for the email edge functions. The two producers
// (queue-transactional-email, send-bulk-email) previously carried byte-identical
// copies of all of this; it now lives here. The consumer (process-email-queue)
// only shares the constant-time compare, which comes from ./crypto.ts.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// The concrete generic shape of a Supabase client varies across supabase-js
// minor versions (the schema param defaults differ between a call site and a
// bare `ReturnType<typeof createClient>`). These helpers only touch
// .from()/.rpc(), so a permissive client type keeps them reusable across both
// producers without fighting that variance.
// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export const EMAIL_FROM = "LevelUp Learning <noreply@leveluplearning.in>";
export const SENDER_DOMAIN = "leveluplearning.in";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function emailCorsHeaders(): Record<string, string> {
  const origin = Deno.env.get("SITE_URL") ?? "https://app.leveluplearning.in";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

export function emailJsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...emailCorsHeaders(), "Content-Type": "application/json" },
  });
}

/** Strip newlines, angle brackets, and bare URLs from a user-supplied template
 *  variable before interpolation into subject/body. */
export function sanitizeVar(v: unknown, maxLen = 500): string {
  if (v == null) return "";
  return String(v)
    .slice(0, maxLen)
    .replace(/[\r\n]+/g, " ")
    .replace(/[<>]/g, "")
    .replace(/https?:\/\/\S+/gi, "");
}

/** Enqueue one rendered email onto the transactional_emails pgmq queue. The
 *  caller controls run_id (one per campaign, or one per transactional send). */
export async function enqueueEmail(
  admin: Admin,
  opts: {
    runId: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    label: string;
    idempotencyKey: string;
    messageId: string;
  },
) {
  const payload = {
    run_id: opts.runId,
    to: opts.to,
    from: EMAIL_FROM,
    sender_domain: SENDER_DOMAIN,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    purpose: "transactional",
    label: opts.label,
    idempotency_key: opts.idempotencyKey,
    message_id: opts.messageId,
    queued_at: new Date().toISOString(),
  };
  return admin.rpc("enqueue_email", { queue_name: "transactional_emails", payload });
}

/** Single-email suppression check. */
export async function isEmailSuppressed(admin: Admin, email: string): Promise<boolean> {
  const { data } = await admin.from("suppressed_emails").select("id").eq("email", email).maybeSingle();
  return !!data;
}

/** Batched suppression lookup -> Set of suppressed emails (chunked by 500). */
export async function fetchSuppressedSet(admin: Admin, emails: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  for (let i = 0; i < emails.length; i += 500) {
    const chunk = emails.slice(i, i + 500);
    const { data } = await admin.from("suppressed_emails").select("email").in("email", chunk);
    (data || []).forEach((s: { email: string }) => set.add(s.email));
  }
  return set;
}
