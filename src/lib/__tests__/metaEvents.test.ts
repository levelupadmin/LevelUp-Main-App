import { describe, it, expect } from "vitest";
import {
  addPaymentInfoEventId,
  contentCategoryForTier,
  normalizeEmailForMeta,
  normalizePhoneForMeta,
  purchaseEventId,
} from "@shared/metaEvents";

describe("metaEvents", () => {
  it("names the masterclass category the custom conversion keys on", () => {
    expect(contentCategoryForTier("masterclass")).toBe("Masterclass");
    expect(contentCategoryForTier(" Masterclass ")).toBe("Masterclass");
    expect(contentCategoryForTier("live_cohort")).toBe("Live Cohort");
    expect(contentCategoryForTier(null)).toBe("Course");
    expect(contentCategoryForTier("something_new")).toBe("Course");
  });

  it("builds one Purchase event id for browser and server", () => {
    expect(purchaseEventId("pay_ABC123")).toBe("purchase_pay_ABC123");
    expect(addPaymentInfoEventId("8b1c")).toBe("api_8b1c");
  });

  it("normalises email for matching and drops the phone placeholder address", () => {
    expect(normalizeEmailForMeta("  Buyer@Example.COM ")).toBe("buyer@example.com");
    expect(normalizeEmailForMeta("919876543210@phone.leveluplearning.in")).toBeNull();
    expect(normalizeEmailForMeta("")).toBeNull();
    expect(normalizeEmailForMeta(null)).toBeNull();
  });

  it("normalises phone to digits with the country code", () => {
    expect(normalizePhoneForMeta("+91 98765 43210")).toBe("919876543210");
    expect(normalizePhoneForMeta("9876543210")).toBe("919876543210");
    expect(normalizePhoneForMeta("919876543210")).toBe("919876543210");
    expect(normalizePhoneForMeta("09876543210")).toBe("919876543210");
    expect(normalizePhoneForMeta("123")).toBeNull();
    expect(normalizePhoneForMeta(undefined)).toBeNull();
  });
});
