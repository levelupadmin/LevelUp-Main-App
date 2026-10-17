import { describe, it, expect, vi, beforeEach } from "vitest";
import { hmacSha256Hex } from "@shared/crypto";

/**
 * When the Razorpay signature checks out but Razorpay's API cannot be asked for
 * the payment (network error, 5xx, 429), verify-razorpay-payment leaves the
 * order as it is instead of marking it failed. The webhook or a later verify
 * settles it, and an open order is reused rather than replaced by a new one
 * that could be paid a second time. A real mismatch still marks it failed.
 */

const fake = vi.hoisted(() => {
  const env = new Map<string, string>([
    ["SUPABASE_URL", "https://ref.supabase.co"],
    ["SUPABASE_SERVICE_ROLE_KEY", "service-role"],
    ["SUPABASE_ANON_KEY", "anon"],
    ["RAZORPAY_KEY_ID", "rzp_test_k"],
    ["RAZORPAY_KEY_SECRET", "rzp_secret"],
  ]);
  const state = {
    handler: null as null | ((req: Request) => Promise<Response>),
    updates: [] as Array<Record<string, unknown>>,
  };
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (k: string) => env.get(k) },
    serve: (h: (req: Request) => Promise<Response>) => {
      state.handler = h;
      return {};
    },
  };
  const order = {
    id: "po_1",
    user_id: null,
    offering_id: "off_1",
    razorpay_order_id: "order_1",
    status: "created",
    total_inr: 999,
    payment_type: null,
    application_id: null,
    notes: {},
  };
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "is", "or", "limit", "order"]) b[m] = () => b;
    b.update = (patch: Record<string, unknown>) => {
      state.updates.push(patch);
      return b;
    };
    b.single = () => Promise.resolve({ data: order, error: null });
    b.maybeSingle = () => Promise.resolve({ data: order, error: null });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok);
    return b;
  };
  const admin = { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) };
  return { state, createClient: () => admin };
});

vi.mock("https://esm.sh/@supabase/supabase-js@2.98.0", () => ({ createClient: fake.createClient }));
vi.mock("../../../supabase/functions/_shared/postCaptureRuntime.ts", () => ({
  postCaptureClaimed: () => false,
  schedulePostCapture: vi.fn(),
}));

await import("../../../supabase/functions/verify-razorpay-payment/index.ts");

async function callVerify() {
  const signature = await hmacSha256Hex("order_1|pay_1", "rzp_secret");
  return fake.state.handler!(
    new Request("https://fn.local/verify-razorpay-payment", {
      method: "POST",
      body: JSON.stringify({
        razorpay_payment_id: "pay_1",
        razorpay_order_id: "order_1",
        razorpay_signature: signature,
        payment_order_id: "po_1",
        is_guest: true,
      }),
    }),
  );
}

const markedFailed = () => fake.state.updates.some((u) => u.status === "failed");

beforeEach(() => {
  fake.state.updates = [];
});

describe("verify, signature valid, Razorpay API cannot be asked", () => {
  it("a network error leaves the order open and answers 503", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const res = await callVerify();
    expect(res.status).toBe(503);
    expect((await res.json()).success).toBeUndefined();
    expect(markedFailed()).toBe(false);
  });

  it("a Razorpay 5xx or 429 leaves the order open", async () => {
    for (const status of [502, 429]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status })));
      expect((await callVerify()).status).toBe(503);
    }
    expect(markedFailed()).toBe(false);
  });

  it("a wrong amount still marks the order failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "pay_1", status: "captured", order_id: "order_1", amount: 100 }), { status: 200 })),
    );
    expect((await callVerify()).status).toBe(400);
    expect(markedFailed()).toBe(true);
  });
});
