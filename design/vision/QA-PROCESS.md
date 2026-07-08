# LevelUp — QA Doctrine for the Design Program
### The gate, the checklists, the budgets, the device protocol, the rollout doctrine.
*Companion to `design/vision/REPORT.md` + `EXECUTION-BACKLOG.md`. Codifies what `.claude/workflows/design-qa-gate.js` does today and what every phase from 3 onward must add. Written to be copy-paste usable as gate/sprint prompts.*

---

## 1. The gate as it exists today (baseline — keep all of it)

`design-qa-gate.js` runs two stages: parallel **lenses** → **chair verdict** (`PASS / FIX-LIST / BLOCK`), findings schema `{lens, verdict, findings:[{issue, screen, severity, evidence, files[]}], summary}`, screenshots to `design/qa/phase-N/`, both 375×812 and 360×740, dev server with `VITE_DEV_ADMIN_BYPASS=true`.

Current lenses: **motion** (static: tokens/springs/interruptibility), **layout** (live: overflow, safe-area, 44px, tab-bar occlusion @360+375), **a11y-motion** (reduced-motion neutralization, focus, aria, contrast), **perf** (static smells: layout-property animation, stacked blurs, unthrottled listeners, CLS images), **visual** (live vs DESIGN-STRATEGY §6 + brief), **completeness critic** (brief promises vs delivery).

**Two standing fixes to the harness itself (do these once, in the next gate run):**
1. The stale default repo path `'/Users/rahul/Claude Code/LevelUp-Main-App'` in all three `.claude/workflows/design-*.js` → always pass `repoPath`, and update the default to `/Users/rahulsrinivas/Claude/LevelUp-Main-App`.
2. Screenshots taken while a page is mid-load time out via `page.screenshot()` (it awaits quiescence). For timed cold-start frames use raw CDP: `const cdp = await ctx.newCDPSession(page); const {data} = await cdp.send('Page.captureScreenshot',{format:'png'})` — this never blocks. (Proven in this audit's Slow-3G capture.)

## 2. New lenses (add per phase, starting Phase 3)

| Lens | Type | What it checks | Active from |
|---|---|---|---|
| **cold-start** | live, measured | Slow-3G + Fast-3G first-paint frames on a PROD build (`npm run build && npx vite preview --port 4173`); asserts budgets in §5. Frames captured at 1s/2.5s/5s/10s via the CDP screenshot method. | Phase 6 (observe-only in 3–5) |
| **data-layer** | live, counted | Request count per route mount (supabase REST calls), refetch-on-revisit count (must be 0 within staleTime), duplicate-query detection (same table+filter twice in one mount = fail). | Phase 6 |
| **voice** | static | Student-facing string diff scan: bans "please", "Something went wrong", system nouns (edge/gateway/function/request), "✓"/emoji in toasts; flags exclamation marks in errors. | Phase 5 |
| **token-police** | static, grep | The §4 greps below return zero NEW hits vs the previous phase's recorded baseline (`design/qa/baselines.json` — the gate writes it each PASS). | Phase 3 |
| **interaction-latency** | live | Tap→visible-feedback ≤100ms on 5 sampled controls per route under 4× CPU throttle (measure via `PointerEvent` timestamp → next frame with computed transform change). | Phase 4 |
| **platform** | live, emulated | Keyboard-inset simulation (visualViewport resize), safe-area env simulation (`--webkit` inset overrides), Android-back overlay dismissal walk (dispatch Escape → assert no orphan overlay + body scroll unlocked). | Phase 4 |

## 3. Device-emulation profiles (the gate's Playwright contexts)

| Profile | Settings | Used for |
|---|---|---|
| `m360` | 360×740, DPR 2.625, `isMobile, hasTouch`, dark | Median ₹15k Android |
| `m375` | 375×812, DPR 3, `isMobile, hasTouch`, dark | iPhone baseline |
| `m360-rm` / `m375-rm` | + `reducedMotion:'reduce'` | Reduced-motion sweep |
| `m360-cpu4` | + CDP `Emulation.setCPUThrottlingRate {rate:4}` | Scroll/latency budget |
| `m375-3g` | + CDP `Network.emulateNetworkConditions {latency:400, downloadThroughput:51200, uploadThroughput:25600}` | Cold-start lens (prod preview) |
| `d1280` | 1280×800, DPR 2, fine pointer | Desktop pass |

Note: Playwright touch emulation makes `(pointer:coarse)` CSS match — this is how the June-14-class checks and the greeting-band checks must run. Never trust a fine-pointer-only pass for anything touching scroll or sticky.

## 4. The mechanical checklists (copy-paste blocks)

**4.1 Body-lock invariant (every gate, every phase):**
```bash
grep -rn "body.style.overflow" src/  # EXACTLY one writer: CompletionTakeover.tsx
grep -rn "overflow-x" src/index.css   # unchanged vs main unless a task explicitly owned it (T7-class, council)
```
Then live: complete a lesson → dismiss takeover via each path (CTA, backdrop, Android back/Escape, route change) → `document.body.style.overflow === ''` and the page scrolls.

**4.2 Token discipline (token-police lens):**
```bash
# off-palette raw Tailwind colors on student surfaces (target: 0 by end of Phase 5)
grep -rnE "(text|bg|fill|border)-(red|green|emerald|rose|orange|blue|sky|yellow|amber|violet|purple|pink)-[0-9]" src/pages src/components --include='*.tsx' | grep -v "pages/admin/" | grep -v "components/admin/"
# hardcoded hex outside tokens/canvas-generator
grep -rnE "#[0-9a-fA-F]{6}" src --include='*.tsx' | grep -v admin | grep -v certificate-generator | grep -v test
# one-off motion values (target: 0 always)
grep -rnE "duration-\[|cubic-bezier\(" src --include='*.tsx' | grep -v admin
# blur budget: no xl outside admin; total not above recorded baseline
# (baseline: design/qa/baselines.json .metrics.backdrop; live surfaces enumerated in
#  design/qa/phase-5/blur-ledger.md — 28 live filters; the raw grep also counts ~15 comment lines)
grep -rn "backdrop-blur-xl" src | grep -v admin | wc -l   # must be 0 (.backdrop.backdrop_blur_xl_non_admin_max)
grep -rn "backdrop-" src --include='*.tsx' | wc -l          # ≤ .backdrop.raw_tsx_max (43)
# legacy press system (target: 0 on student surfaces by end of Phase 4)
grep -rn "pressable\|card-hover\|press-scale" src/pages src/components --include='*.tsx' | grep -v admin | grep -v index.css
```

**4.3 Touch targets:** the layout lens taps every `a, button, [role=button], [role=tab], input, [role=switch]` on gate routes and asserts `getBoundingClientRect()` ≥44×44 **or** a padded ancestor hit area ≥44×44. Static pre-filter:
```bash
grep -rnE "h-(6|7|8|9) w-(6|7|8|9)|size-(6|7|8|9)|min-h-\[(2[0-9]|3[0-9]|40|42)px\]" src/pages src/components --include='*.tsx' | grep -v admin
```

**4.4 Reduced-motion sweep:** per `-rm` profile, per route: (a) all brief choreography collapses to instant; (b) **no element >40px tall computes `opacity:0` inside `main`** after 1s settle (the hidden-content trap — carousel slides excepted via `[aria-hidden=true]` filter); (c) sequences (completion arc) preserve ORDER, drop theatrics.

**4.5 CLS budget:** inject `new PerformanceObserver(l => …).observe({type:'layout-shift', buffered:true})` before nav; route CLS ≤0.05, and ≤0.02 for skeleton→content swaps (LoadingSwap contract). Fail lists the shifting nodes.

**4.6 Scroll regression (June-14 class):** per route per width (coarse profiles): `scrollTo(0, max)` → assert reached; flick-scroll via touch gestures over the greeting/hero/sticky regions; repeat AFTER completing a lesson + dismissing all overlays; assert no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`).

**4.7 Overlay exits:** for each overlay surface in the phase (dialogs, sheets, dropdowns, sidebar): open → close → assert an exit transition actually PLAYS (computed opacity/transform mid-transition ≠ final) except under `-rm`; assert focus returns to the trigger; assert no `[data-state=open]` orphans.

**4.8 Voice lens strings:**
```bash
grep -rn "Something went wrong\|please try again\|Please " src/pages src/components --include='*.tsx' | grep -v admin
grep -rnE "✓|🎉|📄|📚|🔥" src/pages src/components --include='*.tsx' | grep -v admin
```

## 5. Perf budgets + measurement commands (enforced from Phase 6; observed from Phase 3)

| Budget | Target | How to measure |
|---|---|---|
| Entry JS chunk | ≤450KB (post P6-T7); never +10% in any phase | `npm run build && ls -la dist/assets/index-*.js` |
| First contentful paint, Fast-3G, prod preview, cold | ≤2.5s | `npx vite preview --port 4173` + `m375-3g` profile (Fast-3G: latency 150, down 1.6Mbps) + CDP frames; first frame with wordmark/skeleton visible |
| Warm open to Home content (persisted cache) | ≤1.0s | same, second visit, assert catalog cards present at t=1000ms frame |
| Home mount request count | ≤6 (post P6-T1) | Playwright `page.on('request')` filter supabase.co, count until networkidle |
| Tap → visible feedback | ≤100ms @4× CPU | interaction-latency lens (§2) |
| Scroll jank | <5% frames >32ms @4× CPU flick-scroll | the stage-3 rAF sampler from this audit (`design/vision/` scratch scripts; port into the gate) |
| Route CLS | ≤0.05 | §4.5 |
| Animation properties | transform/opacity only | perf lens static scan (existing) + spot-check DevTools Performance on 1 route/phase |
| **Real-device confirmation** | 60fps scroll on Rahul's mid-range Android | §6 — emulated numbers NEVER substitute (CLAUDE.md rule) |

## 6. On-device protocol (Rahul, per internal release)

**Setup (once per release):** Android — install from Play internal track link; iOS — TestFlight build N. Charge >40%, kill other apps, real 4G (not office Wi-Fi) for at least the cold-start items.

**The 12-minute pass (every release):**
1. **Cold open (film this, 30s):** force-stop app → open → time to YOUR Home content. Watch for: black gap after splash, double skeleton, popcorn sections.
2. **Scroll feel (film 20s):** Home top→bottom fast flick ×2, Offering page ×1. Judder, hitching near hero/greeting, sticky-band behavior.
3. **The money walk:** Home → any offering → sticky bar appears → Checkout (WEB on Android/desktop; on the Android APP confirm buy CTAs are ABSENT and "Continue on web" shows) → (test coupon) → Razorpay test → ThankYou. Feel: haptic on pay-tap, haptic + confetti on arrival.
4. **The screening room (film 60s):** open enrolled course → chapter → play 30s → Mark complete → watch the FULL arc (ring → takeover → recap if course end) → dismiss each way (button, back gesture/button, backdrop) → **verify the page scrolls after every dismissal**.
5. **Keyboard:** notes textarea + community composer + (web) checkout form — open/close keyboard 3×, look for jumps, hidden fields, detached sticky bars.
6. **Back behavior (Android):** from chapter → back → back → back to Home → back = exit toast → back = exit. With any sheet/dialog open, back closes it first. (Android 14+: check the predictive-back preview looks sane once P10-T2 ships.)
7. **Notifications (post Phase 8):** trigger a test push (send-push test mode) with app closed → tap → correct screen.
8. **Offline (post Phase 6):** airplane mode → open app → cached Home renders + banner; reconnect → self-heal.
9. **One rotation + one interruption:** rotate during video fullscreen; take a phone call mid-lesson → return.

**What to film:** items 1, 2, 4 always; anything that feels off (screen-record + one-line note). Drop files in the shared release folder; the director triages into `design-fix-sprint` items verbatim.

**Per-platform additions:** iOS — edge-swipe back from every depth (must never fight PageMotion); status bar over the player; TestFlight-specific: check FLAG_SECURE equivalent isn't blocking screenshots on iOS (it's Android-only — screenshots should work on iOS). Android — System WebView version noted (Settings→Apps→Android System WebView) in the report; test once on data-saver mode.

## 7. Staged rollout + rollback doctrine (per platform)

**Android (Play):**
- Internal track for every phase build (`play-publish.mjs <aab> --track internal`).
- Promotion to production ONLY on Rahul's explicit "promote phase N", at `--rollout 0.1`–`0.2` (`status:"inProgress"`); watch Sentry + Play vitals + support WhatsApp for a minimum of 24h at stage 1; ramp 20%→50%→100% over ≥3 days for any release containing Tier-1 surfaces; **halt** (freeze fraction) at the first scroll/login/payment regression report, fix-forward via sprint or ship previous AAB with bumped versionCode.
- Rollback reality: Play has no true rollback — the halt+re-release path IS the rollback; keep the previous release AAB + its versionCode in the release notes for instant re-publish.

**iOS (App Store):**
- TestFlight for every phase build. Public releases use **Phased Release** (7-day auto-ramp), pause on the same triggers. Expedited-review request only for S1 regressions.

**Web (Vercel):**
- Effectively instant + 100%: post-deploy verification ON PROD within 15 minutes of merge (the §6 money walk, steps 1–3, on desktop + one phone browser), because web is the native purchase path. Rollback = `git revert` + redeploy (target <10 min). NEVER merge a phase branch to main as part of building — main auto-deploys (ORCHESTRATION.md step 7 stands).

**Council triggers (restate):** any release whose accumulated diff touches `src/index.css`, html/body/scroll roots, routing, auth/session, payments, native shell, or app-wide primitives (`ui/button.tsx`, toast system, query client) runs `bugfix-council` before release — the council argues the fix, cross-platform verify is mandatory, and Rahul's device pass gates promotion.

## 8. Copy-paste prompt skeletons

**Gate run:**
```
Workflow design-qa-gate (scriptPath .claude/workflows/design-qa-gate.js, repoPath /Users/rahulsrinivas/Claude/LevelUp-Main-App):
{ phase: N, briefPath: "design/briefs/phase-N.md",
  routes: [<gate routes from the brief>], devPort: 8087,
  notes: "Also run: token-police greps §4.2, body-lock §4.1, reduced-motion sweep §4.4,
  scroll-regression §4.6 incl. post-completion, overlay-exit checks §4.7,
  CLS §4.5 on skeleton swaps, interaction-latency sample §2.
  Budgets §5 are (observe|enforce) this phase. Write design/qa/baselines.json on PASS." }
```

**Fix sprint from device feedback:**
```
Workflow design-fix-sprint: { items: [
  { issue: "<verbatim Rahul note + film timestamp>", screen: "<route>",
    severity: "high", evidence: "release-folder/<file>", files: [<from triage>] } ],
  briefPath: "design/briefs/phase-N.md", phase: N }
Rules reminder: transform/opacity only; tokens only; no html/body overflow;
body-lock invariant §4.1; re-gate touched routes after.
```

**Cold-start measurement (Phase 6+, manual or lens):**
```bash
npm run build && npx vite preview --port 4173 --strictPort &
node design/vision/tools/coldstart.mjs   # port the stage4b CDP-frame script here; frames → design/qa/phase-N/coldstart/
```

## 9. Baseline numbers from this audit (2026-07-07, branch design/phase-2)

For future gates to beat: Home mount ≈25+ supabase requests · entry chunk 534KB · Slow-3G dev cold start >24s black (prod unmeasured — establish the prod baseline in the first Phase-3 gate) · 4×-CPU flick-scroll: Home 16.7ms avg/0 jank, Offering 16.7ms avg/1 jank (emulated) · backdrop-filter occurrences: 43 (xl on header/tab-bar/FloatingSupport/NotificationDropdown/HeroCarousel) · off-palette color hits: ~75 student+admin · sub-44px targets: 51 lines · 10–11px text: 232 instances · toast systems mounted: 2 · `.pressable/.card-hover` on student surfaces: MyCoursesPage, CourseDetail, UpcomingEvents, NewMembers, PopularCommunity, ProfilePage, Login/Signup.
