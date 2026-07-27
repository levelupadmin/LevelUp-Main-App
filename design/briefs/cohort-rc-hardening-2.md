# PHASE RC — Hardening 2 (money-attribution root cause)
*Closes the three flag-on money-routing blockers (B1/B2/B3) the second `bugfix-council` proved on the real deriveStage surface. Branch `design/cohort-rc`, still dark. Source: the re-council verdict (2026-07-22) + `FUNNEL-DATA-AUDIT.md` §5 ("which cohort a ₹400 payer belongs to: not knowable from Razorpay alone") + INTEG-PAY-1.*

## The one root cause (fix this, not the symptoms)
Offering-scoping fixed *cross-product* contamination (Live vs Forge), but the Live **₹400 app-fee and ₹8k seat-confirm amounts are SHARED across every Live cohort**. So a payment's amount + the mere *existence* of a `product_1` lead does NOT prove the money was captured for *this* offering. The reconciler must therefore treat a shared-amount money signal as **attributed only when corroborated**, and **withhold the money CTA whenever attribution can't be pinned to exactly one offering** — degrading to the existing status-driven timeline, which already owns payments today. "When in doubt, show information, never a money CTA." This is the safe default and it structurally closes B1/B2/B3.

## The three inviolable rules still hold (do not regress)
1. Payment pipeline + staged `isIOS()` guard byte-untouched (now at `ApplicationStatus.tsx:432/450`).
2. READ-ONLY externals (SOR-1): zero writes to Tally/TeleCRM/Razorpay; the TeleCRM POST is `/lead/search` (read).
3. Never writes `cohort_applications.status`, never authors `accepted`; only the 5 `reconciled_*` mirror columns.
Dark (`VITE_FUNNEL_RECON` off) — flag-off byte-identical to today.

---

## Task H3-1 — Confident-attribution money model + offering-scoped balance + data-layer floor (`tier: 1`)
**Files:** `supabase/functions/_shared/reconcile.ts`, `supabase/functions/reconcile-funnel-stage/index.ts`, `src/lib/__tests__/reconcile.test.ts`, `qa-harness/reconcile-fixtures.ts`
**Spec:**
1. **B1 — attribution requires corroboration, not lead-existence.** Today `attributionConfident = scopedLead !== null || firstPartyConfirmed` (reconcile.ts ~452). Existence of a `product_1` lead only proves the user APPLIED to this offering — not that a SHARED payment (₹400 / ₹8k / ₹15k) was captured for it. Redefine confident attribution of a **shared-tier** amount as: **(a)** a first-party `payment_orders` row for this `user_id`+`offering_id` (exact, unambiguous), **OR (b)** the scoped lead's own **STATUS corroborates the tier** — `Application Fee Paid`+ (or later) to attribute a ₹400; `Interview completed`/`Accepted`/`Converted` to attribute a ₹8k seat-confirm. Mere lead existence at `NEW`/`Fee Link Sent` is NOT sufficient for a shared seat-confirm. If neither holds → the money signal is **`ambiguous`** and the money-bearing stage is withheld (see step 4).
2. **B2 — offering-scope `hasBalanceOrFull`.** Today it's a global threshold (any capture ≥ ~₹21,560 → `enrolled`, evaluated first). Compare captures to **THIS offering's own** balance/full range (derived from its `price_inr` − app_fee − confirmation, or its own ≥-confirmation band), exactly as app-fee/confirm are now offering-scoped. An unrelated ≥₹22k for another product must neither force a false `enrolled` nor mask a real `confirm-paid-no-balance`.
3. **Data-layer status floor on the WRITE.** The mirror `.update()` must not stamp a progress stage or outreach markers when the application's OWN status is terminal-negative (`rejected`/`withdrawn`/`waitlisted` → `STATUS_TO_STEP` = -1). Read the application row's `status` (one scoped SELECT by user_id+offering_id) and, when it maps to -1, write `reconciled_stage=null`/no markers (or skip the progress write) — so future outreach jobs keyed on `reconciled_*` can't fire on a terminal row. (The client render floor already exists; this closes the DATA layer.)
4. **Withhold the money stage when `ambiguous`.** When a shared-tier amount is un-attributed (step 1) OR balance/full isn't offering-confirmed (step 2), do NOT resolve to a money-CTA stage (`confirm-paid-no-balance`, `enrolled`, `completed-no-fee`→pay-₹400) on the strength of that ambiguous money; resolve to the highest **non-money** stage the corroborated signals support and set `ambiguous=true`. The external `/payments` scan stays PRIMARY (INTEG-PAY-1; `payment_orders` supplementary) — this changes ATTRIBUTION confidence, not the source.
5. **Tests** (`reconcile.test.ts` + fixtures) — add the council's failing-then-passing cases: VE lead@`NEW` + `[8000]` (shared, uncorroborated) → **NOT** `confirm-paid-no-balance` (ambiguous, no pay-balance); same-SKU two-intake (one VE lead + `[400,8000]` → intake B) → **NOT** confirm-paid on B; no VE lead + `[25000]` → **NOT** `enrolled`; `[8000+25000]` global → **NOT** masking `confirm-paid-no-balance`; a corroborated case (lead@`Converted` + `[8000]`) → confirm-paid correctly; terminal status floor (rejected row → no progress stage written).
**Acceptance:** shared-tier money attributes ONLY with payment_orders or corroborating lead status; `hasBalanceOrFull` offering-scoped; terminal statuses get no progress mirror; every council B1/B2/B3 repro fixture is green (was-red); zero external writes; never writes `status`/`accepted`; `npx vitest run` + eslint green.

## Task H3-2 — Wire `ambiguous` end-to-end; withhold the payment CTA (`tier: 2`)
**Files:** `src/hooks/useFunnelStage.ts`, `src/pages/ApplicationStatus.tsx`
**Spec:**
1. Add `ambiguous: boolean` to the `FunnelStage` type (useFunnelStage.ts) — it's already returned by the fn (index.ts ~718) but dropped today.
2. `ApplicationStatus.tsx`: when `ambiguous` is true, render **chip-only — NO payment CTA** (fall back to the status-driven timeline that owns payments). Keep the existing render floors (`currentStepIndex>=0`, stage-not-behind-local). Keep the staged `isIOS()` guard byte-untouched and any new payment CTA isIOS-gated. Flag-off stays byte-identical (all of this is inert when `reconciled` is undefined).
3. Test: an `ambiguous` reconciled payload (e.g. stage=`completed-no-fee`, ambiguous=true) renders the chip and **no "Pay application fee"/"Pay balance" CTA** (the reconcile.test.ts:284-299 comment that "relies on the client to soften the CTA" is now actually wired).
**Acceptance:** `ambiguous` payloads render information-only, never a money CTA; single-application non-ambiguous callers still get their correct CTA; flag-off = zero diff incl. staged guard diff=0; build + vitest + lint green.

---
## Phase acceptance (integrate)
- `npm run build` green; `npx vitest run` green (incl. all B1/B2/B3 repro fixtures + the ambiguous-render test); `npm run lint` no NEW errors.
- Staged `isIOS()` guard diff=0; zero external writes; never writes `status`/`accepted`.
- Dark (`VITE_FUNNEL_RECON` off). Do NOT merge to main, do NOT deploy, do NOT apply the migration.
- Conventional commits (`fix(cohort): confident money attribution — withhold CTA when unattributable`, `fix(cohort): wire ambiguous flag, withhold payment CTA client-side`).
