import { describe, it, expect } from "vitest";
import { FRESH_WINDOW_MS, freshAccountLoginEmail, mintSessionForEmail, settleProvenIdentity, type FreshAdmin, type ProveAdmin } from "@shared/guestSession";

/**
 * A guest lands signed in after paying ONLY when this purchase made their
 * account and it holds nothing else. Anything that could hand a stranger an
 * existing account, or claim an old TagMango purchase on a phone nobody
 * proved, must fall back to the sign-in code.
 */

const NOW = Date.parse("2026-11-04T14:00:00Z");
const ORDER = "po_1";

function fake(opts: {
  user?: { id: string; email?: string | null; phone?: string | null; created_at?: string; app_metadata?: Record<string, unknown> | null } | null;
  enrolments?: Array<{ id: string; payment_order_id: string | null }>;
  otherOrders?: Array<{ id: string }>;
  legacyByPhone?: number;
  legacyByEmail?: number;
}) {
  const reads: string[] = [];
  const admin: FreshAdmin = {
    auth: { admin: { getUserById: async () => ({ data: { user: opts.user ?? null }, error: null }) } },
    from: (table: string) => {
      const f: Record<string, unknown> = {};
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "is"]) {
        q[m] = (k: string, v: unknown) => { if (m === "eq") f[k] = v; return q; };
      }
      q.limit = async () => {
        reads.push(table);
        if (table === "enrolments") return { data: opts.enrolments ?? [], error: null };
        if (table === "payment_orders") return { data: opts.otherOrders ?? [], error: null };
        if (table === "legacy_enrolments") {
          const n = "phone" in f ? opts.legacyByPhone ?? 0 : opts.legacyByEmail ?? 0;
          return { data: Array.from({ length: n }, (_, i) => ({ id: `le${i}` })), error: null };
        }
        return { data: [], error: null };
      };
      return q;
    },
  };
  return { admin, reads };
}

const freshUser = {
  id: "u1",
  email: "919876543210@phone.leveluplearning.in",
  phone: "919876543210",
  created_at: new Date(NOW - 60_000).toISOString(),
  app_metadata: { created_by_payment_order: ORDER, identity_unproven: true },
};

describe("freshAccountLoginEmail", () => {
  it("signs in an account made minutes ago that holds only this order", async () => {
    const { admin } = fake({ user: freshUser, enrolments: [{ id: "e1", payment_order_id: ORDER }] });
    expect(await freshAccountLoginEmail(admin, "u1", ORDER, NOW)).toBe(freshUser.email);
  });

  it("never signs in an account this order did not create, however new (an OTP signup, a Tally applicant)", async () => {
    const otp = fake({ user: { ...freshUser, app_metadata: {} } });
    expect(await freshAccountLoginEmail(otp.admin, "u1", ORDER, NOW)).toBeNull();
    const other = fake({ user: { ...freshUser, app_metadata: { created_by_payment_order: "po_other" } } });
    expect(await freshAccountLoginEmail(other.admin, "u1", ORDER, NOW)).toBeNull();
  });

  it("never signs in an older account", async () => {
    const { admin } = fake({ user: { ...freshUser, created_at: new Date(NOW - FRESH_WINDOW_MS - 1000).toISOString() } });
    expect(await freshAccountLoginEmail(admin, "u1", ORDER, NOW)).toBeNull();
  });

  it("never signs in an account that owns anything else", async () => {
    const other = fake({ user: freshUser, enrolments: [{ id: "e1", payment_order_id: ORDER }, { id: "e2", payment_order_id: "po_other" }] });
    expect(await freshAccountLoginEmail(other.admin, "u1", ORDER, NOW)).toBeNull();
    const granted = fake({ user: freshUser, enrolments: [{ id: "e2", payment_order_id: null }] });
    expect(await freshAccountLoginEmail(granted.admin, "u1", ORDER, NOW)).toBeNull();
    const paid = fake({ user: freshUser, otherOrders: [{ id: "po_other" }] });
    expect(await freshAccountLoginEmail(paid.admin, "u1", ORDER, NOW)).toBeNull();
  });

  it("never signs in when an old TagMango purchase waits on the phone or email", async () => {
    const byPhone = fake({ user: freshUser, legacyByPhone: 1 });
    expect(await freshAccountLoginEmail(byPhone.admin, "u1", ORDER, NOW)).toBeNull();
    const intl = { ...freshUser, email: "jo@example.co.uk", phone: null };
    const byEmail = fake({ user: intl, legacyByEmail: 1 });
    expect(await freshAccountLoginEmail(byEmail.admin, "u1", ORDER, NOW)).toBeNull();
    const clean = fake({ user: intl });
    expect(await freshAccountLoginEmail(clean.admin, "u1", ORDER, NOW)).toBe("jo@example.co.uk");
  });

  it("fails closed with no user, no email or no creation time", async () => {
    expect(await freshAccountLoginEmail(fake({ user: null }).admin, "u1", ORDER, NOW)).toBeNull();
    expect(await freshAccountLoginEmail(fake({ user: { ...freshUser, email: null } }).admin, "u1", ORDER, NOW)).toBeNull();
    expect(await freshAccountLoginEmail(fake({ user: { ...freshUser, created_at: undefined } }).admin, "u1", ORDER, NOW)).toBeNull();
  });
});

describe("mintSessionForEmail", () => {
  it("redeems a magic-link code server-side and returns the tokens", async () => {
    const admin = { auth: { admin: { generateLink: async () => ({ data: { properties: { email_otp: "123456", verification_type: "magiclink" } }, error: null }) } } };
    const anon = { auth: { verifyOtp: async () => ({ data: { session: { access_token: "a", refresh_token: "r" } }, error: null }) } };
    expect(await mintSessionForEmail(admin, anon, "x@y.co")).toEqual({ access_token: "a", refresh_token: "r" });
  });
  it("returns null when either step fails", async () => {
    const bad = { auth: { admin: { generateLink: async () => ({ data: null, error: { message: "no" } }) } } };
    const anon = { auth: { verifyOtp: async () => ({ data: { session: null }, error: null }) } };
    expect(await mintSessionForEmail(bad, anon, "x@y.co")).toBeNull();
  });
});

describe("settleProvenIdentity", () => {
  function prove(meta: Record<string, unknown> | null) {
    const calls: string[] = [];
    let saved: Record<string, unknown> | null = null;
    const admin: ProveAdmin = {
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: { id: "u1", app_metadata: meta } }, error: null }),
          updateUserById: async (_id, attrs) => { calls.push("update"); saved = attrs.app_metadata; return { data: null, error: null }; },
          signOut: async (_jwt, scope) => { calls.push(`signOut:${scope}`); return { error: null }; },
        },
      },
    };
    return { admin, calls, saved: () => saved };
  }
  it("on the first verified sign-in to a checkout-made account, signs out every other session and clears the mark", async () => {
    const p = prove({ created_by_payment_order: "po_1", identity_unproven: true });
    await settleProvenIdentity(p.admin, "u1", "jwt");
    expect(p.calls).toEqual(["signOut:others", "update"]);
    expect(p.saved()).toEqual({ created_by_payment_order: "po_1", identity_unproven: false });
  });
  it("does nothing for any other account", async () => {
    const p = prove({ provider: "email" });
    await settleProvenIdentity(p.admin, "u1", "jwt");
    expect(p.calls).toEqual([]);
  });
});
