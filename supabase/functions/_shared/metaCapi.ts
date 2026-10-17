/**
 * Meta Conversions API: the server copy of a Purchase.
 *
 * The browser pixel fires Purchase from the checkout's Razorpay handler and
 * from the Thank-you page. Both can miss: the buyer closes the in-app browser
 * mid-redirect, iOS or an ad blocker drops facebook.com/tr, or a guest never
 * signs in. This module builds the same Purchase on the server, from the
 * captured order, with the SAME event_id (`purchase_<razorpay_payment_id>`,
 * see metaEvents.ts) so Meta keeps one copy when both arrive.
 *
 * Personal data is hashed (SHA-256) before it leaves: email, phone and the
 * user id. fbc, fbp, client IP and user agent are sent as Meta asks, unhashed;
 * they were stored on the order at creation (notes.attribution).
 *
 * No Deno globals here: the caller passes config and fetch, so vitest can run
 * the builder. `sendCapiEvents` never throws.
 */
import {
  contentCategoryForTier,
  normalizeEmailForMeta,
  normalizePhoneForMeta,
  purchaseEventId,
} from "./metaEvents.ts";
import { fbcFromFbclid } from "./attribution.ts";

export const DEFAULT_GRAPH_API_VERSION = "v23.0";

export type CapiOrder = {
  id: string;
  offering_id: string;
  user_id: string | null;
  total_inr: number | string;
  razorpay_payment_id: string | null;
  captured_at: string | null;
  created_at?: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  notes?: unknown;
};

export type CapiContext = {
  offeringTitle: string | null;
  productTier: string | null;
  /** From public.users when the order has a user_id. */
  userEmail?: string | null;
  userPhone?: string | null;
  /** Used only when the order carries no stored IP / user agent. */
  fallbackClientIp?: string | null;
  fallbackUserAgent?: string | null;
  /** e.g. https://app.leveluplearning.in */
  siteUrl: string;
};

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** The stored attribution on an order, or an empty object. */
export function orderAttribution(notes: unknown): Record<string, unknown> {
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return {};
  const a = (notes as Record<string, unknown>).attribution;
  return a && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : {};
}

/**
 * One Purchase event for the Conversions API, or null when the order cannot
 * carry one (no Razorpay payment id means there is no browser event to match).
 */
export async function buildPurchaseEvent(
  order: CapiOrder,
  ctx: CapiContext,
): Promise<Record<string, unknown> | null> {
  const paymentId = str(order.razorpay_payment_id);
  if (!paymentId) return null;

  const attr = orderAttribution(order.notes);
  const capturedMs = Date.parse(order.captured_at ?? "") || Date.now();
  const createdMs = Date.parse(order.created_at ?? "") || capturedMs;

  const email = normalizeEmailForMeta(order.guest_email) ?? normalizeEmailForMeta(ctx.userEmail);
  const phone = normalizePhoneForMeta(order.guest_phone) ?? normalizePhoneForMeta(ctx.userPhone);
  const fbclid = str(attr.fbclid);
  const fbc = str(attr.fbc) ?? (fbclid ? fbcFromFbclid(fbclid, createdMs) : undefined);
  const fbp = str(attr.fbp);
  const ip = str(attr.client_ip) ?? str(ctx.fallbackClientIp);
  const ua = str(attr.client_user_agent) ?? str(ctx.fallbackUserAgent);

  const userData: Record<string, unknown> = {};
  if (email) userData.em = [await sha256Hex(email)];
  if (phone) userData.ph = [await sha256Hex(phone)];
  if (order.user_id) userData.external_id = [await sha256Hex(order.user_id)];
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;
  if (ip) userData.client_ip_address = ip;
  if (ua) userData.client_user_agent = ua;

  const site = ctx.siteUrl.replace(/\/+$/, "");
  return {
    event_name: "Purchase",
    event_time: Math.floor(capturedMs / 1000),
    event_id: purchaseEventId(paymentId),
    action_source: "website",
    event_source_url: str(attr.event_source_url) ?? `${site}/checkout/${order.offering_id}`,
    user_data: userData,
    custom_data: {
      value: Number(order.total_inr),
      currency: "INR",
      content_ids: [order.offering_id],
      content_type: "product",
      content_category: contentCategoryForTier(ctx.productTier),
      ...(ctx.offeringTitle ? { content_name: ctx.offeringTitle } : {}),
      num_items: 1,
      order_id: order.id,
    },
  };
}

export type CapiSendResult =
  | { ok: true; status: number; eventsReceived: number | null; fbtraceId: string | null }
  | { ok: false; status: number | null; error: string };

/** POST events to /{pixel}/events. Never throws; times out after `timeoutMs`. */
export async function sendCapiEvents(opts: {
  pixelId: string;
  accessToken: string;
  events: Record<string, unknown>[];
  testEventCode?: string | null;
  apiVersion?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<CapiSendResult> {
  const pixel = opts.pixelId.replace(/[^0-9]/g, "");
  if (!pixel) return { ok: false, status: null, error: "no pixel id" };
  const version = /^v\d+\.\d+$/.test(opts.apiVersion ?? "") ? opts.apiVersion! : DEFAULT_GRAPH_API_VERSION;
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    // The token goes in the body, not the URL, so it never lands in an access log.
    const res = await doFetch(`https://graph.facebook.com/${version}/${pixel}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: opts.events,
        access_token: opts.accessToken,
        ...(opts.testEventCode ? { test_event_code: opts.testEventCode } : {}),
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text);
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      const err = (body.error as Record<string, unknown> | undefined)?.message;
      return { ok: false, status: res.status, error: typeof err === "string" ? err.slice(0, 300) : `HTTP ${res.status}` };
    }
    return {
      ok: true,
      status: res.status,
      eventsReceived: typeof body.events_received === "number" ? body.events_received : null,
      fbtraceId: typeof body.fbtrace_id === "string" ? body.fbtrace_id : null,
    };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message.slice(0, 300) : "send failed" };
  } finally {
    clearTimeout(timer);
  }
}
