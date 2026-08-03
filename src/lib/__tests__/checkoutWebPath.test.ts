import { describe, expect, it } from "vitest";
import { checkoutWebPath } from "@/lib/checkoutWebPath";

describe("native checkout web handoff", () => {
  it("preserves an application-fee reminder's application-scoped checkout", () => {
    expect(
      checkoutWebPath({
        offeringId: "offering/id",
        offeringSlug: "cohort-3",
        paymentType: "app_fee",
        applicationId: "application-123",
      }),
    ).toBe("/checkout/offering%2Fid?type=app_fee&app=application-123");
  });

  it.each(["confirmation", "balance"] as const)(
    "preserves the %s staged-payment destination",
    (paymentType) => {
      expect(
        checkoutWebPath({
          offeringId: "offering-1",
          offeringSlug: "cohort-3",
          paymentType,
          applicationId: "application-123",
        }),
      ).toBe(`/checkout/offering-1?type=${paymentType}&app=application-123`);
    },
  );

  it("keeps full purchases on the public offering journey", () => {
    expect(
      checkoutWebPath({
        offeringId: "offering-1",
        offeringSlug: "cohort 3",
        paymentType: "full",
        applicationId: null,
      }),
    ).toBe("/p/cohort%203");
  });
});
