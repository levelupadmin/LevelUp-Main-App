# Phase 4 brief — Tactility & sheets

**Goal:** the app gains real touch physics — vaul sheets with drag-to-dismiss become the overlay grammar, pull-to-refresh feels engineered, stats feel earned, certificates become share-worthy objects, Community/Login/Profile get their polish passes — and the Family-style button→sheet morph becomes the signature move every sheet inherits from day one.

**Branch:** `design/phase-4` · **Gate routes:** `/home` (pull-to-refresh), `/learn?seg=courses` (stats), `/profile` + account surfaces (sheets, certificates), `/community`, `/login` (OTP polish — READ-ONLY judging, no OTP submission) · **North star:** DESIGN-STRATEGY.md Pillars 3–4, deepened by the vision audit.

**SOURCE OF TRUTH FOR TASK SPECS:** `design/vision/EXECUTION-BACKLOG.md` — **# PHASE 4** section (P4-T1 … P4-T10). Builders MUST read their full P4-Tn spec there first. ENRICHMENT SOURCE: `design/vision/INTERACTION-STEALS.md` — this phase adopts, as first-class specs (not optional): **STEAL #10** (Family button→sheet FLIP-morph grammar — applies to P4-T1/T4; first site: the sheet CTA morphing to its on-page twin), **STEAL #8** (Toss-style OTP digits-merge-to-check — applies to P4-T9), **STEAL #3** (Flighty blacklight certificate hold-to-reveal — applies to P4-T6), **STEAL #6** (Gentler Streak calm recap story — applies to the P4-T5 stats surfaces where its spec fits). Where a steal and the backlog conflict, the steal's choreography wins on motion, the backlog wins on scope/files.

**Foundation available:** everything through phase 3 (tokens/springs, MotionButton/Card, ArtworkImage/AmbientGlow, haptics doctrine, LoadingSwap/skeletons, CountUp with immediate mode, useFocusTrap, tokenized overlay exits, champagne Button variant + PayButtonContent, useInViewRef with measured rootMargin, publicOfferingHandoff pattern, ChampagneDust).

**Hard rules (every task):** transform/opacity-only; no `backdrop-filter` additions and none on any element whose transform/opacity animates per frame (phase-3 lesson); all motion values from tokens; reduced-motion intact; ≥44px targets; hover styles gated `[@media(hover:hover)]` (phase-3 council lesson — never bare `hover:` on touch surfaces); verify empty/loading/error states.

**⚠️ THE BODY-LOCK INVARIANT (vaul phase = maximum exposure):** CompletionTakeover remains the SOLE `document.body.style.overflow` writer. vaul manages its own scroll containment — builders must verify vaul's mechanism does NOT write body overflow styles that collide (it uses its own techniques; test open/close/drag-cancel on every sheet + the grep gate). Any conflict = STOP and surface, don't hack.

**⚠️ Tier-1 flags:** P4-T4 (StudentLayout shell), P4-T6 (adds @capacitor/share native plugin — cap sync + both shells), P4-T1/T2 if they touch layout roots. Council before release regardless.

**Product-call rule:** P4-T7 (weekly consistency streak) is a RAHUL DECISION not yet granted — build it BEHIND a default-off flag exactly per its backlog spec's flag clause, or skip if the spec has no flag clause; do NOT ship it visible. Everything else is approved.

## Tasks (specs in EXECUTION-BACKLOG.md § PHASE 4 + the named STEALs)

| id | title | tier | files (exclusive ownership) |
|---|---|---|---|
| P4-T1 | vaul adoption: InvoiceDetailSheet becomes a real sheet + the STEAL-10 morph grammar primitive (`MorphSheet` wrapper in `src/components/motion/`) | 2 | per backlog + `src/components/motion/MorphSheet.tsx` (new) |
| P4-T2 | Notification center: sheet on mobile, pop on desktop | 2 | per backlog |
| P4-T3 | Pull-to-refresh v2 (spring release, threshold haptic, branded indicator) | 2 | per backlog |
| P4-T4 | StudentLayout overlay exits + sheet groundwork | 1 | per backlog |
| P4-T5 | MyCourses stats that feel earned (+ STEAL-6 calm recap treatment where its spec fits) | 2 | per backlog |
| P4-T6 | Certificates: native share + share card + STEAL-3 blacklight hold-to-reveal | 1 | per backlog |
| P4-T7 | Weekly consistency (calm register) — BEHIND DEFAULT-OFF FLAG per product-call rule | 2 | per backlog |
| P4-T8 | Community feels alive (composer choreography, entrance staggers, heart-pop haptic) — NOTE: scope ONLY the motion/polish items; do NOT build community structure (the community program in design/community/ supersedes structural work) | 2 | per backlog |
| P4-T9 | Login/OTP micro-polish + STEAL-8 digits-merge-to-check — REVENUE/AUTH GUARD: zero changes to OTP verification logic/payloads/MSG91 wiring; visual+haptic layer only | 1 | per backlog |
| P4-T10 | Profile coherence | 2 | per backlog |

**Sequencing:** P4-T1 first (creates MorphSheet that T2/T4/T6 consume). T3/T5/T7/T8/T9/T10 parallel. T4 after T1. T6 after T1.

## Acceptance criteria (gate)
1. Suite green; no NEW lint errors vs main baseline.
2. Every sheet: drag-to-dismiss with spring settle, background scale-down, the STEAL-10 morph on open/close where specced, focus trap + restore, body-lock grep still shows the sole writer, scroll intact after every dismissal path.
3. Pull-to-refresh: spring release (no snap), haptic tick at threshold, branded indicator, no scroll-capture outside the gesture, works at 360/375.
4. Certificates: share card renders, native share fires on device path (web fallback intact), blacklight reveal works with reduced-motion fallback; new Capacitor plugin synced in BOTH shells.
5. OTP: digits-merge choreography plays on success, auth flow byte-identical (diff-verified), MSG91 untouched.
6. Community/Profile polish per specs; no structural community changes.
7. P4-T7 invisible by default (flag off) — gate verifies it does NOT render.
8. Reduced-motion, 44px, hover-gating, no-backdrop-filter-while-animating: all pass; no scroll regression anywhere.

## Explicitly out of scope
Community structure (design/community/ program), money pages (shipped), cold start/data layer (Phase 6), microcopy sweep (Phase 5), admin.
