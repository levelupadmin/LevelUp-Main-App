import { describe, it, expect } from "vitest";
import {
  identityKeys,
  decideProvision,
  canClaim,
  type JoinKeys,
} from "@shared/identity";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

/** The join keys a fully-identified applicant produces. */
const bothKeys: JoinKeys = { email: "anu@example.com", phone: "9788385577" };

describe("identityKeys", () => {
  it("lowercases and trims the email", () => {
    expect(identityKeys({ email: "  Anu@Example.COM " }).email).toBe("anu@example.com");
  });

  it("collapses every phone format to the last-10 subscriber digits", () => {
    // Must match _shared/phone.ts and find_login_identity's right(digits, 10).
    for (const raw of ["+919788385577", "919788385577", "9788385577", "+91 97883 85577"]) {
      expect(identityKeys({ phone: raw }).phone).toBe("9788385577");
    }
  });

  it("nulls out blank, missing and too-short values", () => {
    expect(identityKeys({})).toEqual({ email: null, phone: null });
    expect(identityKeys({ email: "   ", phone: "12345" })).toEqual({ email: null, phone: null });
    expect(identityKeys({ email: null, phone: null })).toEqual({ email: null, phone: null });
  });
});

describe("decideProvision truth table", () => {
  it("neither key -> skipped/no_identifier", () => {
    expect(decideProvision({ email: null, phone: null }, {})).toEqual({
      status: "skipped",
      reason: "no_identifier",
    });
  });

  it("nothing found -> created", () => {
    expect(decideProvision(bothKeys, { byEmail: null, byPhone: null })).toEqual({
      status: "created",
      userId: "",
    });
    // An absent `found` is the same statement as an explicitly empty one.
    expect(decideProvision(bothKeys, {}).status).toBe("created");
  });

  it("both keys resolve to the SAME id -> existing", () => {
    expect(
      decideProvision(bothKeys, { byEmail: { id: U1 }, byPhone: { id: U1 } }),
    ).toEqual({ status: "existing", userId: U1 });
  });

  it("email and phone resolve to DIFFERENT ids -> collision/cross_linked", () => {
    expect(
      decideProvision(bothKeys, { byEmail: { id: U1 }, byPhone: { id: U2 } }),
    ).toEqual({ status: "collision", reason: "cross_linked" });
    // Both directions: swapping which side owns which uid changes nothing.
    expect(
      decideProvision(bothKeys, { byEmail: { id: U2 }, byPhone: { id: U1 } }),
    ).toEqual({ status: "collision", reason: "cross_linked" });
  });

  it("only the email is taken -> collision/email_taken", () => {
    expect(
      decideProvision(bothKeys, { byEmail: { id: U1 }, byPhone: null }),
    ).toEqual({ status: "collision", reason: "email_taken" });
  });

  it("only the phone is taken -> collision/phone_taken", () => {
    expect(
      decideProvision(bothKeys, { byEmail: null, byPhone: { id: U2 } }),
    ).toEqual({ status: "collision", reason: "phone_taken" });
  });

  it("`existing` is reachable ONLY from both sides agreeing", () => {
    // A single-identifier applicant whose one identifier is taken is still a
    // collision: the found account is a stranger's until a second OTP says
    // otherwise. There is no carve-out that turns a partial match into a bind.
    expect(
      decideProvision({ email: "anu@example.com", phone: null }, { byEmail: { id: U1 } }),
    ).toEqual({ status: "collision", reason: "email_taken" });
    expect(
      decideProvision({ email: null, phone: "9788385577" }, { byPhone: { id: U2 } }),
    ).toEqual({ status: "collision", reason: "phone_taken" });
  });

  it("an unparseable phone cannot downgrade a collision into a silent bind", () => {
    // The attacker-selectable case: `phoneKey` nulls anything under 10 digits,
    // so a null phone key can mean "not supplied" OR "supplied as junk". Both
    // must decide identically, or an applicant who knows only a victim's email
    // could pick their outcome by submitting "98765" as their number.
    const victimEmail = "victim@example.com";
    const withRealPhone = decideProvision(
      identityKeys({ email: victimEmail, phone: "9876543210" }),
      { byEmail: { id: U1 }, byPhone: null },
    );
    for (const junk of ["98765", "+91", "N/A", "", null]) {
      expect(
        decideProvision(identityKeys({ email: victimEmail, phone: junk }), {
          byEmail: { id: U1 },
        }),
      ).toEqual(withRealPhone);
    }
    expect(withRealPhone).toEqual({ status: "collision", reason: "email_taken" });
  });

  it("ignores a hit on a channel that was never searched", () => {
    // A stale byPhone hit with no phone key must not fabricate a cross_linked.
    expect(
      decideProvision({ email: "anu@example.com", phone: null }, {
        byEmail: { id: U1 },
        byPhone: { id: U2 },
      }),
    ).toEqual({ status: "collision", reason: "email_taken" });
  });

  it("treats an empty uid as no row rather than a match", () => {
    expect(decideProvision(bothKeys, { byEmail: { id: "" }, byPhone: { id: "" } })).toEqual({
      status: "created",
      userId: "",
    });
  });

  it("`created` carries an EMPTY placeholder uid the caller must replace", () => {
    // Pinned for S-2: `created` and `existing` narrow together in TypeScript, so
    // a shared `row.user_id = outcome.userId` branch would write "" into a uuid
    // column. Only `existing` ever carries a usable uid.
    const created = decideProvision(bothKeys, {});
    expect(created).toEqual({ status: "created", userId: "" });
    const existing = decideProvision(bothKeys, { byEmail: { id: U1 }, byPhone: { id: U1 } });
    expect(existing).toEqual({ status: "existing", userId: U1 });
    if (created.status === "created") expect(created.userId).toBe("");
    if (existing.status === "existing") expect(existing.userId).toBe(U1);
  });
});

describe("canClaim", () => {
  const pending = { email: "anu@example.com", phone: "9788385577" };

  it("accepts a matching value on the verified channel", () => {
    expect(canClaim(pending, { channel: "email", value: "anu@example.com" })).toBe(true);
    expect(canClaim(pending, { channel: "phone", value: "9788385577" })).toBe(true);
  });

  it("normalises both sides before comparing", () => {
    expect(canClaim(pending, { channel: "email", value: "  Anu@Example.COM " })).toBe(true);
    expect(canClaim(pending, { channel: "phone", value: "+91 97883 85577" })).toBe(true);
    expect(canClaim({ email: " ANU@example.com ", phone: "+919788385577" }, {
      channel: "phone",
      value: "9788385577",
    })).toBe(true);
  });

  it("rejects a mismatched value on the right channel", () => {
    expect(canClaim(pending, { channel: "email", value: "someone@else.com" })).toBe(false);
    expect(canClaim(pending, { channel: "phone", value: "9000000000" })).toBe(false);
  });

  it("rejects a mismatched channel — a verified phone never satisfies the email side", () => {
    // Value equals the row's OTHER channel: still no claim.
    expect(canClaim(pending, { channel: "phone", value: "anu@example.com" })).toBe(false);
    expect(canClaim(pending, { channel: "email", value: "9788385577" })).toBe(false);
  });

  it("rejects when the pending row has no value for the claimed channel", () => {
    expect(canClaim({ email: null, phone: "9788385577" }, {
      channel: "email",
      value: "anu@example.com",
    })).toBe(false);
    expect(canClaim({ email: "anu@example.com", phone: null }, {
      channel: "phone",
      value: "9788385577",
    })).toBe(false);
  });

  it("does NOT know which channel the caller already proved — S-4 must", () => {
    // Pinned so the limitation can't be discovered in production. canClaim
    // answers "is this the row's value for this channel?" and nothing more.
    // The collision row below pairs a victim's email with the attacker's own
    // phone; the attacker signs in with a genuine OTP on that phone. Replaying
    // the SAME channel here passes, so S-4 must always claim on the channel it
    // has not yet proven (signed in by phone -> claim "email", and vice versa).
    const attackerPhone = "9000000000";
    const collisionRow = { email: "victim@example.com", phone: attackerPhone };
    expect(canClaim(collisionRow, { channel: "phone", value: attackerPhone })).toBe(true);
    // The second channel — the one S-4 must actually demand — still gates it.
    expect(canClaim(collisionRow, { channel: "email", value: "attacker@example.com" })).toBe(
      false,
    );
  });

  it("rejects an empty or unusable verified value", () => {
    expect(canClaim(pending, { channel: "email", value: "   " })).toBe(false);
    expect(canClaim(pending, { channel: "phone", value: "12345" })).toBe(false);
  });
});
