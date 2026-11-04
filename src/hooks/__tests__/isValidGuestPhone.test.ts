import { describe, it, expect } from "vitest";
import { isValidGuestPhone } from "@/hooks/useGuestCheckout";

describe("isValidGuestPhone", () => {
  it("takes Indian mobiles (6 to 9 first digit) and valid international numbers", () => {
    expect(isValidGuestPhone("+919884012345")).toBe(true);
    expect(isValidGuestPhone("9884012345")).toBe(true);
    expect(isValidGuestPhone("+447911123456")).toBe(true);
    expect(isValidGuestPhone("+911234567890")).toBe(false);
    expect(isValidGuestPhone("+4412")).toBe(false);
    expect(isValidGuestPhone("")).toBe(false);
  });
});
