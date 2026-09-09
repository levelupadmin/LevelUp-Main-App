import { describe, it, expect } from "vitest";
import {
  canonicalBuyerPhone,
  cleanBuyerEmail,
  resolveOrCreateBuyer,
  type BuyerAdmin,
} from "@shared/buyerIdentity";

/**
 * Regression suite for the 2026-09-09 incident: guest purchases were credited
 * to whichever account had signed up last, because the buyer lookup used
 * GoTrue's /admin/users?email= list (which ignores the filter). The shared
 * helper must (a) never call that endpoint, (b) key identity on the PHONE via
 * find_login_identity, (c) never write anything onto an existing account,
 * (d) create phone-confirmed accounts whose auth email is the synthetic
 * placeholder — the typed, unverified email must never become a login.
 */

type Row = { id: string; email: string | null; phone: string | null };

function fakeAdmin(opts: {
  byPhone?: Row | null;
  /** Returned by the SECOND phone lookup only (simulates a concurrent creator). */
  byPhoneLater?: Row | null;
  byEmail?: Row | null;
  emailOwnedElsewhere?: boolean;
  createError?: { message: string; code?: string } | null;
  newId?: string;
}) {
  const calls: Array<{ kind: string; args: unknown }> = [];
  let phoneLookups = 0;
  const admin: BuyerAdmin = {
    rpc: async (fn, args) => {
      calls.push({ kind: `rpc:${fn}`, args });
      if (fn !== "find_login_identity") return { data: null, error: { message: "unknown rpc" } };
      const a = args as { p_phone: string | null; p_email: string | null };
      if (a.p_phone) {
        phoneLookups += 1;
        const row = phoneLookups >= 2 && opts.byPhoneLater ? opts.byPhoneLater : opts.byPhone;
        return { data: row ? [row] : [], error: null };
      }
      if (a.p_email) return { data: opts.byEmail ? [opts.byEmail] : [], error: null };
      return { data: [], error: null };
    },
    from: (table: string) => {
      let mode: "select" | "update" = "select";
      const filters: Record<string, unknown> = {};
      let patch: unknown = null;
      const chain = {
        select: () => { mode = "select"; return chain; },
        update: (p: unknown) => { mode = "update"; patch = p; return chain; },
        eq: (k: string, v: unknown) => { filters[k] = v; return chain; },
        neq: () => chain,
        limit: async () => {
          calls.push({ kind: `select:${table}:other-owner`, args: filters });
          return { data: opts.emailOwnedElsewhere ? [{ id: "someone-else" }] : [], error: null };
        },
        maybeSingle: async () => {
          calls.push({ kind: `select:${table}`, args: filters });
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => void) => {
          calls.push({ kind: `${mode}:${table}`, args: { filters, patch } });
          resolve({ data: null, error: null });
        },
      };
      return chain;
    },
    auth: {
      admin: {
        createUser: async (attrs) => {
          calls.push({ kind: "createUser", args: attrs });
          if (opts.createError) return { data: { user: null }, error: opts.createError };
          return { data: { user: { id: opts.newId ?? "new-user", email: attrs.email as string } }, error: null };
        },
      },
    },
  };
  return { admin, calls };
}

const input = { name: "Sanjay Kondapally", email: "Sanjay@Example.com", phone: "8688015684" };
const PLACEHOLDER = "918688015684@phone.leveluplearning.in";

describe("canonical inputs", () => {
  it("normalises Indian and international phones to +E.164", () => {
    expect(canonicalBuyerPhone("8688015684")).toBe("+918688015684");
    expect(canonicalBuyerPhone("918688015684")).toBe("+918688015684");
    expect(canonicalBuyerPhone("+91 86880 15684")).toBe("+918688015684");
    expect(canonicalBuyerPhone("+16136173044")).toBe("+16136173044");
    expect(canonicalBuyerPhone("12")).toBeNull();
    expect(canonicalBuyerPhone("")).toBeNull();
  });
  it("lower-cases and validates email", () => {
    expect(cleanBuyerEmail(" Foo@Bar.com ")).toBe("foo@bar.com");
    expect(cleanBuyerEmail("nope")).toBeNull();
  });
});

describe("resolveOrCreateBuyer", () => {
  it("attaches to the account that owns the PHONE and writes NOTHING to it", async () => {
    const { admin, calls } = fakeAdmin({
      byPhone: { id: "owner", email: null, phone: "918688015684" },
    });
    const r = await resolveOrCreateBuyer(admin, input, { tag: "t", paid: true });
    expect(r).toMatchObject({ ok: true, userId: "owner", created: false, matchedBy: "phone" });
    expect(calls.some((c) => c.kind === "createUser")).toBe(false);
    expect(calls.some((c) => c.kind === "update:users")).toBe(false);
    expect(calls[0]).toMatchObject({ kind: "rpc:find_login_identity", args: { p_phone: "+918688015684", p_email: null } });
  });

  it("creates a phone-confirmed account with the PLACEHOLDER auth email; typed email goes on the profile only", async () => {
    const { admin, calls } = fakeAdmin({ byPhone: null });
    const r = await resolveOrCreateBuyer(admin, input, { tag: "t", paid: true });
    expect(r).toMatchObject({ ok: true, userId: "new-user", created: true, matchedBy: "created", loginEmail: PLACEHOLDER });
    const cu = calls.find((c) => c.kind === "createUser") as { args: Record<string, unknown> };
    expect(cu.args).toMatchObject({
      phone: "918688015684",
      phone_confirm: true,
      email: PLACEHOLDER,
      email_confirm: true,
      user_metadata: { full_name: "Sanjay Kondapally", phone: "+918688015684" },
    });
    expect(JSON.stringify(cu.args)).not.toContain("sanjay@example.com");
    const upd = calls.find((c) => c.kind === "update:users") as { args: { patch: Record<string, unknown> } };
    expect(upd.args.patch).toEqual({ email: "sanjay@example.com" });
  });

  it("on an UNPAID call (₹0 guest order) nothing typed is written to the profile", async () => {
    const { admin, calls } = fakeAdmin({ byPhone: null });
    const r = await resolveOrCreateBuyer(admin, input, { tag: "t", paid: false });
    expect(r).toMatchObject({ ok: true, created: true, loginEmail: PLACEHOLDER });
    expect(calls.some((c) => c.kind === "update:users")).toBe(false);
  });

  it("leaves the profile email alone when another profile already carries the typed address", async () => {
    const { admin, calls } = fakeAdmin({ byPhone: null, emailOwnedElsewhere: true });
    await resolveOrCreateBuyer(admin, input, { tag: "t", paid: true });
    expect(calls.some((c) => c.kind === "update:users")).toBe(false);
  });

  it("does NOT adopt an account that matches only by email when a phone is present", async () => {
    const { admin, calls } = fakeAdmin({
      byPhone: null,
      byEmail: { id: "email-only", email: "sanjay@example.com", phone: null },
    });
    const r = await resolveOrCreateBuyer(admin, input, { tag: "t", paid: true });
    expect(r).toMatchObject({ ok: true, created: true, userId: "new-user" });
    expect(calls.some((c) => c.kind === "rpc:find_login_identity" && (c.args as { p_email: string | null }).p_email)).toBe(false);
  });

  it("falls back to an email match only when the order carries no phone", async () => {
    const { admin } = fakeAdmin({ byEmail: { id: "email-acct", email: "sanjay@example.com", phone: null } });
    const r = await resolveOrCreateBuyer(admin, { ...input, phone: null }, { tag: "t", paid: true });
    expect(r).toMatchObject({ ok: true, userId: "email-acct", matchedBy: "email" });
  });

  it("attaches to the concurrently created account when createUser loses the webhook/verify race", async () => {
    const { admin, calls } = fakeAdmin({
      byPhone: null,
      byPhoneLater: { id: "made-by-webhook", email: PLACEHOLDER, phone: "918688015684" },
      createError: { message: "A user with this phone number has already been registered", code: "phone_exists" },
    });
    const r = await resolveOrCreateBuyer(admin, input, { tag: "t", paid: true });
    expect(r).toMatchObject({ ok: true, userId: "made-by-webhook", created: false, matchedBy: "phone" });
    expect(calls.filter((c) => c.kind === "createUser")).toHaveLength(1);
    expect(calls.some((c) => c.kind === "update:users")).toBe(false);
  });

  it("fails closed with neither phone nor email, with no phone to create on, and on createUser failure", async () => {
    const { admin } = fakeAdmin({});
    expect((await resolveOrCreateBuyer(admin, { name: "x" }, { tag: "t", paid: true })).ok).toBe(false);
    expect((await resolveOrCreateBuyer(admin, { name: "x", email: "a@b.co" }, { tag: "t", paid: true })).ok).toBe(false);
    const { admin: a2 } = fakeAdmin({ createError: { message: "boom" } });
    expect((await resolveOrCreateBuyer(a2, input, { tag: "t", paid: true })).ok).toBe(false);
  });

  it("never calls the GoTrue admin user list", async () => {
    const { admin, calls } = fakeAdmin({ byPhone: null });
    await resolveOrCreateBuyer(admin, input, { tag: "t", paid: true });
    expect(calls.every((c) => !c.kind.includes("admin/users"))).toBe(true);
  });
});
