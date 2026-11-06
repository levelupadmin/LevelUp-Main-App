/**
 * Who may take an offering at the checkout, and who may take it for ₹0
 * (pure, no imports).
 *
 * `offerings.access` (migration 20261106120000) says how people get an
 * offering: buy | free | apply | team. Before it existed, "price ₹0" quietly
 * meant "anyone may take it free" and `is_public` decided whether a guest
 * could pay; both were hidden jobs. The rules now:
 *
 *   buy    sold at the checkout; ₹0 only through a coupon (price must be > 0)
 *   free   anyone may claim it at ₹0
 *   apply  joined through an application (Tally / staged payments)
 *   team   added by the team only (batches, resource packs, imports)
 *
 * Live cohorts are sold outside the app (Tally → call → payment link → admin
 * grant), so their rows carry price 0 only because nobody prices them. The
 * older tier / Tally / staged checks stay as a second lock (admin audit
 * 2026-11-02), so a row whose access was never set behaves as before.
 */

export type OfferingAccess = "buy" | "free" | "apply" | "team";

export interface FreeEnrolmentOffering {
  product_tier?: string | null;
  tally_form_url?: string | null;
  payment_mode?: string | null;
  access?: string | null;
  price_inr?: number | string | null;
}

const TEAM_ONLY = "This is added by our team, not bought here";
const BY_APPLICATION = "This programme is joined through an application, not direct enrolment";

/** null when the checkout may open an order for it, else the buyer's message. */
export function checkoutRefusal(offering: FreeEnrolmentOffering): string | null {
  if (offering.access === "team") return TEAM_ONLY;
  if (offering.access === "apply" && offering.payment_mode !== "staged") return BY_APPLICATION;
  return null;
}

/** null when a ₹0 self-enrolment is allowed, else the message for the buyer. */
export function freeEnrolmentRefusal(offering: FreeEnrolmentOffering): string | null {
  if (offering.payment_mode === "staged") {
    return "This offering uses applications, not direct enrolment";
  }
  if (offering.product_tier === "live_cohort" || (offering.tally_form_url ?? "").trim() !== "") {
    return BY_APPLICATION;
  }
  if (offering.access === "team") return TEAM_ONLY;
  if (offering.access === "apply") return BY_APPLICATION;
  // A paid offering reaches ₹0 only through a coupon; one with no price yet
  // is not free, it is unfinished.
  if (offering.access === "buy" && !(Number(offering.price_inr ?? 0) > 0)) {
    return "This isn't on sale yet";
  }
  return null;
}

export interface BumpOffering {
  status?: string | null;
  access?: string | null;
  price_inr?: number | string | null;
}

/** An add-on on someone else's checkout must itself be on sale and priced. */
export function bumpAllowed(bump: BumpOffering | null | undefined, priceOverride?: number | string | null): boolean {
  if (!bump || bump.status !== "active") return false;
  if (bump.access != null && bump.access !== "buy") return false;
  const price = priceOverride != null ? Number(priceOverride) : Number(bump.price_inr ?? 0);
  return price > 0;
}
