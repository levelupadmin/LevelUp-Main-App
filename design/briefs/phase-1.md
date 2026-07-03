# Phase 1 brief — The core loop feels alive

**Goal:** the first *visible* transformation. Every tap in the app responds with spring physics and a haptic tick; Home reads like a produced screen instead of a template; artwork never letterboxes or voids; the tab bar feels native. This build ships to the Play internal track + TestFlight for Rahul's device testing.

**Branch:** `design/phase-1` · **Gate routes:** `/home`, `/learn`, `/community`, `/p/lokesh-kanagaraj-teaches-film-making` · **North star:** DESIGN-STRATEGY.md Pillars 1–2, §4 screens 2–3.

**Foundation available (Phase 0, all unadopted until now):** `src/lib/motion.ts` (springs snap/glide/bounce, `useMotionSafe`, `pressTap`), `MotionButton`/`MotionCard` (`src/components/motion/`), `ArtworkImage`/`AmbientGlow` (`src/components/media/`), haptics doctrine (`tapTick/confirm/celebrate` in `src/lib/haptics.ts`), shadow ladder + z-scale (`tailwind.config.ts`).

**Hard rules (every task):** transform/opacity-only animation; no `backdrop-filter` additions; never touch html/body overflow or `src/index.css` scroll/layout rules; all motion values from `src/lib/motion.ts` / Tailwind motion tokens — zero one-off durations/easings; reduced-motion path intact everywhere (use `useMotionSafe`); 44px touch targets; verify empty/loading/error states of anything you touch.

## Tasks

### T1 — Primitive hardening: close the Phase 0 adoption-time notes (`tier: 2`)
**Files:** `src/components/motion/MotionCard.tsx`, `src/components/motion/MotionButton.tsx`, `src/components/media/AmbientGlow.tsx`, `src/components/media/ArtworkImage.tsx`, `src/components/motion/__tests__/motion-primitives.test.tsx`, `src/components/media/__tests__/media-primitives.test.tsx`
Five carry-over findings from the Phase 0 re-gate, fix before anything adopts these:
1. MotionCard: Space activates on **keyup** (native-button semantics; keydown Space only preventDefaults to stop scroll; Enter stays keydown; no key-repeat multi-fire).
2. MotionCard: JSDoc contract — interactive usage requires an accessible name (aria-label or text child); add a dev-only console.warn when interactive with no discernible name (cheap heuristic: no aria-label/aria-labelledby and no text content).
3. MotionButton: real keyboard test — `fireEvent.keyDown` Enter/Space path, not click-labeled-as-keyboard.
4. AmbientGlow: drop `will-change-transform` (keep `transform-gpu`); update the test that pins it.
5. ArtworkImage: on error, the placeholder surfaces `role="img"` + `aria-label={alt}` when alt is non-empty (currently aria-hidden always).

### T2 — Living buttons app-wide (`tier: 1`)
**Files:** `src/components/ui/button.tsx`
Adopt spring press physics inside the shadcn `Button` so ~every button in the app inherits it in one edit: render via framer `motion.button` (or wrap MotionButton's logic — reuse, don't duplicate; extract shared bits into `src/components/motion/MotionButton.tsx` ONLY if needed via T1 coordination — otherwise keep this file self-contained using `pressTap`/`useMotionSafe` from `src/lib/motion.ts` + `tapTick()` haptic on activation). Preserve EVERYTHING: cva variants, `asChild`/Slot behavior (Slot path may keep CSS-only press — do not break Radix composition), disabled semantics, focus-visible ring, type=button defaults, forwarded refs. Reduced motion ⇒ no scale. Buttons must never double-fire haptics when composed inside other haptic components. Add/extend tests if a button test file exists; otherwise rely on suite + gate.

### T3 — SurfaceCard adoption (`tier: 1`)
**Files:** `src/components/patterns/SurfaceCard.tsx`
The interactive variant of `SurfaceCard` (used across Home/Learn/etc.) adopts MotionCard: snap spring press (scale 0.98), glide hover lift on fine pointers, keyboard operability, `tapTick()` on activation. Preserve its API exactly (`variant`, `padding`, `to`/`onClick` polymorphism — Link renders must keep client-side routing). Static/muted variants stay motion-free. The old `.card-hover`/`.press-scale` CSS classes on this component are replaced by the spring path (leave the CSS classes themselves in index.css — other components still use them; do NOT touch index.css).

### T4 — Tab bar with living active pill (`tier: 1`)
**Files:** `src/components/layout/StudentLayout.tsx`
Mobile bottom tab bar: a shared active-tab indicator (framer `layoutId` pill/underline behind the active icon+label) that springs (glide) between tabs on navigation; icons get a subtle snap-spring press scale; `hapticSelection` already fires — keep it. Active tab must be visually unmistakable (cream pill/tint per strategy accent discipline). Desktop sidebar: active item gets the same treatment (shared layoutId scoped per breakpoint or two indicators — avoid cross-layout layoutId jumps). Do NOT alter nav structure, routes, safe-area classes, or the header. Reduced motion ⇒ indicator moves instantly.

### T5 — Home: Your-Week strip + condensing header (`tier: 2`)
**Files:** `src/pages/Home.tsx`, `src/components/home/YourWeek.tsx` (new)
1. **Your-Week strip**: compact module directly under the greeting — progress ring (most-active enrolled course %, reuse `ProgressRing` from `src/components/progress/`), lessons completed count, and current-course "next lesson" affordance. Reuse EXISTING data hooks/queries (read how `MyCoursesPage.tsx` + `ContinueLearning.tsx` derive progress; do NOT add new Supabase tables/RPCs). Numbers animate with existing `CountUp`. Hide entirely for users with zero enrolments (empty state = render nothing; Home already handles discovery).
2. **Condensing greeting**: on scroll, the large serif greeting condenses into the sticky header area (transform/opacity choreography via framer `useScroll` on the page scroll container — throttled, transform-only, no layout reads in the handler). Keep the existing greeting typography (serif italic name). Reduced motion ⇒ static.

### T6 — Hero parallax + Home→Offering continuity (`tier: 1`)
**Files:** `src/components/home/FeaturedHero.tsx`, `src/pages/PublicOffering.tsx`
1. FeaturedHero: subtle scroll parallax on the artwork (image translates slower than scroll, transform-only), and the existing carousel crossfade timings move onto motion tokens (0.8s one-offs → tokenized).
2. PublicOffering hero: blur-up/scale-settle entrance choreography (poster arrives via `ArtworkImage` with `priority`, hero scales 1.04→1 on glide + staggered title/price reveal) so navigating from a Home card *reads* as spatial continuity. Do NOT restructure routing or PageMotion, do NOT attempt cross-route framer `layoutId` (the router unmounts the source tree — a true shared-element needs architecture Phase 2+ can consider). Fix the header wordmark overlap on this page at 375px while in the file (gate #0 evidence: wordmark collides with page content at the top of `/p/*` routes).
3. Wrap the offering hero in `AmbientGlow` (first adoption — small/thumbnail source per its contract).

### T7 — Catalog cards rebuilt on ArtworkImage + badge discipline (`tier: 2`)
**Files:** `src/components/catalog/CatalogCard.tsx`, `src/components/catalog/CatalogSection.tsx`
Rebuild `CatalogCard` imagery on `ArtworkImage` (aspect `video`, scrim on): kills the letterboxed-thumbnail-in-tall-card and black-void-when-missing-art defects (gate #0 evidence on /home catalog). Badge cleanup per strategy accent discipline: the red "COHORT" chip and any off-palette badges move to the tokenized family (champagne/cream/gold/violet accents; one accent per card). Wishlist heart + View button get press states (via T2's Button or MotionCard — reuse). Card itself becomes a MotionCard-backed pressable with accessible name (course title). Keep all data/behavior (lock states, Coming Soon, ratings, wishlist mutation) identical.

### T8 — Craft sweep: ContinueLearning + Learn segmented control (`tier: 2`)
**Files:** `src/components/home/ContinueLearning.tsx`, `src/pages/Learn.tsx`
1. ContinueLearning resume cards adopt `ArtworkImage` (aspect video, scrim) — no letterbox/void; keep the progress bar + "Lesson N of M" chip exactly.
2. Learn's segmented control (Courses|Live|Events): sliding active pill via framer `layoutId` on glide spring, `tapTick()` on change; the active pill uses the cream family (replace the current amber/orange active tint — accent discipline). Content swap on segment change gets a fast crossfade (motion tokens). No route/behavior changes.

## Acceptance criteria (the gate checks these)
1. Suite green: `npm run build`, `npx vitest run`, `npm run lint` (no NEW lint errors vs the ~650 main baseline).
2. Every tappable surface on the gate routes responds with visible press feedback within 100ms; buttons/cards/tabs use the shared springs (no one-off values in the diff).
3. Zero letterboxed or void artwork on `/home` (catalog + continue-learning + hero) — verified live at 375px AND 360px.
4. Tab bar active state is unmistakable and springs between tabs; Learn segmented control pill slides; both instant under reduced motion.
5. `/p/lokesh-kanagaraj-teaches-film-making` at 375px: no wordmark overlap, hero enters with choreography, AmbientGlow present and cheap (no backdrop-filter, no will-change).
6. Your-Week strip renders for enrolled users, renders nothing for zero-enrolment users, numbers CountUp once.
7. No scroll regression anywhere (the June-14 class of bug): all gate routes scroll fully at both widths.
8. Reduced-motion pass: all new choreography collapses to instant/static without broken layouts.
9. All five Phase 0 adoption-time notes verifiably closed (T1).

## Explicitly out of scope
ChapterViewer (Phase 2), checkout/pricing surfaces, vaul sheets, streaks/PostHog (open product calls), true cross-route shared elements, index.css edits, nav structure changes, admin surfaces.
