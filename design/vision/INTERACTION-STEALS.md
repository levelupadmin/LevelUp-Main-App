# LevelUp — Interaction Steals (60fps.design pass)
### A curated, spec'd catalog of interactions worth adapting, sourced from the 60fps.design library (1,985 shots surveyed via sitemap + curated shot descriptions) and cross-referenced with Mobbin real-app flows.
*Authored 2026-07-07 by the interaction-steal pass. Evidence: shot posters + grids in `design/vision/shots/steals/` (self-describing filenames). Method note: 60fps.design clips could not be played headlessly, but every shortlisted shot has an official curated frame-by-frame description on its detail page (scraped verbatim), so behavior confidence is HIGH unless flagged. Filter grids beyond 6 shots are PRO-gated; the corpus was mined from the full sitemap slug list instead.*

**House rules applied to every proposal in this file** (restated so no future session relitigates):
- Existing motion tokens only (`springs.snap/glide/bounce`, `durations.fast/base/slow/sweep`, `easings.out/inOut/spring` from `src/lib/motion.ts`). Zero new tokens were needed anywhere in this catalog — where a proposal names a timing, it maps to an existing token.
- Transform/opacity only. No layout-property animation, no uncapped blur, no canvas/WebGL.
- Reduced-motion path mandatory (all springs already collapse via `useMotionSafe()`).
- ≥44px touch targets. Nothing touches `html/body` overflow. Nothing alters Apple Reader Rule purchase gating (native hides pay CTAs — every money-path steal lives on the web/`applyUrl` path only).
- Mid-range Android WebView is the perf floor: the cost model for each steal says what animates and why it composites.

---

## 1. Shortlist — the 10 best steals (ranked by impact for LevelUp)

---

### STEAL-1 — The Razorpay handoff (Airbnb) — `tier: 2`
**Source:** Airbnb, "Review Button Morph to Razorpay on Scroll" (60fps.design shot #1856, poster: `shots/steals/shot-airbnb-review-button-morph-to-razorpay-on-scroll-interaction.png`). Curated description, high confidence.

**What it does:** A sticky floating primary CTA is anchored at the bottom of a long checkout/offering page. As the user scrolls to the bottom and the *inline* "Continue to Razorpay" button enters the viewport, the floating button shrinks in width and fades out, handing primacy to the inline button. Scroll-linked (scrubbed, not triggered) — the two buttons never compete; there is exactly one lit primary action at any moment.

**LevelUp mapping:** `src/pages/PublicOffering.tsx` (mobile sticky pay bar + hero/rail CTAs) and `src/components/checkout/StickyPayBar.tsx` on `src/pages/CheckoutPage.tsx`. Today P3-T6 item 2 specs the sticky bar's *entrance/exit* as a spring; this steal upgrades it into a **handoff**: as the inline Pay/Enrol CTA scrolls into view, the sticky bar doesn't just exit — it visibly *cedes* to the inline button (width-scale + fade tracking scroll progress), which reads as the page guiding the eye down to the commit moment. Literally the same PSP as the source shot.

**Brand fit:** Pure calm-luxury: it *removes* competing light instead of adding decoration. On a black canvas where the champagne CTA is the light source, guaranteeing only one champagne button glows at a time is accent discipline made kinetic.

**Perf cost model:** `useInView` on the inline CTA (IntersectionObserver, off-main-thread) supplies a 0→1 progress via two thresholds, or framer `useScroll` clamped to the CTA's approach window. Animated properties: `scaleX`/`opacity` on the sticky bar container (compositor-only; `transform-origin: center bottom`). No layout reads per frame, no blur. Holds 60fps on Android WebView because the scroll handler mutates only transforms on one promoted layer.

**Spec sketch:**
- **Files:** `src/pages/PublicOffering.tsx` (sticky bar block), `src/components/checkout/StickyPayBar.tsx` (same pattern on checkout — optional second site).
- **Motion:** entrance/exit stays `springs.glide` per P3-T6; the handoff is scroll-scrubbed (no duration). Fade window: from "inline CTA 25% visible" → "75% visible" maps to sticky `opacity 1→0`, `scaleX 1→0.92`. `aria-hidden` + `pointer-events: none` once opacity < 0.5 (keep the existing `useInView` accessibility logic).
- **Reduced motion:** binary swap at the 50% threshold — sticky bar hides instantly when the inline CTA is majority-visible; no scrub.
- **Acceptance:** at 375/360, scrolling to the purchase rail crossfades sticky→inline with no frame where both are fully lit; scrolling back restores the sticky bar; sticky bar remains ≥48px tall and full-width while active; native (Reader-Rule) path — where no pay CTA renders — is byte-for-byte unchanged; reduced-motion swap is instant.
- **Backlog:** fold into **P3-T6** (same file, same builder lane).

---

### STEAL-2 — The pay-button processing arc (Swiggy/Juspay + CRED) — `tier: 1` (touches `ui/button.tsx` lane)
**Source:** Swiggy "Juspay Auto Submit Button Progress" (shot #1462) + CRED "Button Loading to Tick" (shot #0823). Posters in `shots/steals/`. Curated descriptions, high confidence. Mobbin cross-ref: [adidas checkout](https://mobbin.com/flows/8c0f2773-3d21-410b-99c6-acf2e17d85a2) for the minimalist register.

**What it does:** Swiggy: on submit, the button itself becomes the progress surface — a fill sweeps its background left→right while the label changes to a processing state; when full, the card fades to a minimal processing screen. CRED: on tap, the label fades out and is replaced by a single centered dot — the container never changes shape; a low-noise "system is working" signal that later resolves to a tick.

**LevelUp mapping:** The champagne Pay button from **P3-T1** (`src/components/ui/button.tsx` champagne variant, `src/pages/CheckoutPage.tsx` `handlePay`, `src/components/checkout/StickyPayBar.tsx`) plus the arrival on `src/pages/ThankYou.tsx` / `SuccessMoment.tsx` (**P3-T4**). Today the processing state is a spinner/label swap. The steal: make the button the *single continuous narrative* — press (existing `whileTap` snap) → label crossfades to a quiet processing glyph *inside the unchanged champagne container* (CRED move) → on Razorpay callback success, glyph morphs to a check with one `springs.bounce` beat before route change (the ThankYou sequence then owns the celebration). No skeleton flash between states; the button is the story.

**Brand fit:** "Physics, not transitions" + calm luxury. CRED's single-dot processing is the most restrained loading pattern in the corpus — exactly the register for a ₹4,999 commit moment. The champagne gradient never gray-swaps (P3-T1 rule) and never changes shape, so the moment feels *held*, not busy.

**Perf cost model:** Label crossfade = two absolutely-positioned children animating `opacity`/`translateY` (compositor). Optional Swiggy-style fill = a `scaleX` on a pseudo-layer *inside* the button (transform-only) — use only if Razorpay init gives determinate progress; otherwise stay with the indeterminate dot (opacity pulse at `durations.base`). Check morph = SVG path swap with `opacity`+`scale` on `springs.bounce`; one-shot. Nothing here can jank: one button-sized layer.

**Spec sketch:**
- **Files:** `src/components/ui/button.tsx` (a `processing` visual state for the champagne variant only — implemented as a sibling overlay, NOT a new cva variant, preserving all existing variants byte-for-byte), `src/pages/CheckoutPage.tsx` (`handlePay` state machine: idle→processing→success), `src/components/checkout/StickyPayBar.tsx`.
- **Motion:** label out / dot in at `durations.fast` on `easings.out`; dot pulse `opacity 0.4↔1` at `durations.base` alternating; success check pops on `springs.bounce`; ≤600ms dwell on the check before navigation (matches `durationsMs.sweep` territory — reuse `durations.slow` + 200ms guard, no new token).
- **Behavior:** button stays enabled=false during processing; keep the existing `hapticImpact("medium")` on press and add `hapticNotification("success")` only at ThankYou mount (P3-T4 already specs it — do not double-fire).
- **Reduced motion:** instant label swaps ("Processing…" text, then route change); no pulse, no bounce.
- **Acceptance:** simulated slow payment shows container shape/gradient unchanged through all three states at 375; no spinner component mounts on the pay path; success check renders exactly once (ref-guard); axe: button exposes `aria-busy="true"` while processing; reduced-motion path is text-only.
- **Backlog:** extends **P3-T1** (same file lane) + hands off to **P3-T4**'s entrance sequence.

---

### STEAL-3 — The blacklight certificate (Flighty) — `tier: 2`
**Source:** Flighty, "Share Passport Blacklight" (shot #0640, poster: `shots/steals/shot-flighty-share-passport-blacklight-interaction.png`). Curated description, high confidence. Mobbin cross-ref: [Ultrahuman "you learned something new today" share card](https://mobbin.com/flows/9ecaa209-28af-4851-8553-2684f84e263d) — dark share-card register on black.

**What it does:** Tapping a "Blacklight" affordance crossfades the entire passport card from its standard theme to a glowing UV variant where routes, stats and stamps "light up with fluorescent ink," mimicking a blacklight revealing hidden security printing. A reward/easter-egg layer that makes the artifact feel like a *physical document with secrets*.

**LevelUp mapping:** `src/components/certificates/CertificateCard.tsx` + `CertificateShareMenu.tsx` (ProfilePage certificates, P4-T6's share card). The steal: a **"hold to inspect"** state — pressing and holding the certificate (or tapping a small ✦ chip) crossfades it to a champagne-UV variant: the LevelUp monogram watermark, the member number, completion date and instructor signature *glow* in champagne on deep black, like a hologram strip under a verifier's lamp. Release (or second tap) returns it. The shareable card can include a frame of the UV state.

**Brand fit:** This is the single most "private screening room" steal in the corpus — a certificate from a craft school *should* behave like a security-printed document. It rewards ownership without confetti; the reveal is literally light on black, which is the brand's whole physics.

**Perf cost model:** Two pre-composed card layers (standard + UV variant of the same DOM/PNG) stacked; the interaction animates only `opacity` on the top layer (plus a ±1.5° `rotate` settle on `springs.glide` for physicality). No filters, no runtime glow computation — the "glow" is baked into the UV layer's art (text-shadow equivalents pre-rendered or done with static CSS on a layer that isn't animating). One card-sized composite: free at 60fps.

**Spec sketch:**
- **Files:** `src/components/certificates/CertificateCard.tsx`, `CertificateShareMenu.tsx` (adds "Share the blacklight" variant), token additions none.
- **Motion:** crossfade at `durations.slow` on `easings.inOut`; hold gesture = pointerdown 250ms threshold then reveal (matches existing long-press conventions), `hapticImpact("light")` at reveal; release reverses at `durations.base`.
- **Reduced motion:** tap toggles the two states instantly (no crossfade); hold still works.
- **Acceptance:** hold ≥250ms reveals UV layer at 60fps (DevTools perf: no layout/paint entries during crossfade); toggle chip is ≥44px; screen readers get `aria-pressed` on the chip; share menu exports both variants; works at 360px width without card overflow.
- **Backlog:** upgrade to **P4-T6** (certificates share) and feeds **P8-T4** (unified share moments).

---

### STEAL-4 — Scrub timeline with chapter text (Quartr) — `tier: 2`
**Source:** Quartr, "Scrub Timeline Chapter Text" (shot #1748) + "Chapter Progress Fill" (shot #1822). Posters in `shots/steals/`. Curated descriptions, high confidence.

**What it does:** (a) While scrubbing the playback timeline, the timestamp *and the current chapter title* under the slider update live — text swaps via rapid crossfade + subtle horizontal slide so fast scrubbing stays readable; the thumb glides across a *segmented* timeline. (b) In the chapter list, the currently-playing item's background fills left→right in real time as a progress bar; tapping another chapter snaps the active fill to it.

**LevelUp mapping:** `src/pages/ChapterViewer.tsx` — `src/components/chapter/ChapterMediaPlayer.tsx` (timeline), `MomentsList.tsx` (the app already has per-chapter "moments" — these are Quartr's segments, verbatim), and `UpNextList.tsx` (the playing row gets the live background fill). Scrubbing the VdoCipher timeline shows "04:12 · Blocking the scene" with the moment name crossfading as you cross segment boundaries; the UpNextList active row quietly fills as the lesson plays, so course momentum is visible *in place* (this is Pillar-4's "session momentum" made concrete).

**Brand fit:** Editorial, informative, zero decoration — motion in service of orientation. The moment titles are craft vocabulary; surfacing them during scrub makes the player feel like a produced film with named scenes, not a YouTube bar.

**Perf cost model:** Scrub text swap: two stacked text nodes animating `opacity` + `translateX(±8px)` at `durations.fast` — only fires on segment-boundary crossings, not per frame. Timestamp uses `tabular-nums` (no reflow jitter). Row fill: `scaleX` on an absolutely-positioned background layer, driven by the existing playback-progress state (updates ≤1/s, tweened with linear CSS transition — cheap). Confidence note: exact VdoCipher scrub-event granularity needs a spike; the pattern degrades gracefully to on-seek updates.

**Spec sketch:**
- **Files:** `src/components/chapter/ChapterMediaPlayer.tsx`, `src/components/chapter/MomentsList.tsx` (export segment lookup), `src/components/chapter/UpNextList.tsx`.
- **Motion:** text crossfade `durations.fast` + `easings.out`; row fill linear (playback-driven, no spring); moment-boundary `hapticSelection()` during scrub (native only).
- **Reduced motion:** text swaps instantly; fill renders as a static percentage bar updated per second.
- **Acceptance:** scrubbing across a moment boundary swaps title within 100ms with no layout shift (title container fixed-height, ellipsized); UpNextList playing row shows live fill; chapters without moments fall back to timestamp-only (no empty label); 44px scrubber hit-slop maintained.
- **Backlog:** new pattern — schedule in **PHASE 5** alongside P5-T5 (player states) or as a P4 stretch; no existing task id covers it.

---

### STEAL-5 — Marquee carousel with center-stage physics (JioHotstar) — `tier: 2`
**Source:** JioHotstar, "Top Carousel Cards Scroll" (shot poster: `shots/steals/shot-jiohotstar-top-carousel-cards-scroll-interaction.png`). Curated description, high confidence.

**What it does:** The featured carousel's active card is centered, fully opaque and scaled up; neighbors are scaled down, partially visible and dimmed. During a swipe, cards slide/scale/crossfade continuously with the gesture and snap into place. The dimming/scale makes "what's on stage" unambiguous — a proscenium.

**LevelUp mapping:** `src/components/HeroCarousel.tsx` on `src/pages/Home.tsx` (the marquee — already framer-motion-powered, already has parallax from phase 2). Upgrade: neighbor cards render at `scale 0.92`, `opacity 0.55` with a scrim, scrubbed against drag offset so the active poster is the only fully-lit object. Also applies to `src/components/home/QuickPick.tsx` if it's a horizontal rail. Indian users know this exact pattern from Hotstar — it reads instantly as "premiere content."

**Brand fit:** "Content is the light source" — dimming neighbors *is* the screening-room move: the marquee becomes a lit screen flanked by dark seats. No new decoration, just light discipline.

**Perf cost model:** Per-card `scale`/`opacity` bound to the drag motion-value (framer `useTransform` of the carousel x offset). 3 visible card layers animating transform/opacity, GPU-composited; posters are already `ArtworkImage`-treated. The scrim is a static gradient (not animated). Well inside budget.

**Spec sketch:**
- **Files:** `src/components/HeroCarousel.tsx` (and `src/components/home/FeaturedHero.tsx` if the marquee lives there).
- **Motion:** scrubbed transforms (no duration) mapped over drag offset; release snap on `springs.glide`; existing ken-burns (`durations.kenburns`) unaffected on the active card, paused (static frame) on dimmed neighbors.
- **Reduced motion:** no scale/dim scrub — simple paged swap with instant snap; neighbors statically dimmed.
- **Acceptance:** mid-drag screenshot shows exactly one full-brightness card; snap settles ≤400ms; swipe velocity flings respect the spring (no tween feel); Lighthouse/devtools shows no paint storms during drag; pagination dots (if present) stay ≥44px targets.
- **Backlog:** upgrade to **P9-T2** (catalog rhythm) but cheap enough to ride any Home-touching lane earlier.

---

### STEAL-6 — The calm recap story (Gentler Streak) — `tier: 2`
**Source:** Gentler Streak (Apple Design Award winner), "Activity Recap" 10-shot sequence — intro/active-days/distance/heart-beat/days-showed-up/outro etc. Poster: `shots/steals/shot-gentler-streak-activity-recap-intro.png`. Curated description of the intro, high confidence; sequence structure inferred from the shot series (medium-high). Mobbin cross-ref: [Ultrahuman completion share](https://mobbin.com/flows/9ecaa209-28af-4851-8553-2684f84e263d).

**What it does:** A recap presented as story-style cards: a thin progress bar at top, text blocks that fade/slide up *sequentially* per card, one stat per screen ("days you showed up"), tap to advance. The register is soft, adult, congratulatory without gamification — the anti-Wrapped Wrapped.

**LevelUp mapping:** `src/components/progress/CompletionRecap.tsx` (course completion — currently a single modal) and the P4-T7 weekly consistency surface (`WeeklyStats.tsx`). Course completion becomes a 4-card recap: (1) serif italic "You finished *[Course]*" over the course art, (2) one stat card — hours in the room / lessons / weeks showing up (CountUp), (3) the instructor beat — poster + a line, (4) certificate CTA + share. Tap/swipe advances; thin champagne progress segments on top. "Days you showed up" is *already* the app's calm-streak language (P4-T7) — this is its celebration-grade expression.

**Brand fit:** "Progress is theater" in the calm register: sequential single-focus cards are literally staging. The serif italic gets its emotional moment. No confetti beyond the existing one-shot; light and typography carry it.

**Perf cost model:** Each card is a static layout whose children animate `opacity`/`translateY` once on entry (`anim-stagger`-style, framer `staggerChildren` at `durations.fast`). One card mounted at a time (AnimatePresence swap at `durations.base`) — never more than ~6 animating layers. CountUp is rAF text mutation (already shipped). Trivial for the WebView.

**Spec sketch:**
- **Files:** `src/components/progress/CompletionRecap.tsx` (rebuilt as `RecapStory` internally), `src/components/progress/WeeklyStats.tsx` (data), `src/pages/ChapterViewer.tsx` (invocation point unchanged — after CompletionTakeover per the shipped arc).
- **Motion:** card swap `springs.glide`; per-card children stagger `durations.fast` apart on `easings.out`; top progress segments fill with linear `durations.slow` per card; `hapticSelection()` on advance, `hapticNotification("success")` stays at arc start only.
- **Reduced motion:** all children visible instantly per card; advance is instant swap; progress segments jump.
- **Acceptance:** completion of a final lesson plays ring→takeover→recap-story with no stacked modals (existing arc guarantee holds); each card interactive ≤600ms after entry; back-tap on left third goes back a card; whole story dismissible via existing overlay exit; works at 360px.
- **Backlog:** upgrade to the **CompletionRecap half of the shipped arc** + **P4-T7**; also the blueprint for a future "Your month at LevelUp" (P8 re-engagement email companion).

---

### STEAL-7 — Collapsing header with a shared anchor (Wabi) — `tier: 2`
**Source:** Wabi, "App Detail Top Sheet Swipe Down Morph" (poster: `shots/steals/shot-wabi-app-detail-top-sheet-swipe-down-morph-interaction.png`). Curated description, high confidence. Mobbin cross-ref: [Moonly course timeline](https://mobbin.com/flows/6f407e79-4d76-46c1-b000-4f585601eeaf) for the dark course-detail register.

**What it does:** Scrolling up collapses a rich detail header (avatar, description, stats, buttons): the avatar *morphs and scales down into a small circular icon anchored in the compact top bar* while everything else fades; scrolling down springs the full header back. The avatar is the shared visual anchor that keeps the user oriented through the collapse.

**LevelUp mapping:** `src/pages/CourseDetail.tsx` (course art shrinks into the compact bar as you scroll the chapter list — P7-T7's register, upgraded) and the community **House screen (C2-T3)** where the community crest is the anchor. Secondary: `src/pages/CommunityPage.tsx` header today. The course thumbnail sliding into the toolbar is the closest thing to a shared-element transition that costs nothing (same screen, no route change — sidesteps the P9-T6 cross-route spike entirely).

**Brand fit:** Spatial storytelling (the Airbnb principle from DESIGN-STRATEGY §2) delivered within one screen. The artwork — the light source — never disappears; it just takes its seat in the projection booth.

**Perf cost model:** Header collapse driven by scroll position via `useScroll` + `useTransform`: art layer animates `scale` + `translate` (transform-only, one promoted layer); text blocks animate `opacity`. The compact bar is position:sticky (no JS pinning). No measure-per-frame: interpolation ranges precomputed from static header height. 60fps-safe; identical technique to the shipped hero parallax.

**Spec sketch:**
- **Files:** `src/pages/CourseDetail.tsx` (header block), later `design/community` C2-T3 House screen shell.
- **Motion:** scroll-scrubbed (no duration); the "spring back" on reverse scroll is inherent to scrubbing (position-driven), with `springs.glide` only on programmatic resets; reduced motion → art doesn't travel: compact bar crossfades in at the collapse threshold (opacity only).
- **Acceptance:** at 375, scrolling the lesson list scales course art into the bar with no text overlap at any scroll offset (test 320–430px widths); back button and title remain ≥44px; no layout shift of list content during collapse (header space reserved); Android WebView drag shows no dropped frames with DevTools throttled 4x CPU.
- **Backlog:** upgrade to **P7-T7** (CourseDetail resume register) and the spec seed for **C2-T3** (House screen).

---

### STEAL-8 — OTP verified, cinematically (Toss) — `tier: 2`
**Source:** Toss, "OTP Successful" (shot #1220, poster: `shots/steals/shot-toss-otp-successful-animation.png`). Curated description, high confidence.

**What it does:** On autofill/entry of the SMS code, the keyboard and the individual input boxes fade away; the entered digits *merge and scale up into a single centered line*, which then morphs/collapses into a success checkmark that springs in, with "Successfully verified!" fading in below. UI is removed step-by-step so the completion state is the only thing left.

**LevelUp mapping:** `src/pages/Login.tsx` OTP step (P4-T9's surface). Sequence on verify success: input boxes fade (`opacity`), digits condense to center (`translate`+`scale` on `springs.glide`), morph to a champagne check (`springs.bounce`), serif italic "*Welcome back*" fades in, then route. Every login on a phone passes through this moment — it's the highest-frequency "the app is crafted" signal available for one component's work.

**Brand fit:** Subtraction-as-celebration — the screen going dark and quiet around a single champagne check is the house voice. Pairs with P4-T9's existing micro-polish scope (shake-on-error is the failure twin of this success state).

**Perf cost model:** ≤7 layers (6 digit cells + check) animating transform/opacity once. Keyboard dismissal is native. Nothing sustained. Free.

**Spec sketch:**
- **Files:** `src/pages/Login.tsx` (OTP block), possibly `src/components/auth/` if the OTP input is componentized.
- **Motion:** boxes out `durations.fast`; digit condense `springs.glide`; check pop `springs.bounce`; text in `durations.base` on `easings.out`; total ≤900ms before navigation; `hapticNotification("success")` once at check pop.
- **Reduced motion:** boxes and digits swap instantly to check + text; same 900ms *maximum* dwell (skippable — navigation isn't gated on the animation completing).
- **Acceptance:** successful OTP shows the sequence exactly once and never delays auth navigation by >1s; failed OTP path untouched (existing error handling); autofill (iOS one-time-code / Android SMS retriever) triggers the same sequence; reduced motion = static swap.
- **Backlog:** upgrade to **P4-T9** (login/OTP micro-polish) — name it in that task's scope.

---

### STEAL-9 — Restrained reaction physics (Apple Music) — `tier: 2`
**Source:** Apple Music, "Emoji Reaction" (shot poster: `shots/steals/shot-apple-music-emoji-reaction-interaction.png`) + Threads "Swipe to Like" (shot poster in `shots/steals/`). Curated descriptions, high confidence.

**What it does:** Apple Music: tapping the reaction button scales up a horizontal emoji picker on a spring; selecting spawns a *brief stream* of floating particles that drift up, scale down and fade — spring physics on the menu, light particle physics on the reaction, then silence. Threads: swiping a post card sideways reveals a heart that scales elastically past a threshold; release snaps the card back and fills the action-bar heart.

**LevelUp mapping:** The community Room feed (**C2-T4**) and Dailies thread (**C2-T5**) in the community program; interim: `src/pages/CommunityPage.tsx`. LevelUp's translation: a *small fixed set* of craft-appropriate reactions ("👏 ✦ 🔥" or the community's own glyphs per UI-DIRECTIONS), picker springs from the reaction affordance (`springs.snap`), selection emits **5–7** champagne-tinted particles (not a stream) that rise ~48px and fade in ≤700ms. Post cards in Dailies optionally take the Threads swipe-to-appreciate with the same restraint.

**Brand fit:** Community is where "alive" is allowed (P4-T8's word), but the dopamine budget is one brief drift of light — embers rising in a dark theater, not a confetti cannon. Fixed small reaction set keeps the crit-room tone.

**Perf cost model:** Picker = one layer scaling on `springs.snap`. Particles = 5–7 absolutely-positioned 12px nodes animating `translateY`/`opacity`/`scale` once, then unmounted — bounded, one-shot, GPU-composited. Never attached to scroll. The pattern is throttled per-post (no rage-tap accumulation beyond one active emission — rage-taps retrigger *after* the current emission ends).

**Spec sketch:**
- **Files:** community phase C2-T4/C2-T5 feed components (per `design/community/EXECUTION-BACKLOG.md`); interim `src/pages/CommunityPage.tsx` if P4-T8 lands first.
- **Motion:** picker `springs.snap`; particle rise `durations.slow` + `easings.out` with staggered starts (`durations.fast` apart); action-icon fill state `springs.bounce`; `hapticSelection()` on pick.
- **Reduced motion:** picker appears instantly; NO particles — icon fill state change only.
- **Acceptance:** reaction round-trip (tap→pick→particles gone) ≤1s; 20 rapid taps produce ≤1 concurrent emission and no >16ms frames (perf trace); picker items ≥44px; works inside a virtualized feed without detaching (particles portal to the card, not the list).
- **Backlog:** spec seed for **C2-T4/C2-T5**; the icon-fill half can ship early inside **P4-T8** (community feels alive).

---

### STEAL-10 — Button morphs into the sheet's button (Family) — `tier: 1` (sheet grammar, council with P4-T4)
**Source:** Family (wallet), "Button Morph to Sheet Button" (shot #1359) and its inverse "Button to Sheet Button Morph". Posters in `shots/steals/`. Curated description, high confidence.

**What it does:** Confirming inside a bottom sheet dismisses the sheet downward while *the sheet's button morphs into the underlying screen's primary button* — container scales/repositions on a spring, label crossfades. One continuous object across two surfaces; the modal never feels like a separate room.

**LevelUp mapping:** The vaul sheet program (**P4-T1/P4-T2/P4-T4**). Concrete first sites: the coupon sheet→Pay button on `src/pages/CheckoutPage.tsx` (apply coupon in sheet → sheet drops → its Apply button visually becomes the updated Pay button whose total just rolled), and notification/invoice sheets where a sheet CTA has an on-page twin. Implemented with framer `layoutId` on the two buttons — this is the cheap, same-route shared-element rehearsal before the P9-T6 cross-route spike.

**Brand fit:** "The interface feels like one continuous space" (DESIGN-STRATEGY Pillar 2's wow move) achieved without route-level shared elements. Physics doing narrative work.

**Perf cost model:** framer `layoutId` FLIP: measure once at transition start, then pure transform interpolation on `springs.glide` — two button-sized layers. Sheet dismissal is vaul's transform. No sustained cost. (FLIP measure is one forced layout at gesture end — acceptable, not per-frame.)

**Spec sketch:**
- **Files:** `src/components/ui/` sheet wrapper from P4-T1, `src/pages/CheckoutPage.tsx` coupon block (P3-T5's lane owns that file — coordinate), shared `MotionButton`.
- **Motion:** `layoutId` transition on `springs.glide`; label crossfade `durations.fast`; sheet exit per vaul defaults synced to the same spring feel.
- **Reduced motion:** no morph — sheet dismisses instantly, target button state-swaps (total roll already collapses via CountUp's reduced path).
- **Acceptance:** coupon apply → sheet drop → pay button reflects new total with the morph landing exactly on the pay button's rest position (no post-settle jump); interrupt mid-morph (fast second tap) doesn't strand a ghost layer; gesture cancel restores sheet; both buttons ≥48px; Reader-Rule native path unaffected (coupon sheet is web checkout only).
- **Backlog:** fold into **P4-T1/P4-T4** as the sheet grammar's signature move.

---

## 2. The longer catalog (phase-mapped)

1. **Mini-player drops in on scroll (Suno, shot desc scraped)** → `ChapterViewer.tsx`: scrolling down to Notes/QnA slides a compact controls strip from the top (play/pause + title), scroll-scrubbed, so the lesson never feels abandoned while reading. Translate WITHOUT Suno's blurred backdrop — opaque near-black surface (P5-T2 blur diet). **Phase 5** (pairs with P5-T5 player states). Poster: `shot-suno-mini-player-drop-on-scroll-interaction.png`.
2. **Sheet-dismiss backdrop response (Apple Music controls collapse)** → the shipped swipe-down player dismiss gains the *backdrop* half: as the player sheet tracks the finger down, the underlying screen scales 0.96→1 and un-dims, scrubbed. Transform-only on the StudentLayout content layer. Upgrade to the shipped phase-2 player dismiss; land inside **P4-T4** (overlay exits council).
3. **Pricing value-prop carousel with ambient color (Tide Guide)** → `PublicOffering.tsx` DescriptionBlocks: swipeable benefit cards where the *ambient glow* behind the card (pre-baked per-card champagne/gold gradient, opacity-crossfaded — not live color computation) shifts per card. **P3-T6 adjacent / P7-T4**. Poster captured.
4. **Directional counter roll (Habitastic)** → totals that change direction-aware: coupon-adjusted Total rolls *down* (old value slides down/out, new slides down/in), quantity/price increases roll up. Extends `CountUp.tsx` with a slide variant on `durations.fast`. Upgrades **P3-T3 item 3**.
5. **Pull-to-refresh reveals a lit under-layer (Wise)** → P4-T3's PTR v2: pulling reveals a champagne-on-black under-canvas with the node-logo indicator, and on release the first card *expands back with a staggered spring settle*. The reveal layer is static art; only `translateY` animates. Upgrades **P4-T3**.
6. **Hold-to-commit fill (Alma)** → cohort application submit on `ApplicationStatus.tsx`/apply flow: "Hold to submit application" with a fill sweeping the button and a spring check on completion. NOT for payments (adds friction to the money path) — for the *commitment* moment of cohort applications only. **P7** (first-act polish), tier 2. Poster captured.
7. **Route-draw completion share card (Walk the World)** → course-completion share card assembly: progress arc draws (`sweep`), stats count up, card scales in with `springs.bounce` overshoot — the recap-story's final card (STEAL-6) doubles as the share artifact. **P8-T4**. Poster captured.
8. **Badge showcase on black (Apple Fitness / Nike Training Club)** → `CertificateGallery.tsx`: tapping a certificate scales it to center while the grid fades to pure black, text staggers in below (`springs.glide` + `staggerChildren`). The gallery IS a screening room. **P4-T6 / P8-T4**. Posters captured for both sources.
9. **Gyro glare on the poster (Binge)** → ONE gyro moment app-wide: the certificate (or CourseDetail hero art) gets a subtle device-tilt sheen — a pre-baked diagonal highlight layer whose `translate` maps to deviceorientation, ±6px max. Native builds only, off on web, hard-capped update rate. **P10-T5** (quality of light). Poster captured.
10. **Tab icon idle animation, one-shot (Airbnb globe)** → when a tab gains a genuinely new state (first unseen community post), its icon plays ONE subtle 600ms animation on tab-bar mount — not a loop. Pairs with the shipped tab pill. **P9-T4 / C2-T7**. Poster captured.
11. **Feed cards snap-to-focus with autoplay (Must)** → community Room feed media posts: vertical snap points; the focused card's video/reel preview plays muted, others show posters (mirrors the Content-Brain reel-card DNA). Budget rule: one playing video max. **C2-T4 / P9-T4**. Poster captured.
12. **Member-since circular text crest (Retro)** → C4-T3 earned identity: the member crest sheet — crest at center, "LEVELUP MEMBER — SINCE 2026 — №0417" as a slowly rotating circular text ring (CSS `rotate` on one text-on-path SVG layer, `durations.kenburns`-class slowness). **C4-T3**. Poster captured.
13. **Streak state change, both directions (Opal)** → P4-T7 weekly consistency: the week-chip transition when consistency is kept vs lapsed — kept: champagne glow scales in (`springs.bounce`); lapsed: glow fades to a quiet outline (`durations.slow`), *never* a red/fire shame state. **P4-T7**. Poster captured.
14. **Ranked-list stagger reveal (Spotify Wrapped genres card)** → `MyCoursesPage.tsx` stats (P4-T5) and recap-story stat cards: list items slide up with pronounced stagger (`staggerChildren: durations.fast`), buttons fade in last. **P4-T5 / STEAL-6 internals**. Poster captured.
15. **Splash → hero sweep reveal (Oura)** → P6-T5 splash choreography: black + wordmark → hero image fades in → value line revealed left-to-right via gradient-mask sweep (a `translateX` on a pre-masked text layer — transform-only) → CTAs slide up. The exact register for Login cold start (P7-T6) too. **P6-T5 / P7-T2**. Poster captured.
16. **Stats → commitment → pricing arc (Ahead)** → onboarding-as-trailer (P7-T2): sequence proof (outcomes/testimonials) → a micro-commitment step → then the catalog/offer. Steal the *architecture*, not Ahead's mascot grid: LevelUp's commitment step = "pick your craft" with serif italic response. **P7-T2**. Poster captured.
17. **Idle ambience on the offer (Endel, translated)** → PublicOffering hero while idle: the existing ken-burns plus a barely-perceptible champagne glow breathing on the CTA (`opacity 0.9↔1` at ~4s period, CSS). Steal Endel's *stillness*, skip its particles. **P7-T4**. Poster captured.
18. **Share sheet with artifact preview (Duolingo streak card)** → P4-T6/P8-T4 share moments: the share sheet always shows the *rendered card preview* above destinations (vaul sheet, `springs.glide` entrance), so sharing feels like handing over a printed still. **P4-T6**. Poster captured.
19. **Plus→check path morph (Apple TV watchlist)** → wishlist affordance (P9-T5) and admin/utility toggles: SVG stroke morph plus→check on `springs.bounce`, container size constant. **P9-T5**. Poster captured.
20. **Slide-anywhere speed scrub (Telegram)** → ChapterMediaPlayer power gesture: horizontal drag on the top third adjusts playback speed with a live "1.5×" indicator. Flag: collides with seek gestures — prototype behind a long-press-then-drag entry. **P10 backlog / spike**, low priority. Poster captured.
21. **OTP auto-submit progress (Swiggy/Juspay, second application)** → Login OTP: once 6 digits land, auto-verify with the button filling as the request runs (cancel by tap). Pairs with STEAL-8. **P4-T9**.
22. **Milestone badges rail (CRED)** → community crests/lifetime marks (Spotlight-style, ML-Hub-adjacent): horizontal rail of earned marks, locked ones as embossed outlines on black. **C4-T3**.
23. **Empty state with one living element (Apple Fitness rings idle)** → P5-T6/P7-T3 empty states: one slow-breathing champagne element (the progress ring at 0% with a `sweep`-timed shimmer pass) instead of illustration clutter. **P7-T3**.
24. **Header wordmark quiet-return (Wabi-adjacent, our own synthesis)** → StudentLayout compact bars: after any collapse (STEAL-7), the wordmark re-fades at `durations.slow` rather than popping — ties every screen's collapse grammar together. **P5 sweep**.

---

## 3. Anti-steals — popular on 60fps.design, wrong for LevelUp

- **Duolingo anything-celebration (fireworks paywall offers, mascot pops, chest unlocks, 30+ streak shots):** dopamine-casino grammar; our register is calm luxury. We already borrowed the only good part (progress legibility). Kill on sight.
- **Confetti-per-event (Instagram reel-views pop, Medium clap, Plata lesson-complete — [Mobbin ref](https://mobbin.com/flows/6d90f6e8-fece-4b9c-b006-2cd61310d392)):** the completion arc owns the app's ONE confetti moment; a second confetti surface devalues it.
- **Fake-3D coins/cards/carousels (Atlys 3D coin, CRED 3D deal carousels, Airbnb 3D payment card):** fails Rahul's AI-slop test (fake-3D gimmicks), heavy texture payloads, and mid-Android GPU pain.
- **Gyroscope-everywhere (Apple Wallet gyro pattern, Pool duck float):** battery + motion-sickness + gimmick when ambient; we allow exactly one *earned* gyro moment (catalog #9, certificates, native only).
- **Liquid-glass / heavy backdrop-blur surfaces (the whole `liquid-glass` tag, Suno's blurred mini-player):** blur is capped by the perf budget and P5-T2 is actively *removing* blur from chrome; translate all glass to opaque near-black surfaces.
- **Slide-to-pay (Swiggy):** adds friction to the money path and fakes a confirmation Razorpay already owns; also risks reading as payment UI inside the app on native review (Reader Rule adjacency).
- **Mascot systems (Duolingo, Reddit PTR runner, Claude Code empty state, Endel creature):** LevelUp has no mascot and must not grow one; the serif voice is the personality. Empty states use type + one living element (catalog #23).
- **Streak fire / loss-shaming (Opal flame extinguish, Duolingo streak-freeze economy):** consistency framing only ("3 weeks of showing up"); no fire, no guilt mechanics, no freeze commerce.
- **Festive splash takeovers (Zomato Holi, Swiggy Diwali PTR):** seasonal skins fight the black canvas and age instantly; brand moments come from light/type, not costume changes.
- **Draw-to-commit canvases (Ahead's happy-face):** charming for a habit app; infantilizing for adults paying to learn from Lokesh Kanagaraj. The commitment *step* is stolen (catalog #16), the crayon is not.
- **Ticker-tape / marquee price strips (Apple Stocks ticker):** motion without meaning on an education storefront; conflicts with tabular-numeral calm (P3-T2).
- **Auto-playing value-prop video backgrounds on login (Hinge, Suno, FocusFlight):** cold-start weight on the exact screen where P6/P7 are fighting for milliseconds; the Oura-style still-image sweep (catalog #15) achieves the cinema for free.

---

## 4. Top-3 to fold into the current pipeline

**1. STEAL-1 — Razorpay handoff → P3-T6 (NOW).** The sticky-bar spring entrance P3-T6 already specs becomes a scroll-scrubbed handoff to the inline CTA. Same file (`PublicOffering.tsx`), same builder lane, IntersectionObserver + transform/opacity only — a one-day add that makes the money page read as choreographed the moment you scroll to commit.

**2. STEAL-2 — Pay-button processing arc → P3-T1/P3-T4 lane (NOW).** The champagne variant gains its idle→processing→tick narrative (CRED dot, container never moves, check on `springs.bounce`) inside the `CheckoutPage.tsx` sequential lane that already owns T1/T3/T5. It upgrades the single most consequential button in the company and hands off cleanly to T4's ThankYou entrance.

**3. STEAL-10 — Button-morphs-into-sheet grammar → P4-T1/P4-T4 (NEXT, phase-4 tactility).** Adopt the Family `layoutId` morph as the signature move of the vaul sheet program before any sheet ships, so every sheet in the app inherits continuity from day one — starting with the checkout coupon sheet → Pay button (coordinated with the P3-T5 coupon polish that just landed in the same file). STEAL-8 (Toss OTP) slots into P4-T9 immediately after as the third phase-4 pickup.

---

## 5. Wiring map — every 60FPS-IDEAS.md idea → target phase/task (for controlled injection)

*Companion doc: `design/vision/60FPS-IDEAS.md` holds the executable choreography specs for the ideas below; this table is the wiring index so each lands at a controlled point — **never** by editing a frozen brief mid-build. Channels: **GATE** = inject via the phase QA-gate/fix-sprint after the build integrates; **BRIEF** = write into the NEXT phase's brief before its crew starts; **SPIKE** = timeboxed investigation first; **PARK** = hold. Where an idea overlaps a STEAL-n in this file, both specs should be reconciled by whoever writes the target brief (the STEAL entry carries the acceptance criteria; the IDEAS entry carries the reference links).*

### Phase 3 — inject via QA-gate / fix-sprint channel (build crew mid-flight; do NOT touch the brief)
| Idea (60FPS-IDEAS.md) | Target | Channel | Cross-ref |
|---|---|---|---|
| #1 Champagne dust | P3-T4 ThankYou | GATE | — |
| #2 The hero that breathes (elastic stretch) | P3-T6 offering scroll | GATE | — |
| #7 Rolling digits (money surfaces) | P3-T2/P3-T3 | GATE | STEAL catalog #4 (directional roll) |
| #8 The receipt that assembles itself | P3-T4 | GATE | — |
| FAQ accordion spring | P3-T6(1) | GATE (likely already satisfied by brief — verify at gate) | — |
| Sticky-bar SAVE chip shimmer (once) | P3-T6 sticky bar | GATE | STEAL-1 (same element — reconcile: handoff owns the bar's exit; shimmer fires once on entrance only) |
| Paid check draws itself | P3-T4 arrival | GATE | STEAL-2 (check morph — one check, not two: Toss-style morph in-button, draw-on-arrival at ThankYou; pick per gate review) |
| Input → confirm continuity | post-P3-T9 polish | GATE | — |
| **STEAL-1 Razorpay handoff** | P3-T6 | GATE | this doc §1 |
| **STEAL-2 Pay-button processing arc** | P3-T1/T4 lane | GATE | this doc §1 |

### Phase 4 — write into the phase-4 brief (next up; brief not yet frozen)
| Idea | Target | Channel | Cross-ref |
|---|---|---|---|
| #4 Node-mark draws itself (PTR) | P4-T3 | BRIEF | STEAL catalog #5 (Wise under-layer — merge both into P4-T3's spec) |
| #5 OTP shimmer + collapse-to-check | P4-T9 | BRIEF | STEAL-8 (same flow — one spec) |
| Welcome layer stagger discipline | P4-T9 (+P7-T1 later) | BRIEF | — |
| Sheet physics canon | P4-T1/P4-T2 | BRIEF | STEAL-10 (button→sheet morph is the signature move of this canon) |
| Realtime insert entrance | P4-T2 | BRIEF | — |
| Share card presents itself | P4-T6 | BRIEF | STEAL catalog #18 (Duolingo share-preview sheet) |
| Certificate crest shimmer | P4-T6 | BRIEF | STEAL-3 (blacklight — shimmer is the passive state, blacklight the held state; one component spec) |
| Stats = StatCards + digit roll | P4-T5 | BRIEF | STEAL catalog #14 (Wrapped stagger) |
| #7 Rolling digits (stats surfaces) | P4-T5 | BRIEF | — |
| Ring draws on arrival | P4-T7 / YourWeek | BRIEF | — |
| "Weeks of showing up" recap grid | P4-T7 | BRIEF | STEAL catalog #13 (Opal state change, calm register) |
| Composer focus glow | P4-T8(2) | BRIEF | — |
| Segment switch content crossfade | P4-T8(4) (+P6-T2) | BRIEF | — |
| **STEAL-6 Calm recap story** | CompletionRecap + P4-T7 | BRIEF | idea "Course recap as a story sequence" — same steal, one spec |
| **STEAL-10 Button→sheet morph** | P4-T1/T4 | BRIEF | this doc §1 |
| Player drag-to-dismiss settle | phase-2 leftover, ride P4-T4 council | BRIEF | STEAL catalog #2 (backdrop scale response — same council item) |

### Phases 5–8 — hold for those phase briefs
| Idea | Target | Channel | Cross-ref |
|---|---|---|---|
| Toast spring-in canon | P5-T1(4) | BRIEF | — |
| Morphing line-icon empty state | P5-T6 / P7-T3 | BRIEF | STEAL catalog #23 (breathing-ring empty state) |
| **STEAL-4 Quartr scrub timeline + chapter fill** | P5-T5 lane (or P4 stretch) | BRIEF | — |
| **STEAL catalog #1 mini-controls strip** / #10 Mini-player collapse | Phase 7 ChapterViewer lane (P7-T4/T5) | BRIEF | idea #10 carries the VdoCipher iframe constraint — authoritative |
| #3 Pull up for the next lesson | Phase 7 (P7-T4 pair) | BRIEF | — |
| Focus-mode seek | P7-T4 lane | BRIEF | STEAL catalog #20 (Telegram speed scrub — both gestures need the same conflict spike) |
| Chapter switch with segmented progress | P7-T4(3) | BRIEF | — |
| #6 Greeting condense morph | P6-T0/T8 | BRIEF | STEAL-7 (same Wabi source — STEAL-7 covers CourseDetail/House; idea #6 covers the greeting band) |
| Curtain-rise splash hand-off | P6-T5 | BRIEF | STEAL catalog #15 (Oura sweep — merge) |
| Loading lines in the brand voice | P6-T1 skeletons | BRIEF | — |
| Section entrance rhythm | P6-T1 | BRIEF | — |
| Onboarding step dots via layoutId | P7-T2 | BRIEF | — |
| Craft picker cards reveal color on select | P7-T2 | BRIEF | STEAL catalog #16 (Ahead arc — architecture reference) |
| Drawn-arrow guidance | P7-T3 | BRIEF | — |
| #11 Gold crest on starry black | P8-T4 + CompletionRecap final card | BRIEF | STEAL-6 final card + STEAL catalog #7/#8 — one share-artifact family |
| Primer shows, doesn't tell | P8-T2(1) | BRIEF | — |
| **STEAL-3 Blacklight certificate** | P4-T6 primary, P8-T4 share variant | BRIEF | — |
| **STEAL-8 Toss OTP** | P4-T9 | BRIEF | duplicate of idea #5 — single spec |

### Phases 9–10 — hold
| Idea | Target | Channel | Cross-ref |
|---|---|---|---|
| #9 Card→detail continuity (interim hero settle) | interim: any Home lane; true morph: P9-T6 | SPIKE (P9-T6) + BRIEF (interim) | — |
| Hero carousel ambient previews | Home marquee / P9-T2 | BRIEF | STEAL-5 (JioHotstar center-stage — same component, merge) |
| Live-session countdown ticker | Phase 9 | BRIEF | — |
| Long-press quick actions on catalog cards | Phase 9 | BRIEF | — |
| Wishlist heart single pop | P9-T2/P9-T5 | BRIEF | STEAL catalog #19 (Apple TV check morph — pick ONE affordance) |
| Compact-row press physics | P9-T2 | BRIEF | — |
| Delete/dismiss coherence | P9-T5 | BRIEF | — |
| Icon-morphs-to-field search | P9-T1(3) | BRIEF | — |
| Rotating placeholder ticker | P9-T1 | BRIEF | — |
| Tab pill morph with label | tab-bar polish, ride P9-T4 or P5 sweep | BRIEF | STEAL catalog #10 (one-shot icon animation — same budget line) |
| #12 Back parallax pop | P10-T2 | BRIEF | — |
| **STEAL catalog #9 gyro glare** | P10-T5 | BRIEF | — |
| **STEAL catalog #20 Telegram speed scrub** | P10 spike | SPIKE | — |

### Community (C-phases) — hold for community briefs
| Idea | Target | Channel | Cross-ref |
|---|---|---|---|
| Playbill stagger | C2-T2 The Programme | BRIEF | — |
| Presence arrives with a settle | C2-T4 Room feed | BRIEF | — |
| End-of-feed pull-back | C2-T4 | BRIEF | — |
| **STEAL-9 restrained reactions** | C2-T4/C2-T5 (icon-fill half early via P4-T8) | BRIEF | — |
| **STEAL catalog #11 Must feed snap** | C2-T4 media posts | BRIEF | — |
| Helped-tick draw | C2-T5 Dailies | BRIEF | — |
| Composer sheet rises with keyboard | C2-T6 (v2) + P10-T1 keyboard work | BRIEF | — |
| Happening-Now pulse | C3-T1 crit night | BRIEF | — |
| Floating-object idle | C4-T1/C4-T2 Door pages | BRIEF | — |
| **STEAL catalog #12 member-since ring** / #22 milestone rail | C4-T3 earned identity | BRIEF | — |
| **STEAL-7 collapsing header anchor** | C2-T3 House (+P7-T7 CourseDetail) | BRIEF | shares spec with idea #6 |

### Parked / conditional
| Idea | Disposition |
|---|---|
| Pricing-tier accordion | PARK until multi-tier pricing exists |
| Diwali lights week | PARK — conflicts with this doc's anti-steal on festive costumes; if Rahul wants it, date-flagged and confined to ONE surface (greeting band), decide at P8 |
| Motion primitives (`settle/roll/draw/dust/stretch/glint/breathe`) | Fold into `src/lib/motion.ts` **only** as each first consumer lands (no speculative tokens); named values live in 60FPS-IDEAS.md §3 |
| Haptic pairings map | Adopt as doctrine inside P5 sweep (pairs with DESIGN-STRATEGY Pillar 3) |
| 60FPS-IDEAS.md anti-patterns list | Superseded-and-merged: §3 of this file is the canonical anti-steal list (contents agree) |

---

*Shots evidence directory: `design/vision/shots/steals/` — `filter-*.png` are listing grids, `shot-*.png` are detail-page poster frames, `feed-grid-top.png`/`listing-home*.png` are the library overview.*
