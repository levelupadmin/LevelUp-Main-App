import { describe, it, expect } from "vitest";
import { freeEnrolmentRefusal } from "@shared/freeEnrolment";

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
