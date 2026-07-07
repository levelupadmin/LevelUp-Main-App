# Phase 2 brief — The screening room

**Goal:** ChapterViewer becomes the flagship screen — where paying students live. The player region glows with its artwork, the user always sees their momentum, completing a lesson is a produced, sequenced moment (never stacked modals), the tab strip feels native, and every dialog/toast in the app finally animates OUT. Plus: close all seven phase-1 carry-overs. Ships to Play internal track + TestFlight for Rahul's device testing.

**Branch:** `design/phase-2` · **Gate routes:** `/home`, `/learn`, `/courses/:courseId` (pick any real course from /home), `/chapters/:chapterId` (navigate from an enrolled course — dev-bypass auth is active) · **North star:** DESIGN-STRATEGY.md Pillar 2 + §4 screen 1 ("the screening room"), §5 Phase 2.

**Foundation available (adopted app-wide in phase 1):** `src/lib/motion.ts` (springs snap/glide/bounce, `useMotionSafe`, `pressTap`), `MotionButton`/`MotionCard`, `ArtworkImage`/`AmbientGlow`, haptics doctrine (`tapTick/confirm/celebrate` — resolves via `window.Capacitor.Plugins.Haptics`), shadow ladder + z-scale, spring-press `Button`/`SurfaceCard`, tab-bar cream pill, Learn ARIA-tabs pattern (copy it for new tab strips).

**Hard rules (every task):** transform/opacity-only animation; no `backdrop-filter` additions; all motion values from `src/lib/motion.ts` / Tailwind motion tokens — zero one-off durations/easings; reduced-motion path intact everywhere (`useMotionSafe`); 44px touch targets; verify empty/loading/error states of anything you touch.

**⚠️ THE BODY-LOCK INVARIANT (this phase works in the June-14 outage neighborhood):**
`CompletionTakeover` is the SOLE owner of the body scroll lock (commit `978f97d` fixed a double-lock race that shipped as a prod outage). NO task may add a new `document.body.style.overflow` writer, and no task may touch html/body overflow rules except T7 under its explicit constraints. Acceptance gate greps for this. After ANY dismissal path of any overlay (button, Android back, route change), body scroll must be unlocked.

## Tasks

### T1 — Screening-room chrome: ambient glow + momentum UI + tab pill (`tier: 2`)
**Files:** `src/pages/ChapterViewer.tsx`, `src/components/chapter/UpNextList.tsx`
1. **Ambient glow:** wrap the player region in `AmbientGlow` (small/thumbnail source per its contract — never the full-res frame; no backdrop-filter). Artwork source: the chapter/course thumbnail already available in the page data.
2. **Momentum UI:** `UpNextList` gains a course-level progress bar and a context line — "Lesson N of M · Module X" (derive N/M/module from the data the page already loads; read how ChapterViewer/CourseDetail compute progress today; NO new Supabase tables/RPCs). Progress bar animates on the glide spring when a lesson completes.
3. **Tab strip** (Resources/Q&A/Notes/Moments): sliding active pill via framer `layoutId` on glide spring + `tapTick()` on change, cream family accent, full ARIA tabs contract (copy Learn's phase-1 pattern), ≥44px hit areas. Reduced motion ⇒ pill moves instantly.

### T2 — Sequenced completion arc (`tier: 1` — completion/body-lock surface)
**Files:** `src/pages/ChapterViewer.tsx`, `src/components/chapter/CompletionTakeover.tsx`, `src/components/progress/CompletionRecap.tsx`, `src/components/progress/ProgressRing.tsx`, `src/pages/CourseDetail.tsx`
Today lesson-completion (CompletionTakeover) and course-completion (CompletionRecap) can stack. Build ONE arc:
1. On lesson completion the progress ring/bar animates **in place first** (the user sees the needle move — bounce spring, `celebrate()` haptic), THEN CompletionTakeover enters.
2. If the course is now complete, CompletionRecap follows the takeover's dismissal — sequenced, never overlapping, never two modals at once.
3. Both takeover and recap get real exit animations (`AnimatePresence`, glide out).
4. **PRESERVE THE INVARIANT:** CompletionTakeover stays the sole body-lock owner; CompletionRecap must NOT re-acquire its own body lock while sequencing; every dismissal path (CTA, backdrop, Android back button, route change mid-arc) leaves body scroll unlocked. Add/extend a regression test for the unlock.
5. Reduced motion ⇒ calm instant versions, sequence order preserved.

### T3 — Player gestures: swipe-down dismiss + double-tap seek (`tier: 1` — gesture layer over media)
**Files:** `src/components/chapter/ChapterMediaPlayer.tsx`, `src/pages/ChapterViewer.tsx`
**INVESTIGATE FIRST:** determine what the player surface actually is per media type (VdoCipher embed = cross-origin iframe; native iOS bridge; plain `<video>` for mp4/hls). Cross-origin iframes cannot receive our touch handlers — scope honestly:
1. **Swipe-down dismiss:** a drag gesture on APP-OWNED chrome (player header/handle region — not inside a cross-origin iframe) that dismisses the player/route with a spring settle (glide) and background scale-settle. Must NOT capture or dampen vertical page scroll anywhere outside the gesture region; must not break native fullscreen or the Android back button; interruptible (release below threshold springs back).
2. **Double-tap seek ±10s with ripple:** ONLY where the app owns the video element (plain `<video>` path). Never attach handlers over cross-origin content. If no app-owned video path exists, document that and skip this sub-item — do not hack it.
3. Ship a short findings note in the task summary: which media types got which gestures and why.
4. Reduced motion ⇒ no spring theatrics; existing close affordances keep working regardless.

### T4 — Skeleton→content crossfade choreography (`tier: 2`)
**Files:** `src/components/patterns/LoadingState.tsx` (investigate the patterns dir for where skeletons actually live), `src/pages/Home.tsx`
1. A reusable skeleton→content handoff: skeleton fades out as content crossfades/staggers in (`AnimatePresence`, motion tokens) — no instant swap, no double-render flash.
2. Adopt it on Home's main loading surfaces and export it so ChapterViewer's loading path can adopt it (wire ChapterViewer only if it needs zero changes to T1/T2/T3 files' logic — otherwise leave it wired-ready and note it).
3. Zero CLS: skeleton and content must share dimensions. Reduced motion ⇒ instant swap (current behavior).

### T5 — Exit animations on dialogs/sheets/toasts (`tier: 1` — app-wide UI primitives)
**Files:** `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx`, `src/components/ui/sheet.tsx`, `src/components/ui/sonner.tsx` (investigate which toast system is actually mounted; adjust file set to reality)
Today overlays vanish instantly on close. Give every Radix/shadcn overlay a real animate-out (fade+scale for dialogs, directional slide for sheets, fade+lift for toasts) using tokenized durations — tailwindcss-animate `data-[state=closed]` classes are the preferred mechanism (they survive Radix unmount timing; verify the exit actually plays, not just that classes exist). Preserve EVERYTHING: Radix composition, focus trap/restore, controlled-close flows, scroll-lock behavior (Radix owns its own — do not add writers). Reduced motion ⇒ instant. Spot-check one admin dialog too.

### T6 — Phase-1 carry-over craft sweep (`tier: 2`)
**Files:** `src/pages/Learn.tsx`, `src/components/catalog/CatalogSection.tsx`, `src/components/home/UpcomingSessions.tsx`, `src/pages/MyCoursesPage.tsx`, `src/components/home/FeaturedHero.tsx`, `src/components/offering/HeroPlayChip.tsx`
Six deferred items from the phase-1 gate (evidence lives in the phase-1 QA commits `f6a213f`/`184fdbc`/`a7a2f54` bodies):
1. Learn empty-state CTA ≥44px tall at 360px width.
2. CatalogSection filter pills: full a11y (roles/labels/focus-visible rings — reuse Learn's pattern where it fits).
3. UpcomingSessions cards: focus-visible ring.
4. MyCoursesPage: any remaining plain-anchor/element CTAs get press states (`.pressable` or MotionCard — reuse, don't invent).
5. FeaturedHero ken-burns: device perf — transform-only, GPU-friendly, gated by reduced-motion, paused/absent when the hero is offscreen (long-running transforms on large images are a WebView battery/jank tax).
6. HeroPlayChip: remove/replace the legacy backdrop blur (solid/gradient treatment per the perf budget).

### T7 — Greeting-band coarse-pointer parking (`tier: 1` — index.css, council mandatory)
**Files:** `src/index.css`, `src/pages/Home.tsx`
Phase-1's condensing greeting parks correctly on fine-pointer/desktop but the register flags coarse-pointer parking against `src/index.css:227` — the `@media (pointer: coarse) { html, body { overflow-x: hidden; } }` block (which exists to keep touch devices scrolling — it IS the June-14 lesson). Investigate: on coarse-pointer devices that overflow rule likely breaks the greeting band's `position: sticky` parking.
**Constraints, non-negotiable:** prefer fixing the greeting band's own positioning strategy (e.g., extend the existing transform-based `useScroll` parking) over ANY change to html/body rules. If an index.css edit turns out to be genuinely required, it must keep coarse-pointer devices on a scrolling document root (never `clip`, never overflow-y changes) — and it triggers the bugfix-council before release regardless. Verify live with DevTools touch/coarse-pointer emulation at 360 AND 375: greeting parks below the app header, page scroll unaffected.

## Acceptance criteria (the gate checks these)
1. Suite green: `npm run build`, `npx vitest run`, `npm run lint` (no NEW lint errors vs main baseline).
2. Chapter route (real chapter, dev bypass): tab pill slides on glide spring with ARIA tabs contract; AmbientGlow present and cheap (no backdrop-filter, small source); "Lesson N of M · Module X" + course progress bar render with real data.
3. **The completion arc:** completing a lesson animates the ring in place → takeover enters → (course done) recap follows — sequenced, never stacked; exit animations on both; after EVERY dismissal path body scroll is unlocked. `grep -rn "body.style.overflow" src/` shows CompletionTakeover as the only writer.
4. Player gestures exist on app-owned surfaces per T3's findings note; page scroll outside the gesture region is untouched; nothing attaches handlers over cross-origin iframes.
5. Dialogs, sheets and toasts animate out (verify live on ≥3 surfaces incl. one admin dialog); reduced motion ⇒ instant; focus restore and controlled closes intact.
6. Skeleton→content crossfade live on Home (+ ChapterViewer if wired): no CLS, no flash-of-both.
7. All six T6 carry-overs verifiably closed at 360 AND 375.
8. Greeting band parks correctly under coarse-pointer emulation at both widths; document root still scrolls (June-14 class).
9. Reduced-motion pass: all new choreography collapses to instant/static without broken layouts or broken sequencing.
10. No scroll regression anywhere: all gate routes scroll fully at both widths, including AFTER completing a lesson and dismissing every overlay.

## Explicitly out of scope
Checkout/money pages (Phase 3), vaul sheets + pull-to-refresh v2 (Phase 4), streaks/PostHog (open product calls with Rahul), true cross-route shared elements, nav structure changes, admin redesign, index.css changes beyond T7's constrained scope.
