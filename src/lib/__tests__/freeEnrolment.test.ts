import { describe, it, expect } from "vitest";
import { bumpAllowed, checkoutRefusal, freeEnrolmentRefusal } from "@shared/freeEnrolment";

describe("freeEnrolmentRefusal", () => {
  it("allows a ₹0 resource pack", () => {
    expect(freeEnrolmentRefusal({ product_tier: "other", tally_form_url: null, payment_mode: "single" })).toBeNull();
    expect(freeEnrolmentRefusal({ product_tier: "workshop", payment_mode: "single" })).toBeNull();
  });

  it("refuses a live cohort priced 0", () => {
    expect(freeEnrolmentRefusal({ product_tier: "live_cohort", payment_mode: "single" })).toMatch(/application/);
  });

  it("refuses any offering with an application form, whatever its tier", () => {
    expect(freeEnrolmentRefusal({ product_tier: "other", tally_form_url: "https://tally.so/r/x" })).toMatch(/application/);
  });

  it("ignores a blank application form url", () => {
    expect(freeEnrolmentRefusal({ product_tier: "other", tally_form_url: "   " })).toBeNull();
  });

  it("refuses staged offerings", () => {
    expect(freeEnrolmentRefusal({ product_tier: "other", payment_mode: "staged" })).toMatch(/applications/);
  });
});

describe("offerings.access (migration 20261106120000)", () => {
  it("lets only Free give it away at ₹0", () => {
    expect(freeEnrolmentRefusal({ product_tier: "workshop", access: "free", price_inr: 0 })).toBeNull();
    expect(freeEnrolmentRefusal({ product_tier: "workshop", access: "team", price_inr: 0 })).toMatch(/team/);
    expect(freeEnrolmentRefusal({ product_tier: "other", access: "apply", price_inr: 0 })).toMatch(/application/);
  });

  it("refuses an unpriced Buy offering, but allows a priced one brought to ₹0 by a coupon", () => {
    expect(freeEnrolmentRefusal({ product_tier: "masterclass", access: "buy", price_inr: 0 })).toMatch(/sale/);
    expect(freeEnrolmentRefusal({ product_tier: "masterclass", access: "buy", price_inr: "2499.00" })).toBeNull();
  });

  it("keeps the old cohort lock whatever access says", () => {
    expect(freeEnrolmentRefusal({ product_tier: "live_cohort", access: "free" })).toMatch(/application/);
  });
});

describe("checkoutRefusal", () => {
  it("opens orders for Buy and Free, and for staged cohort stages", () => {
    expect(checkoutRefusal({ access: "buy" })).toBeNull();
    expect(checkoutRefusal({ access: "free" })).toBeNull();
    expect(checkoutRefusal({ access: "apply", payment_mode: "staged" })).toBeNull();
  });
  it("refuses Team adds and non-staged Apply", () => {
    expect(checkoutRefusal({ access: "team" })).toMatch(/team/);
    expect(checkoutRefusal({ access: "apply", payment_mode: "single" })).toMatch(/application/);
  });
  it("behaves as before for a row without access", () => {
    expect(checkoutRefusal({})).toBeNull();
  });
});

describe("bumpAllowed", () => {
  it("needs a Selling, Buy offering with a price above 0", () => {
    expect(bumpAllowed({ status: "active", access: "buy", price_inr: 199 })).toBe(true);
    expect(bumpAllowed({ status: "archived", access: "buy", price_inr: 199 })).toBe(false);
    expect(bumpAllowed({ status: "active", access: "team", price_inr: 199 })).toBe(false);
    expect(bumpAllowed({ status: "active", access: "buy", price_inr: 0 })).toBe(false);
    expect(bumpAllowed(null)).toBe(false);
  });
  it("uses the add-on price when one is set, and never charges ₹0", () => {
    expect(bumpAllowed({ status: "active", access: "buy", price_inr: 2499 }, 999)).toBe(true);
    expect(bumpAllowed({ status: "active", access: "buy", price_inr: 2499 }, 0)).toBe(false);
  });
});
