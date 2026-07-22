/**
 * reconcile-fixtures.ts — PURE fixture builders for the funnel reconciler unit
 * tests (RC-T3, REQ-RECON-1). NOT shipped; imported ONLY by
 * `src/lib/__tests__/reconcile.test.ts` via a RELATIVE path (there is no `@qa`
 * alias — the vitest include glob picks up the test file, and this fixture is
 * pulled in transitively).
 *
 * These are the ALREADY-NORMALIZED, ALREADY-FETCHED source reads that
 * `deriveStage` consumes — the exact `TallyRead` / `TeleCrmRead` / `RazorpayRead`
 * shapes the edge fn's fail-soft I/O layer produces. There is ZERO network here:
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
  type ProductInfo,
  type RazorpayRead,
  type ResolvedKey,
  type TallyRead,
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
// TeleCRM (funnel-status master) reads
// ---------------------------------------------------------------------------

/** TeleCRM source unreachable / secrets unset — no signal. */
export function telecrmUnavailable(): TeleCrmRead {
  return { available: false, resolvedKey: null, status: null, mql: null, essayPresent: false };
}

/** Reachable TeleCRM with no matching lead. */
export function telecrmNoMatch(): TeleCrmRead {
  return { available: true, resolvedKey: null, status: null, mql: null, essayPresent: false };
}

/**
 * A matched TeleCRM lead at a given top-level `status` picklist value (the §6
 * driver). Case is preserved as the live picklist carries it; `deriveStage`
 * normalizes internally.
 */
export function telecrmStatus(
  status: string,
  opts: { resolvedKey?: ResolvedKey; mql?: number | null; essayPresent?: boolean } = {},
): TeleCrmRead {
  return {
    available: true,
    resolvedKey: opts.resolvedKey ?? "phone",
    status,
    mql: opts.mql ?? null,
    essayPresent: opts.essayPresent ?? false,
  };
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
 * reachable-but-no-payment read with a null resolving key.
 */
export function razorpayAmounts(
  amountsInr: number[],
  resolvedKey: ResolvedKey = "phone",
): RazorpayRead {
  const products: ProductInfo[] = amountsInr.map((a) => amountToProduct(a));
  return {
    available: true,
    resolvedKey: products.length > 0 ? resolvedKey : null,
    products,
  };
}
