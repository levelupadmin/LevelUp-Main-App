import { describe, it, expect, vi, beforeEach } from "vitest";
import { readReuseToken, reuseKey, reuseKeyMatches } from "@shared/guestOrderKey";

/**
 * A guest order belongs to the browser that made it. guest-create-order
 * reuses an open order only for the same reuse token and the same name, and
 * verify-razorpay-payment's status check answers a guest only for the token
 * the order was made with. Otherwise anyone who knew a person's phone and
 * email could make an order, have the person's checkout hand it to them to
 * pay, and poll the status check to learn that they bought.
 *
 * Both handlers run here against one in-memory payment_orders table whose
 * reads apply their filters, as PostgREST would.
 */

type Row = Record<string, unknown>;

const fake = vi.hoisted(() => {
  const env = new Map<string, string>([
    ["SUPABASE_URL", "https://ref.supabase.co"],
    ["SUPABASE_SERVICE_ROLE_KEY", "service-role"],
    ["SUPABASE_ANON_KEY", "anon"],
    ["RAZORPAY_KEY_ID", "rzp_test_k"],
    ["RAZORPAY_KEY_SECRET", "rzp_secret"],
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
    orders: [] as Array<Record<string, unknown>>,
    razorpayOrders: 0,
    clock: 0,
  };

  type Pred = (r: Record<string, unknown>) => boolean;
  // "notes->>reuse_key" reads one key of a jsonb column.
  const read = (r: Record<string, unknown>, col: string) => {
    const [base, key] = col.split("->>");
    if (!key) return r[col];
    const obj = r[base];
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
  };

  function builder(table: string) {
    let mode: "select" | "insert" | "update" = "select";
    let row: Record<string, unknown> | null = null;
    let patch: Record<string, unknown> | null = null;
    let limit = Infinity;
    let newestFirst = false;
    const preds: Pred[] = [];
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.insert = (r: Record<string, unknown>) => {
      mode = "insert";
      row = r;
      return b;
    };
    b.update = (p: Record<string, unknown>) => {
      mode = "update";
      patch = p;
      return b;
    };
    b.eq = (col: string, val: unknown) => {
      preds.push((r) => String(read(r, col)) === String(val));
      return b;
    };
    b.is = (col: string, val: unknown) => {
      preds.push((r) => (read(r, col) ?? null) === val);
      return b;
    };
    b.gte = (col: string, val: string) => {
      preds.push((r) => String(read(r, col)) >= val);
      return b;
    };
    b.order = (_col: string, opts?: { ascending?: boolean }) => {
      newestFirst = opts?.ascending === false;
      return b;
    };
    b.limit = (n: number) => {
      limit = n;
      return b;
    };
    const settle = (): { data: unknown; error: unknown } => {
      if (table === "offerings")
        return {
          data: { id: "off_1", title: "Masterclass", price_inr: 999, gst_mode: "inclusive", gst_rate: 18, status: "active", is_public: true },
          error: null,
        };
      if (table === "users") return { data: null, error: null };
      if (table !== "payment_orders") return { data: null, error: null };
      if (mode === "insert") {
        state.clock += 1;
        const created = {
          ...row!,
          id: `po_${state.orders.length + 1}`,
          razorpay_order_id: null,
          razorpay_payment_id: null,
          created_at: new Date(Date.now() + state.clock).toISOString(),
        };
        state.orders.push(created);
        return { data: { id: created.id }, error: null };
      }
      const hits = state.orders.filter((r) => preds.every((p) => p(r)));
      if (mode === "update") {
        for (const r of hits) Object.assign(r, patch!);
        return { data: hits.map((r) => ({ id: r.id })), error: null };
      }
      const sorted = newestFirst ? [...hits].sort((a, z) => String(z.created_at).localeCompare(String(a.created_at))) : hits;
      return { data: sorted.slice(0, limit).map((r) => ({ ...r })), error: null };
    };
    const one = () => {
      const r = settle();
      if (Array.isArray(r.data)) {
        return r.data.length > 0
          ? { data: r.data[0], error: null }
          : { data: null, error: { code: "PGRST116", message: "no rows" } };
      }
      return r;
    };
    b.single = () => Promise.resolve(one());
    b.maybeSingle = () => Promise.resolve(one());
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(settle()).then(ok, bad);
    return b;
  }

  const admin = {
    from: (t: string) => builder(t),
    rpc: (fn: string) =>
      Promise.resolve({ data: fn === "check_and_increment_rate_limit" ? true : null, error: null }),
  };
  return { handlers, state, createClient: () => admin };
});

vi.mock("https://esm.sh/@supabase/supabase-js@2.98.0", () => ({ createClient: fake.createClient }));

await import("../../../supabase/functions/guest-create-order/index.ts");
await import("../../../supabase/functions/verify-razorpay-payment/index.ts");
const [createOrder, verify] = fake.handlers;

const BUYER = "a1".repeat(24);
const PLANTER = "b2".repeat(24);

const buyer = { guest_name: "Asha Rao", guest_email: "asha@example.com", guest_phone: "+919876543210" };

async function create(token: string | null | undefined, over: Record<string, unknown> = {}) {
  const res = await createOrder(
    new Request("https://fn.local/guest-create-order", {
      method: "POST",
      body: JSON.stringify({ offering_id: "off_1", ...buyer, ...over, ...(token === undefined ? {} : { reuse_token: token }) }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Row };
}

async function statusCheck(paymentOrderId: string, token?: string | null) {
  const res = await verify(
    new Request("https://fn.local/verify-razorpay-payment", {
      method: "POST",
      body: JSON.stringify({
        payment_order_id: paymentOrderId,
        is_guest: true,
        status_check: true,
        ...(token === undefined ? {} : { reuse_token: token }),
      }),
    }),
  );
  return { status: res.status, text: await res.text() };
}

const order = (id: unknown) => fake.state.orders.find((o) => o.id === id)!;

beforeEach(() => {
  fake.state.orders = [];
  fake.state.razorpayOrders = 0;
  fake.state.clock = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://api.razorpay.com/v1/orders" && init?.method === "POST") {
        fake.state.razorpayOrders += 1;
        return new Response(JSON.stringify({ id: `order_${fake.state.razorpayOrders}` }), { status: 200 });
      }
      if (/\/v1\/orders\/[^/]+\/payments$/.test(url)) return new Response(JSON.stringify({ items: [] }), { status: 200 });
      return new Response("{}", { status: 404 });
    }),
  );
});

describe("guest order reuse", () => {
  it("the browser that made an order gets it back for the same cart, and can check its status", async () => {
    const first = await create(BUYER);
    const again = await create(BUYER);
    expect(first.status).toBe(200);
    expect(again.body.payment_order_id).toBe(first.body.payment_order_id);
    expect(again.body.razorpay_order_id).toBe(first.body.razorpay_order_id);
    // The same answer shape as a fresh order.
    expect(Object.keys(again.body).sort()).toEqual(Object.keys(first.body).sort());
    expect(again.body.reused).toBeUndefined();
    expect(fake.state.orders).toHaveLength(1);
    expect(fake.state.razorpayOrders).toBe(1);

    const s = await statusCheck(first.body.payment_order_id as string, BUYER);
    expect(s.status).toBe(200);
    expect(JSON.parse(s.text)).toEqual({ status: "none" });
  });

  it("an order planted with another browser's token is neither reused nor readable", async () => {
    // Someone who knows Asha's phone and email makes an order first.
    const planted = await create(PLANTER);
    // Asha's own checkout, in her browser, a minute later.
    const real = await create(BUYER);

    expect(real.status).toBe(200);
    expect(real.body.payment_order_id).not.toBe(planted.body.payment_order_id);
    expect(real.body.razorpay_order_id).not.toBe(planted.body.razorpay_order_id);
    expect(fake.state.orders).toHaveLength(2);

    // Neither browser can read the other's order, and the refusal reads
    // exactly like an id that does not exist.
    const unknown = await statusCheck("po_missing", BUYER);
    expect(unknown.status).toBe(404);
    for (const [id, token] of [
      [planted.body.payment_order_id, BUYER],
      [real.body.payment_order_id, PLANTER],
      [real.body.payment_order_id, undefined],
      [real.body.payment_order_id, null],
      [real.body.payment_order_id, "short"],
    ] as const) {
      expect(await statusCheck(id as string, token)).toEqual(unknown);
    }
    expect((await statusCheck(real.body.payment_order_id as string, BUYER)).status).toBe(200);
  });

  it("a corrected name gets a fresh order that carries it, and that one is reused after", async () => {
    const typo = await create(BUYER, { guest_name: "Asah Rao" });
    const fixed = await create(BUYER);
    expect(fixed.body.payment_order_id).not.toBe(typo.body.payment_order_id);
    expect(order(fixed.body.payment_order_id).guest_name).toBe("Asha Rao");

    const retry = await create(BUYER, { guest_name: "  Asha Rao " });
    expect(retry.body.payment_order_id).toBe(fixed.body.payment_order_id);
    expect(fake.state.razorpayOrders).toBe(2);
  });

  it("other changes to the cart still get a fresh order", async () => {
    const first = await create(BUYER);
    const otherEmail = await create(BUYER, { guest_email: "asha.rao@example.com" });
    const otherPhone = await create(BUYER, { guest_phone: "+919000000001" });
    const ids = new Set([first, otherEmail, otherPhone].map((r) => r.body.payment_order_id));
    expect(ids.size).toBe(3);
  });

  it("a request with no token, or a malformed one, gets a fresh order each time that no guest can read", async () => {
    for (const token of [undefined, null, "short", "x".repeat(200), "has spaces in it, so it is not a token we make"]) {
      fake.state.orders = [];
      const a = await create(token);
      const b = await create(token);
      expect(a.status).toBe(200);
      expect(b.body.payment_order_id).not.toBe(a.body.payment_order_id);
      expect((order(a.body.payment_order_id).notes as Row).reuse_key).toBeUndefined();
      expect((await statusCheck(a.body.payment_order_id as string, token)).status).toBe(404);
      expect((await statusCheck(a.body.payment_order_id as string, BUYER)).status).toBe(404);
    }
  });

  it("keeps a hash of the token on the order, never the token", async () => {
    const res = await create(BUYER);
    const notes = order(res.body.payment_order_id).notes as Row;
    expect(notes.reuse_key).toBe(await reuseKey(BUYER));
    expect(JSON.stringify(fake.state.orders)).not.toContain(BUYER);
    // The attribution notes are still written alongside it.
    expect(notes.attribution).toBeTypeOf("object");
  });
});

describe("guestOrderKey", () => {
  it("accepts only the tokens the checkout makes", () => {
    expect(readReuseToken(BUYER)).toBe(BUYER);
    expect(readReuseToken("A-z_0".repeat(8))).toBe("A-z_0".repeat(8));
    for (const bad of [undefined, null, 42, "", "short", "x".repeat(129), `${BUYER} `, `${BUYER.slice(0, 40)}/../..`]) {
      expect(readReuseToken(bad)).toBeNull();
    }
  });

  it("matches an order only to the key it was made with", async () => {
    const key = await reuseKey(BUYER);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(reuseKeyMatches({ reuse_key: key }, key)).toBe(true);
    expect(reuseKeyMatches({ reuse_key: key }, await reuseKey(PLANTER))).toBe(false);
    expect(reuseKeyMatches({ reuse_key: key }, null)).toBe(false);
    expect(reuseKeyMatches({}, key)).toBe(false);
    expect(reuseKeyMatches(null, key)).toBe(false);
    expect(reuseKeyMatches({ reuse_key: "" }, "")).toBe(false);
  });
});
