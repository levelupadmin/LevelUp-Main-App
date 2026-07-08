# Phase 6 brief — The Curtain: cold start & the data layer

**Goal:** a returning student sees THEIR Home in under a second; a first-time visitor on Slow-3G sees the brand within 2.5s (prod build); the splash hands off seamlessly. This is the phase the vision audit says matters most to felt quality (evidence baseline: 24 seconds of black on Slow-3G, ~25+ uncached queries per Home open, an auth gate that blocks every route on a network round-trip).

**Branch:** `design/phase-6` · **Gate routes:** `/home` (cold + warm, Slow-3G throttled + normal), `/login` (anon cold start), `/chapters/:id`, `/learn` · **North star:** design/vision/REPORT.md "The Curtain" + EXECUTION-BACKLOG § PHASE 6.

**SOURCE OF TRUTH:** `design/vision/EXECUTION-BACKLOG.md` — **# PHASE 6** (P6-T1 … P6-T7), read verbatim per task. **P6-T0/T8 is SUPERSEDED**: phase-5's X1 root sticky fix already deleted the greeting-band machinery and restored native sticky — do NOT resurrect any of it; the plan-check should drop that task.

**Hard rules (every task):** transform/opacity-only; tokens only; reduced-motion intact; hover gated; 44px; REVENUE/AUTH GUARDS — and for THIS phase specifically: **data-layer changes must be BEHAVIOR-PRESERVING** (same data, same auth decisions, same RLS reads — react-query wraps the existing fetchers, it does not rewrite them); the auth gate rework (P6-T4) must keep every route's access decision IDENTICAL (only the loading choreography changes — protected content must never flash for logged-out users, deep links must still resolve, and the dev-bypass triple-guard stays intact); the persisted cache (P6-T3) must never persist another user's data across sign-out (scope cache keys by user id + clear on sign-out — same class as the lu_weeks_seen lesson) and must never serve stale ENTITLEMENT data where access is decided (revalidate on focus/mount per spec).

**⚠️ Tier-1 density warning:** T1/T3/T4/T5/T6 are ALL council-grade (shared data layer, boot path, auth, native shell, index.css fonts). The council reviews the accumulated diff as usual; expect its mustVerify list to be long. The phase-5 council's kill-switch recommendation (remote-toggleable legacy overflow rule) is IN SCOPE as an optional T-KS if trivially implementable via an existing remote config path — investigate what exists (no new infra; if none exists, report and skip).

**Perf evidence doctrine:** every task's acceptance includes a MEASURED artifact (Slow-3G filmstrip, warm-open timing, bundle-size diff, query-count trace) committed under design/qa/phase-6/ — before/after, honest timestamps. The gate will re-measure; the phase-5 evidence lessons apply (artifacts regenerate AFTER the last code commit, non-vacuous checks).

## Tasks (specs in EXECUTION-BACKLOG.md § PHASE 6 verbatim)

| id | title | tier |
|---|---|---|
| P6-T1 | React-query wave 1: one enrolment chain for Home | 1 |
| P6-T2 | React-query wave 2: the remaining waterfalls (AFTER T1 — same lane) | 2 |
| P6-T3 | Persisted query cache: instant warm opens (AFTER T2 — same lane; user-scoped keys + sign-out purge NON-NEGOTIABLE) | 1 |
| P6-T4 | Auth gate off the critical path (access decisions byte-identical; loading choreography only) | 1 |
| P6-T5 | Splash choreography (native shell handoff — @capacitor/splash-screen wiring; both shells re-synced at integrate) | 1 |
| P6-T6 | Self-hosted fonts: kill the render-blocking @import (index.css — subset + preload per spec; visual parity proof) | 1 |
| P6-T7 | Bundle diet (per spec; no route behavior changes) | 2 |

**Sequencing:** T1 → T2 → T3 strictly ordered (one builder owns the data-layer lane). T4, T5, T6, T7 parallel to that chain.

## Acceptance criteria (gate)
1. Suite green; lint ≤ baseline; behavior-preservation proofs per task (the backlog enumerates them).
2. MEASURED: warm open to personalized Home < 1s (prod build, mid-tier CPU throttle, artifact); Slow-3G cold start shows brand ≤ 2.5s (filmstrip artifact vs the 24s baseline); Home query count reduced per T1/T2 spec (trace artifact).
3. Auth: every gate route's access decision identical to main (test matrix: logged-in, logged-out, deep-link, expired session); no protected-content flash; OTP flow untouched.
4. Cache: sign-out purges persisted cache (test); second user on same device never sees first user's data (test); entitlement-bearing queries revalidate per spec.
5. Fonts: no render-blocking font request (network trace); serif/mono/sans render identical (visual diff on 2 routes); no FOUT worse than spec allows.
6. Splash: native → web handoff without a black gap or double-splash on both shells (emulation evidence + Rahul device checklist).
7. No scroll regression (X1 re-sweep — index.css is touched by T6); body-lock grep clean; reduced-motion pass.

## Explicitly out of scope
Push/notifications (Phase 8), discovery/community surfaces (Phase 9 + community program), new visual features, edge-fn/DB changes (react-query wraps EXISTING calls only), admin.
