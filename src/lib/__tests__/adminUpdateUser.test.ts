import { describe, expect, it } from "vitest";
import { updateUserContact } from "../../../supabase/functions/admin-update-user/handler";

/**
 * Drives the admin-update-user handler with a scripted fake of the service-role
 * client. Each case is one of the failure modes the pre-ship council found in
 * the first cut, so a regression here is a real production bug, not a style nit.
 */

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };

function fakeAdmin(opts: {
  profile: Record<string, unknown> | null;
  auth?: { phone?: string | null; email?: string | null; user_metadata?: Record<string, unknown> } | null;
  clashes?: Array<Record<string, unknown>>;
  authFinds?: Array<{ id: string }>;
  legacyCount?: number;
  profileUpdateError?: string;
  authUpdateError?: string;
}) {
  const calls: Call[] = [];
  const authUpdates: Array<{ id: string; attrs: Record<string, unknown> }> = [];
  function from(table: string) {
    const state: Call = { table, op: "select", filters: [] };
    const b: Record<string, unknown> = {};
    const chain = (col?: string, v?: unknown) => { if (col) state.filters.push([col, v]); return b; };
    Object.assign(b, {
      select: () => b,
      eq: chain, neq: chain, in: chain, ilike: chain, is: chain, or: chain, limit: () => b,
      update: (p: unknown) => { state.op = "update"; state.payload = p; calls.push(state); return b; },
      insert: (p: unknown) => { state.op = "insert"; state.payload = p; calls.push(state); return b; },
      maybeSingle: () => Promise.resolve({ data: table === "users" ? opts.profile : null, error: null }),
      then: (ok: (v: unknown) => unknown) => {
        let res: unknown;
        if (state.op === "update") res = { error: table === "users" && opts.profileUpdateError ? { message: opts.profileUpdateError } : null };
        else if (state.op === "insert") res = { error: null };
        else if (table === "legacy_enrolments") res = { count: opts.legacyCount ?? 0, error: null };
        else if (table === "users") res = { data: opts.clashes ?? [], error: null };
        else res = { data: [], error: null };
        return Promise.resolve(res).then(ok);
      },
    });
    return b;
  }
  const admin = {
    from,
    rpc: async () => ({ data: opts.authFinds ?? [], error: null }),
    auth: { admin: {
      getUserById: async () => ({ data: { user: opts.auth === null ? null : { id: "u1", phone: opts.auth?.phone ?? null, email: opts.auth?.email ?? null, user_metadata: opts.auth?.user_metadata ?? {} } }, error: null }),
      updateUserById: async (id: string, attrs: Record<string, unknown>) => {
        authUpdates.push({ id, attrs });
        return { data: null, error: opts.authUpdateError ? { message: opts.authUpdateError } : null };
      },
    } },
  };
  return { admin, calls, authUpdates };
}

const owner = { id: "owner-1", role: "owner" };
const admin1 = { id: "admin-1", role: "admin" };
const bareProfile = { id: "u1", full_name: "Asha", email: "asha@x.com", phone: "919876543210", bio: null, role: "student" };

describe("admin-update-user handler", () => {
  it("does NOT treat a bare '91…' profile phone as a change when the digits match auth (bio-only save)", async () => {
    const f = fakeAdmin({ profile: bareProfile, auth: { phone: "919876543210", email: "asha@x.com" } });
    const out = await updateUserContact(f.admin, admin1, { user_id: "u1", bio: "new bio", phone: "919876543210", email: "asha@x.com" });
    expect(out.ok).toBe(true);
    expect(f.authUpdates).toEqual([]);
    const upd = f.calls.find((c) => c.op === "update")!;
    expect(upd.payload).toEqual({ bio: "new bio" });
    const audit = f.calls.find((c) => c.table === "admin_audit_logs")!.payload as { metadata: { changed: string[] } };
    expect(audit.metadata.changed).toEqual(["bio"]);
  });

  it("is a no-op (no writes, no audit) when nothing differs on canonical digits", async () => {
    const f = fakeAdmin({ profile: bareProfile, auth: { phone: "919876543210", email: "asha@x.com" } });
    const out = await updateUserContact(f.admin, admin1, { user_id: "u1", phone: "+91 98765 43210" });
    expect(out).toMatchObject({ ok: true, changed: [] });
    expect(f.calls.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("a real phone change writes the profile FIRST, then auth (pre-confirmed), and audits from→to", async () => {
    const f = fakeAdmin({ profile: bareProfile, auth: { phone: "919876543210", email: "asha@x.com" } });
    const out = await updateUserContact(f.admin, admin1, { user_id: "u1", phone: "7911123456", country_code: "44" });
    expect(out).toMatchObject({ ok: true, changed: ["phone"] });
    const order = f.calls.filter((c) => c.op === "update").map((c) => c.table);
    expect(order).toEqual(["users"]);
    expect(f.calls.find((c) => c.op === "update")!.payload).toEqual({ phone: "+447911123456" });
    expect(f.authUpdates).toEqual([{ id: "u1", attrs: { phone: "447911123456", phone_confirm: true } }]);
    const audit = f.calls.find((c) => c.table === "admin_audit_logs")!.payload as { action: string; metadata: { from: unknown; to: unknown } };
    expect(audit.action).toBe("user.update_contact");
    expect(audit.metadata.to).toMatchObject({ phone: "+447911123456" });
  });

  it("moves a phone-only account's placeholder email along with the phone", async () => {
    const f = fakeAdmin({ profile: { ...bareProfile, email: null }, auth: { phone: "919876543210", email: "919876543210@phone.leveluplearning.in" } });
    await updateUserContact(f.admin, admin1, { user_id: "u1", phone: "+919000000001" });
    expect(f.authUpdates[0].attrs).toEqual({ phone: "919000000001", phone_confirm: true, email: "919000000001@phone.leveluplearning.in", email_confirm: true });
  });

  it("reverts the profile and audits the failure when the auth write fails — no drift left behind", async () => {
    const f = fakeAdmin({ profile: bareProfile, auth: { phone: "919876543210", email: "asha@x.com" }, authUpdateError: "Phone already registered" });
    const out = await updateUserContact(f.admin, admin1, { user_id: "u1", phone: "+919000000001" });
    expect(out).toMatchObject({ ok: false, code: "failed" });
    expect((out as { error: string }).error).toMatch(/already registered to another login/);
    const updates = f.calls.filter((c) => c.op === "update").map((c) => c.payload);
    expect(updates).toEqual([{ phone: "+919000000001" }, { phone: "919876543210" }]);
    const audit = f.calls.find((c) => c.table === "admin_audit_logs")!.payload as { action: string };
    expect(audit.action).toBe("user.update_contact_failed");
  });

  it("refuses when the new number already belongs to another profile (any stored form) — before any write", async () => {
    const f = fakeAdmin({ profile: bareProfile, auth: { phone: "919876543210" }, clashes: [{ id: "u2", full_name: "Ravi" }] });
    const out = await updateUserContact(f.admin, admin1, { user_id: "u1", phone: "9000000001" });
    expect(out).toMatchObject({ ok: false, code: "conflict", error: "+919000000001 already belongs to Ravi" });
    expect(f.calls.filter((c) => c.op !== "select")).toEqual([]);
    const clashQ = f.calls.length; expect(clashQ).toBe(0); // clash lookups are selects (not recorded as writes)
  });

  it("refuses when an auth-only account already holds the new email", async () => {
    const f = fakeAdmin({ profile: bareProfile, auth: { phone: "919876543210", email: "asha@x.com" }, authFinds: [{ id: "u9" }] });
    const out = await updateUserContact(f.admin, admin1, { user_id: "u1", email: "taken@x.com" });
    expect(out).toMatchObject({ ok: false, code: "conflict" });
  });

  it("asks for confirmation when the new identity has unclaimed TagMango purchases, then proceeds once confirmed", async () => {
    const mk = () => fakeAdmin({ profile: bareProfile, auth: { phone: "919876543210", email: "asha@x.com" }, legacyCount: 3 });
    const a = mk();
    const first = await updateUserContact(a.admin, admin1, { user_id: "u1", phone: "+919000000001" });
    expect(first).toMatchObject({ ok: false, code: "needs_confirmation", legacy_purchases: 3 });
    expect(a.calls.filter((c) => c.op !== "select")).toEqual([]);
    const b = mk();
    const second = await updateUserContact(b.admin, admin1, { user_id: "u1", phone: "+919000000001", confirm_legacy_claim: true });
    expect(second).toMatchObject({ ok: true, changed: ["phone"] });
  });

  it("only an owner may edit an owner; only an owner may change another admin's login fields", async () => {
    const asOwnerTarget = fakeAdmin({ profile: { ...bareProfile, role: "owner" }, auth: { phone: "919876543210" } });
    expect(await updateUserContact(asOwnerTarget.admin, admin1, { user_id: "u1", full_name: "X" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(asOwnerTarget.calls.filter((c) => c.op !== "select")).toEqual([]);

    const asAdminTarget = fakeAdmin({ profile: { ...bareProfile, id: "u1", role: "admin" }, auth: { phone: "919876543210" } });
    expect(await updateUserContact(asAdminTarget.admin, admin1, { user_id: "u1", phone: "+919000000001" })).toMatchObject({ ok: false, code: "forbidden" });
    // …but an admin may still fix another admin's display name.
    expect(await updateUserContact(asAdminTarget.admin, admin1, { user_id: "u1", full_name: "Renamed" })).toMatchObject({ ok: true, changed: ["full_name"] });

    const byOwner = fakeAdmin({ profile: { ...bareProfile, role: "owner" }, auth: { phone: "919876543210" } });
    expect(await updateUserContact(byOwner.admin, owner, { user_id: "u1", phone: "+919000000001" })).toMatchObject({ ok: true });
  });

  it("rejects clearing a phone, a bad number, an invalid or placeholder email", async () => {
    const f = () => fakeAdmin({ profile: bareProfile, auth: { phone: "919876543210", email: "asha@x.com" } });
    expect(await updateUserContact(f().admin, admin1, { user_id: "u1", phone: "" })).toMatchObject({ ok: false, code: "bad_request" });
    expect(await updateUserContact(f().admin, admin1, { user_id: "u1", phone: "12" })).toMatchObject({ ok: false, code: "bad_request" });
    expect(await updateUserContact(f().admin, admin1, { user_id: "u1", email: "nope" })).toMatchObject({ ok: false, code: "bad_request" });
    expect(await updateUserContact(f().admin, admin1, { user_id: "u1", email: "919@phone.leveluplearning.in" })).toMatchObject({ ok: false, code: "bad_request" });
  });
});
