# Phase 0 brief — Foundation (invisible layer)

**Goal:** every token, primitive and utility the visible phases need, with ZERO visible change to the app. The app must render pixel-identical after this phase. This phase doubles as the Studio System dry run.

**Branch:** `design/phase-0` · **Routes affected:** none visibly (gate routes: `/home`, `/learn` — to prove nothing changed) · **North star:** DESIGN-STRATEGY.md Pillars 1–3.

## Tasks

### T1 — Elevation + z-index tokens (`tier: 1`)
**Files:** `tailwind.config.ts`
Define the missing shadow scale in `theme.extend.boxShadow`: `design-sm`, `design-md`, `design-lg` (soft black elevation ladder tuned for a pure-black canvas — shadows barely read on #000, so pair each with a subtle 1px light-edge strategy where needed) plus `glow-cream` and `glow-gold` (soft champagne glows for CTAs/celebrations, derived from the existing `--champagne-to`/`--gold` HSL vars). These classes are ALREADY referenced in `src/components/ui/{card,button,sheet,dialog}.tsx` but currently undefined (silently fall back to Tailwind defaults) — defining them must not visibly change current rendering more than negligibly (verify by eye against current screenshots; tune values dark enough).
Also add a semantic `zIndex` scale: `base: '1'`, `sticky: '30'`, `overlay: '40'`, `modal: '50'`, `toast: '60'` — matching the z-values the app already uses (audit current usage: header/tab bar use z-40/z-50, Radix portals z-50; do NOT renumber existing components in this phase, just provide the scale).

### T2 — Motion token module (`tier: 2`)
**Files:** `src/lib/motion.ts` (new)
Single source of truth for framer-motion physics, mirroring the CSS vars in `src/index.css:162-169`:
- `springs`: `snap` (buttons/toggles — stiff ~500, damping ~30), `glide` (screens/sheets — ~300/35), `bounce` (celebrations — ~400/22, visible overshoot)
- `durations` + `easings` re-exporting the CSS token values (160/240/400ms; the three cubic-beziers) for framer `transition` use
- `pressTap`: the canonical `whileTap` prop object (`{ scale: 0.97 }` + snap spring)
- `useMotionSafe()`: hook wrapping framer's `useReducedMotion()` returning booleans/presets that collapse springs to instant when reduced-motion is on (framer springs do NOT respect the CSS media query automatically)
Exports typed, tree-shakeable, documented with one-line comments. No component changes in this task.

### T3 — Motion primitives (`tier: 2`)
**Files:** `src/components/motion/MotionButton.tsx` (new), `src/components/motion/MotionCard.tsx` (new), `src/lib/motion.ts` (read-only dependency — same cluster as T2)
- `MotionButton`: wraps children in `motion.button` (or Slot for asChild) with `pressTap` spring + optional haptic tick on press (via T5's `tapTick`), forwarding refs/props — a drop-in the visible phases will adopt inside `ui/button.tsx` and `SurfaceCard`. NOT adopted anywhere yet this phase.
- `MotionCard`: same for card surfaces (`whileTap` scale 0.98 + glide-spring hover lift on desktop pointer media query).
Both must respect `useMotionSafe()` (reduced motion ⇒ no scale animation, instant states) and add zero behavior when JS springs are unavailable. Include a small vitest render test for each (they exist, they forward props, reduced-motion path renders).

### T4 — ArtworkImage + ambient glow (`tier: 2`)
**Files:** `src/components/media/ArtworkImage.tsx` (new), `src/components/media/AmbientGlow.tsx` (new)
- `ArtworkImage`: the app-wide image treatment — props `src`, `alt`, `aspect` (e.g. `"video" | "poster" | "square"`), `scrim` (bottom gradient on/off). Enforces `aspect-ratio` + `object-cover` (kills letterboxing), applies the existing `.dark-img` filter class, fades in on load (opacity transition, no layout shift — dimensions reserved), and on error/missing src renders the branded placeholder: champagne-on-black gradient with the LevelUp monogram (inline SVG, no asset dependency).
- `AmbientGlow`: wrapper that renders a blurred, scaled, desaturated copy of a given image behind its children (pure CSS: absolutely-positioned `img` + `blur` + `saturate` filters + opacity ~0.25, `aria-hidden`, `pointer-events-none`). Blur is applied to a SMALL scaled-down copy (e.g. render at 10% size scaled up) so Android WebView compositing stays cheap — do NOT use `backdrop-filter`.
Not adopted anywhere yet. Vitest render tests: fallback renders on error, aspect enforced.

### T5 — Haptics: real plugin + doctrine helpers (`tier: 2`)
**Files:** `package.json`, `package-lock.json`, `src/lib/haptics.ts`
- `npm install @capacitor/haptics` (the dynamic-import wrapper in `src/lib/haptics.ts` currently no-ops on device because the plugin was never installed).
- Extend `src/lib/haptics.ts` with the doctrine helpers (thin wrappers over the existing functions, keeping their guards): `tapTick()` (selection — nav/tabs/toggles/card taps), `confirm(ok: boolean)` (success/error notification for async resolutions), `celebrate()` (heavy impact — completion moments only). Keep existing exports untouched (7 call sites depend on them).
- Do NOT run `npx cap sync` (native project churn belongs to the release train).

## Acceptance criteria (the gate checks these)
1. `npm run build`, `npx vitest run`, `npm run lint` all green.
2. Zero visible change: `/home` and `/learn` at 375px look identical to before (gate's visual lens compares against current look; the T1 shadow definitions may only produce imperceptible differences).
3. New modules have tests; all new code paths respect reduced motion; no raw hex values; no `backdrop-filter` in AmbientGlow.
4. `@capacitor/haptics` present in package.json dependencies; existing haptic call sites unbroken.

## Explicitly out of scope
Adopting any primitive in visible components (Phase 1), `npx cap sync`, index.css changes beyond none (T1 touches only tailwind.config.ts), light mode, streaks, PostHog.
