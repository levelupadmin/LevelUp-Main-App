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
  type Enrolment = { id: string; user_id: string | null; offering_id: string; payment_order_id: string | null; status: string };
  const state = {
    po: {} as Record<string, unknown>,
    /** Every enrolment row; reads apply their filters to it, as PostgREST would. */
    enrolments: [] as Enrolment[],
    /** Error for the next main enrolment insert; a 23505 also adds the concurrent winner's row. */
    insertError: null as null | { code: string; message: string },
    readError: null as null | { code: string; message: string },
    /** Error for writes to payment_orders (the notes.grant_issue marker). */
    poWriteError: null as null | { code: string; message: string },
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    enrolmentReads: [] as Array<Record<string, unknown>>,
    poWrites: [] as Array<Record<string, unknown>>,
    /** Runs once, just before the next payment_orders write lands (a concurrent writer). */
    beforePoWrite: null as null | (() => void),
    events: [] as string[],
  };

  type Filter = (r: Record<string, unknown>) => boolean;
  // "payment_order_id.eq.po_1,user_id.eq.user_1" → a row matches any one part.
  const orFilter = (expr: string): Filter => {
    const parts = expr.split(",").map((p) => {
      const [col, op, ...rest] = p.split(".");
      if (op !== "eq") throw new Error(`fake or() supports eq only: ${p}`);
      return [col, rest.join(".")] as const;
    });
    return (r) => parts.some(([col, val]) => String(r[col]) === val);
  };

  function builder(table: string) {
    let mode: "select" | "insert" | "update" = "select";
    let row: Record<string, unknown> | null = null;
    let patch: Record<string, unknown> | null = null;
    const filters: Record<string, unknown> = {};
    const preds: Filter[] = [];
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.update = (p: Record<string, unknown>) => {
      mode = "update";
      patch = p;
      return b;
    };
    b.insert = (r: Record<string, unknown>) => {
      mode = "insert";
      row = r;
      state.inserts.push({ table, row: r });
      state.events.push(`insert:${table}`);
      return b;
    };
    b.eq = (col: string, val: unknown) => {
      filters[col] = val;
      preds.push((r) => r[col] === val);
      return b;
    };
    b.neq = (col: string, val: unknown) => {
      filters[col] = val;
      preds.push((r) => r[col] !== val);
      return b;
    };
    b.is = (col: string, val: unknown) => {
      filters[col] = val;
      // "notes->>post_capture" reads one key of a jsonb column.
      const [base, key] = col.split("->>");
      preds.push((r) => ((key ? (r[base] as Record<string, unknown> | null)?.[key] : r[col]) ?? null) === val);
      return b;
    };
    b.or = (expr: string) => {
      filters.or = expr;
      preds.push(orFilter(expr));
      return b;
    };
    b.limit = () => b;
    b.order = () => b;
    const matching = () => state.enrolments.filter((r) => preds.every((p) => p(r as Record<string, unknown>)));
    const settle = (): { data: unknown; error: unknown } => {
      if (table === "payment_orders") {
        if (mode === "update") {
          state.poWrites.push(patch!);
          const concurrent = state.beforePoWrite;
          state.beforePoWrite = null;
          concurrent?.();
          if (state.poWriteError) return { data: null, error: state.poWriteError };
          if (!preds.every((p) => p(state.po))) return { data: [], error: null };
          state.po = { ...state.po, ...patch! };
          return { data: [{ id: state.po.id }], error: null };
        }
        return { data: mode === "select" ? state.po : null, error: null };
      }
      if (table === "enrolments" && mode === "insert") {
        // Main course insert (has total_paid_inr) vs bump insert.
        if (row && "total_paid_inr" in row) {
          const err = state.insertError;
          if (err) {
            if (err.code === "23505") {
              state.enrolments.push({
                id: "enr_winner",
                user_id: row.user_id as string,
                offering_id: row.offering_id as string,
                payment_order_id: "po_concurrent",
                status: "active",
              });
            }
            return { data: null, error: err };
          }
          state.enrolments.push({ ...(row as Omit<Enrolment, "id">), id: "enr_new" });
          return { data: { id: "enr_new" }, error: null };
        }
        return { data: null, error: null };
      }
      if (table === "enrolments") {
        state.enrolmentReads.push({ ...filters });
        if (state.readError) return { data: null, error: state.readError };
        return { data: matching(), error: null };
      }
      return { data: null, error: null };
    };
    b.single = () => Promise.resolve(settle());
    b.maybeSingle = () => {
      const r = settle();
      if (table === "enrolments" && Array.isArray(r.data)) {
        return Promise.resolve({ data: r.data[0] ?? null, error: r.error });
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
const grantIssue = () => (fake.state.po.notes as { grant_issue?: Record<string, unknown> } | undefined)?.grant_issue;
const notesWrites = () => fake.state.poWrites.filter((w) => "notes" in w);

/** An enrolment row in the order's course, for its buyer, unless overridden. */
const enrolment = (over: Record<string, unknown>) => ({
  id: "enr_1",
  user_id: "user_1",
  offering_id: "off_1",
  payment_order_id: "po_1",
  status: "active",
  ...over,
}) as (typeof fake.state.enrolments)[number];

// Rows that belong to someone else or to another course. A read that ignored
// its filters would see them.
const strangers = () => [
  enrolment({ id: "enr_other_buyer", user_id: "user_2", payment_order_id: "po_9", status: "revoked" }),
  enrolment({ id: "enr_other_course", offering_id: "off_2", payment_order_id: "po_8", status: "cancelled" }),
];

beforeEach(() => {
  fake.schedule.mockClear();
  fake.state.po = { ...baseOrder };
  fake.state.enrolments = [enrolment({}), ...strangers()];
  fake.state.insertError = null;
  fake.state.readError = null;
  fake.state.poWriteError = null;
  fake.state.inserts = [];
  fake.state.enrolmentReads = [];
  fake.state.poWrites = [];
  fake.state.beforePoWrite = null;
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

  it("a free captured order schedules nothing, whatever proof a caller sends", async () => {
    // guest-create-order writes a free order "captured" with no payment and
    // returns its id; verify's captured return checks no payment proof.
    fake.state.po = { ...baseOrder, total_inr: 0, razorpay_payment_id: null, razorpay_order_id: null };
    const res = await callVerify({ razorpay_payment_id: "pay_junk", razorpay_order_id: "order_junk", razorpay_signature: "junk" });
    expect(await res.json()).toEqual({ success: true, already_captured: true });
    expect(fake.schedule).not.toHaveBeenCalled();
    expect(enrolmentInserts()).toHaveLength(0);
    expect(fake.state.enrolmentReads).toHaveLength(0);
    expect(fake.state.poWrites).toHaveLength(0);
  });

  it("an order with a total but no payment id, or a payment id but a zero total, schedules nothing", async () => {
    fake.state.po = { ...baseOrder, razorpay_payment_id: null };
    await callVerify();
    fake.state.po = { ...baseOrder, total_inr: "0.00" };
    await callVerify();
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("leaves staged cohort payments and parked orders alone", async () => {
    fake.state.enrolments = strangers();
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
    fake.state.enrolments = strangers();
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

  it("a course this order granted and then lost is not granted again; the order says so", async () => {
    fake.state.enrolments = [enrolment({ status: "revoked" }), ...strangers()];
    const res = await callVerify();
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ success: false, needs_review: true });
    expect(grantIssue()).toMatchObject({ reason: "taken_away", source: "verify" });
    expect(typeof grantIssue()!.at).toBe("string");
    const wh = await deliverWebhook();
    expect(wh.status).toBe(200);
    expect(await wh.json()).toMatchObject({ received: true, course: "taken_away", recorded: "notes.grant_issue" });
    // Written once: the webhook found the marker and left it.
    expect(notesWrites()).toHaveLength(1);
    expect(enrolmentInserts()).toHaveLength(0);
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("a buyer refunded on an earlier order who buys again gets the course", async () => {
    fake.state.enrolments = [
      enrolment({ id: "enr_old", payment_order_id: "po_0", status: "cancelled" }),
      enrolment({ id: "enr_older", payment_order_id: "po_00", status: "expired" }),
      ...strangers(),
    ];
    expect(await (await callVerify()).json()).toEqual({ success: true, already_captured: true });
    expect(enrolmentInserts()[0].row).toMatchObject({ user_id: "user_1", offering_id: "off_1", payment_order_id: "po_1", status: "active" });
    expect(fake.schedule).toHaveBeenCalledTimes(1);
    expect(grantIssue()).toBeUndefined();
    // The webhook now finds the active row and grants nothing more.
    const wh = await deliverWebhook();
    expect(await wh.json()).toEqual({ received: true, status: "captured" });
    expect(enrolmentInserts()).toHaveLength(1);
  });

  it("the webhook grants it too when verify never came back", async () => {
    fake.state.enrolments = [enrolment({ id: "enr_old", payment_order_id: "po_0", status: "cancelled" }), ...strangers()];
    const wh = await deliverWebhook();
    expect(await wh.json()).toEqual({ received: true, status: "captured" });
    expect(enrolmentInserts()).toHaveLength(1);
    expect(fake.state.events).toEqual(["insert:enrolments", "insert:enrolment_audit_log", "schedule"]);
  });

  it("the webhook grants it to a buyer refunded on an earlier order even before the row has its payment id", async () => {
    // The delivery is signed by Razorpay for this order, so only this order's
    // own rows can block the grant.
    fake.state.po = { ...baseOrder, razorpay_payment_id: null };
    fake.state.enrolments = [enrolment({ id: "enr_old", payment_order_id: "po_0", status: "cancelled" }), ...strangers()];
    expect(await (await deliverWebhook()).json()).toEqual({ received: true, status: "captured" });
    expect(enrolmentInserts()).toHaveLength(1);
    expect(grantIssue()).toBeUndefined();
  });

  it("an order with no buyer is written down for a person before the webhook acknowledges it", async () => {
    fake.state.po = { ...baseOrder, user_id: null };
    const wh = await deliverWebhook();
    expect(wh.status).toBe(200);
    expect(await wh.json()).toMatchObject({ course: "no_user", recorded: "notes.grant_issue" });
    expect(grantIssue()).toMatchObject({ reason: "no_user", source: "razorpay-webhook" });
    expect(fake.state.enrolmentReads[0]).toEqual({ offering_id: "off_1", payment_order_id: "po_1" });
    expect(enrolmentInserts()).toHaveLength(0);
  });

  it("the webhook answers 500 when it cannot write the refusal down, so Razorpay delivers again", async () => {
    fake.state.enrolments = [enrolment({ status: "revoked" }), ...strangers()];
    fake.state.poWriteError = { code: "XX000", message: "write failed" };
    expect((await deliverWebhook()).status).toBe(500);
    fake.state.poWriteError = null;
    const wh = await deliverWebhook();
    expect(wh.status).toBe(200);
    expect(grantIssue()).toMatchObject({ reason: "taken_away" });
  });

  it("the marker never wipes a post-capture claim written between its read and its write", async () => {
    fake.state.enrolments = [enrolment({ status: "revoked" }), ...strangers()];
    const claim = { claimed_at: "2026-10-18T00:00:00Z", source: "verify" };
    fake.state.beforePoWrite = () => {
      fake.state.po = { ...fake.state.po, notes: { ...(fake.state.po.notes as object), post_capture: claim } };
    };
    expect((await deliverWebhook()).status).toBe(200);
    expect(notesWrites()).toHaveLength(2);
    expect(fake.state.po.notes).toMatchObject({ post_capture: claim, grant_issue: { reason: "taken_away" } });
  });

  it("a failed grant is written down, and marked resolved once a retry grants the course", async () => {
    fake.state.insertError = { code: "XX000", message: "boom" };
    expect((await deliverWebhook()).status).toBe(500);
    expect(grantIssue()).toMatchObject({ reason: "insert_failed", source: "razorpay-webhook" });
    expect(grantIssue()!.resolved_at).toBeUndefined();
    fake.state.insertError = null;
    expect((await deliverWebhook()).status).toBe(200);
    expect(grantIssue()).toMatchObject({ reason: "insert_failed", resolved_by: "razorpay-webhook" });
    expect(typeof grantIssue()!.resolved_at).toBe("string");
  });

  it("the status check reads it as needs_review, and as captured once the course is granted", async () => {
    expect(await (await statusCheck()).json()).toEqual({ status: "needs_review" });
    fake.state.enrolments = [enrolment({}), ...strangers()];
    expect(await (await statusCheck()).json()).toEqual({ status: "captured", razorpay_payment_id: "pay_1" });
    expect(enrolmentInserts()).toHaveLength(0);
    expect(fake.schedule).not.toHaveBeenCalled();
  });
});

describe("a free order, asked about with no login", () => {
  // guest-create-order writes a free order captured at creation, credits it to
  // the typed phone's account (skipping its own enrolment when that account
  // has any row in the course) and returns its id. Junk-proof verify and the
  // status check must answer it the same way whatever that account holds, or
  // they tell a stranger whether the person behind a phone number once held
  // the course and lost it.
  const freeOrder = { ...baseOrder, total_inr: 0, razorpay_payment_id: null, razorpay_order_id: null };
  const accounts: Array<[string, Record<string, unknown>, ReturnType<typeof enrolment>[]]> = [
    ["a new phone: the free order's own row", {}, [enrolment({})]],
    ["an account that holds the course from a paid order", {}, [enrolment({ id: "enr_paid", payment_order_id: "po_0" })]],
    ["an account whose earlier row was revoked", {}, [enrolment({ id: "enr_old", payment_order_id: "po_0", status: "revoked" })]],
    ["an account refunded on an earlier order", {}, [enrolment({ id: "enr_old", payment_order_id: "po_0", status: "cancelled" })]],
    ["an account whose row from this order was revoked", {}, [enrolment({ status: "revoked" })]],
    ["an order whose buyer could not be set up", { user_id: null }, []],
  ];

  it("gets the same answer from verify and the status check, and nothing is read or written", async () => {
    const answers: string[] = [];
    for (const [label, over, rows] of accounts) {
      fake.state.po = { ...freeOrder, ...over };
      fake.state.enrolments = [...rows, ...strangers()];
      fake.state.inserts = [];
      fake.state.enrolmentReads = [];
      fake.state.poWrites = [];
      const v = await callVerify({ razorpay_payment_id: "pay_junk", razorpay_order_id: "order_junk", razorpay_signature: "junk" });
      const s = await statusCheck();
      answers.push(`${v.status} ${await v.text()} | ${s.status} ${await s.text()}`);
      expect({ label, reads: fake.state.enrolmentReads, inserts: fake.state.inserts, writes: fake.state.poWrites }).toEqual({
        label,
        reads: [],
        inserts: [],
        writes: [],
      });
    }
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toBe(
      `200 ${JSON.stringify({ success: true, already_captured: true })} | 200 ${JSON.stringify({ status: "captured", razorpay_payment_id: null })}`,
    );
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("an order with a total but no payment id, or a payment id but a zero total, is answered the same way", async () => {
    fake.state.enrolments = [enrolment({ id: "enr_old", payment_order_id: "po_0", status: "revoked" }), ...strangers()];
    for (const po of [{ ...baseOrder, razorpay_payment_id: null }, { ...baseOrder, total_inr: "0.00" }]) {
      fake.state.po = po;
      expect(await (await callVerify()).json()).toEqual({ success: true, already_captured: true });
      expect((await (await statusCheck()).json()).status).toBe("captured");
    }
    expect(fake.state.enrolmentReads).toEqual([]);
    expect(fake.state.inserts).toEqual([]);
    expect(fake.state.poWrites).toEqual([]);
  });
});

describe("postCaptureRecoverable", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const paid = { razorpay_payment_id: "pay_1", total_inr: "999.00" };
  it("is true only for an unclaimed order captured in the last 48 hours", () => {
    expect(postCaptureRecoverable({ ...paid, notes: {}, captured_at: ago(60 * 1000) }, now)).toBe(true);
    expect(postCaptureRecoverable({ ...paid, notes: {}, captured_at: ago(POST_CAPTURE_RECOVERY_MS) }, now)).toBe(true);
    expect(postCaptureRecoverable({ ...paid, notes: {}, captured_at: ago(POST_CAPTURE_RECOVERY_MS + 1) }, now)).toBe(false);
    expect(postCaptureRecoverable({ ...paid, notes: {}, captured_at: null }, now)).toBe(false);
    expect(postCaptureRecoverable({ ...paid, notes: {}, captured_at: "not a date" }, now)).toBe(false);
    expect(
      postCaptureRecoverable({ ...paid, notes: { post_capture: { claimed_at: ago(1000) } }, captured_at: ago(60 * 1000) }, now),
    ).toBe(false);
  });

  it("is false for an order with no Razorpay payment or a total of 0", () => {
    const recent = { notes: {}, captured_at: ago(60 * 1000) };
    expect(postCaptureRecoverable({ ...recent, razorpay_payment_id: null, total_inr: 0 }, now)).toBe(false);
    expect(postCaptureRecoverable({ ...recent, razorpay_payment_id: null, total_inr: "999.00" }, now)).toBe(false);
    expect(postCaptureRecoverable({ ...recent, razorpay_payment_id: "  ", total_inr: "999.00" }, now)).toBe(false);
    expect(postCaptureRecoverable({ ...recent, razorpay_payment_id: "pay_1", total_inr: "0.00" }, now)).toBe(false);
    expect(postCaptureRecoverable({ ...recent, razorpay_payment_id: "pay_1", total_inr: null }, now)).toBe(false);
    expect(postCaptureRecoverable(recent, now)).toBe(false);
  });
});
