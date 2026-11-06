import { describe, it, expect } from "vitest";
import { isReady, pageReadiness, renumber, slugify } from "@/lib/catalogue";

const offering = {
  status: "active", access: "buy", price_inr: 99, product_tier: "workshop",
  thumbnail_url: "https://x/y.png", tally_form_url: null, payment_mode: "single", has_landing: false,
};

describe("pageReadiness", () => {
  it("is ready when the button sells a Selling, priced offering with lessons and a picture", () => {
    expect(isReady(pageReadiness({ button_offering_id: "o1" }, offering, 7))).toBe(true);
  });
  it("names what's missing", () => {
    const checks = pageReadiness({ button_offering_id: "o1" }, { ...offering, price_inr: 0, thumbnail_url: null }, 0);
    const missing = checks.filter((c) => !c.ok).map((c) => c.label);
    expect(missing).toEqual(["It has a price above ₹0", "It unlocks a course with lessons", "It has a picture or a page design"]);
  });
  it("needs an application link for Apply, and refuses Team adds", () => {
    expect(isReady(pageReadiness({ button_offering_id: "o" }, { ...offering, access: "apply", product_tier: "live_cohort", tally_form_url: "https://tally.so/r/x" }, 0))).toBe(true);
    expect(isReady(pageReadiness({ button_offering_id: "o" }, { ...offering, access: "team" }, 3))).toBe(false);
  });
  it("is not ready with no offering or a closed one", () => {
    expect(isReady(pageReadiness({ button_offering_id: null }, null, 0))).toBe(false);
    expect(isReady(pageReadiness({ button_offering_id: "o" }, { ...offering, status: "archived" }, 3))).toBe(false);
  });
});

describe("helpers", () => {
  it("slugify", () => expect(slugify("Film Direction 101 — Live!")).toBe("film-direction-101-live"));
  it("renumber", () => expect(renumber([{ id: "a" }, { id: "b" }])).toEqual([{ id: "a", position: 10 }, { id: "b", position: 20 }]));
});
