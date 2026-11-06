/**
 * Add-ons ("bumps") on a checkout: another offering the buyer can tick on the
 * parent offering's checkout (TagMango's "Bump Up"). Shared by
 * create-razorpay-order (signed in) and guest-create-order (guests), so both
 * price them the same way.
 *
 * Parentage + price come from ONE joined read, so a client can't (a) claim a
 * bump that belongs to a different parent to smuggle it in cheap, or (b) race
 * a price change between two reads. The add-on must itself be on sale
 * (`bumpAllowed`: active, access buy, priced above 0).
 */
import { bumpAllowed } from "./freeEnrolment.ts";

export const MAX_BUMPS = 20;

export interface PricedBumps {
  bumpTotal: number;
  validBumpIds: string[];
}

// deno-lint-ignore no-explicit-any
type AdminClient = { from: (t: string) => any };

export async function priceBumps(admin: AdminClient, parentOfferingId: string, bumpIds: unknown): Promise<PricedBumps> {
  const ids = Array.isArray(bumpIds) ? [...new Set(bumpIds.filter((x): x is string => typeof x === "string"))] : [];
  if (!ids.length) return { bumpTotal: 0, validBumpIds: [] };
  const { data: bumps } = await admin
    .from("offering_bumps")
    .select(
      "bump_offering_id, bump_price_override_inr, bump_offering:offerings!offering_bumps_bump_offering_id_fkey(id, price_inr, status, access)",
    )
    .eq("parent_offering_id", parentOfferingId)
    .in("bump_offering_id", ids);
  let bumpTotal = 0;
  const validBumpIds: string[] = [];
  // deno-lint-ignore no-explicit-any
  for (const b of (bumps ?? []) as any[]) {
    if (b.bump_offering_id === parentOfferingId) continue;
    if (!bumpAllowed(b.bump_offering, b.bump_price_override_inr)) continue;
    bumpTotal += b.bump_price_override_inr != null ? Number(b.bump_price_override_inr) : Number(b.bump_offering.price_inr);
    validBumpIds.push(b.bump_offering_id);
  }
  validBumpIds.sort();
  return { bumpTotal, validBumpIds };
}
