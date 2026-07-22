/**
 * reconcile.ts — the PURE join + derive core of the cohort funnel reconciler
 * (REQ-RECON-1, `design/cohorts/docs/04-INTEGRATION-CONTRACTS.md` §7).
 *
 * This is the first-party derivation of a logged-in user's funnel stage from
 * the three external systems the app can READ — Tally, TeleCRM, Razorpay —
 * joined on phone (primary) → email (fallback). It implements the
 * `FUNNEL-DATA-AUDIT.md` §6 stage→CTA table and the §4 amount→product buckets
 * as pure functions of already-fetched, already-normalized reads.
 *
 * The derivation is OFFERING-SCOPED (RC-PHASE-RC / council Risk A). A caller who
 * applied to more than one offering has ONE Tally/TeleCRM/Razorpay footprint that
 * spans several cohorts; a global "furthest progress" stage stamped onto every
 * application shows a wrong badge on siblings and, once the flag flips, routes a
 * payment CTA to the wrong offering. So `deriveStage` takes the target offering
 * context (`OfferingContext`) and resolves the stage FOR THAT OFFERING ONLY:
 *   - TeleCRM: the lead whose `product_1` maps to this offering (not any lead).
 *   - Razorpay: amounts matched against THIS offering's own `appFeeInr` /
 *     `confirmationAmountInr` with a GST-tolerant band (a GST-inclusive capture
 *     is a few percent above the base, so an exact `=== 8000` would miss it).
 *   - The Live ₹400 app-fee (and the ₹8k/₹15k seat-confirm deposits) are shared
 *     across cohorts, so a shared-tier amount is attributed to this offering only
 *     when a product_1 lead (or a first-party `payment_orders` row) confirms it;
 *     otherwise the money signal is `ambiguous`, never mis-assigned.
 *
 * IMPORTANT — keep this file DEPENDENCY-FREE (no imports; no Deno/Node/DOM-only
 * globals), exactly like `_shared/phone.ts` and `_shared/pricing.ts`. It is
 * imported by the Deno edge fn (`../_shared/reconcile.ts`) AND bundled into the
 * Vite frontend / vitest via the `@shared` alias, so an import that exists in
 * only one runtime would break the other. The unit test drives these functions
 * directly with fixtures and needs no network and no mocking. Phone
 * normalization is inlined here (`last10Digits`) rather than imported from
 * `@shared/phone`, to preserve the zero-import guarantee (per RC-T1 spec + the
 * brief's "keep reconcile.ts import-free" rule).
 *
 * SOR-1: this module DERIVES a read-through mirror of external state. It is NOT
 * a source of truth. It never writes anything and never fabricates a stage — an
 * unavailable source is modelled explicitly (`available: false`) and simply
 * contributes no signal.
 */

/** Which identity key resolved a match: phone (primary), email (fallback), or none. */
export type ResolvedKey = "phone" | "email" | null;

/**
 * The derived funnel stage — the §6 stage→CTA rows plus the two interstitial
 * TeleCRM statuses (`interview-scheduled`, `accepted`) the reconciler must also
 * surface (§5.2 / §7.1), and the `unknown` orphan. Kebab-case, so the client
 * hook (`useFunnelStage`) can key CTA copy off it directly.
 */
export type Stage =
  | "unknown" // orphan: matched nothing in any reachable system
  | "partial" // §6: Tally partial, no completion → resume application
  | "completed-no-fee" // §6: completed form, no captured ₹400 → pay the ₹400 app fee
  | "fee-paid-no-interview" // §6: `Application Fee Paid`, no `Interview Scheduled` → book interview
  | "interview-scheduled" // interstitial: interview booked, no CTA (app is mirroring)
  | "awaiting-decision" // §6: `Interview completed`, not yet accepted/converted
  | "accepted" // §5.2 read: TeleCRM flipped to accepted → seat-confirm experience
  | "confirm-paid-no-balance" // §6: ₹8k/₹15k confirm paid, balance not paid → pay balance
  | "enrolled"; // §6: `Converted` / full payment → enrolled

/** The §4 product class inferred from a Razorpay amount (the amount IS the SKU). */
export type ProductKind =
  | "live-app-fee" // ₹400
  | "forge-app-fee" // ₹600–900
  | "live-seat-confirm" // ₹8,000
  | "forge-seat-confirm" // ₹15,000
  | "balance-or-full" // ₹22–32k Live balance, ≥₹40k Forge full
  | "unknown"; // an amount that matches no known bucket (recorded, never promoted)

export interface ProductInfo {
  kind: ProductKind;
  /** The raw rupee amount, retained alongside the bucket so a mis-bucket is auditable (§4.5). */
  amountInr: number;
  isAppFee: boolean; // the ₹400 / ₹600–900 that clears the "completed-no-fee" marker
  isSeatConfirm: boolean; // the ₹8k / ₹15k deposit
  isBalanceOrFull: boolean; // the balance / full-programme payment
}

/** Raw identity as read off the auth user, before normalization. */
export interface RawIdentity {
  phone?: string | null;
  email?: string | null;
}

/** The two normalized join keys (§2.2): last-10 phone, lowercased-trimmed email. */
export interface JoinKeys {
  phone: string | null;
  email: string | null;
}

/**
 * The target offering the derivation is scoped to. Built by the edge fn from the
 * `offerings` row it loads for the requested `offering_id`:
 *   - `appFeeInr` / `confirmationAmountInr` — this offering's OWN amounts, fed to
 *     the GST-tolerant Razorpay match (so a captured amount is matched against the
 *     right expected value, not a global table).
 *   - `productMatch` — the normalized TeleCRM `product_1` codes that identify this
 *     offering. `offerings` has NO `product_1` column and there is no shared map,
 *     so this is built at the code level (`offeringToProductMatch`); empty means
 *     the offering couldn't be mapped, and TeleCRM falls back to newest-overall.
 */
export interface OfferingContext {
  offeringId: string;
  appFeeInr: number | null;
  confirmationAmountInr: number | null;
  productMatch: readonly string[];
  /**
   * THIS offering's OWN balance/full floor in whole rupees, derived by the edge fn
   * from the offering's `price_inr` (`price_inr − appFee − confirmation`) — the
   * amount a caller still owes after the seat-confirm, so a capture at or above it
   * is a balance/full payment FOR THIS OFFERING. Replaces the old global
   * `amount ≥ ₹22k` threshold (council B2): an unrelated ≥₹22k for another product
   * sits below a pricier offering's floor and so can neither force a false
   * `enrolled` nor mask a real `confirm-paid-no-balance`. `null` when the offering
   * carries no `price_inr` — then money alone NEVER infers `enrolled` (the safe
   * default: withhold the money stage rather than guess a cross-product capture).
   */
  balanceFloorInr: number | null;
}

/**
 * Normalized read from Tally (the intake system). `available: false` means the
 * source was unreachable or its secret was unset — it contributes no signal and
 * is NEVER treated as "no submission". Tally is per-person (a submission is a
 * completed/partial application), not per-product, so it is not product-scoped.
 */
export interface TallyRead {
  available: boolean;
  resolvedKey: ResolvedKey; // which key matched a submission, or null if none matched
  completed: boolean; // a completed submission exists (reached the essay / last page)
  partial: boolean; // a partial (started, not completed) submission exists
  essayPresent: boolean; // essay text present — the completed-form signal (§3.3)
  furthestQuestion?: number | null; // resume signal for the re-entry nudge (§7.1)
}

/**
 * A single matched TeleCRM lead, carrying its `product_1` (the SKU code — `VE`,
 * `FC`, `FFM`, `FW`, `FAI`, `BFP`, `L3C`, … per `FUNNEL-DATA-AUDIT.md` §84/§193)
 * so the offering-scoped derivation can pick the lead for THIS offering rather
 * than the newest lead across all of them. `timestamp` drives newest-wins within
 * a product.
 */
export interface TeleCrmLead {
  resolvedKey: ResolvedKey; // which key matched this lead (phone primary → email)
  product1: string | null; // fields.product_1 (raw; normalized at compare time)
  status: string | null; // the top-level status picklist value
  mql: number | null; // fields.mql (≥40 = high)
  essayPresent: boolean; // fields.essay present / character_count > 0 (§5.3)
  timestamp: number; // recency (updated/created), for newest-wins within a product
}

/**
 * Normalized read from TeleCRM (the master funnel-status system, §5). Carries ALL
 * matched leads (a multi-application caller has several, one per `product_1`); the
 * offering-scoped `deriveStage` selects the lead for the target offering. Keeping
 * every lead here — rather than pre-collapsing to one — is what makes the
 * no-cross-offering-contamination guarantee unit-testable in the pure core.
 */
export interface TeleCrmRead {
  available: boolean;
  resolvedKey: ResolvedKey; // any-lead match (phone preferred) — for join health
  leads: TeleCrmLead[];
}

/**
 * Normalized read from Razorpay (payments). Only captured/authorized payments
 * matched to the user by phone→email appear here (§4.5); amount → product.
 * `firstPartyConfirmed` is set when the supplementary app-owned `payment_orders`
 * lookup (keyed on user_id + offering_id) resolved a captured payment for THIS
 * offering — an unambiguous, offering-scoped attribution that resolves the
 * shared-tier ambiguity the same way a matching TeleCRM `product_1` lead does.
 */
export interface RazorpayRead {
  available: boolean;
  resolvedKey: ResolvedKey;
  products: ProductInfo[];
  firstPartyConfirmed?: boolean;
}

/** The two markers invisible in `cohort_applications.status` today (§7.2). */
export interface StageMarkers {
  /** essay-present in Tally/TeleCRM AND no matching captured ₹400 — the warmest recoverable lead. */
  completedNoFee: boolean;
  /** a resolved phone+email partial with no completion — the ~377 sitting in TeleCRM `NEW`. */
  contactablePartial: boolean;
}

export interface DerivedStage {
  stage: Stage;
  resolvedKey: ResolvedKey;
  markers: StageMarkers;
  /** The TeleCRM status the derivation saw for THIS offering (null when no product_1 lead matched). */
  telecrmStatus: string | null;
  /** Raw Razorpay amounts that resolved to this user, for auditability (§4.5). */
  amounts: number[];
  /**
   * A shared-tier money signal (Live ₹400 / ₹8k, Forge ₹15k) matched but could
   * not be pinned to THIS offering (no confirming `product_1` lead / first-party
   * payment) — surfaced so the client never routes a payment CTA off an
   * unattributable payment. `false` on every confidently-attributed run.
   */
  ambiguous: boolean;
}

/**
 * The per-run join-completeness metric. Lives here (pure, no Deno/DOM globals) so
 * the edge fn's health/orphan branch is unit-testable without mocking.
 */
export interface JoinHealth {
  /** true when at least one reachable source resolved a match for this caller. */
  resolved: boolean;
  /** true when NO reachable source matched (stage `unknown`). */
  orphan: boolean;
  /** how many of the three externals were reachable this run. */
  sourcesAvailable: number;
  /** how many reachable externals actually resolved a match. */
  sourcesResolved: number;
  /** 0..1 join-completeness for this single run (1 = joined, 0 = orphan). */
  joinCompleteness: number;
  /** 1 - joinCompleteness — the per-run orphan share compared to the watch line. */
  orphanRate: number;
}

/**
 * Last-10 subscriber digits of a phone, or "" if fewer than 10 digits. Inlined
 * (NOT imported from `@shared/phone`) to keep this module import-free; it is the
 * same last-10 join key `phone.ts:last10` produces, so the join stays stable
 * across "+9197…", "9197…", "97…".
 */
function last10Digits(s: string | null | undefined): string {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

/**
 * joinKeys — normalize a raw identity into the two external join keys.
 *   phone → last-10 subscriber digits, or null if not a usable phone.
 *   email → lowercased + trimmed, or null if empty.
 * Both null means the caller carries no join key at all (a structural orphan;
 * the reconciler surfaces `stage: "unknown"`, never an error).
 */
export function joinKeys({ phone, email }: RawIdentity): JoinKeys {
  const p = last10Digits(phone);
  const e = (email ?? "").trim().toLowerCase();
  return { phone: p || null, email: e || null };
}

// GST-tolerance for matching a captured amount against an expected SKU amount. A
// GST-inclusive capture sits a few percent above the base (18% ceiling in India);
// a small under-tolerance absorbs rounding-down. Used both by `amountToProduct`
// (the generic §4 buckets) and by the offering-scoped `withinGstBand` match, so
// the two never drift.
const GST_LOWER = 0.98;
const GST_UPPER = 1.18;

/**
 * Conservative global upper-sanity for balance/full detection, used ONLY when this
 * offering carries no `price_inr` (so `balanceFloorInr` is null and the exact,
 * offering-scoped floor is unavailable). A capture at or above it is treated as a
 * balance/full payment so a fully-paid student still derives `enrolled` rather than
 * being pinned at `confirm-paid-no-balance` — an imperfect money stage that would
 * corrupt the read-through MIRROR and mis-measure the NSM. It is set ABOVE every
 * seat-confirm tier's GST-inclusive ceiling (₹15k × 1.18 ≈ ₹17,700) so no
 * app-fee/seat-confirm capture can ever reach it, and the derivation additionally
 * takes the max with `confirmationAmountInr × 2`, so a pricier offering's own
 * seat-confirm can't reach it either. This is a fallback sanity, NOT a substitute
 * for the offering floor: the offering floor is always preferred when present.
 */
const NULL_FLOOR_SANITY_INR = 20000;

/**
 * withinGstBand — does a captured whole-rupee `amount` fall in the GST-tolerant
 * band around an `expected` SKU amount? `[expected*0.98, expected*1.18]` (+₹1
 * rounding slack), so a GST-inclusive ₹472 still matches an expected ₹400 while a
 * neighbouring tier (₹600, ₹8,000) never does. Null/zero expected → no match.
 */
function withinGstBand(amount: number, expected: number | null | undefined): boolean {
  const e = Number(expected);
  const a = Number(amount);
  if (!Number.isFinite(e) || e <= 0 || !Number.isFinite(a) || a <= 0) return false;
  return a >= e * GST_LOWER && a <= e * GST_UPPER + 1;
}

/**
 * amountToProduct — classify a Razorpay payment by its whole-rupee amount, per
 * `FUNNEL-DATA-AUDIT.md` §4 (Razorpay carries no SKU, so the amount IS the
 * product). The tabled amounts are matched with a GST-tolerant band (not an exact
 * `=== 400` / `=== 8000`), so a GST-inclusive capture still classifies; the
 * forge-app-fee and balance/full buckets stay ranges. The raw amount is retained
 * on the result so an edge amount is auditable and never silently promoted.
 */
export function amountToProduct(amountInr: number): ProductInfo {
  const amount = Number(amountInr);
  let kind: ProductKind = "unknown";

  if (!Number.isFinite(amount) || amount <= 0) {
    kind = "unknown";
  } else if (withinGstBand(amount, 400)) {
    kind = "live-app-fee";
  } else if (amount >= 600 * GST_LOWER && amount <= 900 * GST_UPPER + 1) {
    kind = "forge-app-fee";
  } else if (withinGstBand(amount, 8000)) {
    kind = "live-seat-confirm";
  } else if (withinGstBand(amount, 15000)) {
    kind = "forge-seat-confirm";
  } else if (amount >= 22000 * GST_LOWER) {
    kind = "balance-or-full";
  } else {
    kind = "unknown";
  }

  return {
    kind,
    amountInr: amount,
    isAppFee: kind === "live-app-fee" || kind === "forge-app-fee",
    isSeatConfirm: kind === "live-seat-confirm" || kind === "forge-seat-confirm",
    isBalanceOrFull: kind === "balance-or-full",
  };
}

/**
 * offeringToProductMatch — build the offering → TeleCRM `product_1` map at the
 * CODE level (per the brief: `offerings` has no `product_1` column and no shared
 * map exists; a migration is explicitly out of scope this phase). Maps an
 * offering's slug/title keywords to the `product_1` codes seen in the audit
 * (`VE`, `FC`, `FFM`, `FW`, `FAI`, `BFP`, `L3C`). Best-effort: an offering that
 * maps to nothing returns `[]`, and the TeleCRM scope then falls back to
 * newest-overall (single-application safe). Pure + unit-tested.
 */
export function offeringToProductMatch(o: {
  slug?: string | null;
  title?: string | null;
  type?: string | null;
}): string[] {
  const hay = `${o.slug ?? ""} ${o.title ?? ""}`.toLowerCase();
  const codes = new Set<string>();
  // Forge track — product-distinct app fees; product_1 names the vertical.
  if (/writ/.test(hay)) codes.add("FW"); // Forge Writing
  if (/creator|content/.test(hay)) codes.add("FC"); // Forge Creators
  if (/film/.test(hay)) codes.add("FFM"); // Forge Filmmaking
  if (/\bai\b|artificial/.test(hay)) codes.add("FAI"); // Forge AI
  // Live track.
  if (/\bbfp\b|breakthrough/.test(hay)) codes.add("BFP");
  if (/video edit|editing academy|\bve\b/.test(hay)) codes.add("VE");
  if (/\bl3c\b|builder cohort|ai builder/.test(hay)) codes.add("L3C");
  return [...codes];
}

/** Lowercase + trim a TeleCRM status for stable comparison (the picklist has mixed case). */
function normStatus(status: string | null): string {
  return (status ?? "").trim().toLowerCase();
}

/** Uppercase + trim a `product_1` code for stable comparison. */
function normProduct(product: string | null | undefined): string {
  return (product ?? "").trim().toUpperCase();
}

/**
 * TeleCRM statuses that only exist once the applicant COMPLETED the form. A
 * `Fee Link Sent` lead has, by definition, finished the form to be sent the
 * link, so completion is inferable from the status even when the essay text
 * isn't in the read.
 */
const COMPLETED_STATUSES = new Set<string>([
  "fee link sent",
  "application fee paid",
  "interview scheduled",
  "need to reschedule interview",
  "interview completed",
  "no show",
  "accepted",
  "converted",
]);

/**
 * Statuses that CORROBORATE a shared ₹400 app-fee capture belongs to THIS
 * offering (council B1). Reaching `Application Fee Paid` (or any later stage)
 * proves the scoped lead actually paid the fee for this offering — mere lead
 * EXISTENCE at `NEW`/`Fee Link Sent` does NOT (the applicant only applied; the
 * shared ₹400 could be any Live cohort's). This is `COMPLETED_STATUSES` minus the
 * pre-payment `fee link sent`.
 */
const APP_FEE_CORROBORATING_STATUSES = new Set<string>([
  "application fee paid",
  "interview scheduled",
  "need to reschedule interview",
  "interview completed",
  "no show",
  "accepted",
  "converted",
]);

/**
 * Statuses that CORROBORATE a shared ₹8k/₹15k seat-confirm belongs to THIS
 * offering (council B1). The seat-confirm deposit is post-interview, so only
 * `Interview completed`/`Accepted`/`Converted` prove the scoped lead reached the
 * point where a seat-confirm is captured. `Application Fee Paid` (or earlier) is
 * NOT sufficient — a same-SKU sibling intake shares both the amount AND the lead's
 * `product_1`, so an app-fee-level status can never pin the seat-confirm to one
 * intake; only a later status (or a first-party `payment_orders` row) can.
 */
const SEAT_CONFIRM_CORROBORATING_STATUSES = new Set<string>([
  "interview completed",
  "accepted",
  "converted",
]);

/**
 * Terminal-NEGATIVE `cohort_applications.status` values — an application that was
 * rejected/withdrawn/waitlisted has no forward progress. The edge fn's mirror
 * write must not stamp a progress stage or outreach markers on such a row
 * (council data-layer floor), so a later outreach job keyed on `reconciled_*`
 * can't fire on a dead application. NOTE: this DUPLICATES the `-1` entries of the
 * client `STATUS_TO_STEP` map in `src/pages/ApplicationStatus.tsx`; there is no
 * shared constant across the client bundle and this import-free edge module, so
 * keep the two in sync by hand if the picklist grows a new terminal status.
 */
export const TERMINAL_NEGATIVE_STATUSES = new Set<string>([
  "rejected",
  "withdrawn",
  "waitlisted",
]);

/** Newest lead (highest timestamp) of a set, or null if empty. */
function newestLead(leads: readonly TeleCrmLead[]): TeleCrmLead | null {
  if (leads.length === 0) return null;
  let best = leads[0];
  for (const l of leads) if (l.timestamp > best.timestamp) best = l;
  return best;
}

/**
 * selectScopedLead — pick the TeleCRM lead for THIS offering: the newest lead
 * whose `product_1` is in `productMatch`. If the offering couldn't be mapped
 * (`productMatch` empty) OR no lead carries any `product_1` at all, fall back to
 * newest-overall (legacy behaviour — correct for a single-application caller). If
 * leads ARE product-tagged but none match this offering, return null: this
 * offering has no TeleCRM signal, and a sibling's lead must NOT leak into it.
 */
function selectScopedLead(
  leads: readonly TeleCrmLead[],
  productMatch: readonly string[],
): TeleCrmLead | null {
  if (leads.length === 0) return null;
  const want = new Set(productMatch.map(normProduct).filter((c) => c !== ""));
  const anyTagged = leads.some((l) => normProduct(l.product1) !== "");
  if (want.size === 0 || !anyTagged) return newestLead(leads);
  const scoped = leads.filter((l) => want.has(normProduct(l.product1)));
  return scoped.length > 0 ? newestLead(scoped) : null;
}

/**
 * A shared-tier expected amount cannot be pinned to one offering by amount alone:
 * the Live ₹400 app-fee is shared across all Live cohorts, and the ₹8k (Live) /
 * ₹15k (Forge) seat-confirm deposits are shared across their track. Forge app
 * fees (₹600–900) are product-distinct and so are NOT shared.
 */
function isSharedTier(expected: number | null): boolean {
  if (expected == null) return false;
  const k = amountToProduct(expected).kind;
  return k === "live-app-fee" || k === "live-seat-confirm" || k === "forge-seat-confirm";
}

/**
 * Prefer phone over email, take the first source that resolved a real match.
 * Returns null only when NOTHING resolved to this offering (the orphan).
 */
function pickResolvedKey(keys: ResolvedKey[]): ResolvedKey {
  if (keys.includes("phone")) return "phone";
  if (keys.includes("email")) return "email";
  return null;
}

/**
 * deriveStage — the pure, OFFERING-SCOPED §6 stage→CTA derivation.
 *
 * Given the target `offering` plus the three normalized (already fail-soft) reads
 * and the caller's join keys, resolve the single furthest-progressed funnel stage
 * FOR THAT OFFERING, the resolving join key, and the two markers. The TeleCRM
 * signal is the lead whose `product_1` maps to this offering; the money signals
 * are captured amounts matched against this offering's OWN amounts (GST-tolerant),
 * with shared-tier amounts attributed only when a `product_1` lead or a
 * first-party payment confirms them (otherwise `ambiguous`). Evaluation is
 * most-advanced-first so a user who has moved on is never pinned to an earlier
 * stage. If nothing resolved to this offering, the result is the orphan
 * (`stage: "unknown"`, `resolvedKey: null`) — surfaced by the health metric, not
 * an error.
 *
 * `keys` are the caller's normalized join keys (from `joinKeys`). They gate the
 * `contactablePartial` marker, whose §7.2 definition is a *phone+email* partial —
 * a lead we can reach on BOTH channels — so a phone-only or email-only partial
 * must NOT flip it (that gate can't be read off the source reads alone).
 */
export function deriveStage(
  offering: OfferingContext,
  tally: TallyRead,
  telecrm: TeleCrmRead,
  razorpay: RazorpayRead,
  keys: JoinKeys,
): DerivedStage {
  // --- TeleCRM: scope to the lead whose product_1 maps to THIS offering (§5) ---
  const scopedLead = telecrm.available
    ? selectScopedLead(telecrm.leads, offering.productMatch)
    : null;
  const status = scopedLead?.status ?? null;
  const s = normStatus(status);
  const telecrmEssay = scopedLead?.essayPresent ?? false;
  const telecrmKey = scopedLead?.resolvedKey ?? null;

  // --- Money signals: match captured amounts to THIS offering's own amounts,
  //     GST-tolerant (§4.5). `amounts` retains every resolved amount for audit. ---
  const products = razorpay.available ? razorpay.products : [];
  const amounts = products.map((p) => p.amountInr);
  const appFeeMatched = amounts.some((a) => withinGstBand(a, offering.appFeeInr));
  const confirmMatched = amounts.some((a) => withinGstBand(a, offering.confirmationAmountInr));

  // --- Shared-tier disambiguation (council B1). A shared amount (Live ₹400 / ₹8k,
  //     Forge ₹15k) is attributed to THIS offering only when corroborated — NOT on
  //     mere lead existence. Confidence is PER TIER: a first-party `payment_orders`
  //     row (offering-exact) confirms any amount; otherwise the scoped lead's OWN
  //     status must corroborate the tier — `Application Fee Paid`+ for the ₹400,
  //     `Interview completed`/`Accepted`/`Converted` for the seat-confirm. A lead
  //     sitting at `NEW`/`Fee Link Sent` proves only that the applicant applied, so
  //     an uncorroborated shared amount stays `ambiguous`, never mis-assigned. ---
  const firstPartyConfirmed = razorpay.firstPartyConfirmed === true;
  const appFeeConfident = firstPartyConfirmed || APP_FEE_CORROBORATING_STATUSES.has(s);
  const seatConfirmConfident = firstPartyConfirmed || SEAT_CONFIRM_CORROBORATING_STATUSES.has(s);
  let ambiguous = false;
  const attributeShared = (
    matched: boolean,
    expected: number | null,
    confident: boolean,
  ): boolean => {
    if (!matched) return false;
    if (isSharedTier(expected) && !confident) {
      ambiguous = true;
      return false;
    }
    return true;
  };
  const hasAppFee = attributeShared(appFeeMatched, offering.appFeeInr, appFeeConfident);
  const hasSeatConfirm = attributeShared(
    confirmMatched,
    offering.confirmationAmountInr,
    seatConfirmConfident,
  );
  // A shared app-fee amount matched but could NOT be attributed to this offering
  // (shared-tier + uncorroborated) — we saw a ₹400 that MIGHT be this caller's.
  // That is `ambiguous` (surfaced for the client to soften the CTA), and it must
  // also hold back the outreach markers below: flagging a possibly-paid caller as
  // "owes the app fee" is a pay-twice chase. We never mis-credit (the money stays
  // unattributed), but we also never assert the fee is unpaid over a match we saw.
  const appFeeAmbiguous =
    appFeeMatched && isSharedTier(offering.appFeeInr) && !appFeeConfident;
  // Balance/full → `enrolled` (terminal, no onward CTA). Scoped to THIS offering's
  // OWN floor (`price_inr − appFee − confirmation`), NOT a global `≥₹22k` threshold
  // (council B2): an unrelated ≥₹22k for another product sits below a pricier
  // offering's floor and must neither force a false `enrolled` nor mask a real
  // `confirm-paid-no-balance`.
  //
  // P1 (mirror correctness): when the offering carries no `price_inr` (floor null),
  // do NOT disable balance/full detection outright — that pins a fully-paid student
  // at `confirm-paid-no-balance` (they paid a ₹8k/₹15k seat-confirm AND the balance,
  // but only the seat-confirm was ever detectable), corrupting the read-through
  // MIRROR + the NSM measurement. Instead fall back to a CONSERVATIVE global
  // upper-sanity (`NULL_FLOOR_SANITY_INR`, also ≥ this offering's own seat-confirm ×2)
  // that no app-fee/seat-confirm can reach, so a real balance/full capture still
  // infers `enrolled`. The offering floor is always preferred when present; the
  // conservative sanity is used ONLY when the floor is null.
  const balanceFloor = offering.balanceFloorInr;
  const effectiveBalanceFloor =
    balanceFloor != null && balanceFloor > 0
      ? balanceFloor
      : Math.max(
          NULL_FLOOR_SANITY_INR,
          offering.confirmationAmountInr != null && offering.confirmationAmountInr > 0
            ? offering.confirmationAmountInr * 2
            : 0,
        );
  const hasBalanceOrFull = amounts.some((a) => a >= effectiveBalanceFloor * GST_LOWER);
  // The person resolved to a payment (by phone/email) whenever an amount matched
  // one of THIS offering's own bands — used for join health even if the offering
  // attribution is ambiguous.
  const razorpayKey =
    appFeeMatched || confirmMatched || hasBalanceOrFull ? razorpay.resolvedKey : null;

  // --- Resolving join key, scoped to this offering (phone primary → email) ---
  const resolvedKey = pickResolvedKey([
    tally.available ? tally.resolvedKey : null,
    telecrmKey,
    razorpayKey,
  ]);

  // --- Completion signals (essay presence OR a post-completion status, §3.3/§5.3) ---
  const essayPresent = (tally.available && tally.essayPresent) || telecrmEssay;
  const completed =
    (tally.available && tally.completed) || essayPresent || COMPLETED_STATUSES.has(s);
  const partial =
    (tally.available && tally.partial && !tally.completed) || (s === "new" && !essayPresent);

  // --- Markers (§7.2) ---
  // completed-no-fee: essay present anywhere AND no matching captured app fee. An
  // ambiguous app-fee match (a ₹400 we couldn't attribute) suppresses it — see
  // `appFeeAmbiguous` — so a possibly-paid caller is never queued for the fee chase.
  const completedNoFee = essayPresent && !hasAppFee && !appFeeAmbiguous;
  // contactable-partial (§7.2): a *phone+email* partial with no completion and no
  // fee — a known lead we can reach on BOTH channels who never finished. Likewise
  // held back by an ambiguous app-fee match (they may already have paid).
  const contactablePartial =
    keys.phone !== null &&
    keys.email !== null &&
    partial &&
    !completed &&
    !hasAppFee &&
    !appFeeAmbiguous;

  const markers: StageMarkers = { completedNoFee, contactablePartial };

  // --- Orphan: nothing resolved to THIS offering and no signal → unknown (not an error) ---
  const matchedAnything =
    resolvedKey !== null ||
    hasAppFee ||
    hasSeatConfirm ||
    hasBalanceOrFull ||
    (scopedLead !== null && !!status) ||
    (tally.available && (tally.completed || tally.partial));
  if (!matchedAnything) {
    return { stage: "unknown", resolvedKey: null, markers, telecrmStatus: null, amounts, ambiguous };
  }

  // --- §6 stage resolution, most-advanced-first ---
  //
  // v1 money-stage mirror caveat: the money-bearing stages below (`enrolled` via a
  // shared seat-confirm, `confirm-paid-no-balance`) rest on shared-tier attribution
  // (council B1). For a multi-Live-application user, a single ₹8k/₹15k seat-confirm
  // is shared across cohorts, so even with the `ambiguous` guard a corroborated
  // seat-confirm can still be mirrored onto the "wrong" one of two same-track
  // applications (P2/P3) until Phase-2 staged payments populate `payment_orders`
  // with offering-EXACT, first-party attribution. That residual imperfection is
  // precisely WHY money stages do NOT drive UI in v1: the client suppresses the
  // reconciled override for `completed-no-fee`/`confirm-paid-no-balance` and falls
  // back to the status-driven timeline (V1-1). The stages are still DERIVED here for
  // the mirror + NSM measurement, and all confident-attribution + `ambiguous`
  // machinery stays intact, ready for the fast-follow money-CTA re-enable.
  let stage: Stage;
  if (hasBalanceOrFull || s === "converted") {
    stage = "enrolled";
  } else if (hasSeatConfirm) {
    stage = "confirm-paid-no-balance";
  } else if (s === "accepted") {
    stage = "accepted";
  } else if (s === "interview completed") {
    stage = "awaiting-decision";
  } else if (s === "interview scheduled" || s === "need to reschedule interview") {
    stage = "interview-scheduled";
  } else if (hasAppFee || s === "application fee paid") {
    // Fee is paid but no later status advanced (those were handled above) → book interview.
    stage = "fee-paid-no-interview";
  } else if (completed) {
    // Completed the form but no captured fee → pay the ₹400 (the completed-no-fee state).
    stage = "completed-no-fee";
  } else if (partial) {
    stage = "partial";
  } else {
    // Resolved to a lead but with no completion/partial/money signal (e.g. a bare
    // `NEW`/`WARM`/`Lost` status with an essay we couldn't read): treat as unknown
    // rather than inventing a stage.
    stage = "unknown";
  }

  return { stage, resolvedKey, markers, telecrmStatus: status, amounts, ambiguous };
}

/**
 * computeJoinHealth — the per-run join-completeness metric. This is a PERSON-LEVEL
 * (source-level) health signal, deliberately independent of the offering-scoped
 * derivation: an orphan is a caller that NO reachable source matched
 * (`sourcesResolved === 0`), NOT a caller who resolved to a source but not to the
 * queried offering. Scoping orphan to the offering-scoped derived key would count a
 * multi-application caller (or a `product_1` that doesn't map to this offering) as
 * an orphan even though a source resolved them — self-contradictory
 * (`orphan` yet `sourcesResolved >= 1`) and it inflates the aggregate surge alert,
 * the opposite of calming it. When every source is unavailable the run isn't
 * assessable (source availability is a separate signal already in `sources`), so it
 * is NOT counted as an orphan — a total outage must not masquerade as an orphan surge.
 */
export function computeJoinHealth(
  tally: TallyRead,
  telecrm: TeleCrmRead,
  razorpay: RazorpayRead,
): JoinHealth {
  const all = [tally, telecrm, razorpay];
  const sourcesAvailable = all.filter((s) => s.available).length;
  const sourcesResolved = all.filter((s) => s.available && s.resolvedKey !== null).length;
  // Person-level: resolved when ANY reachable source matched this caller. Kept
  // consistent with `sourcesResolved` so `orphan` can never contradict it.
  const resolved = sourcesResolved > 0;
  const assessable = sourcesAvailable > 0;
  const orphan = assessable && !resolved;
  // Not assessable (no reachable source) → treat as complete so the orphan alert
  // stays quiet; a joined caller is complete; an orphan against reachable sources
  // is 0.
  const joinCompleteness = !assessable ? 1 : resolved ? 1 : 0;
  return {
    resolved,
    orphan,
    sourcesAvailable,
    sourcesResolved,
    joinCompleteness,
    orphanRate: 1 - joinCompleteness,
  };
}
