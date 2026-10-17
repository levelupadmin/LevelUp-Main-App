import { describe, it, expect, vi, beforeEach } from "vitest";
import { hmacSha256Hex } from "@shared/crypto";
import { POST_CAPTURE_RECOVERY_MS, postCaptureRecoverable } from "@shared/postCapture";

/**
 * An order already marked captured is not done until the buyer holds the
 * course: verify writes "captured" before it inserts the enrolment, and an
 * insert error then answers 500. When razorpay-webhook or
 * verify-razorpay-payment meets a captured single-payment order, it grants the
 * missing course first (the same idempotent insert), and only then answers
 * success and starts the post-capture step (server Purchase, receipt) if no
 * one has claimed it. The status check reads such an order as needs_review
 * until the course is granted. The claim inside runPostCapture keeps
 * post-capture to at most one run (covered in receipt.test.ts).
 */

type Row = Record<string, unknown>;
type DbError = { code: string; message: string };

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
  const state = {
    po: {} as Record<string, unknown>,
    /** Enrolments in the order's course for the order or its buyer. */
    enrolments: [] as Array<{ id: string; status: string }>,
    /** Error for the next main enrolment insert; a 23505 also adds the concurrent winner's row. */
    insertError: null as null | { code: string; message: string },
    readError: null as null | { code: string; message: string },
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    enrolmentReads: [] as Array<Record<string, unknown>>,
    events: [] as string[],
  };

  function builder(table: string) {
    let mode: "select" | "insert" | "update" = "select";
    let row: Record<string, unknown> | null = null;
    const filters: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.update = () => {
      mode = "update";
      return b;
    };
    b.insert = (r: Record<string, unknown>) => {
      mode = "insert";
      row = r;
      state.inserts.push({ table, row: r });
      state.events.push(`insert:${table}`);
      return b;
    };
    for (const m of ["eq", "neq", "is", "or", "limit", "order"]) {
      b[m] = (col: string, val?: unknown) => {
        filters[m === "or" ? "or" : col] = m === "or" ? col : val;
        return b;
      };
    }
    const settle = (): { data: unknown; error: unknown } => {
      if (table === "payment_orders") return { data: mode === "select" ? state.po : null, error: null };
      if (table === "enrolments" && mode === "insert") {
        // Main course insert (has total_paid_inr) vs bump insert.
        if (row && "total_paid_inr" in row) {
          const err = state.insertError;
          if (err) {
            if (err.code === "23505") state.enrolments.push({ id: "enr_winner", status: "active" });
            return { data: null, error: err };
          }
          state.enrolments.push({ id: "enr_new", status: "active" });
          return { data: { id: "enr_new" }, error: null };
        }
        return { data: null, error: null };
      }
      if (table === "enrolments") {
        state.enrolmentReads.push({ ...filters });
        if (state.readError) return { data: null, error: state.readError };
        return { data: state.enrolments, error: null };
      }
      return { data: null, error: null };
    };
    b.single = () => Promise.resolve(settle());
    b.maybeSingle = () => {
      const r = settle();
      if (table === "enrolments" && Array.isArray(r.data)) {
        return Promise.resolve({ data: (r.data as Array<{ status: string }>).find((e) => e.status === "active") ?? null, error: r.error });
      }
      return Promise.resolve(r);
    };
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(settle()).then(ok, bad);
    return b;
  }

  const admin = { from: (t: string) => builder(t), rpc: () => Promise.resolve({ data: null, error: null }) };
  const schedule = vi.fn((...args: unknown[]) => {
    void args;
    state.events.push("schedule");
  });
  return { handlers, state, admin, schedule, createClient: () => admin };
});

vi.mock("https://esm.sh/@supabase/supabase-js@2.98.0", () => ({ createClient: fake.createClient }));
vi.mock("../../../supabase/functions/_shared/postCaptureRuntime.ts", async () => {
  const { postCaptureClaimed, postCaptureRecoverable } = await import("../../../supabase/functions/_shared/postCapture.ts");
  return { postCaptureClaimed, postCaptureRecoverable, schedulePostCapture: fake.schedule };
});

await import("../../../supabase/functions/razorpay-webhook/index.ts");
await import("../../../supabase/functions/verify-razorpay-payment/index.ts");
const [webhook, verify] = fake.handlers;

const baseOrder = {
  id: "po_1",
  user_id: "user_1",
  offering_id: "off_1",
  razorpay_order_id: "order_1",
  razorpay_payment_id: "pay_1",
  status: "captured",
  total_inr: 999,
  payment_type: null,
  application_id: null,
  bump_offering_ids: [],
  notes: {},
  captured_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
};

async function deliverWebhook() {
  const body = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 99900 } } },
  });
  const signature = await hmacSha256Hex(body, "whsec");
  return webhook(new Request("https://fn.local/razorpay-webhook", { method: "POST", body, headers: { "x-razorpay-signature": signature } }));
}

function callVerify(extra: Record<string, unknown> = {}) {
  return verify(
    new Request("https://fn.local/verify-razorpay-payment", {
      method: "POST",
      body: JSON.stringify({
        razorpay_payment_id: "pay_1",
        razorpay_order_id: "order_1",
        razorpay_signature: "sig",
        payment_order_id: "po_1",
        is_guest: true,
        ...extra,
      }),
    }),
  );
}

const statusCheck = () =>
  verify(
    new Request("https://fn.local/verify-razorpay-payment", {
      method: "POST",
      body: JSON.stringify({ payment_order_id: "po_1", is_guest: true, status_check: true }),
    }),
  );

const enrolmentInserts = () => fake.state.inserts.filter((i) => i.table === "enrolments");

beforeEach(() => {
  fake.schedule.mockClear();
  fake.state.po = { ...baseOrder };
  fake.state.enrolments = [{ id: "enr_1", status: "active" }];
  fake.state.insertError = null;
  fake.state.readError = null;
  fake.state.inserts = [];
  fake.state.enrolmentReads = [];
  fake.state.events = [];
});

describe("post-capture after an already-captured order", () => {
  it("the webhook starts it when no one has claimed it", async () => {
    const res = await deliverWebhook();
    expect(res.status).toBe(200);
    expect(fake.schedule).toHaveBeenCalledTimes(1);
    expect(fake.schedule).toHaveBeenCalledWith(fake.admin, "po_1", { source: "razorpay-webhook" });
    expect(enrolmentInserts()).toHaveLength(0);
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

  it("neither starts it for an order captured more than 48 hours ago, but both still answer", async () => {
    fake.state.po = { ...baseOrder, captured_at: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString() };
    expect((await deliverWebhook()).status).toBe(200);
    expect(await (await callVerify()).json()).toEqual({ success: true, already_captured: true });
    fake.state.po = { ...baseOrder, captured_at: null };
    await deliverWebhook();
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("leaves staged cohort payments and parked orders alone", async () => {
    fake.state.enrolments = [];
    fake.state.po = { ...baseOrder, payment_type: "app_fee", application_id: "app_1" };
    await deliverWebhook();
    expect(await (await callVerify()).json()).toEqual({ success: true, already_captured: true });
    fake.state.po = { ...baseOrder, status: "needs_review" };
    await deliverWebhook();
    expect(fake.schedule).not.toHaveBeenCalled();
    expect(enrolmentInserts()).toHaveLength(0);
    expect(fake.state.enrolmentReads).toHaveLength(0);
  });
});

describe("a captured order whose course was never granted", () => {
  beforeEach(() => {
    fake.state.enrolments = [];
  });

  it("verify grants the course before it answers success and starts post-capture", async () => {
    const res = await callVerify();
    expect(await res.json()).toEqual({ success: true, already_captured: true });
    expect(enrolmentInserts()[0].row).toEqual({
      user_id: "user_1",
      offering_id: "off_1",
      payment_order_id: "po_1",
      status: "active",
      source: "checkout",
      application_id: null,
      total_paid_inr: 999,
    });
    expect(fake.state.events.indexOf("insert:enrolments")).toBeLessThan(fake.state.events.indexOf("schedule"));
    expect(fake.state.enrolmentReads[0]).toEqual({ offering_id: "off_1", or: "payment_order_id.eq.po_1,user_id.eq.user_1" });
  });

  it("the webhook grants the course before it starts post-capture", async () => {
    const res = await deliverWebhook();
    expect(res.status).toBe(200);
    expect(enrolmentInserts()).toHaveLength(1);
    expect(fake.state.events).toEqual(["insert:enrolments", "insert:enrolment_audit_log", "schedule"]);
  });

  it("a concurrent grant (23505 on enrolments_unique_active) counts as granted", async () => {
    fake.state.insertError = { code: "23505", message: 'duplicate key value violates unique constraint "enrolments_unique_active"' };
    expect(await (await callVerify()).json()).toEqual({ success: true, already_captured: true });
    expect(fake.schedule).toHaveBeenCalledTimes(1);
  });

  it("when the grant fails, verify does not report success or start post-capture", async () => {
    fake.state.insertError = { code: "XX000", message: "boom" };
    const res = await callVerify();
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBeUndefined();
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("when the grant fails, the webhook answers 500 so Razorpay delivers again, and starts nothing", async () => {
    fake.state.insertError = { code: "XX000", message: "boom" };
    expect((await deliverWebhook()).status).toBe(500);
    fake.state.insertError = null;
    fake.state.readError = { code: "XX000", message: "read failed" };
    expect((await deliverWebhook()).status).toBe(500);
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("a course that was revoked is not granted again, and nothing reports success", async () => {
    fake.state.enrolments = [{ id: "enr_1", status: "revoked" }];
    const res = await callVerify();
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ success: false, needs_review: true });
    const wh = await deliverWebhook();
    expect(wh.status).toBe(200);
    expect(await wh.json()).toMatchObject({ received: true, course: "taken_away" });
    expect(enrolmentInserts()).toHaveLength(0);
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("the status check reads it as needs_review, and as captured once the course is granted", async () => {
    expect(await (await statusCheck()).json()).toEqual({ status: "needs_review" });
    fake.state.enrolments = [{ id: "enr_1", status: "active" }];
    expect(await (await statusCheck()).json()).toEqual({ status: "captured", razorpay_payment_id: "pay_1" });
    expect(enrolmentInserts()).toHaveLength(0);
    expect(fake.schedule).not.toHaveBeenCalled();
  });
});

describe("postCaptureRecoverable", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it("is true only for an unclaimed order captured in the last 48 hours", () => {
    expect(postCaptureRecoverable({ notes: {}, captured_at: ago(60 * 1000) }, now)).toBe(true);
    expect(postCaptureRecoverable({ notes: {}, captured_at: ago(POST_CAPTURE_RECOVERY_MS) }, now)).toBe(true);
    expect(postCaptureRecoverable({ notes: {}, captured_at: ago(POST_CAPTURE_RECOVERY_MS + 1) }, now)).toBe(false);
    expect(postCaptureRecoverable({ notes: {}, captured_at: null }, now)).toBe(false);
    expect(postCaptureRecoverable({ notes: {}, captured_at: "not a date" }, now)).toBe(false);
    expect(
      postCaptureRecoverable({ notes: { post_capture: { claimed_at: ago(1000) } }, captured_at: ago(60 * 1000) }, now),
    ).toBe(false);
  });
});
