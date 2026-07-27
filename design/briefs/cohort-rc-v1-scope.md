# PHASE RC — v1 scope: reconciler drives NON-MONEY stages only
*Rahul's decision (2026-07-22): disable reconciler payment CTAs in v1. The third `bugfix-council` verified the reconciler's payment-CTA attribution from shared external amounts is structurally fragile (P1 null-floor regression, P2/P3 shared-amount wrong-cohort). Option A closes the entire wrong-cohort/wrong-stage money-CTA class in one reversible move. Branch `design/cohort-rc`, still dark. Money CTAs re-enable as a fast-follow once Phase-2 staged payments populate `payment_orders` (offering-exact, first-party attribution).*

## The move
The reconciler still DERIVES every stage (for the NSM measurement backend + the mirror). But the CLIENT surfaces the reconciler ONLY for **non-money** stages; **money-bearing** reconciled stages fall back entirely to the existing status-driven timeline (chip = `statusLabel`, no reconciled CTA). No reconciler-driven payment CTA is rendered anywhere in v1. This structurally eliminates P1+P2+P3 from the UI.

**Money-bearing reconciled stages (client suppresses the reconciled override for these):** `completed-no-fee` (→ would be "Pay ₹400"), `confirm-paid-no-balance` (→ would be "Pay balance").
**Non-money reconciled stages the reconciler still drives (chip + CTA):** `partial` (resume application), `fee-paid-no-interview` (book interview), `interview-scheduled`, `awaiting-decision` (informational), `enrolled` (chip only). `unknown` stays neutral.

## The three inviolable rules still hold (do not regress)
1. Payment pipeline + staged `isIOS()` guard byte-untouched (`ApplicationStatus.tsx:432/450`).
2. READ-ONLY externals (SOR-1); zero writes to Tally/TeleCRM/Razorpay.
3. Never writes `cohort_applications.status`, never authors `accepted`; only the 5 `reconciled_*` mirror columns.
Dark (`VITE_FUNNEL_RECON` off) — flag-off byte-identical to today.

---

## Task V1-1 — Client: reconciler drives non-money stages only (`tier: 2`)
**Files:** `src/pages/ApplicationStatus.tsx`, `src/pages/__tests__/ApplicationStatus.ambiguous.test.tsx`
**Spec:**
1. Define a `MONEY_STAGES` set on the client: `{ "completed-no-fee", "confirm-paid-no-balance" }` (the two reconciled stages that map to a payment CTA — cross-check against `RECONCILED_STAGE_UI` entries whose CTA has `payment: true`).
2. Where the reconciled chip + CTA are computed: when the reconciled stage is in `MONEY_STAGES` (OR its candidate CTA has `payment: true`), **suppress the entire reconciled override** — the badge renders `statusLabel(application.status)` (not the reconciled chip) and NO reconciled CTA is rendered. For all NON-money stages, the reconciler drives the chip + CTA exactly as today. Keep the existing render floors (`currentStepIndex>=0`, stage-not-behind-local) and the `ambiguous` suppression (now a strict subset — all money stages are suppressed regardless of `ambiguous`).
3. The staged `isIOS()` confirmation_paid/balance_paid guards stay byte-untouched. Since no reconciler payment CTA ever renders in v1, the reconciled-CTA `isIOS()` gate becomes dead for money stages — that's fine (keep it, it's harmless + ready for the fast-follow re-enable). Flag-off stays byte-identical (inert when `reconciled` is undefined).
4. Tests: add cases — a `completed-no-fee` reconciled payload renders `statusLabel` chip + NO "Pay application fee" CTA; a `confirm-paid-no-balance` payload renders NO "Pay balance" CTA; a `fee-paid-no-interview` payload STILL renders the "book interview" CTA (non-money path preserved); an `enrolled` payload renders its chip.
**Acceptance:** grep/test proves NO reconciler payment CTA ("Pay application fee"/"Pay balance") can render from any reconciled stage in v1; non-money CTAs (resume, book interview) still render; flag-off = zero diff incl. staged guard diff=0; `npm run build` + `npx vitest run` + eslint green.

## Task V1-2 — Server: P1 null-floor mirror-correctness + document the money-stage caveat (`tier: 1`)
**Files:** `supabase/functions/_shared/reconcile.ts`, `src/lib/__tests__/reconcile.test.ts`, `qa-harness/reconcile-fixtures.ts`
**Spec:**
1. **P1 fix (mirror correctness, not a CTA — the CTA is already gone via V1-1):** when `balanceFloorInr` is null (offering missing `price_inr`), do NOT disable balance/full detection outright — fall back to a **conservative global upper-sanity** (e.g. a capture `>= confirmationAmountInr * 2` or a fixed high sentinel that no seat-confirm/app-fee can reach) so a fully-paid student still derives `enrolled` rather than `confirm-paid-no-balance`. This keeps the MIRROR + NSM measurement correct even though no CTA renders. Prefer the offering floor when present; only use the conservative sanity when the floor is null.
2. **Document the v1 money-stage mirror caveat:** add a comment on the money-stage derivation noting that for multi-Live-application users a shared seat-confirm may still mirror an imperfect money stage (P2/P3) until Phase-2 staged payments populate `payment_orders` for offering-exact attribution — which is WHY money stages do not drive UI in v1 (client suppresses them, V1-1). Keep all the confident-attribution + `ambiguous` machinery intact (it's correct and ready for the fast-follow re-enable).
3. Tests: the null-floor fully-paid fixture (lead@Accepted + `[8000,33000]`, offering price_inr null) now derives `enrolled` (not `confirm-paid-no-balance`); the existing offering-floor tests stay green.
**Acceptance:** null-floor fully-paid derives `enrolled`; offering-scoped floor behavior unchanged when price present; zero external writes; never writes `status`/`accepted`; vitest + eslint green.

---
## Phase acceptance (integrate)
- `npm run build` green; `npx vitest run` green (incl. the new no-money-CTA + null-floor tests); `npm run lint` no NEW errors.
- **Grep proof:** no reconciler-driven "Pay application fee"/"Pay balance" CTA can render in v1 (money stages suppressed to status-chip).
- Staged `isIOS()` guard diff=0; zero external writes; never writes `status`/`accepted`.
- Dark (`VITE_FUNNEL_RECON` off). Do NOT merge to main, do NOT deploy, do NOT apply the migration.
- Conventional commits (`feat(cohort): RC v1 — reconciler drives non-money stages only`, `fix(cohort): null-floor mirror correctness (P1)`).
