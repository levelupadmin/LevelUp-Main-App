# PHASE SP — The Identity Spine
*Slice 1, rung 1.2 · REQ-IDENT-1/2/3/4 + OTP-1 · branch `design/cohort-sp` · worktree `/Users/rahulsrinivas/Claude/LevelUp-cohort`.*
*Sources: `design/cohorts/EXECUTION-BACKLOG-V3.md` §PHASE SP; `design/cohorts/docs/01-PRD.md` §5.1; `04-INTEGRATION-CONTRACTS.md` §2.*

## What this phase is
An applicant who fills the Tally form becomes an app user **automatically — no signup screen, ever**. One passwordless `auth.users` row carries **both phone and email**, so a later OTP on *either* channel resolves to the same `auth.uid`. Collisions never silent-merge: they defer to an interactive claim at first sign-in. Sign-in offers a Phone tab (today's MSG91 flow, untouched) and a new Email tab.

## 🔴 A DESIGN CORRECTION THE BACKLOG PREDATES — READ THIS FIRST
The PRD writes REQ-IDENT-1 against the **Tally webhook** ("when a `FORM_RESPONSE` arrives…"). **That is now the wrong host.** Phase TP established that `tally-application-webhook` is **fail-closed and inert** (no `TALLY_SIGNING_SECRET`, and Rahul declined to set one), while `tally-application-poll` is what actually runs — it ingested the first 2 real applications on 2026-07-27. **Provisioning built into the webhook would never execute.**

**Therefore:** the provisioning + collision logic lives in a NEW shared module `supabase/functions/_shared/identity.ts`, and is CALLED by the poller (live today) and, optionally and unchanged in behaviour, by the webhook (if a signing secret is ever set). This is host-independent by construction, which is the property that matters — the intake host has already changed once.

## The inviolable rules (unchanged)
1. **The payment pipeline and `ApplicationStatus.tsx`'s `isIOS()` guards are untouched.**
2. **Phone-OTP must stay byte-identical to production.** `verify-msg91-otp` is the proven login path for every existing user; email OTP is ADDITIVE. If email OTP is disabled or broken, phone login is unaffected.
3. **Never a silent merge.** A collision leaves `user_id` NULL + `pending_claim` and creates/merges nothing.
4. **No user-facing signup screen exists in any flow** (grep must prove it).
5. Secrets by name only. `deno check` must pass (`npm run typecheck:functions`).

## Ground truth to build against (verified in this repo)
- Provisioning surface: `auth.admin.createUser({ email, phone, email_confirm:false, phone_confirm:false })` — the proven pattern at `guest-create-order/index.ts:247-255`.
- OTP resolution: `find_login_identity(p_phone, p_email)` — `verify-msg91-otp/index.ts:167-178`, call site `:175`.
- Interactive collision precedent: the 403 mismatch guard at `guest-create-order/index.ts:118-128`.
- Idempotency precedent: 23505 caught as success at `tally-application-webhook/index.ts:164-176`.
- Email delivery already exists: `queue-transactional-email`, `process-email-queue`, `auth-email-hook`.
- Phone helpers: `_shared/phone.ts` (`normalizePhone`, `e164`, `last10`, `syntheticEmail`).

## 🔗 EXACT CONTRACTS — so tasks build in PARALLEL, not in a queue
Every task below owns disjoint files. S-2/S-4/S-6 consume S-1's module; they must build against **these exact signatures** rather than waiting for it:
```ts
// supabase/functions/_shared/identity.ts
export interface IdentityInput { email?: string | null; phone?: string | null }
export interface JoinKeys { email: string | null; phone: string | null }   // lowercased email, last-10 phone
export function identityKeys(input: IdentityInput): JoinKeys
export type ProvisionOutcome =
  | { status: "created";   userId: string }
  | { status: "existing";  userId: string }
  | { status: "collision"; reason: "email_taken" | "phone_taken" | "cross_linked" }
  | { status: "skipped";   reason: "no_identifier" }
/** Pure decision step — NO network. Given what a lookup found, decide what to do. */
export function decideProvision(keys: JoinKeys, found: {
  byEmail?: { id: string } | null; byPhone?: { id: string } | null;
}): ProvisionOutcome
/** Pure claim check: does this second-channel OTP entitle the caller to the pending row? */
export function canClaim(pending: { email: string | null; phone: string | null },
                         verified: { channel: "email" | "phone"; value: string }): boolean
```

---

## Task S-1 — `_shared/identity.ts` + unit tests (`tier: 1`)
**Files:** `supabase/functions/_shared/identity.ts` *(new)*, `src/lib/__tests__/identity.test.ts` *(new)*
**Spec:** Implement exactly the contract above. **PURE and dependency-free** (like `_shared/phone.ts`) so vitest imports it via `@shared/identity` with zero mocking. `identityKeys` reuses the same normalisation semantics as `_shared/phone.ts` (last-10 phone, lowercased+trimmed email) — inline a tiny helper rather than importing, to keep the module import-free. `decideProvision` truth table: neither key → `skipped`; no existing row → `created`; both keys resolve to the SAME id → `existing`; email and phone resolve to DIFFERENT ids → `collision/cross_linked`; only email taken by another id → `collision/email_taken`; only phone taken → `collision/phone_taken`. `canClaim` returns true only when the verified channel's value matches the pending row's value for that channel.
**Acceptance:** every truth-table row unit-tested incl. both collision directions; `canClaim` rejects a mismatched channel and a mismatched value; module has zero imports; vitest + `deno check` green.

## Task S-2 — Provision from the poller (`tier: 1`)
**Files:** `supabase/functions/tally-application-poll/index.ts`, `supabase/functions/tally-application-webhook/index.ts`
**Spec:** After a row is built and BEFORE insert, resolve identity via `_shared/identity.ts`: look up `auth.users` by lowercased email and by last-10 phone, call `decideProvision`, then — `created` → `auth.admin.createUser({email, phone, email_confirm:false, phone_confirm:false})` and stamp `user_id`; `existing` → stamp that `user_id`; `collision` → leave `user_id` NULL and set `pending_claim = true`; `skipped` → insert as today. **Idempotent**: re-running a tick must not mint a second auth user (the poller already skips existing `tally_response_id`, so provisioning only ever runs for genuinely new rows). **Fail-soft**: a provisioning error must NOT lose the application — log and insert with `user_id` NULL. Apply the SAME call in the webhook so behaviour is identical if it is ever enabled; the webhook's existing fail-closed signature check and `FORM_RESPONSE` filter are UNCHANGED.
**Acceptance:** a new in-window submission with an unknown email+phone yields exactly one `auth.users` row carrying BOTH identifiers and a stamped `user_id`; re-tick creates no duplicate; a collision fixture leaves `user_id` NULL + `pending_claim` and mints nothing; a provisioning failure still inserts the application; `deno check` green.

## Task S-3 — Email OTP edge function (`tier: 1`)
**Files:** `supabase/functions/verify-email-otp/index.ts` *(new)*, `supabase/functions/_shared/otp.ts` *(new — pure code gen/verify helpers)*, `src/lib/__tests__/otp.test.ts` *(new)*, `supabase/config.toml`
**Spec:** Mirror `verify-msg91-otp`'s structure. Six-digit code, single-use, expiry + rate-limit parity with the phone path. Delivery through the EXISTING `queue-transactional-email`. On success mint a session for the uid resolved by `find_login_identity(p_phone => null, p_email => <email>)`. Unknown email → generic "code sent" (NO account enumeration). Put the pure code-generation/verification/expiry logic in `_shared/otp.ts` so it is unit-testable without network. `config.toml`: `[functions.verify-email-otp] verify_jwt = false` (it is an unauthenticated login endpoint, like the other auth entry points) — state the reason in a comment.
**Acceptance:** valid code mints a session; invalid/expired/reused code rejected; unknown email returns the same generic response as a known one (grep the two paths return identical bodies); rate limit enforced; **`verify-msg91-otp` diff = 0**; pure helpers unit-tested; `deno check` green.

## Task S-4 — Claim flow + OTP tabs (`tier: 2`)
**Files:** `src/pages/auth/ClaimApplication.tsx` *(new)*, `src/hooks/useClaimApplication.ts` *(new)*, `src/components/auth/OtpTabs.tsx` *(new)*
**Spec:** `OtpTabs` renders a Phone tab (existing MSG91 flow, wired unchanged) and an Email tab (S-3). **No password field appears anywhere in the applicant flow.** At first interactive sign-in, if the signed-in identity has a `pending_claim` application, `ClaimApplication` surfaces the claim step — ONE additional OTP on the SECOND channel — and on success attaches the application (`user_id` stamped). **No admin/support action may be required** to complete it. Wrong second-channel code → reject, no attach, no merge. Abandoned claim → row stays `pending_claim` and re-surfaces next sign-in. Motion: transform/opacity only from `src/lib/motion.ts`; ≥44px targets; reduced-motion intact; 360×740 and 375×812.
**Acceptance:** claim completes in-flow with zero out-of-band steps; wrong code rejects without attaching; abandoning leaves the row claimable; no password field (grep); build + lint green.

## Task S-5 — Staged applicant home (`tier: 2`)
**Files:** `src/components/home/ApplicantStageCard.tsx` *(new)*, `src/hooks/useApplicantStage.ts` *(new)*
**Spec:** REQ-IDENT-4. One label chip (`applicant · draft` / `fee pending` / `in review` / `decision ready`) plus exactly ONE primary (champagne) action, derived from `cohort_applications.status` — and from the reconciled stage when `VITE_FUNNEL_RECON` is on (RC already ships `useFunnelStage`). **No new state machine.** Unknown/orphan stage → neutral "we're checking your application" card, never a wrong CTA. A `pending_claim` row routes to the claim step (S-4), not a stage chip. **Money-bearing reconciled stages stay suppressed** per the RC v1 ruling — this card must not reintroduce a payment CTA.
**Acceptance:** each of the four sub-states renders the correct chip + single action; changing the underlying status changes the surface with no other code change; no payment CTA renders from any reconciled stage; build + lint green.

## Task S-6 — Adversarial identity suite (`tier: 1` — the proof)
**Files:** `qa-harness/identity-spine.spec.mjs` *(new)*, `qa-harness/identity-fixtures.sql` *(new)*
**Spec:** One command, exit 0. Cases: provision-idempotency (same `tally_response_id` ×3 → 1 user, 1 application); both-identifier bind (email-provisioned row + later phone-OTP → SAME uid); collision-defer (pre-existing conflicting phone → `pending_claim`, 0 users minted, 0 merges); claim (correct second-channel OTP attaches; wrong code does not); OTP parity (phone path byte-identical; email path mints/rejects correctly); no-signup-screen grep; no-password-field grep. Wire as the `identity-spine` lens in `design-qa-gate`.
**Acceptance:** one command, exit 0, every case above green; the suite is the sign-off artifact for the council.

---
## Phase acceptance
- `npm run build` · `npx vitest run` · `npm run typecheck:functions` all green; lint no NEW errors.
- `verify-msg91-otp` diff = 0; payment pipeline + `isIOS()` guard diff = 0.
- No signup screen, no password field in the applicant flow (grep).
- Do NOT deploy or merge — the orchestrator runs the council, then the adversarial suite on a shadow project, then deploys.
