# PHASE RC — Hardening (council flag-on blockers)
*Applies the `bugfix-council` (2026-07-22, SHIP-AFTER-VERIFICATION) flag-on blockers to the dark reconciler on branch `design/cohort-rc`. The dark artifact is already council-cleared to exist; this pass makes it CORRECT so the flag can be flipped after Rahul's sign-off. Source: the council verdict + `design/cohorts/docs/04-INTEGRATION-CONTRACTS.md` §7/§4.1 (INTEG-PAY-1) + `design/cohorts/funnel/FUNNEL-DATA-AUDIT.md` §2/§4.*

## The core defect (the council's headline)
`deriveStage` (reconcile.ts) returns ONE **global** furthest-progress stage across ALL the caller's offerings; `ApplicationStatus.tsx` stamps that global chip/CTA onto ONE specific application (badge override + a payment CTA routed to the viewed offering). For a multi-application user this shows a wrong badge (even on rejected/withdrawn rows) and routes money to the wrong offering the moment the flag flips. **Passing `offering_id` to the hook does NOT fix it — that only scopes the mirror WRITE; the payload stays global.** The fix is **offering-scoped derivation**, which simultaneously makes the mirror write correct (closes the council's Risk A).

## The three inviolable rules still hold (do not regress)
1. Payment pipeline + `ApplicationStatus.tsx` staged `isIOS()` guard byte-untouched. Any NEW payment CTA stays `isIOS()`-gated (Apple anti-steering).
2. READ-ONLY against externals (SOR-1): zero writes to Tally/TeleCRM/Razorpay; the TeleCRM `lead/search` POST is a read.
3. The app never writes `cohort_applications.status` and never authors `accepted`; the only write is the 5 app-owned `reconciled_*` mirror columns.
Ships **dark** (`VITE_FUNNEL_RECON` default off) — flag-off stays byte-identical to today.

---

## Task H1 — Offering-scoped derivation + orphan-alert fix + health extract + Razorpay/Tally hardening (`tier: 1`)
**Files:** `supabase/functions/_shared/reconcile.ts`, `supabase/functions/reconcile-funnel-stage/index.ts`, `src/lib/__tests__/reconcile.test.ts`, `qa-harness/reconcile-fixtures.ts`
**Spec:**
1. **Offering-scope the derivation.** `deriveStage` takes the **target offering context** — `{ offeringId, appFeeInr, confirmationAmountInr, productMatch }` (the offering's own amounts + its TeleCRM `product_1` mapping) — and resolves the stage FOR THAT offering only:
   - **TeleCRM:** pick the lead whose `product_1` maps to this offering (not any lead); use THAT lead's `status`/`mql`/essay.
   - **Razorpay/payments:** match captured amounts against **this offering's** `appFeeInr` / `confirmationAmountInr` (from the `offerings` row), **GST-tolerant** — match a band around the expected amount (e.g. `>= expected*0.98 && < nextTier`), NOT an exact `=== 8000`, so GST-inclusive captures are not missed. Live ₹400 is shared across Live cohorts, so when only the shared app-fee resolves and the offering can't be disambiguated, prefer the TeleCRM `product_1` lead as the tie-breaker; if still ambiguous, mark that money signal `ambiguous` rather than mis-assigning.
   - The returned stage is **per-application**, never global.
2. **Edge fn requires `offering_id`.** The fn reads `offering_id` from the request body and derives scoped to it. If absent → 400 (every real caller has an application context; the client always passes it after H2). Load the offering's `app_fee_inr`/`confirmation_amount_inr` from `offerings` to feed the GST-tolerant match. The mirror `.update()` (already `.eq(user_id).eq(offering_id)`) now actually runs because `offering_id` is present.
3. **Razorpay source — KEEP EXTERNAL PRIMARY (INTEG-PAY-1).** The live ₹400/₹8k run on hardcoded Razorpay links and carry no app id (0/199, `FUNNEL-DATA-AUDIT.md` §2), so `payment_orders` is DORMANT for the live funnel and CANNOT be the primary money signal. Retain the external `/payments` scan as the primary NET-match by phone→email. **ADD** a `payment_orders` first-party lookup (`.eq(user_id).eq(offering_id)`, exact `payment_type`/`captured_at`) as a FAST SUPPLEMENTARY signal that short-circuits when an app-path payment exists (rare today, future-proof) — it does not replace the external scan. Bound the login-adjacent cost: add a **per-user short-TTL server cache** (e.g. reuse the reconciled_at column or a light in-fn cache keyed by user+offering) so a caller can't exhaust the shared external quota; now that derivation is offering-scoped, the external scan can filter to this offering's amount band and stop early.
4. **Extract `computeJoinHealth` into `_shared/reconcile.ts`** (pure, unit-testable, no mocking). Keep the "total outage is NOT an orphan" logic. **Fix the orphan alert:** it currently treats a per-run binary as a rate and `console.error`s (with the user UUID) for EVERY orphan caller → log-flooding/alert-fatigue. Downgrade the per-caller orphan to `warn` (or emit a UUID-free structured counter); reserve `error` for a genuine cross-run/aggregate signal. Never log the Razorpay payments array or TeleCRM leads array (grep the diff to confirm).
5. **Paginate `readTally`** the same way `readRazorpay` is paged (or, if a single page provably covers any real applicant, document why in a comment) — do not leave an asymmetric un-paged Tally read that under-reports the same class Razorpay was paged to avoid.
6. **Update tests** (`reconcile.test.ts` + `reconcile-fixtures.ts`): the offering-scoped `deriveStage` signature; a **multi-application fixture proving no contamination** (offering A = fee-paid, offering B = rejected → `deriveStage(A)` = fee-paid-no-interview, `deriveStage(B)` = the B stage, never A's); the GST-tolerant amount match; `computeJoinHealth` (total-outage-not-orphan + above-watch-line).
**Acceptance:** `deriveStage` is offering-scoped (multi-application fixture proves no cross-offering bleed); external Razorpay stays the primary money signal with `payment_orders` supplementary + GST-tolerant bands; orphan alert no longer error-logs per caller with a UUID; `computeJoinHealth` is pure + unit-tested; Tally paged or justified; zero external writes; never writes `status`/`accepted`; `npx vitest run` + eslint on touched files green.

## Task H2 — Client: pass offering_id, scope the chip/CTA to the application (`tier: 2`)
**Files:** `src/hooks/useFunnelStage.ts`, `src/pages/ApplicationStatus.tsx`
**Spec:**
1. `useFunnelStage(uid, offeringId)` passes `{ body: { offering_id: offeringId } }` to `supabase.functions.invoke("reconcile-funnel-stage", { body })`; include `offeringId` in the query key (`["funnel","stage",uid,offeringId]`). Flag off → still inert (enabled:false), returns null, status-only fallback unchanged.
2. `ApplicationStatus.tsx` passes `application.offering_id` to the hook, so the reconciled chip + CTA reflect **THIS application's** offering — the global-stage contamination is gone. Keep: the isIOS() guard byte-untouched; the new payment CTA isIOS-gated; flag-off byte-identical to today; fn-unreachable → status-only (no spinner-lock).
**Acceptance:** a multi-application user sees the correct per-application chip/CTA (no sibling/rejected contamination); flag-off = zero diff incl. `ApplicationStatus.tsx` staged guard diff = 0; build + vitest + lint green.

---

## Phase acceptance (integrate)
- `npm run build` green; `npx vitest run` green (incl. the new contamination + health tests); `npm run lint` no NEW errors.
- The staged-payment `isIOS()` guard diff = 0; zero external writes; never writes `status`/`accepted`.
- Everything stays dark (`VITE_FUNNEL_RECON` off). Do NOT merge to main, do NOT deploy, do NOT apply the migration.
- Conventional commits (`fix(cohort): offering-scope the reconciler derivation`, `fix(cohort): client passes offering_id + scopes the chip/CTA`, etc.).
