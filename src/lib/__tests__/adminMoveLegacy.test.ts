import { describe, expect, it } from "vitest";
import { moveLegacyPurchases } from "../../../supabase/functions/admin-update-user/legacy";

/**
 * The admin's "Change number" for a TagMango buyer with no account (founder,
 * 3 Nov 2026). Driven with a scripted fake of the service-role client. The
 * contract: the purchases move to the right number and attach to an account
 * at once, an account the number already signs in to is used only after the
 * admin says yes, and every move is audited with the old number.
 */

type Rpc = { fn: string; args: Record<string, unknown> };

function fakeAdmin(opts: {
  legacyRows?: Array<Record<string, unknown>>;
  authByPhone?: Array<{ id: string; phone: string }>;
  authByEmail?: Array<{ id: string }>;
  profileByPhone?: Array<{ id: string }>;
  existingName?: string | null;
  createError?: string;
  moveResult?: Record<string, number>;
}) {
  const rpcs: Rpc[] = [];
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const created: Array<Record<string, unknown>> = [];
  function from(table: string) {
    let op = "select";
    let payload: Record<string, unknown> = {};
    let byPhone = false;
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b, is: () => b, limit: () => b,
      in: (col: string) => { if (col === "phone") byPhone = true; return b; },
      update: (p: Record<string, unknown>) => { op = "update"; payload = p; updates.push({ table, payload: p }); return b; },
      insert: (p: Record<string, unknown>) => { op = "insert"; payload = p; inserts.push({ table, payload: p }); return b; },
      maybeSingle: () => Promise.resolve({ data: { id: "acct-1", full_name: opts.existingName ?? null }, error: null }),
      then: (ok: (v: unknown) => unknown) => {
        let res: unknown = { data: [], error: null };
        if (op === "select" && table === "legacy_enrolments") res = { data: opts.legacyRows ?? [], error: null };
        else if (op === "select" && table === "users" && byPhone) res = { data: opts.profileByPhone ?? [], error: null };
        else if (op !== "select") res = { error: null };
        void payload;
        return Promise.resolve(res).then(ok);
      },
    });
    return b;
  }
  const admin = {
    from,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      if (fn === "admin_find_auth_user") {
        return { data: args.p_phone ? (opts.authByPhone ?? []).filter((r) => r.phone === args.p_phone) : opts.authByEmail ?? [], error: null };
      }
      if (fn === "admin_move_legacy_purchases") return { data: opts.moveResult ?? { rows: 4, moved: 4, claimed: 3, stamped: 4, blocked: 0 }, error: null };
      return { data: null, error: null };
    },
    auth: { admin: {
      createUser: async (attrs: Record<string, unknown>) => {
        created.push(attrs);
        return opts.createError ? { data: null, error: { message: opts.createError } } : { data: { user: { id: "new-1" } }, error: null };
      },
    } },
  };
  return { admin, rpcs, inserts, updates, created };
}

const actor = { id: "admin-1", role: "admin" };
const gideon = [
  { id: "l1", email: "gideon@example.com", full_name: "Gideon Thevar", offering_id: "o1" },
  { id: "l2", email: "gideon@example.com", full_name: "Gideon Thevar", offering_id: "o2" },
];
const body = { action: "move_legacy" as const, legacy_phone: "+919900000559", phone: "+919930400569" };

describe("moveLegacyPurchases — Change number for a TagMango buyer", () => {
  it("opens an account on the new number, with their name and email, and attaches the purchases", async () => {
    const f = fakeAdmin({ legacyRows: gideon });
    const out = await moveLegacyPurchases(f.admin, actor, body);
    expect(out).toMatchObject({ ok: true, created_account: true, user_id: "new-1", phone: "+919930400569" });
    expect(f.created[0]).toMatchObject({
      phone: "919930400569", phone_confirm: true, email: "gideon@example.com", email_confirm: true,
      user_metadata: { full_name: "Gideon Thevar", provisioned_by_admin: true },
    });
    expect(f.rpcs.find((r) => r.fn === "admin_move_legacy_purchases")?.args).toEqual({
      p_from_phone: "+919900000559", p_to_phone: "+919930400569", p_user_id: "new-1",
    });
    const audit = f.inserts.find((i) => i.table === "admin_audit_logs")!.payload;
    expect(audit).toMatchObject({ action: "legacy.move_number", target_id: "new-1" });
    expect(audit.metadata).toMatchObject({ from_phone: "+919900000559", to_phone: "+919930400569", account: "created" });
  });

  it("leaves their email off when another account already signs in with it", async () => {
    const f = fakeAdmin({ legacyRows: gideon, authByEmail: [{ id: "someone" }] });
    await moveLegacyPurchases(f.admin, actor, body);
    expect(f.created[0].email).toBeUndefined();
    expect(f.created[0].email_confirm).toBe(false);
  });

  it("asks before attaching to an account the number already signs in to", async () => {
    const f = fakeAdmin({ legacyRows: gideon, authByPhone: [{ id: "acct-1", phone: "919930400569" }], existingName: "LevelUp Student" });
    const out = await moveLegacyPurchases(f.admin, actor, body);
    expect(out).toMatchObject({ ok: false, code: "needs_confirmation", account: { id: "acct-1" } });
    expect((out as { error: string }).error).toContain("an account with no name yet");
    expect(f.rpcs.some((r) => r.fn === "admin_move_legacy_purchases")).toBe(false);
    expect(f.created).toHaveLength(0);
  });

  it("attaches to that account once the admin says yes", async () => {
    const f = fakeAdmin({ legacyRows: gideon, authByPhone: [{ id: "acct-1", phone: "919930400569" }] });
    const out = await moveLegacyPurchases(f.admin, actor, { ...body, confirm_existing_account: true });
    expect(out).toMatchObject({ ok: true, created_account: false, user_id: "acct-1" });
    expect(f.created).toHaveLength(0);
    expect(f.rpcs.find((r) => r.fn === "admin_move_legacy_purchases")?.args.p_user_id).toBe("acct-1");
  });

  it("finds a login stored as +91… or as the bare 10 digits", async () => {
    for (const phone of ["+919930400569", "9930400569"]) {
      const f = fakeAdmin({ legacyRows: gideon, authByPhone: [{ id: "acct-2", phone }] });
      expect(await moveLegacyPurchases(f.admin, actor, body)).toMatchObject({ ok: false, code: "needs_confirmation", account: { id: "acct-2" } });
    }
  });

  it("does not treat a number only on someone's profile as their login", async () => {
    const f = fakeAdmin({ legacyRows: gideon, profileByPhone: [{ id: "acct-3" }] });
    expect(await moveLegacyPurchases(f.admin, actor, body)).toMatchObject({ ok: true, created_account: true });
  });

  it("does not match a number abroad to an Indian login with the same last 10 digits", async () => {
    const f = fakeAdmin({ legacyRows: gideon, authByPhone: [{ id: "indian", phone: "917700900123" }, { id: "indian10", phone: "7700900123" }] });
    expect(await moveLegacyPurchases(f.admin, actor, { ...body, phone: "+447700900123" })).toMatchObject({ ok: true, created_account: true });
  });

  it("refuses the same number, a bad number, and a buyer with nothing waiting", async () => {
    expect(await moveLegacyPurchases(fakeAdmin({ legacyRows: gideon }).admin, actor, { ...body, phone: "+919900000559" }))
      .toMatchObject({ ok: false, code: "bad_request" });
    expect(await moveLegacyPurchases(fakeAdmin({ legacyRows: gideon }).admin, actor, { ...body, phone: "12" }))
      .toMatchObject({ ok: false, code: "bad_request" });
    expect(await moveLegacyPurchases(fakeAdmin({ legacyRows: [] }).admin, actor, body))
      .toMatchObject({ ok: false, code: "not_found" });
  });

  it("moves to a number abroad in the +<code> form TagMango rows use", async () => {
    const f = fakeAdmin({ legacyRows: gideon });
    const out = await moveLegacyPurchases(f.admin, actor, { ...body, phone: "+447700900123" });
    expect(out).toMatchObject({ ok: true, phone: "+447700900123" });
    expect(f.created[0].phone).toBe("447700900123");
  });

  it("reports purchases a refunded enrolment kept from attaching", async () => {
    const f = fakeAdmin({ legacyRows: gideon, moveResult: { rows: 2, moved: 2, claimed: 1, stamped: 1, blocked: 1 } });
    expect(await moveLegacyPurchases(f.admin, actor, body)).toMatchObject({ ok: true, rows: 2, blocked: 1 });
  });
});
