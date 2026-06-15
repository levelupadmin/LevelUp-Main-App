import { describe, it, expect } from "vitest";
import {
  clampPercent,
  couponDiscountInr,
  gstInr,
  totalInr,
  toPaise,
  couponInvalidReason,
} from "@shared/pricing";

/**
 * The money math the customer is actually charged. These guard the rules that,
 * if they silently change, cost real rupees or surprise a buyer at checkout.
 */

describe("clampPercent", () => {
  it("passes through 0–100", () => {
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(50)).toBe(50);
    expect(clampPercent(100)).toBe(100);
  });
  it("clamps a mis-entered coupon (e.g. 150 or -10)", () => {
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(-10)).toBe(0);
  });
});

describe("couponDiscountInr — percent", () => {
  it("takes the rounded percentage of the base", () => {
    expect(couponDiscountInr("percent", 10, 1000)).toBe(100);
    expect(couponDiscountInr("percent", 15, 999)).toBe(150); // round(149.85)
    expect(couponDiscountInr("percent", 33, 101)).toBe(33); // round(33.33)
  });
  it("clamps percent to 0–100 so it can never exceed the base", () => {
    expect(couponDiscountInr("percent", 150, 1000)).toBe(1000);
    expect(couponDiscountInr("percent", -10, 1000)).toBe(0);
  });
});

describe("couponDiscountInr — flat", () => {
  it("subtracts the flat value", () => {
    expect(couponDiscountInr("flat", 200, 1000)).toBe(200);
  });
  it("never discounts more than the base", () => {
    expect(couponDiscountInr("flat", 2000, 1000)).toBe(1000);
  });
});

describe("gstInr", () => {
  it("extracts GST from an inclusive price", () => {
    // 1180 inclusive of 18% → 180 tax, 1000 net
    expect(gstInr(1180, "inclusive", 18)).toBe(180);
  });
  it("adds GST on an exclusive price", () => {
    expect(gstInr(1000, "exclusive", 18)).toBe(180);
  });
  it("is zero for 'none' or any other mode", () => {
    expect(gstInr(1000, "none", 18)).toBe(0);
    expect(gstInr(1000, null, 18)).toBe(0);
    expect(gstInr(1000, undefined, 18)).toBe(0);
  });
  it("rounds inclusive and exclusive independently (they differ on the same base)", () => {
    // Inclusive extracts: round(100 - 100/1.18) = round(15.2542) = 15.
    // Exclusive adds:     round(100 * 18/100)   = 18.
    expect(gstInr(100, "inclusive", 18)).toBe(15);
    expect(gstInr(100, "exclusive", 18)).toBe(18);
  });
});

describe("totalInr", () => {
  it("adds GST only when exclusive", () => {
    expect(totalInr(1000, "exclusive", 180)).toBe(1180);
  });
  it("leaves the total alone for inclusive / none (tax already inside)", () => {
    expect(totalInr(1180, "inclusive", 180)).toBe(1180);
    expect(totalInr(1000, "none", 0)).toBe(1000);
  });
});

describe("toPaise", () => {
  it("converts rupees to the minor unit Razorpay charges", () => {
    expect(toPaise(1000)).toBe(100000);
    expect(toPaise(1062)).toBe(106200);
    expect(toPaise(99.5)).toBe(9950);
  });
});

describe("couponInvalidReason", () => {
  const now = new Date("2026-06-16T00:00:00Z");
  const OFFERING = "off-1";

  it("returns null for a plain valid coupon", () => {
    expect(couponInvalidReason({}, OFFERING, now)).toBeNull();
  });
  it("flags a coupon that is not yet active", () => {
    expect(couponInvalidReason({ valid_from: "2026-07-01T00:00:00Z" }, OFFERING, now))
      .toBe("not_yet_active");
  });
  it("flags an expired coupon", () => {
    expect(couponInvalidReason({ valid_until: "2026-06-01T00:00:00Z" }, OFFERING, now))
      .toBe("expired");
  });
  it("flags a coupon at its redemption cap", () => {
    expect(couponInvalidReason({ max_redemptions: 5, used_count: 5 }, OFFERING, now))
      .toBe("limit_reached");
    expect(couponInvalidReason({ max_redemptions: 5, used_count: 4 }, OFFERING, now))
      .toBeNull();
  });
  it("treats a null cap as unlimited", () => {
    expect(couponInvalidReason({ max_redemptions: null, used_count: 9999 }, OFFERING, now))
      .toBeNull();
  });
  it("flags a coupon scoped to a different offering", () => {
    expect(couponInvalidReason({ applies_to_offering_id: "off-2" }, OFFERING, now))
      .toBe("not_applicable");
    expect(couponInvalidReason({ applies_to_offering_id: "off-1" }, OFFERING, now))
      .toBeNull();
  });

  it("returns the FIRST failing check when several fail (date → cap → applicability)", () => {
    // Every check fails at once; the order must stay date → cap → applicability,
    // because each caller maps the reason to a different message/behaviour.
    const allBad = {
      valid_from: "2026-07-01T00:00:00Z", // not yet active
      max_redemptions: 5,
      used_count: 5, // over cap
      applies_to_offering_id: "off-2", // wrong offering
    };
    expect(couponInvalidReason(allBad, OFFERING, now)).toBe("not_yet_active");
    // Drop the date problem → cap wins over applicability.
    expect(couponInvalidReason({ max_redemptions: 5, used_count: 5, applies_to_offering_id: "off-2" }, OFFERING, now))
      .toBe("limit_reached");
    // Expired beats cap + applicability too.
    expect(couponInvalidReason({ valid_until: "2026-06-01T00:00:00Z", max_redemptions: 5, used_count: 5, applies_to_offering_id: "off-2" }, OFFERING, now))
      .toBe("expired");
  });
});

describe("the bumps preview seam (documented, intentional)", () => {
  // validate-coupon previews the discount on the base price only; the order
  // paths apply it to price + bumps. They MUST differ when bumps are present —
  // this test pins that intentional behaviour so it can't drift unnoticed.
  it("discounts the base on preview, the full order at checkout", () => {
    const price = 1000;
    const withBump = price + 500;
    const preview = couponDiscountInr("percent", 10, price); // validate-coupon
    const atCheckout = couponDiscountInr("percent", 10, withBump); // create-razorpay-order
    expect(preview).toBe(100);
    expect(atCheckout).toBe(150);
    expect(atCheckout).not.toBe(preview);
  });
});

describe("full pricing pipeline (matches the server order path)", () => {
  it("exclusive GST: price 1000, 10% coupon, 18% GST → ₹1062 / 106200 paise", () => {
    const discount = couponDiscountInr("percent", 10, 1000);
    const afterDiscount = Math.max(1000 - discount, 0);
    const gst = gstInr(afterDiscount, "exclusive", 18);
    const total = totalInr(afterDiscount, "exclusive", gst);
    expect(discount).toBe(100);
    expect(afterDiscount).toBe(900);
    expect(gst).toBe(162);
    expect(total).toBe(1062);
    expect(toPaise(total)).toBe(106200);
  });

  it("inclusive GST: price 1180 incl. 18% → total stays 1180 / 118000 paise", () => {
    const afterDiscount = 1180;
    const gst = gstInr(afterDiscount, "inclusive", 18);
    const total = totalInr(afterDiscount, "inclusive", gst);
    expect(gst).toBe(180);
    expect(total).toBe(1180);
    expect(toPaise(total)).toBe(118000);
  });
});
