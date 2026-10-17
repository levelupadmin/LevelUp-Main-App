import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * guest-create-order runs for anyone who types a phone number (no login). Its
 * answer must not depend on whether the typed phone has an account, or on
 * whether that account owns the course: either would tell a stranger something
 * about the person behind the number. The only identity check left is the
 * email half it has always had (an account found by the typed email, with a
 * different phone, is refused).
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
    rpcCalls: [] as string[],
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
      state.rpcCalls.push(fn);
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

const call = (email = "asha@example.com", phone = "+919876543210") =>
  fake.state.handler!(
    new Request("https://fn.local/guest-create-order", {
      method: "POST",
      body: JSON.stringify({
        offering_id: "off_1",
        guest_name: "Asha Rao",
        guest_email: email,
        guest_phone: phone,
      }),
    }),
  );

beforeEach(() => {
  fake.state.phoneOwner = null;
  fake.state.emailUser = null;
  fake.state.tablesRead = [];
  fake.state.rpcCalls = [];
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

  it("answers a registered phone with a made-up email exactly like an unused phone", async () => {
    const unused = await call("made.up@example.com", "+919000000001");
    const unusedBody = await unused.json();

    // This phone belongs to an account with a real, different email.
    fake.state.phoneOwner = { id: "owner_1", email: "someone.else@example.com" };
    const registered = await call("made.up@example.com", "+919876543210");
    const registeredBody = await registered.json();

    expect(registered.status).toBe(200);
    expect(unused.status).toBe(200);
    expect(Object.keys(registeredBody).sort()).toEqual(Object.keys(unusedBody).sort());
    expect(registeredBody.error).toBeUndefined();
  });

  it("never looks up the typed phone's account", async () => {
    fake.state.phoneOwner = { id: "owner_1", email: "someone.else@example.com" };
    await call();
    expect(fake.state.rpcCalls).not.toContain("find_login_identity");
  });

  it("keeps the email half: an account found by the typed email with another phone is refused", async () => {
    fake.state.emailUser = { id: "acct_e", phone: "+919111111111" };
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/doesn't match the account on file/);

    // The same phone stored as +91… passes, and so does an account with no phone.
    fake.state.emailUser = { id: "acct_e", phone: "+919876543210" };
    expect((await call()).status).toBe(200);
    fake.state.emailUser = { id: "acct_e", phone: null };
    expect((await call()).status).toBe(200);
  });
});
