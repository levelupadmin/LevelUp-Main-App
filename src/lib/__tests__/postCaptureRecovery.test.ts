import { describe, it, expect, vi, beforeEach } from "vitest";
import { hmacSha256Hex } from "@shared/crypto";

/**
 * Post-capture (server Purchase, receipt) runs at most once per order, and a
 * failure after capture must not lose it for good: when razorpay-webhook or
 * verify-razorpay-payment meets an order that is already captured, it starts
 * the post-capture step if no one has claimed it yet. The claim inside
 * runPostCapture keeps that to one run (covered in receipt.test.ts).
 */

const fake = vi.hoisted(() => {
  const env = new Map<string, string>([
    ["SUPABASE_URL", "https://ref.supabase.co"],
    ["SUPABASE_SERVICE_ROLE_KEY", "service-role"],
    ["SUPABASE_ANON_KEY", "anon"],
    ["RAZORPAY_KEY_ID", "rzp_test_k"],
    ["RAZORPAY_KEY_SECRET", "rzp_secret"],
    ["RAZORPAY_WEBHOOK_SECRET", "whsec"],
  ]);
  const handlers: Array<(req: Request) => Promise<Response>> = [];
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (k: string) => env.get(k) },
    serve: (h: (req: Request) => Promise<Response>) => {
      handlers.push(h);
      return {};
    },
  };
  const state = { po: {} as Record<string, unknown> };
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "update", "neq", "is", "limit", "order"]) b[m] = () => b;
    b.single = () => Promise.resolve({ data: state.po, error: null });
    b.maybeSingle = () => Promise.resolve({ data: state.po, error: null });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok);
    return b;
  };
  const admin = { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) };
  const schedule = vi.fn();
  return { handlers, state, admin, schedule, createClient: () => admin };
});

vi.mock("https://esm.sh/@supabase/supabase-js@2.98.0", () => ({ createClient: fake.createClient }));
vi.mock("../../../supabase/functions/_shared/postCaptureRuntime.ts", async () => {
  const { postCaptureClaimed } = await import("../../../supabase/functions/_shared/postCapture.ts");
  return { postCaptureClaimed, schedulePostCapture: fake.schedule };
});

await import("../../../supabase/functions/razorpay-webhook/index.ts");
await import("../../../supabase/functions/verify-razorpay-payment/index.ts");
const [webhook, verify] = fake.handlers;

const baseOrder = {
  id: "po_1",
  razorpay_order_id: "order_1",
  razorpay_payment_id: "pay_1",
  status: "captured",
  total_inr: 999,
  payment_type: null,
  application_id: null,
  notes: {},
};

async function deliverWebhook() {
  const body = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 99900 } } },
  });
  const signature = await hmacSha256Hex(body, "whsec");
  return webhook(new Request("https://fn.local/razorpay-webhook", { method: "POST", body, headers: { "x-razorpay-signature": signature } }));
}

function callVerify() {
  return verify(
    new Request("https://fn.local/verify-razorpay-payment", {
      method: "POST",
      body: JSON.stringify({
        razorpay_payment_id: "pay_1",
        razorpay_order_id: "order_1",
        razorpay_signature: "sig",
        payment_order_id: "po_1",
        is_guest: true,
      }),
    }),
  );
}

beforeEach(() => {
  fake.schedule.mockClear();
  fake.state.po = { ...baseOrder };
});

describe("post-capture after an already-captured order", () => {
  it("the webhook starts it when no one has claimed it", async () => {
    const res = await deliverWebhook();
    expect(res.status).toBe(200);
    expect(fake.schedule).toHaveBeenCalledTimes(1);
    expect(fake.schedule).toHaveBeenCalledWith(fake.admin, "po_1", { source: "razorpay-webhook" });
  });

  it("verify starts it when no one has claimed it", async () => {
    const res = await callVerify();
    expect(await res.json()).toEqual({ success: true, already_captured: true });
    expect(fake.schedule).toHaveBeenCalledTimes(1);
    expect(fake.schedule.mock.calls[0][1]).toBe("po_1");
    expect(fake.schedule.mock.calls[0][2]).toMatchObject({ source: "verify" });
  });

  it("neither starts it again once it was claimed", async () => {
    fake.state.po = { ...baseOrder, notes: { post_capture: { claimed_at: "2026-10-18T00:00:00Z", source: "verify" } } };
    await deliverWebhook();
    await callVerify();
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("leaves staged cohort payments and parked orders alone", async () => {
    fake.state.po = { ...baseOrder, payment_type: "app_fee", application_id: "app_1" };
    await deliverWebhook();
    await callVerify();
    fake.state.po = { ...baseOrder, status: "needs_review" };
    await deliverWebhook();
    expect(fake.schedule).not.toHaveBeenCalled();
  });
});
