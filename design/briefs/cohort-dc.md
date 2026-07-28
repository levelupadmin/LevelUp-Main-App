# PHASE DC — The Decision
*Slice 2, rung 2.1 · REQ-DEC-1..6 · branch `design/cohort-dc` · worktree `/Users/rahulsrinivas/Claude/LevelUp-dc`.*
*Sources: `design/cohorts/EXECUTION-BACKLOG-V3.md` §PHASE DC; `docs/01-PRD.md` §5.6; `FLOW-FEEDBACK-R1.md` §9d–9h.*

## What this phase is
The emotional peak of the whole funnel. A sealed decision → a full-viewport reveal → a genuinely shareable artifact → an acceptance card that creates status → the claim flow. This is the most visible surface in the program; it is also the one most likely to be screenshotted, so every detail is load-bearing.

## The inviolable rules
1. **The app READS `accepted`; it NEVER writes it (SOR-1).** TeleCRM is the master. The reveal fires because the reconciler observed the flip. **There is NO in-app admin decision RPC** — SEC-DECISION-1 was removed. Any code that sets a funnel status is a bug.
2. **The payment pipeline and `ApplicationStatus.tsx:319,337` `isIOS()` guard are untouched.** The ₹8k seat-confirm runs on the EXISTING Razorpay link (INTEG-PAY-1) — this phase SURFACES it, it does not originate it.
3. **NFR-COPY-1: the 100-word essay text is NEVER surfaced in any UI**, including the artifact. Personalise from STRUCTURED fields only (name, cohort, craft, city).
4. **No verdict in any notification payload.** The decision is learned by opening it, never by a push preview.
5. **REQ-DEC-4: no seat numbers.** Low numbers signal an empty cohort. Use the locked-future view instead.
6. **SEAT-1: seat release stays MANUAL in v1.** Build no auto-release cron.
7. **RENDER-1: v1 artifact is PNG + on-device WebM.** Do NOT build the server-rendered MP4 worker — it needs a chromium+ffmpeg host that exists on neither deploy target.

---

## Task D-1 — Read `accepted`, fire the sealed reveal (`tier: 2`)
**Files:** `src/hooks/useDecision.ts` *(new)*, `src/pages/decision/DecisionReveal.tsx` *(new)*, `src/lib/flags.ts`
**Spec:** Detect the reconciler's flip to `accepted` (RC ships `useFunnelStage`; consume it, do not reimplement) and fire the experience. **Grep must prove no funnel-status write.** Register `VITE_DECISION_FLOW` in the existing `src/lib/flags.ts` registry (default OFF). The three kept beats (REQ-DEC-1), verbatim: **"Your decision is ready" → "Open your decision" → "Claim my seat"**. Sealed until opened.
**Reveal (REQ-DEC-2):** full-viewport, **≤2.6s**, **transform/opacity only** (values from `src/lib/motion.ts`, no one-off easings); `prefers-reduced-motion` → a **≤200ms crossfade that still reveals the verdict** (never withhold the outcome to satisfy a motion preference).
**Edge cases:** `accepted` seen but flag off → today's email/admin path, no in-app reveal; **rejected → a graceful, dignified decision screen and NO shareable artifact**; `accepted` arriving offline → reveal on next open.
**Acceptance:** reveal fires from READING `accepted` (grep proves no status write); ≤2.6s transform/opacity only; reduced-motion path reveals the verdict ≤200ms; no verdict in any notification body; flag off = zero behavioural diff.

## Task D-2 — The shareable admission artifact (`tier: 2`)
**Files:** `src/lib/artifact/renderAdmission.ts` *(new)*, `src/components/decision/ShareArtifact.tsx` *(new)*, `src/lib/__tests__/renderAdmission.test.ts` *(new)*
**Spec:** REQ-DEC-3 v1 path. **PNG floor always; on-device WebM where supported**, produced within a **60s post-accept budget**. Buildspace-grade: a beautiful animated card carrying their name, shareable to stories/LinkedIn. Personalise from structured fields ONLY — **zero essay text** (grep). Keep the pure layout/scaling maths in `renderAdmission.ts` so it is unit-testable without a canvas.
**Edge cases:** WebM unsupported → PNG still delivered (never nothing); slow device → PNG immediately, WebM when ready; reduced-motion → static PNG.
**Acceptance:** PNG always produced; WebM where supported within 60s; zero essay text in the artifact (grep); name + cohort come from structured fields; pure maths unit-tested.

## Task D-3 — Acceptance card, claim-my-seat, enrollment details (`tier: 2`)
**Files:** `src/pages/decision/AcceptanceCard.tsx` *(new)*, `src/pages/decision/ClaimSeat.tsx` *(new)*, `src/pages/decision/EnrollmentDetails.tsx` *(new)*
**Spec:**
- **Acceptance card (REQ-DEC-4):** no essay, **no seat number**. Replace scarcity-by-number with the **locked future view** — they SEE what is inside the cohort as locked previews, and confirming unlocks it (this is Rahul's §9i correction: low seat numbers signal an empty cohort).
- **Claim my seat (REQ-DEC-5):** the honest held-seat window — **"seat held · closes {countdown}"** — shown BEFORE Razorpay and persisted across scroll/refresh. This copy IS the v1 conversion lever. The ₹8k runs on the **existing** link; the app originates no order.
- **Lapse behaviour, stated upfront:** if the window expires the seat releases **but the acceptance stays valid for the next batch**. This removes deadline resentment and builds pre-sold pipeline — say it plainly rather than hiding it.
  > **⚠️ v1 LIMITATION — this is COPY, not a mechanism.** `accepted_at` is stamped once and never cleared, and the app holds no write path to it, so re-admitting a student to a later batch leaves the original anchor in place and their window is **already lapsed on arrival**. The only remedy is hand-written SQL. That is consistent with SEAT-1 (seat release stays MANUAL in v1) and is not a defect for this phase to fix — but the promise this copy makes is kept by an operator, not by the product. Do NOT build an auto-release or a write to `accepted_at` here. Recorded so no future task reads the line above as a description of shipped behaviour.
- **Enrollment details:** what happens on claim, the per-SKU fee structure, the schedule.
**Acceptance:** no seat number anywhere (grep); locked-future preview renders; countdown persists across scroll and refresh; claim routes to the EXISTING ₹8k link (app-originated order diff = 0); lapse copy present.

## Task D-4 — Public admission page + whitelist-only read policy (`tier: 2` + 🔴 policy)
**Files:** `src/pages/AdmissionPublic.tsx` *(new)*, `supabase/migrations/20260728110000_admission_public_policy.sql` *(new)*
**Spec:** REQ-DEC-6 / §9h — what a RECIPIENT sees when an admission is shared as a link. Render **only whitelisted fields** (name, cohort, a celebratory frame). **No PII, no essay, no internal status, no email/phone.** The public-read RLS policy is 🔴 Tier-1: additive, idempotent, reversible, **no `RAISE EXCEPTION`**, and scoped so an anonymous probe can reach nothing beyond the whitelist. Per-record unpublish → 404/private.
**Acceptance:** an adversarial logged-out probe leaks **0** non-whitelisted fields (enumerate the exact column list in the test); unpublish → 404; the policy is the artifact the council reviews.

---
## Phase acceptance
- `npm run build` · `npx vitest run` · `npm run typecheck:functions` green; lint no NEW errors.
- Greps prove: no funnel-status write; no essay text in any decision surface; no seat number; no verdict in notifications.
- Payment pipeline + `isIOS()` guard diff = 0.
- Everything behind `VITE_DECISION_FLOW`, default OFF; flag-off = byte-identical to today **in the client bundle**.
  > **⚠️ CORRECTION — the flag does NOT cover the database half, and this line used to claim it did.** `db push` GRANTs EXECUTE on `get_admission_page` to `anon` the moment the migration lands, so it is callable directly with the publishable key without ever loading the SPA; and `src/lib/flags.ts` resolves `localStorage` BEFORE env, so any visitor can flip the client flag themselves. Neither is weakened — the real boundary is the RPC's whitelist projection, the 256-bit token, and `admission_page_published_at` being NULL on every row. State that boundary honestly; do not describe the flag as the security control, because it is not one. (NFR-CONFIG-2: security never depends on a feature flag.)
- Do NOT deploy, apply migrations, or merge.
