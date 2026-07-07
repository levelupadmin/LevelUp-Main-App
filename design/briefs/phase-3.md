# Phase 3 brief — The money pages

**Goal:** the purchase path carries the strongest treatment in the app. Offering → checkout → Razorpay → ThankYou reads as ONE produced sequence: champagne pay moment, disciplined price typography, structured checkout skeleton, staged arrival, tokenized proof colors, and a correct, accessible guest form.

**Branch:** `design/phase-3` · **Gate routes:** `/p/lokesh-kanagaraj-teaches-film-making`, `/checkout/:offeringId` (any active offering), `/thank-you?order=…` (simulate paid state), `/p/video-editing-academy` (staged/cohort variant) · **North star:** DESIGN-STRATEGY.md Pillar 1–2 + §4 screen 3, deepened by the vision audit.

**SOURCE OF TRUTH FOR TASK SPECS:** `design/vision/EXECUTION-BACKLOG.md` — **# PHASE 3** section (P3-T1 … P3-T9). Every task below is specified there with exact values, line references, edge cases and acceptance criteria. Builders MUST read their full P3-Tn spec from that file before writing code; this brief adds only phase-level rules and clarifications. Where the backlog cites a file:line that has drifted, honor the intent and note the drift.

**Foundation available:** everything from phases 0–2 — motion tokens (`src/lib/motion.ts`: springs snap/glide/bounce, durations, `useMotionSafe`, `pressTap`), `MotionButton`/`MotionCard`, `ArtworkImage`/`AmbientGlow`, haptics doctrine, `LoadingSwap` + `SkeletonLine/SkeletonBlock` (`src/components/patterns/LoadingState.tsx`), `CountUp`, `useFocusTrap`, tokenized overlay exits, Radix `Accordion` with tokenized animation.

**Hard rules (every task):** transform/opacity-only animation; no `backdrop-filter` additions; all motion values from tokens — zero one-off durations/easings; reduced-motion path intact everywhere; ≥44px touch targets; verify empty/loading/error states of anything touched; no new `document.body.style.overflow` writers (CompletionTakeover stays the sole owner — grep-gated).

**⚠️ REVENUE GUARDS (this phase works on the money path — payments are Tier 1, council mandatory before release):**
1. **Never weaken a native purchase gate.** Every buy-CTA `isNative()` gate stays byte-identical; `ApplicationStatus` keeps `isIOS()` (NOT `isNative()`) — changing it kills an Android purchase path. Do not touch either unless the spec explicitly says so (none does).
2. **The checkout contract is frozen:** payloads to `create-razorpay-order` / `guest-create-order` / `validate-coupon` must remain byte-identical (shipped Capacitor clients call them). P3-T9's PhoneInput change must produce identical E.164 payloads for +91 numbers — unit-test the submit payload.
3. **No pricing-math changes.** All discount/GST/paise math stays in `supabase/functions/_shared/pricing.ts` and its imports — this phase changes presentation only.
4. Razorpay `theme.color` centralization (P3-T6.3) must not alter any other Razorpay option field.

## Tasks (specs in EXECUTION-BACKLOG.md § PHASE 3)

| id | title | tier | files (exclusive ownership) |
|---|---|---|---|
| P3-T1 | The champagne pay moment — `champagne` Button variant + Pay surfaces | 1 | `src/components/ui/button.tsx`, `src/pages/CheckoutPage.tsx`, `src/components/checkout/StickyPayBar.tsx` |
| P3-T2 | Tabular numerals + price typography across the money path | 2 | `src/pages/PublicOffering.tsx`, `src/components/offering/PurchaseRail.tsx` |
| P3-T3 | Checkout structured skeleton + receipt choreography | 2 | `src/pages/CheckoutPage.tsx` (same lane as T1 — T1 lands first) |
| P3-T4 | ThankYou: the produced arrival | 2 | `src/pages/ThankYou.tsx`, `src/components/checkout/SuccessMoment.tsx` |
| P3-T5 | Coupon interactions polished | 3 | `src/pages/CheckoutPage.tsx` (same lane as T1/T3) |
| P3-T6 | Offering scroll choreography + FAQ + theme fixes + `src/lib/brand.ts` | 2 | `src/pages/PublicOffering.tsx` (lane w/ T2), `src/pages/EventsPage.tsx`, `src/pages/EventDetail.tsx`, `src/pages/ThankYou.tsx` (theme-color line only — coordinate with T4 lane), `src/components/home/UpcomingEvents.tsx` (theme-color line only), `src/lib/brand.ts` (new) |
| P3-T7 | Conversion instrumentation — five events behind one `track()` | 2 | `src/lib/analytics.ts`, plus one-line hooks in the T2/T6 and T1/T3/T5 and T4 lanes (coordinate: analytics.ts is T7's; the event-call lines belong to each page's lane owner) |
| P3-T8 | TrustPanel + proof tokens (gold stars, success token) | 3 | `src/components/checkout/TrustPanel.tsx`, `src/components/reviews/ProofRow.tsx`, `src/components/reviews/StarRating.tsx`, `src/components/reviews/CourseRatingBadge.tsx`, `src/components/reviews/RatingDistribution.tsx` |
| P3-T9 | Guest checkout form correctness (PhoneInput, labels, inline errors) | 2 | `src/pages/CheckoutPage.tsx` (same lane as T1/T3/T5 — ONE builder owns CheckoutPage for the phase) |

**Sequencing:** P3-T1 first (creates the `champagne` variant others consume). Then T2/T6 (PublicOffering lane), T3/T5/T9 (CheckoutPage lane — one builder), T4 (ThankYou lane), T8 (reviews lane) in parallel. T7's analytics.ts lands anytime; its per-page event lines are added by each lane's owner per T7's spec.

**P3-T7 decision status:** Rahul approved executing the full vision phase-3 scope; the recommendation was YES. Implementation rule: build the five events behind one `track()` in `src/lib/analytics.ts`, reusing the existing transport in that file. Enable a PostHog sink ONLY if `VITE_POSTHOG_KEY` exists in env; otherwise events flow to the existing pixel layer (or no-op) — never block, never error offline, no PII beyond the session user id.

## 60fps reference addendum (added 2026-07-07 — builders MUST read their entries)
`design/vision/60FPS-IDEAS.md` maps curated interaction references onto this phase. Where an idea ENRICHES your task, adopt its choreography (the entries carry motion-breakdown links + cost models); where it conflicts with this brief, the brief wins and you note the conflict:
- **P3-T4 (ThankYou):** Idea #1 "Champagne dust" — celebration as rising golden bokeh light on black, NOT confetti; and Idea #8 "The receipt that assembles itself" — the entrance sequence choreography.
- **P3-T6 (Offering):** Idea #2 "The hero that breathes" — elastic overscroll stretch + spring-settle on the offering poster (transform-only; respect the existing ArtworkImage wrapper).
- **P3-T2/T3 (prices, totals):** Idea #7 "Rolling digits" — odometer-style rolls where ONLY the changing digits move (applies to the CountUp usage on coupon totals; if the existing CountUp can't do per-digit rolls, note it as a follow-up rather than rebuilding it in this phase).
- **All tasks:** the §5 anti-catalog lists rejected patterns — do not reintroduce them.

## Acceptance criteria (the gate checks these; per-task criteria in the backlog also apply)
1. Suite green: `npm run build`, `npx vitest run`, `npm run lint` (no NEW errors vs main baseline).
2. Pay button + mobile sticky bar render the champagne gradient at 375 AND 360; disabled = opacity/saturate, never gray; no other Button variant visually changed (spot-check ghost/outline/destructive on admin + profile).
3. Zero `font-mono` on price elements on `/p/*`; "₹4,999" renders without the comma-space artifact; all money-path prices `tabular-nums`.
4. Cold `/checkout/:id` shows a structured skeleton (not a spinner); CLS < 0.02 on the route; coupon apply rolls the total via CountUp once; applied-coupon chip animates in/out with a ≥44px remove target.
5. ThankYou entrance plays as one staged sequence ≤1.2s (instant under reduced motion); exactly one success haptic on native mount; CTAs champagne; new upsell copy present; signed-in auto-redirect intact at 10s.
6. Offering FAQ uses the tokenized Accordion; sticky pay bar springs in/out with `useInView` + `aria-hidden` logic intact; `grep -rn "F5F1E8" src/` returns 0.
7. `grep -rn "yellow-400" src/components` returns 0; stars/checks render gold/success tokens on `/p/*` and checkout.
8. Guest form: real labels wired via htmlFor, PhoneInput with defaultCountry IN, inline `role="alert"` errors; submit payload E.164-identical for +91 (unit test); keyboard type tel.
9. The five analytics events fire on the funnel (visible in sink or verifiable via spy/network tab in test mode); zero console errors when the sink is absent/blocked/offline.
10. REVENUE GUARDS hold: `git diff` shows no change to any `isNative()`/`isIOS()` gate, no payload-shape change to the three checkout edge-fn calls, no math change outside presentation.
11. No scroll regression on any gate route at 375/360; reduced-motion pass clean; body-lock grep still shows the sole writer.

## Explicitly out of scope
vaul sheets, pull-to-refresh, stats/streaks, certificates (Phase 4); toast-system consolidation, blur diet, microcopy sweep (Phase 5); data layer/cold start (Phase 6); anything in admin; edge-function changes of any kind.
