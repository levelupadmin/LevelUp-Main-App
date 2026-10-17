/**
 * The purchase receipt email, sent once per captured single-payment order from
 * the post-capture step (_shared/postCapture.ts), whichever capture path
 * (verify or webhook) claims the order first.
 *
 * Why it lives here: the old receipt call in verify-razorpay-payment never sent
 * anything. It left out user_id, which queue-transactional-email requires (400),
 * passed a to_email that function ignores, ran only when verify beat the
 * webhook (about 1 order in 3), and ran after the response with nothing
 * keeping the isolate alive. email_send_log holds 0 receipts, ever.
 *
 * Rules:
 *   - Recipient: a guest order goes to the email typed at checkout (the order's
 *     own guest fields, never a matched account's profile; see
 *     ARCHITECTURE.md). A signed-in order goes to the account's email. The app's
 *     placeholder address (<digits>@phone.leveluplearning.in) is never mailed.
 *   - Template: the active `payment_receipt` row in email_templates, rendered
 *     the way queue-transactional-email renders it ({{name}} placeholders,
 *     sanitizeVar on text values). URL values are checked against the app and
 *     storage origins instead of sanitized, because sanitizeVar strips URLs and
 *     the invoice link came out empty.
 *   - Variables the live template uses: student_name, offering_name, amount,
 *     payment_id, date, app_url, invoice_url. Also passed, for a template that
 *     adds them: sign_in_hint, refund_policy, course_url.
 *   - Personal data: a guest's receipt goes to an email nobody has verified,
 *     so no variable carries more than the buyer's name, the course, the
 *     amount, the date and the payment id. No email, no phone digits. The
 *     invoice link is a 7-day signed link to a copy without contact details
 *     (postCapture.ts, generate-invoice-pdf `receipt_copy`).
 *
 * Pure: no runtime imports beyond other pure _shared modules. The email
 * helpers (_shared/email.ts imports a URL module) are passed in as deps, so
 * vitest can run this file.
 */
import { normalizeEmailForMeta } from "./metaEvents.ts";
import { masterclassRefundSentence, watchRuleApplies } from "./refundPolicy.ts";

export const RECEIPT_TEMPLATE_KEY = "payment_receipt";

// The service-role client, kept loose so a test double fits.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type ReceiptEmailDeps = {
  enqueueEmail: (
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
  ) => PromiseLike<{ error: unknown }>;
  isEmailSuppressed: (admin: Admin, email: string) => Promise<boolean>;
  sanitizeVar: (v: unknown, maxLen?: number) => string;
};

export type ReceiptOrder = {
  id: string;
  user_id: string | null;
  offering_id: string;
  total_inr: number | string;
  razorpay_payment_id: string | null;
  captured_at: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
};

export type ReceiptContext = {
  offeringTitle: string | null;
  productTier: string | null;
  refundPolicyDays?: number | null;
  user?: { email: string | null; full_name: string | null; phone: string | null } | null;
  /** e.g. https://app.leveluplearning.in */
  appUrl: string;
  /** Signed URL of the invoice PDF, or null to point at the profile page. */
  invoiceUrl?: string | null;
  /** Origins a URL variable may start with (the app, Supabase storage). */
  allowedUrlOrigins: string[];
  /** First lesson path, e.g. /chapters/<id>, when known. */
  coursePath?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Who gets the receipt, or null when there is no real inbox on file. */
export function receiptRecipient(
  order: Pick<ReceiptOrder, "guest_email" | "guest_name">,
  user?: ReceiptContext["user"],
): { email: string; name: string } | null {
  const guest = normalizeEmailForMeta(order.guest_email);
  if (guest && EMAIL_RE.test(guest)) {
    return { email: guest, name: (order.guest_name ?? "").trim() || "there" };
  }
  if (order.guest_email) return null; // a guest order never falls back to a matched profile
  const own = normalizeEmailForMeta(user?.email);
  if (own && EMAIL_RE.test(own)) {
    return { email: own, name: (user?.full_name ?? "").trim() || "there" };
  }
  return null;
}

/** "17 Oct 2026" in India time. */
export function receiptDate(iso: string | null | undefined): string {
  const d = new Date(iso || Date.now());
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** A URL value is used only when it is https and starts at an allowed origin. */
export function safeUrl(value: string | null | undefined, allowedOrigins: string[]): string | null {
  const v = (value ?? "").trim();
  if (!/^https:\/\/[^\s"'<>]+$/.test(v)) return null;
  const ok = allowedOrigins.some((o) => {
    const origin = o.replace(/\/+$/, "");
    return !!origin && (v === origin || v.startsWith(`${origin}/`) || v.startsWith(`${origin}?`));
  });
  return ok ? v : null;
}

export function receiptVariables(order: ReceiptOrder, ctx: ReceiptContext, recipientName: string): Record<string, string> {
  const appUrl = ctx.appUrl.replace(/\/+$/, "");
  const isGuest = !!order.guest_email;
  return {
    student_name: recipientName,
    offering_name: ctx.offeringTitle || "your course",
    amount: Number(order.total_inr || 0).toLocaleString("en-IN"),
    payment_id: order.razorpay_payment_id || "",
    date: receiptDate(order.captured_at),
    app_url: appUrl,
    invoice_url: safeUrl(ctx.invoiceUrl, ctx.allowedUrlOrigins) ?? `${appUrl}/profile`,
    course_url: `${appUrl}${ctx.coursePath && ctx.coursePath.startsWith("/") ? ctx.coursePath : "/learn?seg=courses"}`,
    sign_in_hint: isGuest
      ? "Sign in with the phone number you paid with and a one-time code."
      : "Sign in to the account you bought with.",
    refund_policy: watchRuleApplies(ctx.productTier) ? masterclassRefundSentence(ctx.refundPolicyDays) : "",
  };
}

const URL_VARS = new Set(["app_url", "invoice_url", "course_url"]);

/**
 * Fill {{name}} placeholders the way queue-transactional-email does. Text
 * values go through sanitizeVar; URL values were checked by receiptVariables
 * and are escaped for an HTML attribute.
 */
export function renderReceipt(
  template: { subject: string | null; html_body: string | null; text_body: string | null },
  vars: Record<string, string>,
  sanitizeVar: ReceiptEmailDeps["sanitizeVar"],
): { subject: string; html: string; text: string } {
  let subject = template.subject ?? "";
  let html = template.html_body ?? "";
  let text = template.text_body ?? "";
  for (const [key, raw] of Object.entries(vars)) {
    const val = URL_VARS.has(key)
      ? String(raw).slice(0, 2000).replace(/"/g, "%22").replace(/</g, "%3C").replace(/>/g, "%3E")
      : sanitizeVar(raw);
    const placeholder = `{{${key}}}`;
    subject = subject.replaceAll(placeholder, val);
    html = html.replaceAll(placeholder, val);
    text = text.replaceAll(placeholder, val);
  }
  return { subject, html, text };
}

export type ReceiptResult =
  | { sent: true; message_id: string; to_domain: string }
  | { sent: false; skipped?: string; error?: string };

/** Render and queue the receipt. Never throws. */
export async function sendPurchaseReceipt(
  admin: Admin,
  order: ReceiptOrder,
  ctx: ReceiptContext,
  deps: ReceiptEmailDeps,
): Promise<ReceiptResult> {
  try {
    const to = receiptRecipient(order, ctx.user);
    if (!to) return { sent: false, skipped: "no_email" };
    if (await deps.isEmailSuppressed(admin, to.email)) return { sent: false, skipped: "suppressed" };

    const { data: template } = await admin
      .from("email_templates")
      .select("subject, html_body, text_body")
      .eq("template_key", RECEIPT_TEMPLATE_KEY)
      .eq("is_active", true)
      .maybeSingle();
    if (!template) return { sent: false, skipped: "no_template" };

    const rendered = renderReceipt(template, receiptVariables(order, ctx, to.name), deps.sanitizeVar);
    const messageId = crypto.randomUUID();
    const { error } = await deps.enqueueEmail(admin, {
      runId: crypto.randomUUID(),
      to: to.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      label: RECEIPT_TEMPLATE_KEY,
      // One receipt per order: the post-capture claim already runs this once,
      // and the key names the order for anyone reading the queue.
      idempotencyKey: `${RECEIPT_TEMPLATE_KEY}:${order.id}`,
      messageId,
    });
    if (error) {
      return { sent: false, error: error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? error).slice(0, 300) };
    }
    return { sent: true, message_id: messageId, to_domain: to.email.split("@")[1] ?? "" };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message.slice(0, 300) : "receipt failed" };
  }
}
