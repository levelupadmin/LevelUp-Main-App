/**
 * One-time work after a single-payment order is captured.
 *
 * Both capture paths call `runPostCapture` once the order row says "captured":
 * verify-razorpay-payment (the buyer's browser) and razorpay-webhook (Razorpay's
 * servers). Whichever calls first claims the order by writing
 * `notes.post_capture` with a conditional UPDATE (only where that key is still
 * absent); Postgres lets exactly one caller win, so the work below runs once per
 * order, whatever the race between the two paths.
 *
 * The work, each step caught and recorded on its own:
 *   1. the server copy of the Meta Purchase (Conversions API);
 *   2. the purchase receipt email (_shared/receipt.ts), with the invoice PDF
 *      link when generate-invoice-pdf can make one.
 *
 * Scope rules:
 *   - Staged cohort payments (payment_type / application_id set) are skipped
 *     entirely. That pipeline is do-not-touch and behaves as before.
 *   - Nothing here can fail the capture: every step is caught and logged, and
 *     the callers run this after their own work is done (in the background via
 *     EdgeRuntime.waitUntil where available).
 *   - Missing configuration (no META_CAPI_ACCESS_TOKEN, no pixel id, no email
 *     helpers) is a logged no-op, so the code can ship before it is set.
 *
 * Edge functions import `schedulePostCapture` from postCaptureRuntime.ts, which
 * passes the email helpers in. This file stays free of URL imports so vitest
 * can run it.
 */
import { buildPurchaseEvent, sendCapiEvents, type CapiOrder } from "./metaCapi.ts";
import { sendPurchaseReceipt, type ReceiptEmailDeps } from "./receipt.ts";

// The service-role client, kept loose so a test double fits.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any; storage?: any };

export type PostCaptureOptions = {
  /** "verify" | "razorpay-webhook", recorded on the claim. */
  source: string;
  /** The buyer's request IP / user agent, used only when the order has none stored. */
  requestMeta?: { client_ip?: string; client_user_agent?: string };
  /** Email helpers for the receipt. Without them the receipt step is skipped. */
  email?: ReceiptEmailDeps;
};

type OfferingRow = { title: string | null; product_tier: string | null; refund_policy_days: number | null };
type UserRow = { email: string | null; phone: string | null; full_name: string | null };

type OrderRow = CapiOrder & {
  status: string;
  payment_type: string | null;
  application_id: string | null;
  guest_name: string | null;
  notes: unknown;
};

const ORDER_COLUMNS =
  "id, offering_id, user_id, total_inr, status, razorpay_payment_id, captured_at, created_at, guest_name, guest_email, guest_phone, payment_type, application_id, notes";

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
}

// Read through globalThis so this file also type-checks (and runs in tests)
// outside Deno, where there is no environment and every value reads as unset.
type DenoEnv = { env: { get(name: string): string | undefined } };
function env(name: string): string | null {
  try {
    const v = (globalThis as { Deno?: DenoEnv }).Deno?.env.get(name);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** Merge one result key into notes.post_capture. Best-effort. */
async function recordResult(admin: Admin, orderId: string, key: string, value: unknown): Promise<void> {
  try {
    const { data } = await admin.from("payment_orders").select("notes").eq("id", orderId).maybeSingle();
    const notes = asObject(data?.notes);
    const post = asObject(notes.post_capture);
    post[key] = value;
    notes.post_capture = post;
    await admin.from("payment_orders").update({ notes }).eq("id", orderId);
  } catch (e) {
    console.warn("[post-capture] could not record", key, "for", orderId, e);
  }
}

async function resolvePixelId(admin: Admin): Promise<string | null> {
  const fromEnv = env("META_PIXEL_ID");
  if (fromEnv) return fromEnv;
  try {
    const { data } = await admin
      .from("analytics_settings")
      .select("meta_pixel_id, meta_pixel_enabled")
      .limit(1)
      .maybeSingle();
    if (data?.meta_pixel_enabled && typeof data.meta_pixel_id === "string" && data.meta_pixel_id.trim()) {
      return data.meta_pixel_id.trim();
    }
  } catch (e) {
    console.warn("[post-capture] analytics_settings read failed", e);
  }
  return null;
}

async function sendServerPurchase(
  admin: Admin,
  po: OrderRow,
  opts: PostCaptureOptions,
  offering: OfferingRow | null,
  user: UserRow | null,
): Promise<void> {
  const accessToken = env("META_CAPI_ACCESS_TOKEN");
  if (!accessToken) {
    console.log("[post-capture] META_CAPI_ACCESS_TOKEN not set; server Purchase skipped for", po.id);
    await recordResult(admin, po.id, "capi", { skipped: "no_token", at: new Date().toISOString() });
    return;
  }
  const pixelId = await resolvePixelId(admin);
  if (!pixelId) {
    console.log("[post-capture] no Meta pixel id configured; server Purchase skipped for", po.id);
    await recordResult(admin, po.id, "capi", { skipped: "no_pixel", at: new Date().toISOString() });
    return;
  }

  const event = await buildPurchaseEvent(po, {
    offeringTitle: offering?.title ?? null,
    productTier: offering?.product_tier ?? null,
    userEmail: user?.email ?? null,
    userPhone: user?.phone ?? null,
    fallbackClientIp: opts.requestMeta?.client_ip ?? null,
    fallbackUserAgent: opts.requestMeta?.client_user_agent ?? null,
    siteUrl: env("SITE_URL") ?? "https://app.leveluplearning.in",
  });
  if (!event) {
    await recordResult(admin, po.id, "capi", { skipped: "no_payment_id", at: new Date().toISOString() });
    return;
  }

  const result = await sendCapiEvents({
    pixelId,
    accessToken,
    events: [event],
    testEventCode: env("META_CAPI_TEST_EVENT_CODE"),
    apiVersion: env("META_GRAPH_API_VERSION"),
  });
  if (result.ok) {
    console.log("[post-capture] server Purchase sent", { order: po.id, event_id: event.event_id, received: result.eventsReceived });
  } else {
    console.error("[post-capture] server Purchase failed", { order: po.id, status: result.status, error: result.error });
  }
  await recordResult(admin, po.id, "capi", {
    ok: result.ok,
    status: result.status,
    event_id: event.event_id,
    ...(result.ok ? { fbtrace_id: result.fbtraceId } : { error: result.error }),
    at: new Date().toISOString(),
  });
}

/**
 * The receipt's invoice link, or null. generate-invoice-pdf makes a receipt
 * copy that carries no contact details (name, course, amounts, date and
 * payment id only), because a guest's receipt goes to an email nobody has
 * verified. The signed link lasts 7 days. Any failure leaves the receipt
 * pointing at the profile page, where the buyer can download the full
 * invoice after signing in.
 */
export const RECEIPT_INVOICE_LINK_SECONDS = 60 * 60 * 24 * 7;

async function invoiceLink(admin: Admin, orderId: string): Promise<string | null> {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || !admin.storage) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/functions/v1/generate-invoice-pdf`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ payment_order_id: orderId, receipt_copy: true }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as { path?: unknown };
    if (!res.ok || typeof json.path !== "string") {
      console.warn("[post-capture] invoice PDF not made for", orderId, res.status);
      return null;
    }
    const signed = await admin.storage.from("invoices").createSignedUrl(json.path, RECEIPT_INVOICE_LINK_SECONDS);
    return typeof signed?.data?.signedUrl === "string" ? signed.data.signedUrl : null;
  } catch (e) {
    console.warn("[post-capture] invoice PDF failed for", orderId, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function sendReceipt(
  admin: Admin,
  po: OrderRow,
  opts: PostCaptureOptions,
  offering: OfferingRow | null,
  user: UserRow | null,
): Promise<void> {
  if (!opts.email) {
    await recordResult(admin, po.id, "receipt", { skipped: "no_email_helpers", at: new Date().toISOString() });
    return;
  }
  const appUrl = env("SITE_URL") ?? "https://app.leveluplearning.in";
  let coursePath: string | null = null;
  try {
    const { data: link } = await admin
      .from("offering_courses")
      .select("course_id")
      .eq("offering_id", po.offering_id)
      .limit(1)
      .maybeSingle();
    if (link?.course_id) coursePath = `/courses/${link.course_id}`;
  } catch {
    /* the receipt links the library instead */
  }
  const result = await sendPurchaseReceipt(
    admin,
    po,
    {
      offeringTitle: offering?.title ?? null,
      productTier: offering?.product_tier ?? null,
      refundPolicyDays: offering?.refund_policy_days ?? null,
      user,
      appUrl,
      invoiceUrl: await invoiceLink(admin, po.id),
      allowedUrlOrigins: [appUrl, env("SUPABASE_URL") ?? ""].filter(Boolean),
      coursePath,
    },
    opts.email,
  );
  if (result.sent) console.log("[post-capture] receipt queued", { order: po.id, message_id: result.message_id });
  else console.warn("[post-capture] receipt not sent", { order: po.id, ...result });
  await recordResult(admin, po.id, "receipt", { ...result, at: new Date().toISOString() });
}

/**
 * Has any caller claimed this order's post-capture work yet? Read from the
 * order's notes. The capture paths' already-captured early returns use it to
 * schedule the work only when it never started: if the call that captured the
 * order died (a 500 after capture, a killed isolate before the claim), the
 * next delivery or verify still sends the server Purchase and the receipt.
 * The claim in runPostCapture keeps that to one run.
 */
export function postCaptureClaimed(notes: unknown): boolean {
  return !!asObject(notes).post_capture;
}

/**
 * Run the one-time post-capture work for an order. Safe to call from both
 * capture paths and more than once; never throws.
 */
export async function runPostCapture(admin: Admin, paymentOrderId: string, opts: PostCaptureOptions): Promise<void> {
  try {
    const { data: po, error } = await admin
      .from("payment_orders")
      .select(ORDER_COLUMNS)
      .eq("id", paymentOrderId)
      .maybeSingle();
    if (error || !po) {
      console.warn("[post-capture] order not found", paymentOrderId, error);
      return;
    }
    const order = po as OrderRow;
    if (order.status !== "captured") return;
    // Staged cohort payments: out of scope by design (do-not-touch pipeline).
    if (order.payment_type || order.application_id) return;

    const notes = asObject(order.notes);
    if (notes.post_capture) return;

    // Claim: only the caller whose UPDATE still sees no post_capture key wins.
    const claimedNotes = { ...notes, post_capture: { claimed_at: new Date().toISOString(), source: opts.source } };
    const { data: claimed, error: claimErr } = await admin
      .from("payment_orders")
      .update({ notes: claimedNotes })
      .eq("id", order.id)
      .is("notes->>post_capture", null)
      .select("id");
    if (claimErr) {
      console.warn("[post-capture] claim failed", order.id, claimErr);
      return;
    }
    if (!claimed || claimed.length === 0) return; // the other path got here first
    order.notes = claimedNotes;

    let offering: OfferingRow | null = null;
    let user: UserRow | null = null;
    try {
      const { data } = await admin
        .from("offerings")
        .select("title, product_tier, refund_policy_days")
        .eq("id", order.offering_id)
        .maybeSingle();
      offering = (data as OfferingRow | null) ?? null;
      if (order.user_id) {
        const { data: u } = await admin
          .from("users")
          .select("email, phone, full_name")
          .eq("id", order.user_id)
          .maybeSingle();
        user = (u as UserRow | null) ?? null;
      }
    } catch (e) {
      console.warn("[post-capture] offering/buyer read failed", order.id, e);
    }

    try {
      await sendServerPurchase(admin, order, opts, offering, user);
    } catch (e) {
      console.error("[post-capture] server Purchase threw", order.id, e);
    }
    try {
      await sendReceipt(admin, order, opts, offering, user);
    } catch (e) {
      console.error("[post-capture] receipt threw", order.id, e);
    }
  } catch (e) {
    console.error("[post-capture] unexpected error", paymentOrderId, e);
  }
}

// Supabase's edge runtime keeps an isolate alive for work that outlives the
// response through EdgeRuntime.waitUntil. It is not a Deno global, so it is
// declared here and probed with `typeof`.
declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;

/**
 * Start post-capture work without delaying the caller's response. Where the
 * runtime offers waitUntil the isolate is kept alive until it finishes;
 * elsewhere (local serve) the promise still runs.
 */
export function schedulePostCapture(admin: Admin, paymentOrderId: string, opts: PostCaptureOptions): void {
  const task = runPostCapture(admin, paymentOrderId, opts).catch((e) => {
    console.error("[post-capture] background task threw", e);
  });
  const runtime = typeof EdgeRuntime === "undefined" ? undefined : EdgeRuntime;
  runtime?.waitUntil?.(task);
}
