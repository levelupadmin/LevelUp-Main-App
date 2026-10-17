import { describe, it, expect, vi, beforeEach } from "vitest";
import { track } from "@/lib/analytics";
import { checkoutVisitEventId, captureCheckoutAttribution } from "@/lib/attribution";

/**
 * Meta merges two copies of one event only when they share an event id. These
 * pin the ids the checkout sends: InitiateCheckout reuses the landing page's
 * ic_eid (or one id per tab), AddPaymentInfo is keyed on the payment order, and
 * Purchase is purchase_<razorpay_payment_id> everywhere.
 */
describe("checkout Meta event ids", () => {
  const g = globalThis as unknown as { fbq?: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    g.fbq = vi.fn();
    window.sessionStorage.clear();
  });

  it("InitiateCheckout uses the given event id and carries the category", () => {
    track({
      name: "initiate_checkout",
      content_id: "off-1",
      content_name: "Nelson",
      value: 2499,
      currency: "INR",
      content_category: "Masterclass",
      event_id: "tap-123",
    });
    expect(g.fbq).toHaveBeenCalledWith(
      "track",
      "InitiateCheckout",
      expect.objectContaining({ content_ids: ["off-1"], content_type: "product", content_category: "Masterclass", value: 2499 }),
      { eventID: "tap-123" },
    );
  });

  it("AddPaymentInfo uses api_<payment_order_id>", () => {
    track({
      name: "add_payment_info",
      content_id: "off-1",
      content_name: "Nelson",
      value: 2499,
      currency: "INR",
      event_id: "api_po-9",
    });
    expect(g.fbq).toHaveBeenCalledWith("track", "AddPaymentInfo", expect.objectContaining({ value: 2499 }), { eventID: "api_po-9" });
  });

  it("Purchase uses purchase_<payment id> and the category", () => {
    track({
      name: "purchase",
      transaction_id: "pay_1",
      content_id: "off-1",
      content_name: "Nelson",
      value: 2499,
      currency: "INR",
      content_category: "Masterclass",
    });
    expect(g.fbq).toHaveBeenCalledWith(
      "track",
      "Purchase",
      expect.objectContaining({ content_category: "Masterclass", content_type: "product", num_items: 1 }),
      { eventID: "purchase_pay_1" },
    );
  });

  it("the visit id is the landing ic_eid when present, else stable for the tab", () => {
    captureCheckoutAttribution("?ic_eid=tap-xyz", "off-1");
    expect(checkoutVisitEventId("off-1")).toBe("tap-xyz");
    const minted = checkoutVisitEventId("off-2");
    expect(minted).toBeTruthy();
    expect(checkoutVisitEventId("off-2")).toBe(minted);
  });
});
