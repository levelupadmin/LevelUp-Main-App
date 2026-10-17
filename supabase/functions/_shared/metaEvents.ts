/**
 * Meta event conventions shared by the browser pixel (src/lib/analytics.ts,
 * via the `@shared` alias) and the server Conversions API sender
 * (`_shared/metaCapi.ts`). Pure and dependency-free: it runs in Deno and Vite.
 *
 * Both copies of a Purchase must carry the SAME event_id or Meta counts the sale
 * twice. The id is `purchase_<razorpay_payment_id>`: the checkout's Razorpay
 * success handler, the Thank-you page and the server sender all build it here.
 */

/** Meta `content_category` for an offering, from `offerings.product_tier`. */
export function contentCategoryForTier(tier: string | null | undefined): string {
  switch ((tier ?? "").trim().toLowerCase()) {
    case "masterclass":
      return "Masterclass";
    case "live_cohort":
      return "Live Cohort";
    case "workshop":
      return "Workshop";
    case "program":
      return "Program";
    case "mastery":
      return "Mastery Program";
    default:
      return "Course";
  }
}

/** event_id for a Purchase. Browser and server MUST use this same value. */
export function purchaseEventId(transactionId: string): string {
  return `purchase_${transactionId}`;
}

/** event_id for AddPaymentInfo: one per payment order, so a retry dedupes. */
export function addPaymentInfoEventId(paymentOrderId: string): string {
  return `api_${paymentOrderId}`;
}

/**
 * Meta's matching rules for `em`: trimmed, lower-case. Returns null for an empty
 * value or for the app's own placeholder address (`<digits>@phone.leveluplearning.in`),
 * which identifies a phone, not a person's inbox.
 */
export function normalizeEmailForMeta(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s || !s.includes("@")) return null;
  if (s.endsWith("@phone.leveluplearning.in")) return null;
  return s;
}

/**
 * Meta's matching rules for `ph`: digits only, with the country code. A bare
 * 10-digit Indian number gets 91 in front (the checkout is +91 only).
 */
export function normalizePhoneForMeta(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}
