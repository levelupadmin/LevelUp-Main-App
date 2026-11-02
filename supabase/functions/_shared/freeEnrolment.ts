/**
 * Which offerings a buyer may take for ₹0 on their own (pure, no imports).
 *
 * Used by the two free paths: create-free-enrolment (signed in) and the
 * free-capture branch of guest-create-order. Live cohorts are sold outside the
 * app (Tally application → sales call → payment link → admin grant), so their
 * offering rows carry price 0 only because nobody prices them. Without this
 * gate a ₹0 cohort was a free self-enrolment for anyone holding its id
 * (admin audit 2026-11-02). Free resource packs (price 0, tier "other" /
 * "workshop") stay claimable.
 */

export interface FreeEnrolmentOffering {
  product_tier?: string | null;
  tally_form_url?: string | null;
  payment_mode?: string | null;
}

/** null when a ₹0 self-enrolment is allowed, else the message for the buyer. */
export function freeEnrolmentRefusal(offering: FreeEnrolmentOffering): string | null {
  if (offering.payment_mode === "staged") {
    return "This offering uses applications, not direct enrolment";
  }
  if (offering.product_tier === "live_cohort" || (offering.tally_form_url ?? "").trim() !== "") {
    return "This programme is joined through an application, not direct enrolment";
  }
  return null;
}
