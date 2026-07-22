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
 * Normalized read from Tally (the intake system). `available: false` means the
 * source was unreachable or its secret was unset — it contributes no signal and
 * is NEVER treated as "no submission".
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
 * Normalized read from TeleCRM (the master funnel-status system, §5). The stage
 * lives in the top-level `status` picklist; `mql` is the real MQL score.
 */
export interface TeleCrmRead {
  available: boolean;
  resolvedKey: ResolvedKey;
  status: string | null; // the top-level status picklist value (newest lead wins)
  mql: number | null; // fields.mql (≥40 = high)
  essayPresent: boolean; // fields.essay present / character_count > 0 (§5.3)
}

/**
 * Normalized read from Razorpay (payments). Only captured/authorized payments
 * matched to the user by phone→email appear here (§4.5); amount → product.
 */
export interface RazorpayRead {
  available: boolean;
  resolvedKey: ResolvedKey;
  products: ProductInfo[];
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
  /** The TeleCRM status the derivation saw (null when TeleCRM was unavailable / no match). */
  telecrmStatus: string | null;
  /** Raw Razorpay amounts that resolved to this user, for auditability (§4.5). */
  amounts: number[];
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

/**
 * amountToProduct — classify a Razorpay payment by its whole-rupee amount, per
 * `FUNNEL-DATA-AUDIT.md` §4 (Razorpay carries no SKU, so the amount IS the
 * product). Ranges (not just the exact tabled amounts) are used for the fee and
 * balance/full buckets so a real ₹25,785 balance or a ₹650 fee still classifies;
 * the raw amount is retained on the result so an edge amount is auditable and
 * never silently promoted.
 */
export function amountToProduct(amountInr: number): ProductInfo {
  const amount = Number(amountInr);
  let kind: ProductKind = "unknown";

  if (!Number.isFinite(amount) || amount <= 0) {
    kind = "unknown";
  } else if (amount === 400) {
    kind = "live-app-fee";
  } else if (amount >= 600 && amount <= 900) {
    kind = "forge-app-fee";
  } else if (amount === 8000) {
    kind = "live-seat-confirm";
  } else if (amount === 15000) {
    kind = "forge-seat-confirm";
  } else if (amount >= 22000) {
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

/** Lowercase + trim a TeleCRM status for stable comparison (the picklist has mixed case). */
function normStatus(status: string | null): string {
  return (status ?? "").trim().toLowerCase();
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
 * Prefer phone over email, take the first source that resolved a real match.
 * Returns null only when NOTHING matched in any reachable system (the orphan).
 */
function pickResolvedKey(
  tally: TallyRead,
  telecrm: TeleCrmRead,
  razorpay: RazorpayRead,
): ResolvedKey {
  const keys: ResolvedKey[] = [
    tally.available ? tally.resolvedKey : null,
    telecrm.available ? telecrm.resolvedKey : null,
    razorpay.available ? razorpay.resolvedKey : null,
  ];
  if (keys.includes("phone")) return "phone";
  if (keys.includes("email")) return "email";
  return null;
}

/**
 * deriveStage — the pure §6 stage→CTA derivation.
 *
 * Given the three normalized (already fail-soft) reads plus the caller's join
 * keys, resolve the single furthest-progressed funnel stage, the resolving join
 * key, and the two markers. Evaluation is most-advanced-first so a user who has
 * moved on is never pinned to an earlier stage. An unavailable source
 * contributes no signal (never a fabricated stage). If nothing matched anywhere,
 * the result is the orphan (`stage: "unknown"`, `resolvedKey: null`) — surfaced
 * by the health metric, not an error.
 *
 * `keys` are the caller's normalized join keys (from `joinKeys`). They gate the
 * `contactablePartial` marker, whose §7.2 definition is a *phone+email* partial —
 * a lead we can reach on BOTH channels — so a phone-only or email-only partial
 * must NOT flip it (that gate can't be read off the source reads alone).
 */
export function deriveStage(
  tally: TallyRead,
  telecrm: TeleCrmRead,
  razorpay: RazorpayRead,
  keys: JoinKeys,
): DerivedStage {
  const resolvedKey = pickResolvedKey(tally, telecrm, razorpay);

  // --- Money signals (only captured/authorized payments reach `products`, §4.5) ---
  const products = razorpay.available ? razorpay.products : [];
  const hasAppFee = products.some((p) => p.isAppFee);
  const hasSeatConfirm = products.some((p) => p.isSeatConfirm);
  const hasBalanceOrFull = products.some((p) => p.isBalanceOrFull);
  const amounts = products.map((p) => p.amountInr);

  // --- Funnel-status signal (TeleCRM is master; unavailable → no status) ---
  const status = telecrm.available ? (telecrm.status ?? null) : null;
  const s = normStatus(status);

  // --- Completion signals (essay presence OR a post-completion status, §3.3/§5.3) ---
  const essayPresent =
    (tally.available && tally.essayPresent) ||
    (telecrm.available && telecrm.essayPresent);
  const completed =
    (tally.available && tally.completed) ||
    essayPresent ||
    COMPLETED_STATUSES.has(s);
  const partial =
    (tally.available && tally.partial && !tally.completed) ||
    (s === "new" && !essayPresent);

  // --- Markers (§7.2) ---
  // completed-no-fee: essay present anywhere AND no matching captured ₹400/₹600–900.
  // Uses essay presence specifically (NOT the broader `completed`), so a ₹400
  // with no Tally completion keeps this FALSE — the marker needs essay-present.
  const completedNoFee = essayPresent && !hasAppFee;
  // contactable-partial (§7.2): a *phone+email* partial with no completion and no
  // fee — a known lead we can reach on BOTH channels who never finished. Requires
  // both join keys present (not merely one resolved), so a phone-only or
  // email-only partial does NOT flip it. Clears once they complete.
  const contactablePartial =
    keys.phone !== null &&
    keys.email !== null &&
    partial &&
    !completed &&
    !hasAppFee;

  const markers: StageMarkers = { completedNoFee, contactablePartial };

  // --- Orphan: nothing resolved and no signal anywhere → unknown (not an error) ---
  const matchedAnything =
    resolvedKey !== null ||
    hasAppFee ||
    hasSeatConfirm ||
    hasBalanceOrFull ||
    (telecrm.available && !!status) ||
    (tally.available && (tally.completed || tally.partial));
  if (!matchedAnything) {
    return { stage: "unknown", resolvedKey: null, markers, telecrmStatus: null, amounts };
  }

  // --- §6 stage resolution, most-advanced-first ---
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

  return { stage, resolvedKey, markers, telecrmStatus: status, amounts };
}
