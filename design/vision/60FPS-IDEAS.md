# LevelUp × 60fps — Interaction Reference Mining
### Ideas, choreography specs and reference grounding from the 60fps.design library (~2,000 curated iOS shots)
*Authored 2026-07-07. Method: 35+ semantic sweeps across every app surface AND by motion vocabulary AND by exemplar app (CRED / Family / Opal / Toss / Apple TV / Netflix / Threads / Amie / gentler-streak), 18 motion-anatomy breakdowns pulled for shortlisted shots, implementation-level motion code pulled for the top handful. Curation filter: DESIGN-STRATEGY.md ("private screening room", champagne/cream on pure black, Instrument Serif italic accents, calm luxury — borrow Duolingo's progress legibility, never its confetti-per-tap energy). Every idea states its cost model against the CLAUDE.md perf budget (transform/opacity only, capped blur, mid-range Android WebView 60fps) and is tagged **ENRICHES <task>** (better reference/choreography for something already in `design/vision/EXECUTION-BACKLOG.md`) or **NET-NEW → phase**.*

**How to read an entry:** the *choreography* paragraph is the executable spec; the *reference* links carry the exact motion anatomy (gesture → transition → end state); the *LevelUp adaptation* is how it wears our brand. A builder should be able to build from the entry + the breakdown link without re-doing taste work.

---

## 1. Top 12 — the shortlist that changes the feel (ranked)

### 1. Champagne dust — the calm celebration particle
**Surface:** ThankYou arrival; CompletionRecap finale. **Tag: ENRICHES P3-T4** (and refines the shipped completion arc). **Tier 2.**
**Choreography:** Replace/augment the confetti one-shot with *rising champagne bokeh*: 16–24 soft gold-cream discs (3 size classes: 4/8/16px, the large ones pre-blurred via a radial-gradient background, NOT css `filter`) born just below the fold, drifting up over 2.4–3.2s on `ease-out`, each with independent delay (stagger ≈ 90ms — the reference's exact stagger), slight x-sway (±12px sine via keyframes), scaling 0.6→1 and fading 0→0.85→0 across the top third. One shot, then stillness. Pair with the existing `hapticNotification("success")`.
**Reference:** Apple Messages "send with celebration" — golden bokeh depth-field on a dark screen. Breakdown confirms: slow timing, ease-out, pronounced stagger, up+scale+fade only.
https://60fps.design/shots/apple-messages-send-with-celebration-animation
https://video.gumlet.io/66b49d08225b7b88f78b7b44/67693b0ba080a6ad1607bb3c/main.mp4
**LevelUp adaptation:** particles in `--champagne-from/to` and `--cream` at low opacity over pure black; the serif italic program name is what the light rises *behind*. This is the brand's answer to confetti — celebration as *light*, not litter. Reduced motion: a single static glow fade-in.
**Cost model:** N absolutely-positioned divs animating transform+opacity via CSS keyframes; zero layout, zero filter at runtime, one-shot then unmounted.

### 2. The hero that breathes — elastic offering-hero stretch
**Surface:** PublicOffering hero (the money page), CourseDetail hero. **Tag: ENRICHES P3-T6** (offering scroll choreography) **+ DESIGN-STRATEGY Pillar 2** ("scale-on-overscroll"). **Tier 2** (scoped to the hero element; no html/body change).
**Choreography:** Map scroll position into the hero: while `scrollY <= 0` (iOS rubber-band) or during a tracked pull gesture at top (Android — reuse `usePullToRefresh`'s guarded touch path on non-PTR pages), scale the hero image from `transform-origin: top center` by `1 + pull/900` (cap 1.12) with zero lag (scrubbed, not animated); on release, settle back on `springs.glide`. While scrolling *down* normally, the existing parallax continues.
**Reference:** Marathon show-detail header stretch — breakdown: elastic scale scrubbed to drag, spring snap-back, `spring(response 0.25, damping 0.72)` ≈ our `snap`-adjacent glide.
https://60fps.design/shots/marathon-show-thumbnail-scroll-stretch-interaction
https://video.gumlet.io/66b49d08225b7b88f78b7b44/671733987544fc38002d9bcb/main.mp4
**LevelUp adaptation:** the poster (Lokesh/Nelson) physically responds to the finger — "the trailer is alive". Bottom scrim scales with it so text contrast never breaks.
**Cost model:** one transform on one composited layer, scrubbed from a passive scroll/touch listener; spring release via framer MotionValue. No resize, no layout.

### 3. Pull up for the next lesson — the momentum gesture
**Surface:** ChapterViewer, end of lesson content / Up Next rail. **Tag: NET-NEW → Phase 7** (screening-room furniture; pairs with P7-T4's ResumePill/AutoAdvance work). **Tier 1** — gesture in the player neighborhood; keep the touch target on the scroll container *below* the video iframe, never over it.
**Choreography:** When the chapter's scroll container is at its end and the lesson is ≥90% complete, dragging up past the end reveals a panel rising from the bottom edge: a circular badge whose arrow rotates and crossfades into the *next lesson's thumbnail* as pull deepens (scrubbed), with "Next — *Lesson 6 · Blocking a scene*" in serif italic. Release past threshold → `tapTick()` → navigate; release before → spring back on `glide`.
**Reference:** Telegram pull-up-to-jump-channel — breakdown: elastic pull panel, arrow-morphs-into-avatar as commitment signal, spring(0.45/0.72), subtle stagger.
https://60fps.design/shots/telegram-pull-up-to-jump-channel-interaction
https://video.gumlet.io/66b49d08225b7b88f78b7b44/66e409d9cdca5b9380d6af35/main.mp4
**LevelUp adaptation:** turns "what's next" from a button into physics — the same pull vocabulary as refresh, pointed forward. This is Duolingo session-momentum energy delivered as a *gesture*, no gamification pixels.
**Cost model:** touchmove-scrubbed translateY on one panel + one crossfade; identical guard pattern to `usePullToRefresh` (only arms at scroll-end).

### 4. The node-mark that draws itself — pull-to-refresh confirmed
**Surface:** Home + Community pull-to-refresh. **Tag: ENRICHES P4-T3** — this is *exactly* the planned indicator; the reference supplies the full choreography and proves it at scale. **Tier 2.**
**Choreography (validated against the breakdown):** SVG stroke `stroke-dashoffset` mapped 1:1 to pull distance (0→100% draw across 0→80px), so the mark is *drawn by the finger*; `tapTick()` once at threshold; on release the fully-drawn mark spins (rotate, 1s linear, transform-only) while refreshing; on completion it *snaps back up out of view* on `glide` (the retract is upward, not a fade — keeps the "object" illusion).
**Reference:** Threads logo pull-to-refresh — breakdown names the exact mechanism: "SVG stroke-dashoffset linked directly to the scroll gesture… logo spins to indicate loading… snaps back upward."
https://60fps.design/shots/threads-logo-pull-down-to-refresh
https://video.gumlet.io/66b49d08225b7b88f78b7b44/66b8ebd2a093f143602feab9/main.mp4
**LevelUp adaptation:** cream stroke on `bg-surface-2` 44px circle, per P4-T3 spec. Ship P4-T3 as written; add the upward-snap retract detail from this breakdown.
**Cost model:** stroke-dashoffset (cheap SVG paint) + one rotate; scrub is passive-listener-driven.

### 5. OTP with dignity — the waiting shimmer + the collapse-to-check
**Surface:** Login OTP step. **Tag: ENRICHES P4-T9.** **Tier 2.**
**Choreography:** (a) *While waiting:* a soft low-contrast light streak sweeps across the six OTP boxes left→right on a slow ease-in-out loop (~2.2s) — a linear-gradient overlay translating on transform; signals "listening" without a spinner. (b) *On success:* keyboard and chrome fade first (progressive de-clutter), the six digits slide/scale to screen center, then collapse to a point that expands into a champagne check with a `bounce`-spring pop; then route. Per-digit `tapTick()` on entry stays (P4-T9).
**References:** Toss verification shimmer (idle) + Toss OTP success morph (collapse-to-check) — two shots, one flow; breakdowns pulled for both.
https://60fps.design/shots/toss-verification-code-shimmer-animation
https://video.gumlet.io/66b49d08225b7b88f78b7b44/67dc00dd4c720203cbdd9905/main.mp4
https://60fps.design/shots/toss-otp-successful-animation
https://video.gumlet.io/66b49d08225b7b88f78b7b44/67fe8753cb2a6516988e66ae/main.mp4
**LevelUp adaptation:** the first 20 seconds a paying student ever spends in the app become quietly cinematic. Cream shimmer at ~8% opacity; the success check rides the existing `hapticNotification("success")`. MSG91 widget constraint: if digit-box DOM isn't ours, apply shimmer/success as an overlay layer on the container — degrade gracefully.
**Cost model:** one translating gradient div (loop, transform-only); success = 4 transform/opacity tweens, one-shot.

### 6. The greeting that condenses, not occludes
**Surface:** Home greeting band. **Tag: ENRICHES P6-T0/T8** (the occlusion defect fix — this is the reference that settles *how* it should feel). **Tier 1** (as already tiered).
**Choreography:** On scroll, the large serif greeting *morphs* into the compact bar state: text scales down toward a top-anchored origin while secondary lines fade, the band height collapsing in lockstep (scrubbed, both directions, spring-assisted on release). Coming back down, it re-expands with a subtle `glide` bounce. Nothing slices; the two states are one object.
**Reference:** Wabi detail top-sheet morph — breakdown: "morphing and scaling the avatar down into a small top-centered circle while fading the text… scrolling down reverses with a springy bounce; maintains visual continuity, preventing a jarring jump."
https://60fps.design/shots/wabi-app-detail-top-sheet-swipe-down-morph-interaction
https://video.gumlet.io/66b49d08225b7b88f78b7b44/692710c93c7ed780e097d16d/main.mp4
**LevelUp adaptation:** "Good evening, *Rahul*" stays the first thing the app says — it just gets out of the way like a well-mannered host. Matches P6-T0 option 1 (condense) and argues *for* it over option 2 (full release).
**Cost model:** scale+translate+opacity on `useScroll` MotionValues (already the plan); spacer shrink via transform-safe reserved element.

### 7. Rolling digits wherever money or progress moves
**Surface:** Checkout total, offering price, MyCourses stats, minutes-learned counter. **Tag: ENRICHES P3-T2 / P3-T3 / P4-T5** (upgrade `CountUp` with a `roll` mode). **Tier 2.**
**Choreography:** When a number changes (coupon applied, stat resolves), only the *changing digits* roll vertically to their new value (each digit a 0–9 column translating on `snap` spring with a subtle settle), commas sliding horizontally to their new slots. First mount can still CountUp-sweep; *changes* roll. `tabular-nums` everywhere so columns never shift.
**References:** Finma account-numbers flip ("animating only the changing digits… reminiscent of a physical odometer", spring settle) + Family number input (commas shift with spring physics, text scales to fit, zero layout jump).
https://60fps.design/shots/finma-account-numbers-flip-animation
https://video.gumlet.io/66b49d08225b7b88f78b7b44/682abe5f283a3162ff378ad3/main.mp4
https://60fps.design/shots/family-number-input-commas-shift-place-interaction
https://video.gumlet.io/66b49d08225b7b88f78b7b44/686895f32f7f889f3d1b4836/main.mp4
**LevelUp adaptation:** the ₹1,499 → ₹999 coupon moment becomes a tiny piece of theater instead of a text swap — precision reads as trustworthy on a money page.
**Cost model:** per-digit translateY inside overflow-hidden spans; 3–7 digits max; transform-only.

### 8. The receipt that assembles itself
**Surface:** ThankYou. **Tag: ENRICHES P3-T4** (the spec already says "make it read as an assembled receipt" — this supplies the mechanism). **Tier 2.**
**Choreography:** The receipt strip reveals via a *top→down mask wipe* (a clip-path/height mask growing on `glide`, ~600ms) as if being printed, its line items staggering in 60–80ms apart *behind* the wipe; the total lands last with a digit-roll (idea #7) and one `hapticImpact("light")`. Check-orb → headline → program name (serif) → chips precede it per the existing P3-T4 sequence.
**References:** Dtd Sounds focus-end receipt print (mask-reveal + stagger anatomy; we take the print *feel*, drop the skeuomorphic printer/wiggle) + Run Receipt scroll (paper-feed mask reveal).
https://60fps.design/shots/dtd-sounds-focus-end-print-receipt-animation
https://video.gumlet.io/66b49d08225b7b88f78b7b44/69a2edcb98dac99517794432/main.mp4
https://60fps.design/shots/run-receipt-scroll-animation
https://video.gumlet.io/66b49d08225b7b88f78b7b44/69f8d030c3d879bf57304319/main.mp4
**LevelUp adaptation:** mono type for the line items (JetBrains Mono is already the receipt register), cream rules, no paper texture, no sound. A ₹15k cohort purchase deserves a produced receipt.
**Cost model:** one animated clip-path/masked height + N opacity/translate staggers; one-shot.

### 9. Card → detail: continuity, honestly scoped
**Surface:** Home/catalog card → PublicOffering. **Tag: ENRICHES P9-T6** (the shared-element spike — these are its reference exhibits) and REPORT gap #2. **Tier 2 for the interim treatment; the true morph stays a spike.**
**Choreography (interim, shippable now):** On card tap, the card presses in (`pressTap`), then the offering hero *enters as the same artwork* with a scale-settle from 1.06→1.00 on `glide` plus a bottom-up scrim fade — perceptual continuity without cross-route layout math. On back, the hero exits with a reverse micro-settle (see idea #12).
**References:** Agora podcast card expand (morph anatomy: "card morphs outward… detail text fades and slides up… excellent spatial context") + Apple App Store featured-card morph (the canonical pattern at production quality).
https://60fps.design/shots/agora-podcast-card-details-expand
https://video.gumlet.io/66b49d08225b7b88f78b7b44/66e47b4ecdca5b9380d93735/main.mp4
https://60fps.design/shots/apple-app-store-featured-card-morph
https://video.gumlet.io/66b49d08225b7b88f78b7b44/66c56e9fb5be771faba11590/main.mp4
**LevelUp adaptation:** the artwork is the shared noun; hero enter keyed to the exact thumbnail the card showed (already cached), so the eye reads one continuous object even though the DOM isn't.
**Cost model:** enter-only transform/opacity on the hero; zero cross-route coupling.

### 10. Player collapses to a mini-bar while you read
**Surface:** ChapterViewer — scrolling into Notes/Q&A/Overview on mobile. **Tag: NET-NEW → Phase 7** (sequential with P7-T4/T5 in the ChapterViewer lane). **Tier 1** (player layout; VdoCipher iframe constraints).
**Choreography:** As the user scrolls the tab content past the video, the player doesn't just scroll away: past a threshold it *snaps* (spring, not scrub — per the reference) into a sticky compact bar at top — thumbnail (or live frame for app-owned `<video>`), title one-liner, thin progress bar, play/pause. Tapping it springs the full player back. For VdoCipher iframes: never resize the iframe (DRM/network cost) — keep the iframe mounted at full size but translated off-canvas, and render the mini-bar as chrome with play-state controls; app-owned media may truly shrink.
**Reference:** Neuecast snap-scroll → mini-player — breakdown: "player elements slide up and fade while progress bar and artwork transition into a compact sticky mini-player using a snapping spring motion… lets the user read notes without losing playback context."
https://60fps.design/shots/neuecast-snap-scroll-convert-to-mini-player-interaction
https://video.gumlet.io/66b49d08225b7b88f78b7b44/67dc00dd4c720203cbdd98fa/main.mp4
**LevelUp adaptation:** students take notes *while* the lesson plays — this is the single most student-workflow-shaped idea in the library. The mini-bar carries the momentum line ("Lesson 5 of 24").
**Cost model:** one snap transition (transform/opacity) on a threshold, not per-frame scrub; iframe never reflows.

### 11. The gold crest on a starry black — course completion's key frame
**Surface:** CompletionRecap final card; also the application-accepted moment. **Tag: ENRICHES P8-T4 / CompletionRecap polish.** **Tier 2.**
**Choreography:** The recap's final card cuts to near-black with a barely-visible star grain; a gold crest/badge scales up 0.4→1.0 with a single spring overshoot (`bounce`, one bounce only), success line fading in beneath 150ms later; `celebrate()` haptic on the overshoot peak. Then the Share button (P8-T4) rises.
**Reference:** Swiggy restaurant-voted check — breakdown: "transition from a standard list to a dark, starry success screen elevates a simple action into a premium, rewarding moment"; golden badge, springy overshoot, subtle stagger.
https://60fps.design/shots/swiggy-restaurant-voted-check-animation
https://video.gumlet.io/66b49d08225b7b88f78b7b44/67e0002a586c4a5a5e05beb9/main.mp4
**LevelUp adaptation:** our version of a trophy: `--gold` crest, serif italic course title, zero confetti (idea #1's dust is the ThankYou's; the recap gets *weight* instead). Also the visual seed for certificate share cards (P4-T6).
**Cost model:** two transforms + two fades, one-shot.

### 12. Back feels acknowledged — the parallax pop
**Surface:** All in-app back navigations. **Tag: ENRICHES P10-T2** (back-motion audit — this is the exact reference). **Tier 1** (routing).
**Choreography:** On POP, the outgoing screen slides right off-canvas while the incoming screen slides in from ~-24px with a *parallax offset* (it moves less than the outgoing one) and a 160ms opacity settle — hierarchy reads as physical layering. Matches P10-T2's `page-motion-pop` micro-settle; the parallax offset is the upgrade.
**Reference:** Shop back-navigation pop — breakdown: "active screen slides right while the parent slides in from the left with a subtle parallax offset… mimics physical layering."
https://60fps.design/shots/shop-back-navigation-pop-interaction
https://video.gumlet.io/66b49d08225b7b88f78b7b44/69a2edcb98dac9951779442c/main.mp4
**LevelUp adaptation:** kills the "back is an instant cut" finding (REPORT §b nav score 6) with the cheapest possible move.
**Cost model:** two translateX + one opacity, tokenized 160–240ms; must not fight Android predictive back (P10-T2 owns the interplay).

---

## 2. Full surface-by-surface catalog

Format: **Idea** — choreography one-liner · reference(s) · adaptation note · cost · tag · tier.

### Cold start / splash
- **Curtain-rise splash hand-off** — after `SplashScreen.hide()`, wordmark holds center, then greeting skeleton fades in beneath it and wordmark translates up into the header slot; one continuous reveal. · Opal Splash (calm circular brand reveal → dashboard): https://60fps.design/shots/opal-splash · https://video.gumlet.io/66b49d08225b7b88f78b7b44/670e554f18e315822e1d8ee7/main.mp4 · Medium Splash (logo crossfade → staggered slide-up content): https://60fps.design/shots/medium-splash · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66e29f53f18be3eb6e1db7d5/main.mp4 · Adapt: the wordmark is the only actor; no shapes/morphs. · Cost: 2 transforms + fades. · **ENRICHES P6-T5.** T1 (shell).
- **Loading lines in the brand voice** — while the skeleton holds on true cold start, one serif italic line crossfades on a slow loop ("Dimming the lights…" → "Finding your row…"). · Co-Star loading (morphing moon + poetic text, "meditative"): https://60fps.design/shots/co-star-loading-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/67a4dfa7c82041cdc38085a9/main.mp4 · Adapt: text only, no illustration runtime. · Cost: opacity crossfade. · **NET-NEW → Phase 6** (rides P6-T1 skeletons). T3.

### Login / OTP / Signup / Onboarding
- **Welcome layer stagger discipline** — logo settles from top, CTAs rise from bottom, both toward center, slow ease-out over video/kenburns hero — confirms Login's existing register and gives Signup (P7-T1) its timing sheet. · Portal Splash (breakdown pulled: "staggered vertical movement from opposite edges draws focus to center; slow smooth easing matches the calm video"): https://60fps.design/shots/portal-splash · https://video.gumlet.io/66b49d08225b7b88f78b7b44/676ed814f936951f1cb86870/main.mp4 · **ENRICHES P7-T1/P4-T9.** T2.
- **OTP shimmer + collapse-to-check** — Top-12 #5.
- **Onboarding step dots via layoutId** (already P7-T2 spec) — validated by Particle News carousel dots + morphing illustrations: https://60fps.design/shots/particle-news-onboarding-carousel-dots-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/68309ea06f0c463e2efbc8bd/main.mp4 · **ENRICHES P7-T2.** T2.
- **Craft picker cards reveal color on select** — unselected cards sit dark; selecting fades in the craft's imagery with a check pop (calm version). · Mindllama choose-goals (dark cards reveal vivid backgrounds on tap): https://60fps.design/shots/mindllama-choose-goals · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66b9efd99672bd0f1455fdbb/main.mp4 · Adapt: selection = image brightens from `.dark-img` to full + champagne ring; deselected stay dimmed. · Cost: opacity/filter pre-baked variants. · **ENRICHES P7-T2.** T2.

### Home (greeting, hero, rails, quick-pick)
- **Greeting condense morph** — Top-12 #6.
- **Hero carousel: ambient video/still previews with crossfade + slide** — the marquee slide auto-advances by *crossfading* artwork while chrome stays put (no full-card slide), Apple TV-style ambient glow behind. · Apple TV video preview (breakdown-grade example of content-forward dark carousel): https://60fps.design/shots/apple-tv-video-preview-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66b4bcef371d29849d7bd89b/main.mp4 · App Store Arcade previews: https://60fps.design/shots/apple-app-store-arcade-previews · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66c361e553c6551dedd6c39d/main.mp4 · Cost: crossfade two stacked images. · **ENRICHES DESIGN-STRATEGY Home "marquee"** (HeroCarousel). T2.
- **Live-session countdown ticker over artwork** — for a booked session <24h away, the Home card shows a rolling HH:MM:SS in mono over the artwork, digits ticking via vertical roll. · Airbnb Icons countdown (rolling digits over auto-scrolling imagery, "premium calm"): https://60fps.design/shots/airbnb-icons-countdown · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66b4bcdc61d73e2622b35209/main.mp4 · Cost: 1s interval + per-digit roll. · **NET-NEW → Phase 9** (UpcomingSessions). T2.
- **Section entrance rhythm** — sections reveal with a *single* subtle stagger on first paint only (no re-stagger on cache hydrate). · Vakitler list fade-in (calm, subtle, "peaceful" stagger): https://60fps.design/shots/vakitler-list-fade-in-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/67dc00dd982f3b0964930ee4/main.mp4 · **ENRICHES P6-T1 loading UI.** T3.

### Catalog cards + wishlist
- **Long-press quick actions on catalog cards** — press-and-hold a card: it shrinks 0.96, and a trio of chips (Save · Share · Preview) springs out staggered above the thumb; drag-to-cancel. · Unsplash long-press actions (breakdown: springy staggered trio, scale feedback): https://60fps.design/shots/unsplash-long-press-actions-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/67509738ff6640815e7e85fb/main.mp4 · Adapt: chips in `bg-surface-2` with cream icons; haptic `tapTick` on trigger. · Cost: 3 transform pops; long-press detection only on cards (not over video). · **NET-NEW → Phase 9** (catalog). T2.
- **Wishlist heart: single pop + settle** — heart scales 1→1.28→1 on `bounce` with color-fill crossfade to `--accent-crimson`, one haptic tick; no particles. · Family star toggle (spin/scale/morph on a favorite star, "tactile"): https://60fps.design/shots/family-star-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/67036ffad81b3dcea576085d/main.mp4 · Adapt: drop the spin; keep pop+fill. · **ENRICHES P9-T2 (wishlist heart on both card sizes).** T3.
- **Compact-row press physics** — the P9-T2 compact rows inherit SurfaceCard spring press; reference for how dense rows should feel: Family tokens drag list (spring-loaded row physics): https://60fps.design/shots/family-tokens-drag-and-drop-stacking-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/686895d72f7f889f3d1b47b9/main.mp4 · **ENRICHES P9-T2.** T3.

### Offering / sales page
- **Elastic hero stretch** — Top-12 #2.
- **Pricing-tier accordion** — if/when multi-tier pricing ships, selected plan expands in height revealing details while others collapse — one open at a time, spring height. · Joi pricing accordion (breakdown-grade: "selected tiers smoothly expand… inactive collapse"): https://60fps.design/shots/joi-pricing-plan-accordion-scale-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/69270f313c99376d4fef2d15/main.mp4 · **NET-NEW → parked until multi-tier pricing exists.** T2.
- **FAQ accordion spring** — Radix accordion per P3-T6; the reference that sets the feel bar (springy expand, no abrupt jumps): Amie list accordion + menu sheet (breakdown pulled): https://60fps.design/shots/amie-list-accordion-and-menu-sheet · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66c56cd7652c129409801e63/main.mp4 · **ENRICHES P3-T6.** T3.
- **Sticky-bar SAVE chip shimmer (once)** — when the sticky pay bar first mounts, a single light streak sweeps the "SAVE ₹3,500" chip — once, not looping. · CRED promo badge shimmer (sticky above nav; we take one pass only): https://60fps.design/shots/cred-promo-badge-shimmer-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/670e5550f6ea50ecbbceca39/main.mp4 · **ENRICHES P3-T6 sticky bar.** T3.

### Checkout + payment moment
- **Digit-roll totals** — Top-12 #7. **Receipt assembly** — Top-12 #8.
- **Input → confirm continuity** — guest form submit morphs into the order-summary state (fields collapse up, summary rows land where fields were) rather than a screen swap. · Family entering-values → confirm morph (shared-element input→confirmation): https://60fps.design/shots/family-entering-values-to-confirm-screen-morph-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/6868966c2f7f889f3d1b49fa/main.mp4 · Cost: AnimatePresence + layout springs within one route. · **NET-NEW → Phase 3-adjacent polish (post P3-T9).** T2.
- **Paid check draws itself** — on return from Razorpay success, before routing to ThankYou, a 400ms interstitial: champagne ring scales in, check stroke *draws* (dashoffset), then routes. · CRED paid check (breakdown: crosshairs retract, check draws with spring overshoot — "tactile completion"): https://60fps.design/shots/cred-paid-check-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/6706669e5d11d5a0fec6fccb/main.mp4 · **ENRICHES P3-T4 (arrival sequencing).** T2.

### Success / ThankYou
- **Champagne dust** — Top-12 #1. **Receipt print** — Top-12 #8. **Gold crest** — Top-12 #11.

### Video player chrome + seek
- **Focus-mode seek** — on scrub-start (app-owned media), player chrome fades to 20%, the progress bar thickens and lifts toward the thumb with a springy timestamp tooltip; on release everything settles back. · SoundCloud waveform seek (breakdown: "removing peripheral noise and enlarging the scrubber gives high-precision control") + [untitled] mini-player seek (springy timestamp tooltip): https://60fps.design/shots/soundcloud-drag-waveform-seekbar · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66e3d77298a6ede244ad25dd/main.mp4 · https://60fps.design/shots/untitled-mini-player-seek-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66f4003239eb587d9eca86ca/main.mp4 · VdoCipher iframes: not reachable — scope to app-owned `<video>` (workshops/HLS). · **NET-NEW → Phase 7 (P7-T4 lane).** T2.
- **Chapter switch with segmented progress** — Up Next strip gets a segmented per-lesson progress bar; prev/next arrows slide the title horizontally and re-highlight the active segment. · Queue chapter switch (breakdown: "segmented progress maps directly to chapters… inline skipping + menu selection feel effortless"): https://60fps.design/shots/queue-chapter-switch-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/6734a537ba34cfe064c72e81/main.mp4 · Also solves the P7-T4 dot-strip crowding with a *better* pattern than "5/15" text. · **ENRICHES P7-T4(3).** T2.
- **Mini-player collapse** — Top-12 #10. **Pull-up next lesson** — Top-12 #3.
- **Player drag-to-dismiss settle** — the planned swipe-down player dismissal (DESIGN-STRATEGY Pillar 3) keyed to Apple Music's queue collapse (drag scrub + spring snap, background scale): https://60fps.design/shots/apple-music-player-controls-collapse-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/69f8cff3c3d879bf57303c5b/main.mp4 · **ENRICHES Phase-2 leftover / P7 player work.** T1 (gesture over player region — chrome-owned zones only).

### Lesson complete / progress / streak
- **Ring draws on arrival** (shipped ProgressRing sweep) — calm exemplars for the exact register: Mindllama streak ring draw: https://60fps.design/shots/mindllama-streak · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66bcec7fee4a1d9df64637f3/main.mp4 · Gentler-streak steps pulse (breathing fill on the ring — idle life): https://60fps.design/shots/gentler-streak-steps-fill-pulse-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/68bb1cc86a4843e6765bf283/main.mp4 · Idle pulse only while a lesson is in progress. · **ENRICHES YourWeek ring / P4-T7.** T3.
- **"Weeks of showing up" recap grid** — if P4-T7 ships, the n-increment moment can render a small dot-grid of the run, dots staggering in left→right like time passing. · Gentler Streak "days you showed up" (breakdown: staggered dot-grid reveal "mimics the passage of time… rewarding without gamification"; the app's whole register is our calm-streak north star): https://60fps.design/shots/gentler-streak-activity-recap-days-showed-up · https://video.gumlet.io/66b49d08225b7b88f78b7b44/676ffebaf936951f1cbe4129/main.mp4 · **ENRICHES P4-T7.** T3.
- **Course recap as a story sequence** — CompletionRecap's cards adopt recap-story pacing (auto-advance with tap-to-skip, one stat per card, staggered reveal). · Gentler Streak recap heart-beat (calm multi-card recap): https://60fps.design/shots/gentler-streak-activity-recap-heart-beat · https://video.gumlet.io/66b49d08225b7b88f78b7b44/676ffebaf936951f1cbe4131/main.mp4 · **ENRICHES CompletionRecap.** T2.

### Tabs / nav transitions
- **Back parallax pop** — Top-12 #12.
- **Tab pill morph with label** — active tab expands into a pill containing icon+label; inactive collapse to icons (our tab bar already has the pill — the reference adds the label-morph option at ≥390px). · Neuecast bottom tabs (breakdown-grade pill morph): https://60fps.design/shots/neuecast-bottom-tabs-swipe-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/677573664ee6c592aaedf253/main.mp4 · **ENRICHES tab bar polish (P1 shipped).** T2.
- **Segment switch content crossfade** — Learn/community segmented switches crossfade content with a slight x-slide on `glide` (both directions), empty states included. · Family fluid tab switch (spring slide + crossfading empty states): https://60fps.design/shots/family-fluid-tab-switch-text-morph-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/686894d16410daa283ff12f4/main.mp4 · Pairs with P6-T2's keep-mounted Learn fix (display toggle + opacity, no remount). · **ENRICHES P6-T2 / P4-T8(4).** T2.

### Pull-to-refresh
- **Node-mark draw** — Top-12 #4. Seasonal variant → §4 (Diwali).

### Sheets / modals
- **Sheet physics canon** — vaul adoption (P4-T1/T2) referenced against: Haptic top-sheet (drag reveal snap): https://60fps.design/shots/haptic-top-sheet · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66b4badf61d73e2622b343d6/download.mp4 · Family sheet-to-sheet morph (one sheet morphs into the next instead of stack-swapping — for invoice→share chains): https://60fps.design/shots/family-action-on-sheet-to-sheet-morph-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/686895752f7f889f3d1b4611/main.mp4 · Amie drag-to-dock morph (sheet minimizes to a floating dock — future notes-sheet-while-watching): https://60fps.design/shots/amie-drag-to-calendar-morph · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66c56cd712271a7827f52bfa/main.mp4 · **ENRICHES P4-T1/T2.** T2.
- **Delete/dismiss coherence** — sheet slides down *while* the affected list row collapses behind it (one continuous cause→effect). · Five Cents delete transaction: https://60fps.design/shots/five-cents-delete-transaction-sheet · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66e30e7798a6ede244a65a0/main.mp4 · **ENRICHES P9-T5 (remove-from-saved).** T3.

### Toasts / notifications
- **Toast spring-in canon** — Sonner config (P5-T1) tuned to: slide-up 16px + `snap` spring with slight overshoot, exit fade+slide. · Telegram copy-link toast: https://60fps.design/shots/telegram-copy-link-toast · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66c23e8a53c6551dedd3536b/main.mp4 · **ENRICHES P5-T1(4).** T3.
- **Realtime insert entrance** — new notification rows spring-expand height (layout anim on `glide`) — already P4-T2 spec; reference: Marathon notifications preview stagger: https://60fps.design/shots/marathon-turn-on-notifications-pop-up-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/67173398c180cd70accaa937/main.mp4 · **ENRICHES P4-T2.** T3.

### Empty states
- **Morphing line-icon empty state** — the icon in EmptyState slowly morphs between 3–4 related line glyphs (clapperboard → reel → pencil → back) on ease-in-out, ~8s loop. · X explore-interests empty state (breakdown: "fluid morphing keeps the interface feeling alive… discoverable detail"): https://60fps.design/shots/x-explore-interests-empty-state-icon-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/69f8cff38835595b0e9e2d30/main.mp4 · SVG path morph pre-computed, reduced-motion static. · **ENRICHES P5-T6 (canonical EmptyState) / P7-T3.** T3.
- **Floating-object idle** — gated/locked states get a gently floating lock/crest illustration (2px y-drift, 4s loop). · Family approvals floating lock: https://60fps.design/shots/family-approvals-empty-state-floating-lock-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/6745f91c080b60408ca18ae2/main.mp4 · **ENRICHES community Door pages (UI-DIRECTIONS).** T3.
- **Drawn-arrow guidance** — see §4 wit.

### Search / discovery
- **Icon-morphs-to-field search** — tapping the search icon morphs it into the input while keyboard rises in tandem (one motion, not two). · Globetrotter search morph: https://60fps.design/shots/globetrotter-search-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66b4bd1e371d29849d7bdc53/main.mp4 · **ENRICHES P9-T1(3).** T2.
- **Rotating placeholder ticker** — the catalog search placeholder cycles example queries ("try *filmmaking*", "try *Lokesh*") with a vertical slide ticker. · Blinkit search ticker: https://60fps.design/shots/blinkit-christmas-section-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/67695a738f5e80dcc0b716eb/main.mp4 · **ENRICHES P9-T1.** T3.

### Community / social (maps to UI-DIRECTIONS "The Programme")
- **Playbill stagger** — the Programme's time-column list (mono time · serif title) enters with the Vakitler calm stagger — the reference is *literally* a devotional times-list rendered premium; closest existing pattern to the playbill. · https://60fps.design/shots/vakitler-list-fade-in-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/67dc00dd982f3b0964930ee4/main.mp4 · **ENRICHES community EXECUTION-BACKLOG home surface.** T3.
- **Happening-Now pulse** — the live row's champagne dot pulses via concentric expanding ring (scale+fade, 2s), the *only* motion on the Programme screen (per UI-DIRECTIONS register note). · Apple heart-rate pulse (measured, serious pulse): https://60fps.design/shots/apple-heart-rate-pulse-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/6712ac5e350c08ef72ea7cf1/main.mp4 · **ENRICHES community programming UI.** T3.
- **Presence arrives with a settle** — "24 inside" count increments with a digit roll + the joining avatar pops in on a small spring. · Honk presence indicator (calm-ified): https://60fps.design/shots/honk-presence-indicator-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/68541af4c00d01d537450a79/main.mp4 · **NET-NEW → community build.** T3.
- **Composer focus glow** — Top-12 sidebar: on composer focus, a cream radial glow fades in behind the input and breathes (opacity 0.5↔0.8, 3s) while the card lifts — P4-T8's choreography plus ambient light. · Google Gemini input glow (breakdown pulled: glow "draws focus without distracting"): https://60fps.design/shots/google-gemini-input-gradient-pulse-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/6a12cb5a6d3b523a977329e0/main.mp4 · Cost: pre-rendered radial-gradient div, opacity-only pulse — NO backdrop-filter. · **ENRICHES P4-T8(2).** T2.
- **Composer sheet rises with keyboard in tandem** — mobile composer opens as a sheet whose rise is synchronized with the keyboard (one motion), with inline expansions for attachments. · Threads new-thread sheet: https://60fps.design/shots/threads-new-thread-sheet · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66b8ebd2a093f143602feaa3/main.mp4 · Depends on P10-T1 keyboard plugin for the tandem feel. · **NET-NEW → Phase 9/10 (community composer v2).** T2.
- **End-of-feed pull-back** — feeds END (UI-DIRECTIONS); at the end, continuing to pull rotates an arrow badge and releases back to the Programme ("You're all caught up. Tonight at 8: Dailies."). · Threads end-scroll swipe-back (breakdown-adjacent: rotating arrow scrubbed to pull): https://60fps.design/shots/threads-end-scroll-to-swipe-back-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/69a2eddae9610ba04ea939ad/main.mp4 · **NET-NEW → community build.** T2.
- **Helped-tick draw** — the crit thread's champagne "this helped" tick draws its stroke (dashoffset) rather than popping. · CRED paid check (draw anatomy, Top-12 sidebar): https://60fps.design/shots/cred-paid-check-animation · **ENRICHES community Dailies thread.** T3.

### Share moments
- **Share card presents itself** — tapping Share dims/blurs-lite the page, the certificate/share card scales up center with one spring overshoot, share sheet rises beneath — card first, chrome second. · Retro share-profile (breakdown pulled: "springy scale + slide-in sheet feels rewarding and premium"): https://60fps.design/shots/retro-share-profile-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/68d0cc2043b21a129d1102e8/main.mp4 · Duolingo streak-card share sheet (structure reference): https://60fps.design/shots/duolingo-streak-card-and-share-sheet · https://video.gumlet.io/66b49d08225b7b88f78b7b44/6721177fad85c0894404b43f/main.mp4 · Dim = solid black/60 overlay, no backdrop-filter. · **ENRICHES P4-T6 / P8-T4.** T2.

### Profile / stats / certificates
- **Certificate crest shimmer** — a certificate card catches the light once when it scrolls into view (single diagonal streak across the gold crest, 900ms, once per session). · Instagram achievement badge shimmer (looping; we fire once): https://60fps.design/shots/instagram-achievement · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66c1839d210ca5ef7c86d5c2/main.mp4 · **ENRICHES P4-T6 CertificateCard.** T3.
- **Stats = StatCards + digit roll** (P4-T5) — count-up exemplar in the calm register: Freeletics stats ticker: https://60fps.design/shots/freeletics-stats-text-animation · https://video.gumlet.io/66b49d08225b7b88f78b7b44/66cf4ea8a8ec7d01f57bed4a/main.mp4 · **ENRICHES P4-T5.** T3.

### Push permission moment
- **Primer shows, doesn't tell** — the PushPrimer sheet (P8-T2) previews 2–3 mock notification cards staggering in with springs above the copy — the user *sees* what they'd get ("Session starts in 30 min") before the OS prompt. · Marathon notifications pop-up (breakdown-grade stagger preview) + Substack video-in-sheet (show-the-value pattern): https://60fps.design/shots/marathon-turn-on-notifications-pop-up-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/67173398c180cd70accaa937/main.mp4 · https://60fps.design/shots/substack-enable-notification-video-in-sheet · https://video.gumlet.io/66b49d08225b7b88f78b7b44/6877a7a2aa14b70eb1b2c7ee/main.mp4 · Mock cards as DOM, not video. · **ENRICHES P8-T2(1).** T2.

---

## 3. Motion-vocabulary upgrades → `src/lib/motion.ts`

New named primitives, each earned by ≥2 reference shots. All transform/opacity; all collapse under `useMotionSafe`.

1. **`settle`** — the acknowledgment micro-motion: incoming surface arrives at 0.985 scale / −8px and settles to rest on a stiff spring (≈ stiffness 380, damping 32 — between `snap` and `glide`). Used by: back-pop (Top-12 #12), sheet content after vaul spring, hero enter (Top-12 #9). *Justified by:* Shop back-nav pop; Wabi header morph re-expand; Neuecast mini-player snap.
2. **`roll`** — per-digit vertical odometer as a `CountUp` mode (`mode="roll"`): only changing digits translate in 0–9 columns, `snap` spring per digit, commas slide. *Justified by:* Finma account-numbers flip; World App register flip (https://60fps.design/shots/world-app-register-number-flip-animation); Family number input.
3. **`draw`** — stroke-dashoffset primitive with two drivers: `progress` (scrubbed 0–1, e.g. pull distance) and `timed` (spring-eased one-shot). Used by: PTR node-mark, paid check, helped-tick, ProgressRing (already sweeps — unify under this). *Justified by:* Threads logo PTR; CRED paid check; Mindllama streak ring.
4. **`dust`** — the champagne one-shot particle burst: count/size/opacity presets, pronounced stagger (~90ms), ease-out rise, auto-unmount. The ONLY particle primitive allowed in the app. *Justified by:* Apple Messages celebration; Not Boring Camera ambient particles (https://60fps.design/shots/not-boring-camera-get-started-background-animation).
5. **`stretch`** — scrub-driven elastic scale for overscroll surfaces: maps a gesture delta to scale with a cap and a `glide` release. Used by: offering hero, pull-up-next-lesson panel. *Justified by:* Marathon header stretch; Clear pull-down-to-add (https://60fps.design/shots/clear-pull-down-to-add-interaction); Telegram pull-up.
6. **`glint`** — a single (never looping) light-streak sweep: translating linear-gradient overlay, ~900ms ease-in-out, fires at most once per mount. Used by: OTP waiting (looping variant allowed ONLY there, it signals "listening"), SAVE chip, certificate crest. *Justified by:* Toss verification shimmer; CRED promo badge shimmer; Queue update-button shimmer (https://60fps.design/shots/queue-update-button-shimmer-animation).
7. **`breathe`** — ambient idle pulse for exactly one element per screen: opacity 0.6↔1.0 or scale 1↔1.03, 2.5–4s ease-in-out loop. Used by: Happening-Now dot, in-progress ring, composer glow. *Justified by:* gentler-streak steps pulse; Google Gemini input glow; Google Lens border pulse (https://60fps.design/shots/google-lens-border-gradient-pulse-animation).

Doctrine line to add at the top of motion.ts when these land: *"Seven verbs — settle, roll, draw, dust, stretch, glint, breathe. If a motion isn't one of these plus the three springs, it doesn't ship."*

---

## 4. Wit & personality moves (cheap, calm, authored)

- **Diwali lights week** — during Diwali week only: a single strand of tiny champagne fairy lights along the Home header that *breathe* (staggered opacity pulses, no color chaos), and the PTR node-mark gets a diya-flame flicker at its center while spinning. Seasonal, silent, gone in 5 days — for this audience it's the highest-warmth 40 lines of CSS in the plan. · Blinkit Diwali lights (breakdown pulled: twinkle = brightness pulses, "warm, festive, subtle"): https://60fps.design/shots/blinkit-diwali-theme-change-lights-interaction · https://video.gumlet.io/66b49d08225b7b88f78b7b44/68f4524b558b404636062a06/main.mp4 · Swiggy Diwali diya PTR: https://60fps.design/shots/swiggy-diwali-theme-pull-to-refresh-loader · https://video.gumlet.io/66b49d08225b7b88f78b7b44/6736b9b2f82ccc4efafb444c/main.mp4 · **NET-NEW → any phase, ship behind a date flag.** T3.
- **The drawn arrow** — first-visit Learn empty state: a hand-drawn cream arrow *draws itself* (dashoffset) from the copy toward the mini-catalog below, then fades. Once per user (localStorage). · Family browser arrow empty state: https://60fps.design/shots/family-browser-animated-arrow-empty-state · https://video.gumlet.io/66b49d08225b7b88f78b7b44/686895f1fc386bd77fdc77e4/main.mp4 · **ENRICHES P7-T3.** T3.
- **Morphing empty-state glyph** — §2 Empty states (X explore) — the Learn/community empty icons quietly cycle craft glyphs; a student who notices feels the app is awake. T3.
- **Loading lines with stage directions** — §2 cold start (Co-Star): serif italic loading copy rotates through screening-room stage directions. Voice per P5-T4 rules. T3.
- **"You're all caught up. Tonight at 8."** — end-of-feed pull-back (§2 community): the feed ends with an invitation, not a void. T2.
- **404 already nails it** — "We lost the reel" is the register proof; port its grain+serif+single-action anatomy into ErrorState (P7-T3) — no new reference needed, the app is its own reference here.
- **Haptic pairings map** (uses existing helpers, zero new deps): OTP digit → `tapTick` · pull threshold → `tapTick` · pay initiated → `hapticImpact("medium")` (exists) · receipt total lands → `hapticImpact("light")` · crest overshoot peak → `celebrate()` · pull-up-next-lesson commit → `tapTick` · "weeks of showing up" increment → `celebrate()` (P4-T7, exists). Rule: haptics fire at the *physics peak* (overshoot/threshold), never at animation start.
- **Idle breath on the thing that's alive** — exactly one `breathe` per screen: Home = Happening-Now dot (when live), ChapterViewer = in-progress ring, Community = composer glow (focused only). Never two.

---

## 5. Anti-catalog — rejected patterns (and why, one line each)

- **CRED rewards wheel / chest / slot-machine / voucher 3D bursts** (cred-rewards-wheel, cred-claim-reward-chest-open, cred-voucher-claimed…) — dopamine-casino mechanics; our celebration is light, not loot.
- **Duolingo lesson-complete mascot + XP stat pops** (duolingo-lesson-complete-state, brilliant-lesson-complete) — we borrow progress *legibility*, not mascots or XP tickers.
- **Fire-streak iconography** (opal-streak-fire, brilliant streak flame) — P4-T7 is "weeks of showing up" in serif; no flames, no guilt.
- **Heart/emoji particle explosions on like** (instagram-heart-like, honk double-tap bursts) — heart-pop + haptic tick is the ceiling; particles on a *tap* cheapen the dust reserved for real milestones.
- **3D gyroscope/flip cards & shattering gems** (queue logo flip, any-distance badge, opal-gem-unlocked, instagram share-card 3D flip) — GPU-hostile on mid-range Android WebView and a register break (physical showmanship vs. calm luxury).
- **Slide-to-pay** (swiggy-slide-to-pay) — novelty friction at the highest-intent tap; Razorpay owns the payment gesture, our job is the champagne button.
- **Blur-driven overlays/morphs** (apple-folder-expand, airbnb search blur, arc long-press assistant) — `backdrop-filter` is the #1 jank source in our budget; solid scrims only.
- **Full-screen animated mascot PTR** (reddit runner, zomato spoon) — mascots are permanently out (AI-slop test + brand).
- **Skeuomorphic printer wiggle + sound effects** (dtd-sounds receipt hardware cosplay) — we take its mask-reveal, reject the costume.
- **Rapid multi-style illustration splashes** (housewarming, capwords) — cold start must hand off to *content* in <1s (Phase 6), not perform.
- **Warp-speed light bursts on purchase** (cred-cashback-unlocked) — the money moment converts on trust; drama stays under 1.2s and champagne-colored.
- **Auto-expanding promo cards in feeds** (cred-order-purchased-offer-expand) — motion without user intent in a feed reads as advertising, which the Programme explicitly is not.

---

## Coverage index (idea → backlog task)

| Backlog task | Ideas here |
|---|---|
| P3-T2/T3 | digit `roll` (Top-12 #7) |
| P3-T4 | champagne dust (#1) · receipt print (#8) · paid-check draw |
| P3-T6 | hero stretch (#2) · FAQ spring · SAVE glint |
| P4-T1/T2 | sheet physics canon · realtime insert entrance |
| P4-T3 | node-mark draw (#4, validated) |
| P4-T5 | StatCard roll |
| P4-T6 | share-card presentation · crest glint |
| P4-T7 | showed-up dot grid · ring breathe |
| P4-T8 | composer glow · segment crossfade · heart pop ceiling |
| P4-T9 / P7-T1/T2 | OTP shimmer+collapse (#5) · welcome stagger · craft-picker reveal · step dots |
| P5-T1/T6 | toast spring canon · morphing empty glyph |
| P6-T0/T8 | greeting condense morph (#6) |
| P6-T5 | curtain-rise splash · loading lines |
| P7-T3 | drawn arrow · 404-register port |
| P7-T4/T5 | segmented chapter bar · focus-mode seek · pull-up next lesson (#3) · mini-player (#10) |
| P8-T2 | primer preview stagger |
| P8-T4 | gold crest (#11) |
| P9-T1/T2/T5 | search morph · placeholder ticker · long-press quick actions · wishlist pop · row delete coherence |
| P9-T6 | card→detail continuity exhibits (#9) |
| P10-T2 | back parallax pop (#12) |
| Community (UI-DIRECTIONS) | playbill stagger · happening-now pulse · presence settle · end-of-feed pull-back · helped-tick draw · floating lock |

*Totals: 46 ideas — 31 ENRICHES · 15 NET-NEW (incl. 7 wit moves; NET-NEW: pull-up-next-lesson, mini-player collapse, countdown ticker, long-press quick actions, input→confirm morph, focus-mode seek, composer sheet v2, end-of-feed pull-back, presence settle, pricing accordion (parked), loading lines, Diwali week, plus vocabulary work). Motion primitives proposed: 7 (settle · roll · draw · dust · stretch · glint · breathe).*
