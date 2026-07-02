# LevelUp App — World-Class Design Strategy
### Creative direction + implementation plan for the design/fluidity/interactivity revamp
*Authored 2026-07-02 from a full code audit (design tokens, motion layer, screen architecture) + live screen review at phone viewport. Strategy only — nothing here has been built yet.*

---

## 1. The honest verdict

**Where the app is today: a 6/10 with 9/10 bones.** That's the most important finding. This is *not* a rebuild — the foundation is genuinely strong and most teams would kill for it:

- A real token system (HSL CSS variables, semantic tiers, spacing/motion tokens) — not ad-hoc CSS
- A distinctive identity already in place: pure-black canvas, warm cream text, champagne-gradient CTAs, Instrument Serif italic accents, film grain — this is *not* generic shadcn
- Exemplary `prefers-reduced-motion` handling, safe-area classes, stagger/reveal primitives
- Clean patterns layer (`SurfaceCard`, `Section`, `LoadingState`) and a nav shell that stays mounted across routes

**What keeps it from world-class is the last 40%: choreography, physics, depth, and craft-finishing.** Specifically:

| Dimension | Today | Award-level |
|---|---|---|
| Press feedback | CSS `scale(0.97)` — feels dead | Spring physics with release velocity |
| Screen transitions | 340ms slide-in | Shared-element continuity (artwork travels between screens) |
| Scroll | Static | Parallax, condensing headers, scroll-linked reveals |
| Depth | Flat black-on-black; `shadow-design-*` classes are **referenced but never defined** (silent bug) | Elevation ladder + light logic |
| Haptics | 6 components | Every meaningful touch |
| Gestures | Rough pull-to-refresh only | Sheet drag-to-dismiss, swipe-back, physical overscroll |
| Progress emotion | Two completion modals | A progress *system* the user feels on every session |
| Craft finish | Letterboxed/broken card art, badge clutter, orange/cream color clashes | Zero visible seams |

Motion maturity scored **5.5/10** in the audit. Framer-motion is installed but used in exactly one component (hero carousel). `vaul` (swipeable bottom sheets) is in dependencies and used *nowhere*. The tools are already in the bundle — they're just not being played.

**Live-screen findings that undercut the premium feel right now** (fix these regardless of everything else — they're the difference between "designed" and "template"):
1. Catalog cards render letterboxed 16:9 thumbnails floating inside taller dark cards (Video Editing Academy card), and cards with missing art show a giant empty black void (Creator Academy card) — `CatalogCard.tsx`
2. Header wordmark overlaps page content on the offering page at 375px
3. Offering hero shows a black void when the poster hasn't loaded — no gradient placeholder/blurhash
4. The red "COHORT" badge and amber "Courses" segment pill fight the champagne/cream system
5. Learn tab for a fresh user is a nearly full-screen empty state — a dead first impression of the tab

---

## 2. The North Star

**"The app should feel like the work it teaches."** LevelUp teaches craft — filmmaking, editing, music, photography, design. The product's credibility rests on the app itself feeling *crafted*. A student paying ₹1,499 to learn from Lokesh Kanagaraj should feel production value in every tap.

The creative positioning: **a private screening room, not a SaaS dashboard.**
- **Content is the light source.** On a pure-black canvas, imagery, video and champagne accents are the only light. Every screen should feel lit by its content — ambient glows from artwork, gradient scrims, spotlight moments — never by gray boxes.
- **Physics, not transitions.** Everything that moves obeys spring physics and responds to the finger. Nothing snaps, nothing teleports.
- **Progress is theater.** Finishing a lesson in a craft program is a real accomplishment; the app should stage it like one — and stage the *journey*, not just the finale.
- **Calm luxury, not dopamine casino.** We borrow Duolingo's progress *legibility*, not its confetti-per-tap energy. The brand is dark, warm, adult.

Reference set to study (not to copy — to steal principles from):
- **Family / Amie / Opal** — spring physics, tactile buttons, sheet gestures (this is the fluidity bar)
- **Apple TV+ / Netflix mobile** — content-forward dark UI, image treatment discipline, condensing headers
- **Airbnb** — shared-element transitions as spatial storytelling
- **Duolingo** — progress legibility and session momentum (adapted to a calm register)
- **Apple Design Award criteria** — the "Delight and Fun" + "Interaction" rubrics are effectively our acceptance tests

---

## 3. The five pillars

### Pillar 1 — Depth & Light (visual system)
The canvas is pure black and surfaces are near-black; today the app reads *flat*. World-class dark UIs build depth with **light logic**, not gray steps.

- **Define the elevation ladder** (this also fixes the silent bug): `shadow-design-sm/md/lg` + glow variants actually defined in `tailwind.config.ts`; a semantic z-index scale (`base/sticky/overlay/modal/toast`)
- **Ambient content glow**: cards and the player emit a soft, blurred, desaturated glow sampled from their artwork (CSS `filter: blur` on a scaled image copy — cheap, no canvas work). This is the single highest-impact visual move for a black app.
- **Image treatment system**: every thumbnail gets `aspect-ratio` enforcement + `object-cover` (kills letterboxing), a bottom gradient scrim, the existing `.dark-img` filter, and a **branded placeholder** (champagne-on-black monogram gradient) for missing art. Blur-up loading (tiny inline preview → sharp) so images *arrive*, never pop.
- **Accent discipline**: retire the orange/red one-off badges; tier badges move to the champagne/cream/gold family with one semantic accent per content type (Live = gold pulse, Cohort = violet, Masterclass = champagne). One accent per screen moment.
- **Typography drama**: the Instrument Serif italic is the brand's best asset and it's underused. Use it as the *emotional register* — greetings, empty states, completion moments, section eyebrows on sales pages — with bigger contrast between display sizes and body.

### Pillar 2 — Motion with Intent (physics & choreography)
One motion grammar, spring-based, used everywhere:

- **Spring token set** (`src/lib/motion.ts`): three named springs — `snap` (stiff, buttons), `glide` (screens/sheets), `bounce` (celebrations) — plus the existing duration/easing tokens. Every animation in the app draws from this file. This is what makes an app feel *coherent* rather than animated-in-places.
- **Living buttons**: `MotionButton`/`MotionCard` primitives with `whileTap` spring scale + haptic; adopted by `button.tsx` and `SurfaceCard` so all ~100 call sites inherit it in one move.
- **Shared-element transitions** (the wow move): course artwork travels from Home card → Offering hero → Player via framer-motion `layoutId`. This single pattern is what people remember about award-winning apps — the interface feels like one continuous space.
- **Scroll choreography**: offering-page hero parallax + scale-on-overscroll; a condensing header (large title → compact bar) on Home/Learn; `useScroll`-linked reveals replacing some static staggers.
- **Exit animations everywhere**: modals, sheets and toasts animate out through `AnimatePresence` — today they vanish instantly, which reads as jank even at 60fps.
- **Loading choreography**: skeleton → content crossfade with stagger (no instant swap); the shimmer already exists, the handoff doesn't.

### Pillar 3 — Tactility (gesture & haptic layer)
This is a phone app for a touch-first Indian audience; the finger is the primary instrument.

- **Bottom sheets with real drag**: adopt `vaul` (already installed!) for invoice detail, share, chapter notes, filters — swipe-down dismiss with spring settle and background scale-down.
- **Pull-to-refresh v2**: spring release (currently snaps to 0), a haptic tick at the trigger threshold, branded indicator (the LevelUp node-logo drawing itself).
- **Haptic coverage doctrine**: selection ticks on nav/tabs/toggles, light impact on card taps, success/error notifications on every async resolution, heavy impact reserved for completion moments. Install `@capacitor/haptics` properly (the wrapper exists; the plugin isn't in package.json — half the calls are no-ops on device today).
- **Player gestures**: swipe-down to dismiss the chapter player (Netflix-style), double-tap seek with ripple.

### Pillar 4 — Progress as Theater (the emotional system)
The audit's biggest product finding: progress surfaces are modest and the home screen doesn't *know you*.

- **Home "Your Week" module**: greeting joined by a compact progress strip — ring (course %), minutes learned this week (CountUp), next milestone. The serif greeting already sets the tone; give it substance.
- **Session momentum in the player**: `UpNextList` gains a course-level progress bar and "Lesson 5 of 24 · Module 2" context; completing a lesson animates the ring *in place* before the takeover fires — the user sees the needle move.
- **Fix the celebration stack**: today lesson-completion (`CompletionTakeover`) and course-completion (`CompletionRecap`) can stack modals. Sequence them into one arc: ring fills → takeover → (if course done) recap. One story, no double-modals.
- **Stats that feel earned**: `MyCoursesPage` text counters become stat cards with icons, tabular numerals, CountUp on reveal.
- **A weekly streak, in a calm register**: "3 weeks of showing up" with the WeeklyStats day-blocks — consistency framing, not fire-emoji pressure. (Product call for Rahul: include or park.)

### Pillar 5 — Craft Finish (the last 10% that reads as world-class)
- Kill every letterboxed/void thumbnail (aspect-ratio + placeholder system above)
- Empty states get the serif treatment + one gorgeous branded graphic + a *useful* action (Learn tab's empty state should show the catalog, not a button to the catalog)
- Badge/chip cleanup to one family; tabular numerals for all prices/counters; consistent icon stroke width
- Fix the header/wordmark overlap at 375px; audit every screen at 360×740 (the real Indian Android median), not just 375×812
- Microcopy pass: every empty state, error and loading line in one voice (warm, craft-focused, zero corporate)

---

## 4. Screen-by-screen direction (priority order)

1. **ChapterViewer — "the screening room" (highest stakes).** This is where paying students live. Player gets ambient artwork glow, gesture dismissal, momentum UI (course progress + module context), in-place ring animation on completion, sequenced celebration arc. The tab strip (Resources/Q&A/Notes/Moments) gets sliding-pill indicator with spring.
2. **Home — "the marquee."** Condensing header, Your-Week progress strip, hero carousel with parallax + `layoutId` handoff to offering pages, catalog cards rebuilt on the image-treatment system, personalized QuickPick (resume-aware, craft-aware).
3. **PublicOffering — "the trailer" (this is also the money page).** Hero parallax with blur-up poster, scroll-choreographed sections (instructor proof, lesson browser, testimonials), sticky pay bar that appears with a spring after the hero scrolls past, price CountUp. Conversion and drama are the same project here.
4. **Learn** — segmented control gets a sliding spring pill; enrolled cards lead with progress; empty state becomes a mini-catalog.
5. **Community** — the editorial header is already the app's best screen; add composer focus choreography (sheet-like expansion), post entrance staggers, heart-pop + haptic on like (pop exists; wire haptic), pull-to-refresh v2.
6. **Onboarding/Login** — already cinematic; add spring to the bottom-sheet rise, stagger the pills, haptic on OTP success (wired) *and* on each OTP digit (not wired).
7. **Profile/AccountHub** — invoice/cert details move into vaul sheets; certificates get a share-worthy card design.

---

## 5. Implementation plan

Phasing respects the repo's own change-risk tiers (see `CLAUDE.md` — Tier 1 = shared CSS/layout = council + real-device verify + staged rollout; the June 14 one-word-CSS scroll outage is the cautionary tale for exactly this project).

### Phase 0 — Foundation (≈1 week, mostly Tier 1, zero visible change)
- Define `shadow-design-*`, glow shadows, z-index scale in `tailwind.config.ts`; fix dead references
- `src/lib/motion.ts` spring/duration token module; `MotionButton`/`MotionCard`/`MotionSheet` primitives in `src/components/motion/`
- Image-treatment primitives: `ArtworkImage` (aspect-ratio, scrim, blur-up, branded fallback), ambient-glow wrapper
- Install `@capacitor/haptics` for real; haptic doctrine helper (`tapTick/confirm/celebrate`)
- **Performance budget locked here**: transform/opacity only; blur capped (Android WebView compositing is the constraint — heavy `backdrop-filter` is the #1 dark-app jank source on mid-range Androids); 60fps verified on a real mid-range Android device *before* anything ships. Every later phase inherits this gate.

### Phase 1 — The core loop feels alive (≈2 weeks)
- MotionButton/Card adoption across `button.tsx` + `SurfaceCard` (one edit, app-wide effect)
- Home: condensing header, Your-Week strip, catalog cards on `ArtworkImage`, hero parallax
- Shared-element: Home → Offering (`layoutId` on artwork + title)
- Tab bar: active-tab spring pill + haptic ticks
- Craft-bug sweep: letterboxing, missing-art voids, wordmark overlap, badge cleanup
- **Ship as Android staged rollout (10–20%) + TestFlight; watch Sentry for a few days**

### Phase 2 — The screening room (≈2 weeks)
- ChapterViewer: ambient glow, momentum UI, sequenced completion arc, tab pill, swipe-dismiss player, double-tap seek
- Skeleton→content crossfade choreography (player + home first)
- Exit animations on all dialogs/toasts

### Phase 3 — The money pages (≈1–2 weeks)
- PublicOffering scroll choreography + sticky pay bar spring + blur-up hero
- Checkout: press states, price tabular numerals, success moment upgrade
- (This phase should measurably move conversion — instrument it via PostHog before/after)

### Phase 4 — Tactility + emotional systems (≈2 weeks)
- vaul sheets (invoices, share, notes, filters); pull-to-refresh v2
- Stats redesign, weekly-consistency streak (if greenlit), certificate cards
- Community/Login/Profile polish passes

### Phase 5 — Hardening + audit (≈1 week)
- Device matrix: mid-range Android WebView (real device), iOS WKWebView, desktop web, 360px width, reduced-motion on, font-scale 120%
- Perf pass: no CLS, tap feedback <100ms, 60fps scroll on all revamped screens
- Full-app screenshot diff review at 360/375/768; final microcopy pass

**Total: ~8–9 weeks of focused work to award-candidate territory, with visible transformation landing at the end of Phase 1 (week ~3).** Every phase ships independently behind staged rollouts — no big-bang release.

### What I need from Rahul (product calls, not design calls)
1. **Streaks/consistency mechanic** — in or out? (Pillar 4; everything else stands without it)
2. **Conversion instrumentation** — OK to wire PostHog events on the offering/checkout pages so Phase 3 proves itself?
3. Any **brand red lines** (e.g., the champagne/black system is assumed sacred; the orange badge accents are assumed disposable)

---

## 6. Definition of "world-class" (acceptance criteria)

The revamp is done when a cold reviewer can verify:
- [ ] Every tappable element responds with spring + haptic within 100ms
- [ ] No screen-to-screen cut lacks continuity (shared element, directional slide, or crossfade — chosen deliberately)
- [ ] Artwork never letterboxes, voids, or pops in; every image arrives
- [ ] The app's depth reads clearly with the brightness at 30% (elevation/light logic works)
- [ ] A returning student sees their momentum within 1 second of opening the app
- [ ] Course completion feels like a produced moment, not a modal
- [ ] 60fps scroll + zero layout shift on a ₹15k Android phone
- [ ] Reduced-motion users get a calm, complete, un-broken experience
- [ ] Nothing anywhere looks like a default component

*Companion docs: `ARCHITECTURE.md` (code map), `CLAUDE.md` (risk tiers & release runbooks). Audit details (file:line references for every finding) live in the 2026-07-02 session; the three audit reports can be regenerated on demand.*
