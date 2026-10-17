import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * guest-create-order runs for anyone who types a phone number (no login). It
 * must not answer differently depending on whether that phone's account owns
 * the course, and its identity gate must find the phone's account at all
 * (public.users.phone holds "91…"/"+91…", never the bare 10 digits it used to
 * compare against).
 */

type Row = Record<string, unknown> | null;

const fake = vi.hoisted(() => {
  const env = new Map<string, string>([
    ["SUPABASE_URL", "https://ref.supabase.co"],
    ["SUPABASE_SERVICE_ROLE_KEY", "service-role"],
    ["RAZORPAY_KEY_ID", "rzp_test_k"],
    ["RAZORPAY_KEY_SECRET", "rzp_secret"],
  ]);
  const state = {
    handler: null as null | ((req: Request) => Promise<Response>),
    phoneOwner: null as null | { id: string; email: string | null },
    emailUser: null as Row,
    tablesRead: [] as string[],
  };
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (k: string) => env.get(k) },
    serve: (h: (req: Request) => Promise<Response>) => {
      state.handler = h;
      return {};
    },
  };

  function builder(table: string) {
    const filters: Record<string, unknown> = {};
    let selected = "";
    let mode: "select" | "insert" | "update" = "select";
    const result = (): { data: unknown; error: null } => {
      if (table === "offerings")
        return {
          data: { id: "off_1", title: "Masterclass", price_inr: 999, gst_mode: "inclusive", gst_rate: 18, status: "active", is_public: true },
          error: null,
        };
      if (table === "users" && "email" in filters) return { data: state.emailUser, error: null };
      if (table === "users" && "id" in filters)
        return { data: state.phoneOwner ? { email: state.phoneOwner.email } : null, error: null };
      if (table === "payment_orders" && mode === "insert") return { data: { id: "po_new" }, error: null };
      if (table === "payment_orders" && mode === "select") return { data: [], error: null };
      if (table === "enrolments") return { data: [{ id: "enr_1" }], error: null };
      return { data: null, error: null };
    };
    const b: Record<string, unknown> = {};
    b.select = (cols: string) => {
      selected = cols;
      void selected;
      return b;
    };
    b.insert = () => {
      mode = "insert";
      return b;
    };
    b.update = () => {
      mode = "update";
      return b;
    };
    for (const m of ["eq", "is", "gte", "order", "limit", "neq"]) {
      b[m] = (col: string, val: unknown) => {
        if (m === "eq") filters[col] = val;
        return b;
      };
    }
    b.single = () => Promise.resolve(result());
    b.maybeSingle = () => Promise.resolve(result());
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
    return b;
  }

  const admin = {
    from: (t: string) => {
      state.tablesRead.push(t);
      return builder(t);
    },
    rpc: (fn: string) => {
      if (fn === "check_and_increment_rate_limit") return Promise.resolve({ data: true, error: null });
      if (fn === "find_login_identity")
        return Promise.resolve({
          data: state.phoneOwner ? [{ id: state.phoneOwner.id, email: "919876543210@phone.leveluplearning.in", phone: "919876543210" }] : [],
          error: null,
        });
      return Promise.resolve({ data: null, error: null });
    },
    auth: { admin: { createUser: () => Promise.resolve({ data: null, error: { message: "unused" } }) } },
  };
  return { state, createClient: () => admin };
});

vi.mock("https://esm.sh/@supabase/supabase-js@2.98.0", () => ({ createClient: fake.createClient }));

await import("../../../supabase/functions/guest-create-order/index.ts");

const call = (email = "asha@example.com") =>
  fake.state.handler!(
    new Request("https://fn.local/guest-create-order", {
      method: "POST",
      body: JSON.stringify({
        offering_id: "off_1",
        guest_name: "Asha Rao",
        guest_email: email,
        guest_phone: "+919876543210",
      }),
    }),
  );

beforeEach(() => {
  fake.state.phoneOwner = null;
  fake.state.emailUser = null;
  fake.state.tablesRead = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ id: "order_new" }), { status: 200 })),
  );
});

describe("guest-create-order", () => {
  it("answers an owner's phone exactly like anyone else's: a normal order, no ownership lookup", async () => {
    const stranger = await call();
    const strangerBody = await stranger.json();

    fake.state.phoneOwner = { id: "owner_1", email: "asha@example.com" };
    fake.state.tablesRead = [];
    const owner = await call();
    const ownerBody = await owner.json();

    expect(owner.status).toBe(200);
    expect(stranger.status).toBe(200);
    expect(Object.keys(ownerBody).sort()).toEqual(Object.keys(strangerBody).sort());
    expect(ownerBody.razorpay_order_id).toBe("order_new");
    expect(fake.state.tablesRead).not.toContain("enrolments");
  });

  it("finds the phone's account through find_login_identity and stops a different real email", async () => {
    fake.state.phoneOwner = { id: "owner_1", email: "someone.else@example.com" };
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("identity_mismatch");
  });

  it("compares emails case-insensitively and treats a placeholder address as no email", async () => {
    fake.state.phoneOwner = { id: "owner_1", email: "Asha@Example.com" };
    expect((await call()).status).toBe(200);
    fake.state.phoneOwner = { id: "owner_1", email: "919876543210@phone.leveluplearning.in" };
    expect((await call()).status).toBe(200);
    fake.state.phoneOwner = { id: "owner_1", email: null };
    expect((await call()).status).toBe(200);
  });
});
