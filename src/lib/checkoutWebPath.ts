export type CheckoutPaymentType = "full" | "app_fee" | "confirmation" | "balance";

interface CheckoutWebPathInput {
  offeringId: string | undefined;
  offeringSlug: string | null | undefined;
  paymentType: CheckoutPaymentType;
  applicationId: string | null;
}

/**
 * Destination used when a native shell hands a purchase to the public website.
 *
 * Staged payments must keep both their payment type and application id. Sending
 * them to the offering page loses the application-scoped checkout context and
 * turns an application-fee reminder into a dead end. Full purchases can still
 * land on the offering page, which is the intentional browse-to-buy journey.
 */
export function checkoutWebPath({
  offeringId,
  offeringSlug,
  paymentType,
  applicationId,
}: CheckoutWebPathInput): string {
  if (paymentType !== "full" && offeringId) {
    const params = new URLSearchParams({ type: paymentType });
    if (applicationId) params.set("app", applicationId);
    return `/checkout/${encodeURIComponent(offeringId)}?${params.toString()}`;
  }

  return offeringSlug ? `/p/${encodeURIComponent(offeringSlug)}` : "/browse";
}
