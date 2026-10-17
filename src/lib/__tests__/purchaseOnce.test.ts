import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The browser sends Purchase once per payment, whichever of the checkout and
 * Thank-you gets there first, to every sink: Meta, Google and X (whose
 * tw-purchase has no id to dedupe on).
 */
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

type Sinks = { fbq?: ReturnType<typeof vi.fn>; gtag?: ReturnType<typeof vi.fn>; twq?: ReturnType<typeof vi.fn> };
const w = window as unknown as Sinks;

async function fresh() {
  vi.resetModules();
  const analytics = await import("@/lib/analytics");
  const once = await import("@/lib/purchaseOnce");
  return { track: analytics.track, claimPurchaseOnce: once.claimPurchaseOnce };
}

const purchase = (transaction_id: string) =>
  ({
    name: "purchase",
    transaction_id,
    content_id: "off-1",
    content_name: "Nelson",
    value: 2499,
    currency: "INR",
  }) as const;

const purchases = (fn?: ReturnType<typeof vi.fn>, name = "Purchase") =>
  (fn?.mock.calls ?? []).filter((c) => c.includes(name) || c.includes("purchase") || c.includes("tw-purchase")).length;

describe("one browser Purchase per payment", () => {
  beforeEach(() => {
    window.localStorage.clear();
    w.fbq = vi.fn();
    w.gtag = vi.fn();
    w.twq = vi.fn();
  });

  it("sends the checkout's Purchase and skips Thank-you's copy of the same payment", async () => {
    const { track } = await fresh();
    track(purchase("pay_1")); // checkout, right after verify
    track(purchase("pay_1")); // Thank-you on arrival
    expect(purchases(w.fbq)).toBe(1);
    expect(purchases(w.gtag)).toBe(1);
    expect(purchases(w.twq)).toBe(1);
    expect(w.fbq).toHaveBeenCalledWith("track", "Purchase", expect.anything(), { eventID: "purchase_pay_1" });
  });

  it("still skips it after a reload (a new page load reads localStorage)", async () => {
    (await fresh()).track(purchase("pay_2"));
    (await fresh()).track(purchase("pay_2"));
    expect(purchases(w.fbq)).toBe(1);
    (await fresh()).track(purchase("pay_3"));
    expect(purchases(w.fbq)).toBe(2);
  });

  it("does not use up the send when no sink is loaded yet", async () => {
    const { track } = await fresh();
    w.fbq = undefined;
    w.gtag = undefined;
    w.twq = undefined;
    track(purchase("pay_4"));
    w.fbq = vi.fn();
    track(purchase("pay_4"));
    expect(purchases(w.fbq)).toBe(1);
  });

  it("guards in memory when storage is blocked, and keeps scopes apart", async () => {
    const { claimPurchaseOnce } = await fresh();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(claimPurchaseOnce("pay_5")).toBe(true);
    expect(claimPurchaseOnce("pay_5")).toBe(false);
    expect(claimPurchaseOnce("pay_5", "offering_pixels")).toBe(true);
    expect(claimPurchaseOnce("pay_5", "offering_pixels")).toBe(false);
    get.mockRestore();
  });
});
