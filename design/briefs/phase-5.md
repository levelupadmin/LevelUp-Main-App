# Phase 5 brief — Hardening & the two-hundred-cut sweep

**Goal:** the app stops having seams. One toast system, one EmptyState, one skeleton language, one microcopy voice, a blur diet on always-mounted chrome, the 44px floor everywhere, a11y closure — plus the debt reckoning: the phase-2.1 root sticky fix, the reference-counted body-lock module, and every filed council follow-up from phases 2–4.

**Branch:** `design/phase-5` · **Gate routes:** all student routes (`/home`, `/learn`, `/community`, `/profile`, `/chapters/:id`, `/courses/:id`, `/p/*`, `/checkout/:id`, `/login`) at 360 AND 375 + one admin spot-check · **North star:** DESIGN-STRATEGY.md Pillar 5 + §5 Phase 5, deepened by the vision audit.

**SOURCE OF TRUTH:** `design/vision/EXECUTION-BACKLOG.md` — **# PHASE 5** (P5-T1 … P5-T8), read verbatim per task. ENRICHMENT: `design/vision/INTERACTION-STEALS.md` STEAL #4 (Quartr scrub timeline → ChapterViewer) is first-class spec for P5-X2.

**Hard rules (every task):** transform/opacity-only; no backdrop-filter on per-frame-animated elements; tokens only; reduced-motion intact; ≥44px; hover gated `[@media(hover:hover)]`; empty/loading/error states verified; REVENUE/AUTH GUARDS as in phases 3–4 (no payload/gate/pricing/OTP-logic changes).

**⚠️ THE BIG ONE — P5-X1 (phase-2.1 root sticky fix) is the highest-blast-radius change of the whole program.** It replaces the June-14-era `@media (pointer:coarse){html,body{overflow-x:hidden}}` rule with `#root{overflow-x:clip}` (clip on a NON-ROOT element does not create a scroll container and cannot propagate to the viewport — the phase-2 council designed this) and then DELETES Home.tsx's ~200-line probe/pin/occlusion machinery, restoring native `position:sticky` app-wide (fixes the non-sticky app header + chapter grab bar on Android). It gets its OWN dedicated adversarial review inside the build, the council MUST treat it as the centerpiece, and it ships only with the full device-matrix verification. If ANY doubt survives verification, the task is REVERTED and re-parked — do not force it.

## Tasks (specs in EXECUTION-BACKLOG.md § PHASE 5 unless marked)

| id | title | tier |
|---|---|---|
| P5-T1 | One toast system (consolidate sonner + Radix toast per backlog; pin sonner to exact 1.7.4 while at it — council follow-up) | 1 |
| P5-T2 | Backdrop-blur diet on always-mounted chrome | 1 |
| P5-T3 | The 44px floor (app-wide sweep incl. the global chrome items gates kept deferring: wordmark, avatar — coordinate with T2 if StudentLayout overlaps) | 2 |
| P5-T4 | Microcopy: one voice | 3 |
| P5-T5 | Player + edge failure states in the brand voice | 2 |
| P5-T6 | One EmptyState, one skeleton (kill the h-10 patterns/EmptyState duplicate — phase-2 latent finding) | 2 |
| P5-T7 | Token police: the status-color map | 2 |
| P5-T8 | A11y closure | 2 |
| P5-X1 | **Root sticky fix (phase-2.1)**: `#root{overflow-x:clip}` replacing the coarse-pointer html/body rule + DELETE Home's probe/pin/occlusion machinery + restore plain sticky greeting band; verify app header + chapter grab bar now stick on coarse-pointer emulation; document rollback (single revert) | **1 — centerpiece** |
| P5-X2 | ChapterViewer scrub timeline + UpNextList row fill (STEAL #4 spec verbatim; app-owned surfaces only, no cross-origin handlers) | 2 |
| P5-X3 | Council follow-up sweep: reference-counted body-lock module (`useBodyScrollLock`, retires the by-convention invariant, adopts CompletionTakeover, adds recap desktop-wheel containment); App.tsx:136 `[vaul-drawer]`→`[data-vaul-drawer]`; parameterize OtpEntryStep 'Welcome back'; whitespace-thumbnail WRITER fixes (trim-or-null in SavedSection/ReelCard/ThankYou upload paths — client code only, NO db migration); scope `lu_weeks_seen` per user id + clear on sign-out | 1 |

**Sequencing:** P5-X1 in its own lane, first and isolated (Home.tsx + index.css + layout roots). P5-T2/T3 coordinate on StudentLayout. P5-T1 isolated (App.tsx + ui/). Everything else parallel.

## Acceptance criteria (gate)
1. Suite green; lint ≤ baseline; no NEW one-off durations/colors (grep-gated).
2. P5-X1: on coarse-pointer emulation at 360/375, the app header, chapter top bar, AND greeting band all stick natively through full scroll ranges on every gate route; document root scrolls; the probe machinery is GONE (grep detectStickyParkingBroken = 0); fine-pointer/desktop unchanged. Real-device confirmation goes to Rahul's checklist before any ramp completion.
3. Exactly ONE toast system mounted; exits tokenized; all call sites migrated.
4. Blur audit: zero backdrop-filter on always-mounted chrome that animates; remaining blurs enumerated with justification.
5. 44px floor: the audit script passes on every gate route (exceptions documented).
6. One EmptyState (h-11 CTA), one skeleton family; duplicates deleted.
7. Microcopy sweep applied; player/edge failures read in the brand voice (no raw technical strings anywhere — grep for 'Failed to' in user-facing paths).
8. body-lock module: grep shows ZERO ad-hoc body.style.overflow writers (the module is the only path); recap contains desktop wheel; all dismissal paths unlock.
9. STEAL-4 scrub timeline works on app-owned media, 44px targets, reduced-motion path.
10. No scroll regression: every gate route, both widths, after every overlay/completion flow. The June-14 lesson is the whole point of this phase — prove it.

## Explicitly out of scope
Cold start/data layer (Phase 6), community structure, new features beyond the named steals, admin redesign, edge functions, DB migrations.
