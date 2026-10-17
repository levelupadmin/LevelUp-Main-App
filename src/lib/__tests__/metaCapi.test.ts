import { describe, it, expect, vi } from "vitest";
import { buildPurchaseEvent, sendCapiEvents, sha256Hex, type CapiOrder } from "@shared/metaCapi";
import { runPostCapture } from "@shared/postCapture";

type PostNotes = { post_capture: { source: string; capi: { skipped?: string } } };

const order: CapiOrder = {
  id: "po_1",
  offering_id: "190a09ee-3f34-4242-ad9f-70ddedcc8eae",
  user_id: "11111111-2222-3333-4444-555555555555",
  total_inr: "2499.00",
  razorpay_payment_id: "pay_ABC",
  captured_at: "2026-10-17T10:00:00.000Z",
  created_at: "2026-10-17T09:58:00.000Z",
  guest_email: " Buyer@Example.com ",
  guest_phone: "+919876543210",
  notes: {
    attribution: {
      fbclid: "IwAR9",
      fbp: "fb.1.1596403881668.1116446470",
      client_ip: "203.0.113.9",
      client_user_agent: "Mozilla/5.0 Instagram",
      event_source_url: "https://app.leveluplearning.in/checkout/190a09ee-3f34-4242-ad9f-70ddedcc8eae",
    },
  },
};

const ctx = { offeringTitle: "Nelson Dilipkumar Teaches Filmmaking", productTier: "masterclass", siteUrl: "https://app.leveluplearning.in" };

describe("buildPurchaseEvent", () => {
  it("matches the browser event id and carries hashed identifiers", async () => {
    const ev = (await buildPurchaseEvent(order, ctx))!;
    expect(ev.event_id).toBe("purchase_pay_ABC");
    expect(ev.event_name).toBe("Purchase");
    expect(ev.action_source).toBe("website");
    expect(ev.event_time).toBe(Math.floor(Date.parse(order.captured_at!) / 1000));
    const ud = ev.user_data as Record<string, unknown>;
    expect(ud.em).toEqual([await sha256Hex("buyer@example.com")]);
    expect(ud.ph).toEqual([await sha256Hex("919876543210")]);
    expect(ud.external_id).toEqual([await sha256Hex(order.user_id!)]);
    expect(ud.fbp).toBe("fb.1.1596403881668.1116446470");
    // No stored fbc: built from fbclid with the order's creation time.
    expect(ud.fbc).toBe(`fb.1.${Date.parse(order.created_at!)}.IwAR9`);
    expect(ud.client_ip_address).toBe("203.0.113.9");
    expect(ud.client_user_agent).toBe("Mozilla/5.0 Instagram");
    expect(ev.custom_data).toMatchObject({
      value: 2499,
      currency: "INR",
      content_ids: [order.offering_id],
      content_type: "product",
      content_category: "Masterclass",
      num_items: 1,
      order_id: "po_1",
    });
  });

  it("skips the placeholder email and falls back to the profile and request meta", async () => {
    const ev = (await buildPurchaseEvent(
      { ...order, guest_email: "919876543210@phone.leveluplearning.in", guest_phone: null, notes: {} },
      { ...ctx, userEmail: "real@example.com", userPhone: "9876543210", fallbackUserAgent: "UA-from-verify" },
    ))!;
    const ud = ev.user_data as Record<string, unknown>;
    expect(ud.em).toEqual([await sha256Hex("real@example.com")]);
    expect(ud.ph).toEqual([await sha256Hex("919876543210")]);
    expect(ud.client_user_agent).toBe("UA-from-verify");
    expect(ev.event_source_url).toBe(`https://app.leveluplearning.in/checkout/${order.offering_id}`);
  });

  it("returns null without a Razorpay payment id", async () => {
    expect(await buildPurchaseEvent({ ...order, razorpay_payment_id: null }, ctx)).toBeNull();
  });
});

describe("sendCapiEvents", () => {
  it("posts to the pixel with the token in the body", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ events_received: 1, fbtrace_id: "t1" }), { status: 200 }));
    const res = await sendCapiEvents({ pixelId: "662214098433203", accessToken: "TOKEN", events: [{ a: 1 }], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toEqual({ ok: true, status: 200, eventsReceived: 1, fbtraceId: "t1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/662214098433203/events");
    expect(url).not.toContain("TOKEN");
    expect(JSON.parse(String(init.body))).toMatchObject({ access_token: "TOKEN", data: [{ a: 1 }] });
  });

  it("reports an API error without throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token" } }), { status: 400 }));
    const res = await sendCapiEvents({ pixelId: "1", accessToken: "x", events: [], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toEqual({ ok: false, status: 400, error: "Invalid OAuth access token" });
  });

  it("reports a network failure without throwing", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    const res = await sendCapiEvents({ pixelId: "1", accessToken: "x", events: [], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toEqual({ ok: false, status: null, error: "offline" });
  });
});

/** A scripted stand-in for the service-role client: one payment_orders row. */
function fakeAdmin(row: Record<string, unknown>) {
  const state = { row: { ...row }, updates: [] as Record<string, unknown>[] };
  const from = (table: string) => {
    const q: Record<string, unknown> & { _filters: [string, unknown][]; _update?: Record<string, unknown> } = { _filters: [] };
    q.select = () => q;
    q.eq = (c: string, v: unknown) => { q._filters.push([c, v]); return q; };
    q.is = (c: string, v: unknown) => { q._filters.push([c, v]); return q; };
    q.limit = () => q;
    q.update = (u: Record<string, unknown>) => { q._update = u; return q; };
    q.maybeSingle = async () => {
      if (table === "payment_orders") return { data: { ...state.row }, error: null };
      return { data: null, error: null };
    };
    // `await query` after update(...).select("id") or update(...).eq(...)
    q.then = (resolve: (v: unknown) => void) => {
      if (table === "payment_orders" && q._update) {
        const guard = q._filters.find(([c]) => c === "notes->>post_capture");
        const notes = (state.row.notes ?? {}) as Record<string, unknown>;
        if (guard && notes.post_capture) return resolve({ data: [], error: null });
        state.row = { ...state.row, ...q._update };
        state.updates.push(q._update);
        return resolve({ data: [{ id: state.row.id }], error: null });
      }
      return resolve({ data: null, error: null });
    };
    return q;
  };
  return { admin: { from }, state };
}

describe("runPostCapture", () => {
  const captured = { ...order, status: "captured", payment_type: null, application_id: null, guest_name: "B", notes: {} };

  it("claims once, records the skip when no token is configured, and does nothing the second time", async () => {
    const { admin, state } = fakeAdmin(captured);
    await runPostCapture(admin, "po_1", { source: "verify" });
    const notes = state.row.notes as PostNotes;
    expect(notes.post_capture.source).toBe("verify");
    expect(notes.post_capture.capi.skipped).toBe("no_token");
    const writes = state.updates.length;
    await runPostCapture(admin, "po_1", { source: "razorpay-webhook" });
    expect(state.updates.length).toBe(writes);
    expect((state.row.notes as PostNotes).post_capture.source).toBe("verify");
  });

  it("leaves staged cohort payments alone", async () => {
    const { admin, state } = fakeAdmin({ ...captured, payment_type: "app_fee", application_id: "app_1" });
    await runPostCapture(admin, "po_1", { source: "verify" });
    expect(state.updates).toHaveLength(0);
  });

  it("does nothing before capture", async () => {
    const { admin, state } = fakeAdmin({ ...captured, status: "created" });
    await runPostCapture(admin, "po_1", { source: "razorpay-webhook" });
    expect(state.updates).toHaveLength(0);
  });
});
