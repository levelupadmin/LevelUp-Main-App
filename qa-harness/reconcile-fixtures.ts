/**
 * reconcile-fixtures.ts — PURE fixture builders for the funnel reconciler unit
 * tests (RC-T3, REQ-RECON-1). NOT shipped; imported ONLY by
 * `src/lib/__tests__/reconcile.test.ts` via a RELATIVE path (there is no `@qa`
 * alias — the vitest include glob picks up the test file, and this fixture is
 * pulled in transitively).
 *
 * These are the ALREADY-NORMALIZED, ALREADY-FETCHED source reads that
 * `deriveStage` consumes — the exact `TallyRead` / `TeleCrmRead` / `RazorpayRead`
 * shapes the edge fn's fail-soft I/O layer produces — plus the `OfferingContext`
 * that scopes the derivation to a single offering. There is ZERO network here:
 * every builder returns a plain object, so the pure derive path is fully green
 * without mocking a single fetch. The §4 amount→product classification is reused
 * from `@shared/reconcile` (`amountToProduct`) so a Razorpay fixture buckets its
 * amounts exactly the way the live read does — the fixture can't drift from the
 * classifier it's meant to exercise.
 *
 * The `@shared` alias is wired in `vitest.config.ts` + `tsconfig`, so importing
 * the types + classifier from `@shared/reconcile` resolves in both the test run
 * and the type-check.
 */

import {
  amountToProduct,
  type JoinKeys,
  type OfferingContext,
  type ProductInfo,
  type RazorpayRead,
  type ResolvedKey,
  type TallyRead,
  type TeleCrmLead,
  type TeleCrmRead,
} from "@shared/reconcile";

/**
 * Build the two normalized join keys for a fixture caller. Mirrors what
 * `joinKeys` produces off a real auth identity: last-10 phone, lowercased email.
 * Pass `null` for either channel to model a phone-only / email-only / keyless
 * caller.
 */
export function keys(phone: string | null, email: string | null): JoinKeys {
  return {
    phone: phone ? phone.replace(/\D/g, "").slice(-10) || null : null,
    email: email ? email.trim().toLowerCase() || null : null,
  };
}

/** A caller reachable on BOTH channels — the default identity for most rows. */
export const BOTH_KEYS: JoinKeys = keys("+919788385577", "aspirant@example.com");

// ---------------------------------------------------------------------------
// Offering context (the target the derivation is scoped to)
// ---------------------------------------------------------------------------

/**
 * Build an `OfferingContext`. Defaults model a Live cohort (₹400 app fee / ₹8,000
 * seat-confirm, `product_1` = `VE`, a ₹33k programme so the balance floor is
 * `33000 − 400 − 8000 = ₹24,600`). Override for a Forge product, a pricier intake,
 * etc. `balanceFloorInr` is what the edge fn derives from `price_inr − appFee −
 * confirmation`; a capture at/above it is a balance/full payment FOR THIS offering.
 */
export function offering(overrides: Partial<OfferingContext> = {}): OfferingContext {
  return {
    offeringId: overrides.offeringId ?? "off_live",
    appFeeInr: overrides.appFeeInr ?? 400,
    confirmationAmountInr: overrides.confirmationAmountInr ?? 8000,
    balanceFloorInr: overrides.balanceFloorInr ?? 24600,
    productMatch: overrides.productMatch ?? ["VE"],
  };
}

/**
 * A Live cohort: ₹400 shared app fee, ₹8,000 shared seat-confirm, `product_1` VE,
 * balance floor ₹24,600 (₹33k programme). A ₹25,785 capture clears the floor →
 * balance/full; a ₹25,000 capture for a PRICIER offering would sit below its floor.
 */
export const LIVE_OFFERING: OfferingContext = offering();

/** A Forge product: ₹700 product-distinct app fee, ₹15,000 seat-confirm, `product_1` FC, ₹40k programme. */
export const FORGE_OFFERING: OfferingContext = offering({
  offeringId: "off_forge",
  appFeeInr: 700,
  confirmationAmountInr: 15000,
  balanceFloorInr: 24300,
  productMatch: ["FC"],
});

// ---------------------------------------------------------------------------
// Tally (intake) reads
// ---------------------------------------------------------------------------

/** Tally source unreachable / secret unset — contributes no signal (§SOR-1). */
export function tallyUnavailable(): TallyRead {
  return {
    available: false,
    resolvedKey: null,
    completed: false,
    partial: false,
    essayPresent: false,
    furthestQuestion: null,
  };
}

/** Reachable Tally with no matching submission for this caller. */
export function tallyNoMatch(): TallyRead {
  return {
    available: true,
    resolvedKey: null,
    completed: false,
    partial: false,
    essayPresent: false,
    furthestQuestion: null,
  };
}

/**
 * A STARTED-but-not-completed Tally submission (the resume/partial signal, §7.1).
 * `essayPresent` stays false — a partial never reached the essay page.
 */
export function tallyPartial(
  resolvedKey: ResolvedKey = "phone",
  furthestQuestion = 3,
): TallyRead {
  return {
    available: true,
    resolvedKey,
    completed: false,
    partial: true,
    essayPresent: false,
    furthestQuestion,
  };
}

/**
 * A COMPLETED Tally submission with the essay present — the completed-form
 * signal (§3.3) that (absent a captured ₹400) drives the completed-no-fee marker.
 */
export function tallyCompleted(resolvedKey: ResolvedKey = "phone"): TallyRead {
  return {
    available: true,
    resolvedKey,
    completed: true,
    partial: false,
    essayPresent: true,
    furthestQuestion: null,
  };
}

// ---------------------------------------------------------------------------
// TeleCRM (funnel-status master) reads — now a list of leads (one per product_1)
// ---------------------------------------------------------------------------

/** TeleCRM source unreachable / secrets unset — no signal. */
export function telecrmUnavailable(): TeleCrmRead {
  return { available: false, resolvedKey: null, leads: [] };
}

/** Reachable TeleCRM with no matching lead. */
export function telecrmNoMatch(): TeleCrmRead {
  return { available: true, resolvedKey: null, leads: [] };
}

/**
 * A single matched lead. Defaults to a Live (`VE`) lead resolved on phone. Pass a
 * `product1` to model a Forge / other-vertical lead, and a `timestamp` to control
 * newest-wins.
 */
export function lead(
  status: string,
  opts: {
    resolvedKey?: ResolvedKey;
    product1?: string | null;
    mql?: number | null;
    essayPresent?: boolean;
    timestamp?: number;
  } = {},
): TeleCrmLead {
  return {
    resolvedKey: opts.resolvedKey ?? "phone",
    product1: opts.product1 ?? "VE",
    status,
    mql: opts.mql ?? null,
    essayPresent: opts.essayPresent ?? false,
    timestamp: opts.timestamp ?? 1000,
  };
}

/**
 * A matched TeleCRM read carrying ONE lead at a given top-level `status` picklist
 * value (the §6 driver). Case is preserved as the live picklist carries it;
 * `deriveStage` normalizes internally. Defaults to `product_1` = `VE`.
 */
export function telecrmStatus(
  status: string,
  opts: {
    resolvedKey?: ResolvedKey;
    product1?: string | null;
    mql?: number | null;
    essayPresent?: boolean;
  } = {},
): TeleCrmRead {
  const l = lead(status, opts);
  return { available: true, resolvedKey: l.resolvedKey, leads: [l] };
}

/**
 * A matched TeleCRM read carrying MULTIPLE leads — the multi-application caller
 * whose single CRM footprint spans several `product_1` verticals. The
 * offering-scoped `deriveStage` must pick the lead for the target offering and
 * never let a sibling's lead leak in.
 */
export function telecrmLeads(leads: TeleCrmLead[]): TeleCrmRead {
  const resolvedKey: ResolvedKey = leads.some((l) => l.resolvedKey === "phone")
    ? "phone"
    : leads.some((l) => l.resolvedKey === "email")
      ? "email"
      : null;
  return { available: true, resolvedKey, leads };
}

// ---------------------------------------------------------------------------
// Razorpay (payments) reads — amount IS the product (§4)
// ---------------------------------------------------------------------------

/** Razorpay source unreachable / secrets unset — no signal. */
export function razorpayUnavailable(): RazorpayRead {
  return { available: false, resolvedKey: null, products: [] };
}

/** Reachable Razorpay with no captured payment matched to this caller. */
export function razorpayNoMatch(): RazorpayRead {
  return { available: true, resolvedKey: null, products: [] };
}

/**
 * Build a Razorpay read from a list of whole-rupee amounts, bucketed through the
 * SAME `amountToProduct` classifier the live read uses (§4). An empty list is a
 * reachable-but-no-payment read with a null resolving key. Set
 * `firstPartyConfirmed` to model a supplementary app-owned `payment_orders` row
 * that pins the payment to this offering (unambiguous attribution).
 */
export function razorpayAmounts(
  amountsInr: number[],
  resolvedKey: ResolvedKey = "phone",
  opts: { firstPartyConfirmed?: boolean } = {},
): RazorpayRead {
  const products: ProductInfo[] = amountsInr.map((a) => amountToProduct(a));
  return {
    available: true,
    resolvedKey: products.length > 0 ? resolvedKey : null,
    products,
    ...(opts.firstPartyConfirmed ? { firstPartyConfirmed: true } : {}),
  };
}
