# LevelUp — Execution Backlog (phases 3–10)
### Hand-off-to-Opus plan. Every task execution-ready: zero design thinking required from the builder.
*Companion to `design/vision/REPORT.md` (the why) and `design/vision/QA-PROCESS.md` (the gate). Format and precision follow `design/briefs/phase-2.md`. Written 2026-07-07 against branch `design/phase-2`; re-validate file/line refs against the phase-2 final merge before building each phase (a fix-sprint was mid-flight during authoring).*

## How to use this document
- Each phase below becomes one `design/briefs/phase-N.md` (copy the tasks verbatim, prune anything phase-2's final state already fixed) and runs through ORCHESTRATION.md's loop: `design-phase-build` → `design-qa-gate` → sprints → council (if Tier 1) → internal release → Rahul device pass → promote.
- **Tiers** per CLAUDE.md: 🔴 T1 = council + cross-platform verify + staged rollout (index.css, html/body, routing, auth, payments, native shell, app-wide primitives). 🟡 T2 = component scope, adversarial self-review. 🟢 T3 = trivial.
- **Global hard rules (every task, non-negotiable):** transform/opacity-only animation; NO new `backdrop-filter`; all motion values from `src/lib/motion.ts` / Tailwind motion tokens (zero one-off durations/easings); reduced-motion intact via `useMotionSafe`/CSS; ≥44px touch targets on anything touched; verify empty/loading/error states of anything touched; **never touch html/body overflow** (June-14 class) except where a task explicitly scopes it; `CompletionTakeover` stays the sole `document.body.style.overflow` writer; buy CTAs stay gated by `isNative()` — and `ApplicationStatus.tsx:319,337` stays `isIOS()` (Android staged-cohort payments depend on it — DO NOT "normalize").
- **File ownership is exclusive per task within a phase.** Where two tasks name the same file they are marked as one sequential lane.
- Copy strings are given in quotes and are final unless Rahul edits them. Em dashes are fine in-app; NEVER in store metadata.

---

# PHASE 3 — The money pages
**Goal:** the purchase path carries the strongest treatment in the app. From offering → checkout → Razorpay → ThankYou reads as one produced sequence.
**Gate routes:** `/p/lokesh-kanagaraj-teaches-film-making`, `/checkout/:offeringId` (any active offering), `/thank-you?order=…` (simulate paid state), `/p/video-editing-academy` (staged/cohort variant).
**Sequencing:** P3-T1 first (it creates the `champagne` Button variant others use). P3-T2/T3/T5/T6/T8/T9 parallel after. P3-T4 after T1. P3-T7 anytime (if approved).

### P3-T1 — The champagne pay moment (`tier: 1` — ui/button.tsx + payment surface)
**Files:** `src/components/ui/button.tsx`, `src/pages/CheckoutPage.tsx`, `src/components/checkout/StickyPayBar.tsx`
1. Add a `champagne` variant to `buttonVariants` in `ui/button.tsx`: exactly the `.btn-champagne` treatment — `background-image: linear-gradient(180deg, hsl(var(--champagne-from)), hsl(var(--champagne-to)))`, `text-[hsl(var(--cream-text))] font-medium rounded-2xl`, `shadow-[inset_0_1px_0_hsl(0_0%_100%/0.35),0_10px_28px_hsl(var(--champagne-to)/0.18)]`, hover (fine pointer only) `brightness-[1.04]`. Implement as cva variant classes; do NOT add an `:active` transform (framer `whileTap` owns press — see the index.css:320-327 doctrine comment). Preserve every existing variant/size/asChild/haptic behavior byte-for-byte.
2. CheckoutPage main Pay button (`CheckoutPage.tsx:858-880`): `variant="champagne"`, keep `size="xl"`, keep `haptic={false}` + the existing `hapticImpact("medium")` in `handlePay`. Label unchanged.
3. `StickyPayBar.tsx:56`: `variant="champagne"`, keep `size="lg"`, keep `haptic={false}` (`:60`).
4. Disabled state: champagne variant at `disabled:opacity-50 disabled:saturate-50` — never gray-swap the gradient.
**Edge cases:** processing state keeps the existing spinner/label swap; 360px width — button remains full-width, ≥48px tall; reduced motion — no press scale (inherited).
**Acceptance:** `/checkout/:id` Pay button and mobile sticky bar render the champagne gradient at 375 AND 360; contrast of `--cream-text` on champagne ≥ 4.5:1 (it is — verify computed); no other button variant changed (visual spot-check `ghost`/`outline`/`destructive` on admin + profile); grep shows no `.btn-champagne:active` added.

### P3-T2 — Tabular numerals + price typography across the money path (`tier: 2`)
**Files:** `src/pages/PublicOffering.tsx`, `src/components/offering/PurchaseRail.tsx`
1. Every price on PublicOffering gets `tabular-nums`: hero price (`:488`), strike MRP (`:492`), sticky-bar price (`:1595`); PurchaseRail price (`PurchaseRail.tsx:56`).
2. **Fix the "₹4, 999" artifact:** the strike price at `:492` drops `font-mono`; render `₹{mrp.toLocaleString("en-IN")}` in the body font with `tabular-nums line-through text-muted-foreground`. Same for the sticky-bar strike.
3. Savings line (`:1483` area): keep copy, move the green to `text-[hsl(var(--success))]`.
4. All price glyphs use the same font stack (Inter) — no mono prices anywhere on this page.
**Edge cases:** free offerings (price 0 → existing "Free" path untouched); no-MRP offerings render no strike; coupon-adjusted price still tabular.
**Acceptance:** screenshot at 375: "₹4,999" renders with no space after the comma; hero price/strike/sticky/rail all `tabular-nums` (DevTools computed `font-variant-numeric`); zero `font-mono` on price elements on `/p/*`.

### P3-T3 — Checkout structured skeleton + receipt choreography (`tier: 2`)
**Files:** `src/pages/CheckoutPage.tsx` *(sequential lane with P3-T1 — T1 lands first, this rebases)*
1. Replace the "Loading secure checkout…" spinner (`:397-407`) with a structured skeleton mirroring final layout (title line, offering row with 64px thumb block, 3 summary lines, full-width button block) using `SkeletonLine/SkeletonBlock` from `src/components/patterns/LoadingState.tsx`, wrapped in the existing `LoadingSwap` for crossfade. Skeleton and content share dimensions (zero CLS).
2. Order-summary rows (`:782-826`) stagger-reveal on first content mount: `anim-stagger` on the rows container (CSS path — cheap), one-time only (no re-trigger on coupon apply).
3. On coupon apply/remove, the Total row animates: wrap the total amount in the existing `CountUp` (from `src/components/motion/CountUp.tsx`) keyed on `totalInr` so the number rolls to its new value; `hapticSelection()` on successful apply.
**Edge cases:** guest mode (form above summary — skeleton covers it); free/100%-off (Pay → "Enrol free" path unchanged); bump added mid-session recalculates without re-staggering; reduced motion → instant swap, no CountUp roll (CountUp already collapses).
**Acceptance:** cold `/checkout/:id` shows skeleton (not spinner) at 375/360; no CLS between skeleton→content (layout-shift observer < 0.02 on route); coupon apply rolls the total once; suite green.

### P3-T4 — ThankYou: the produced arrival (`tier: 2`)
**Files:** `src/pages/ThankYou.tsx`, `src/components/checkout/SuccessMoment.tsx`
1. `hapticNotification("success")` fires once on success-screen mount (guard with a ref; native only — the helper no-ops on web). Keep the confetti one-shot exactly as is.
2. Stage the entrance as ONE sequence using `springs.glide` with framer `staggerChildren` ≈ `durations.fast`: check-orb → headline → program name (serif italic, keep `:662`) → benefit chips → receipt strip. Currently these arrive together; make it read as an assembled receipt. Reduced motion → all visible instantly.
3. Primary CTA (`:719`) and UpsellCard CTA (`:246`) move to the `champagne` Button variant from P3-T1 (import Button; keep link semantics via `asChild` if currently anchors — asChild path keeps CSS-only press, acceptable).
4. Copy fix (`:860-861`): replace "Enhance Your Learning" / "Special offers just for you" with "Keep the momentum" / "Students who took this also picked these".
5. Auto-redirect countdown: keep 10s + signed-in-only behavior, but the countdown line renders in `.caption` and the timer pauses while any upsell card is pressed/hovered (fine pointer) — do not strand guests (guests already excluded).
**Edge cases:** guest arrival (no redirect, no account CTA regression); order fetch failure → existing error path unchanged; native (upsells hidden `:855`) — sequence still plays with remaining blocks; reduced motion instant.
**Acceptance:** on mount (native emulation), exactly one success haptic call (assert via spy in a unit test or manual device pass); entrance plays once, ≤1.2s total; CTAs champagne; new copy present; countdown still redirects signed-in users at 10s.

### P3-T5 — Coupon interactions polished (`tier: 3`)
**Files:** none new — *sequential lane with P3-T3 inside `src/pages/CheckoutPage.tsx`* (execute as part of the same builder cluster)
1. Applied-coupon chip (`:718-742`) enters/exits via `AnimatePresence` (fade + y-4, `springs.glide`); remove button becomes ≥44×44px hit area (`min-h-[44px] min-w-[44px]` icon button with visible 24px glyph).
2. "Saved ₹X" line uses `text-[hsl(var(--success))]` and `tabular-nums`.
**Acceptance:** chip animates in/out; remove target measures ≥44px in DevTools; reduced motion → instant.

### P3-T6 — Offering scroll choreography + FAQ + theme fixes (`tier: 2`)
**Files:** `src/pages/PublicOffering.tsx` *(sequential lane with P3-T2 — same builder cluster)*, `src/pages/EventsPage.tsx`, `src/pages/EventDetail.tsx`, `src/pages/ThankYou.tsx` *(theme-color line only — coordinate with P3-T4 lane)*, `src/components/home/UpcomingEvents.tsx` *(theme-color line only)*
1. FAQ (`PublicOffering.tsx:941-945`): replace the conditional render with the existing Radix `Accordion` from `src/components/ui/accordion.tsx` (animate-accordion-down/up already tokenized at 0.2s). One item open at a time (`type="single" collapsible`). 44px triggers.
2. Mobile sticky pay bar entrance: replace `translate-y-full→0 duration-base` with framer `motion.div` on `springs.glide` (y: 96→0, opacity 0→1), exit reversed via `AnimatePresence`. Keep the `useInView` trigger + `aria-hidden` logic exactly.
3. Razorpay `theme.color`: replace every hardcoded `"#F5F1E8"` with the computed cream token. Implementation: add `export const RAZORPAY_THEME_COLOR = "#F3E5C8" /* hsl(var(--cream)) */;` to `src/lib/platform.ts`… **no — keep pure:** create `src/lib/brand.ts` exporting that constant with a comment pinning it to `--cream` in index.css:130; import in the 4 call sites (`CheckoutPage.tsx:349`, `ThankYou.tsx:537`, `EventsPage.tsx:204`, `EventDetail.tsx:172`).
4. EventsPage/EventDetail "Registered" badge: `bg-green-500/20 text-green-400` → `bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]` (`EventsPage.tsx:282`, `EventDetail.tsx:319`). Remove the "✓" glyphs from toast copy (`EventsPage.tsx:122,152`) — plain words.
**Edge cases:** archived offerings (no sticky bar — unchanged); native (bar only when `applyUrl || !isNative()` — unchanged); reduced motion → bar appears instantly.
**Acceptance:** FAQ animates open/closed at tokenized duration; sticky bar springs in after hero CTA scrolls out and springs away when it returns; `grep -rn "F5F1E8" src/` returns 0; Registered badges tokenized; no "✓" in toasts.

### P3-T7 — Conversion instrumentation (`tier: 2`) — **RAHUL DECISION (recommend YES)**
**Files:** `src/lib/analytics.ts`, `src/pages/PublicOffering.tsx` *(same lane as T2/T6)*, `src/pages/CheckoutPage.tsx` *(same lane as T1/T3/T5)*, `src/pages/ThankYou.tsx` *(same lane as T4)*
Wire PostHog (or extend the existing `bootAnalytics` pixel layer — investigate `lib/analytics.ts` first and reuse its transport) with exactly five events: `offering_viewed {slug}`, `pay_cta_tapped {slug, surface: hero|sticky|rail}`, `checkout_loaded {offeringId, guest:boolean}`, `payment_initiated {orderId}`, `purchase_completed {orderId, valueInr}`. No PII beyond user id already in session. Fire-and-forget; zero blocking. If Rahul declines PostHog: implement the same five as no-op stubs behind one `track()` in analytics.ts so Phase-3 A/B claims remain measurable later.
**Acceptance:** events visible in the chosen sink on a full test purchase (test mode); no console errors when blocked/offline.

### P3-T8 — TrustPanel + proof tokens (`tier: 3`)
**Files:** `src/components/checkout/TrustPanel.tsx`, `src/components/reviews/ProofRow.tsx`, `src/components/reviews/StarRating.tsx`, `src/components/reviews/CourseRatingBadge.tsx`, `src/components/reviews/RatingDistribution.tsx`
Every star/check: `fill-yellow-400 text-yellow-400` → `fill-[hsl(var(--gold))] text-[hsl(var(--gold))]`; `text-emerald-500` (`TrustPanel.tsx:107`) → `text-[hsl(var(--success))]`; distribution bar (`RatingDistribution.tsx:41`) → `bg-[hsl(var(--gold))]`.
**Acceptance:** `grep -rn "yellow-400" src/components` returns 0; stars render warm gold on `/p/*` and checkout at 375.

### P3-T9 — Guest checkout form correctness (`tier: 2`)
**Files:** `src/pages/CheckoutPage.tsx` *(same sequential lane as T1/T3/T5 — one builder owns this file for the phase)*
1. Replace the hand-rolled `+91` prefix + Input (`:691-705`) with the app's `PhoneInput` (react-phone-number-input, styles already in index.css:8-87), `defaultCountry="IN"`.
2. Add real `<label>` elements (visually styled `.caption`, `htmlFor` wired) for name/email/phone — placeholder-only is an a11y failure.
3. Validation errors render inline under fields in `--destructive` with `role="alert"`, not only as toasts.
**Edge cases:** non-+91 numbers (PhoneInput handles country switch — guest-create-order already normalizes via `_shared/phone.ts`); autofill styling on dark canvas (test `-webkit-autofill`).
**Acceptance:** labels present + associated (axe passes on the form); phone entry produces identical E.164 payloads to the old path for +91 numbers (unit test the submit payload); keyboard type `tel` on mobile.

---

# PHASE 4 — Tactility & sheets
**Goal:** every interruption slides on vaul physics; stats count; the legacy press system dies on student surfaces; Community/Login/Profile get their polish pass.
**Gate routes:** `/profile`, `/community`, `/home`, `/my-courses`, `/login` (no-bypass server), plus one invoice detail + notification open.
**Sequencing:** P4-T1 first (establishes the vaul sheet pattern others copy). P4-T2/T3 after T1. All others parallel. P4-T4 is Tier 1 → council accumulates with any other Tier-1 in the release.

### P4-T1 — vaul adoption: InvoiceDetailSheet becomes a real sheet (`tier: 2`)
**Files:** `src/components/profile/InvoiceDetailSheet.tsx`, `src/components/ui/drawer.tsx`
1. Rebuild InvoiceDetailSheet on the existing (currently zero-consumer) `ui/drawer.tsx` (vaul): drag handle (36×5px rounded-full `bg-border` centered, 12px top margin), swipe-down dismiss with vaul's spring settle, `shouldScaleBackground` OFF (background scale needs `[vaul-drawer-wrapper]` on the app root — do NOT add one in this task; note it for P4-T4's owner to evaluate).
2. Preserve everything: PDF generation, native share path, haptic double-buzz suppression (`:187`), `sr-only` title/desc, Paid badge (already tokenized here).
3. Snap points: single, content-height (max 92dvh). Overlay: `bg-black/60` (vaul default fade). Reduced motion: vaul respects `prefers-reduced-motion` — verify dismiss is instant, else force `duration-0` via the drawer's props.
4. **Body-lock check:** vaul manages its own scroll lock — confirm `grep -rn "body.style.overflow" src/` still lists only CompletionTakeover as a *writer in our code* after this change (vaul's internal handling is allowed; our code must not add writers).
**Edge cases:** Android back button closes the sheet (the App.tsx back handler dispatches Escape to `[data-state=open]` dialogs — verify vaul responds; if not, add vaul's `open`/`onOpenChange` wiring to the existing Escape path, not a new listener); long invoices scroll inside the sheet, not the page.
**Acceptance:** sheet drags to dismiss with spring; interrupted drag below threshold springs back; Android-back closes it; body scroll intact after every dismissal path; PDF + share still work on device.

### P4-T2 — Notification center: sheet on mobile, pop on desktop (`tier: 2`)
**Files:** `src/components/NotificationDropdown.tsx`
1. On `useIsMobile()` (existing hook): render the list inside a vaul Drawer (pattern from P4-T1) titled "Notifications" (serif italic accent on "caught up" rest-state stays). Desktop (≥lg): keep the anchored dropdown, but add: Esc-to-close, focus trap (`useFocusTrap` hook exists), and exit animation (`AnimatePresence`, opacity+y-2, `springs.snap`).
2. Type-badge palette (currently 10 raw colors, `:29-39`) collapses to FOUR semantic tints: success events → `--success`; payments/invoices → `--gold`; sessions/live → `--accent-crimson`; everything else → `--cream`. Icon tile: `bg-<token>/12 text-<token>`.
3. Mark-all-read button ≥44px; each row ≥56px; `tapTick()` on row tap (rows navigate — keep behavior).
**Edge cases:** empty state (clapperboard rest state — keep); 30+ items scroll within sheet; realtime insert while open prepends with a `motion.div` height/opacity entrance (layout animation on `springs.glide`).
**Acceptance:** mobile bell opens a draggable sheet; desktop dropdown closes on Esc and animates out; only the four tints remain (grep `sky-500|rose-300|violet-300` in the file → 0); all targets ≥44px.

### P4-T3 — Pull-to-refresh v2 (`tier: 2`)
**Files:** `src/hooks/usePullToRefresh.ts`, `src/pages/Home.tsx` *(indicator markup only)*, `src/pages/CommunityPage.tsx` *(indicator markup only)*
1. Release animation: indicator retracts on `springs.glide` (JS spring or CSS transition on the transform with `--ease-spring` + `--motion-base`) instead of snapping to 0.
2. Haptic: `tapTick()` exactly once when pull crosses the 80px threshold (arm/disarm so it can't repeat within one gesture); `confirm(true)` when refresh completes.
3. Branded indicator: replace the current indicator with the LevelUp node-mark as an SVG whose stroke draws with pull progress (`stroke-dashoffset` mapped to `pullProgress`), cream stroke, 28px, inside a 44px `bg-surface-2` circle. Spin (rotate, 1s linear infinite, transform-only) while `isRefreshing`. Asset: reuse the mark from `LevelUpWordmark.tsx` — extract the `<path>`s, do not add an image file.
4. Must not fight native overscroll glow or the June-14 rules: hook logic only reads `touchstart/move` at scrollTop 0 (verify existing guard stays).
**Edge cases:** reduced motion → no draw animation, static mark + instant retract; refresh error → indicator retracts, existing error surfaces handle messaging; desktop — untouched (touch-only).
**Acceptance:** threshold tick fires once per gesture on device; release springs; indicator is the node-mark; both pages behave identically; no scroll regression at either width.

### P4-T4 — StudentLayout overlay exits + sheet groundwork (`tier: 1` — layout shell, council)
**Files:** `src/components/layout/StudentLayout.tsx`
1. Mobile nav sidebar (`:213-287`) and avatar dropdown (`:344-373`) get real exits: wrap both in `AnimatePresence`; sidebar slides x:-100%→0 on `springs.glide` with overlay fade, exit reversed; avatar menu scales 0.96→1 + opacity on `springs.snap`, exit reversed. Keep Escape/hardware-back close paths (`:82-92`) and focus behavior.
2. Add `tapTick()` to: header bell button (`:307`), avatar menu button (`:333`), mobile hamburger (`:297`), sidebar close (`:222`).
3. Unread badge (`:316`): `bg-red-500` → `bg-[hsl(var(--destructive))]`; cap count display at "9+".
4. Evaluate adding `vaul-drawer-wrapper` attribute to the layout root for background-scale sheets (P4-T1 dependency): test on Android emulation that it does NOT create a transform containing-block that breaks `position:fixed` children (tab bar, sticky header). If it does, document and skip — sheets ship without background scale.
**Edge cases:** rapid open/close spam (AnimatePresence interruptible — verify no orphan overlay); route change while sidebar open → closes and unmounts cleanly; reduced motion → instant.
**Acceptance:** both overlays animate out on every close path (button, Esc, backdrop, Android back, route change); no body-lock writers added; tab bar + header still fixed/sticky after the wrapper experiment; council sign-off (Tier 1).

### P4-T5 — MyCourses stats that feel earned (`tier: 2`)
**Files:** `src/pages/MyCoursesPage.tsx`
1. The 3-stat text strip becomes three `StatCard`s (`src/components/patterns/StatCard.tsx`) with icons (BookOpen, Clock, Award from lucide), values in `CountUp` (`tabular-nums`), labels in `.heading-eyebrow`.
2. Skeleton parity: WeeklyStats + stat strip render `SkeletonBlock` placeholders of identical dimensions while `loading` (kill the `!loading &&` pop-in at `:274`).
3. Enrolled-course cards migrate from `.pressable`/`hover:-translate-y-1` (`:326`, `:378`) to `SurfaceCard` interactive variant (keeps Link routing, gains spring press + haptic + focus ring). Old serif `EmptyState` import swaps to `patterns/EmptyState` with `icon: BookOpen`, `title: "You haven't enrolled in any courses yet"`, `description: "Explore the catalog and find the program that fits your craft."`, `action: Explore programs → /home` — serif styling comes in P5-T6's unification, not here.
4. Hand-rolled error block (`:304-312`) → `patterns/ErrorState` with retry.
**Edge cases:** zero enrolments (stat cards hidden, empty state shows); certificate count 0 (card shows 0, not hidden); reduced motion → numbers render final instantly.
**Acceptance:** no layout shift when stats resolve (CLS <0.02 on route); CountUp runs once per mount; all cards spring-press; `grep -n "pressable" src/pages/MyCoursesPage.tsx` → 0.

### P4-T6 — Certificates: native share + share card (`tier: 1` — adds a Capacitor plugin)
**Files:** `package.json` (+`@capacitor/share`), `src/components/certificates/CertificateShareMenu.tsx`, `src/components/certificates/CertificateCard.tsx`, `src/lib/certificate-generator.ts`
1. `npm i @capacitor/share` + `npx cap sync` (native shell change → this phase's release train picks it up; council notes it).
2. Share flow: on native, `Share.share({ files: [certificate PNG saved via Filesystem? — investigate the existing invoice native-share path in InvoiceDetailSheet and REUSE its mechanism] })`; on web, `navigator.share` when available with the PNG as a File; fallback = existing intent links (keep LinkedIn/X/WhatsApp menu).
3. Share card variant: `generateShareCard()` in certificate-generator.ts renders a 1080×1350 canvas — pure black, the grain texture (draw the same fractal-noise SVG rasterized at 4% opacity), "CERTIFICATE OF COMPLETION" in JetBrains Mono 28px tracking-widest `#A6A6AA`, course title in Instrument Serif italic 64px `#F3E5C8`, student name Inter 600 44px `#F7F4EC`, LevelUp wordmark bottom-center. No template image dependency — drawn primitives only.
4. `CertificateCard` gains a primary "Share" champagne Button (P3-T1 variant) ≥44px; Download stays secondary (`≥44px`, fixing the `h-9` anchor at `CertificateGallery.tsx:188` is P5-T3's — leave if not touching that file).
**Edge cases:** `navigator.share` absent (desktop Chrome w/o share) → menu fallback; canvas font loading (await `document.fonts.ready` before draw); long course titles wrap to 2 lines max then ellipsize.
**Acceptance:** device test — system share sheet opens with the image attached (Android + iOS); share card matches spec at pixel level (manual review of one export saved to `design/qa/`); web fallback works.

### P4-T7 — Weekly consistency, calm register (`tier: 2`) — **RAHUL DECISION (recommend YES)**
**Files:** `src/components/home/YourWeek.tsx`, `src/components/home/yourWeekDerive.ts`
1. Derive `consecutiveActiveWeeks` from existing `chapter_progress` timestamps (a week is "active" if ≥1 lesson completed; count back from the current week; computed client-side in yourWeekDerive.ts — NO new tables/RPCs).
2. Render inside the existing Your-Week strip as one serif-italic line under the ring: `"{n} weeks of showing up"` (n≥2 only; n<2 renders nothing — no guilt states, no zero states, no broken-streak messaging, ever).
3. When n increments vs the previous visit (localStorage `lu_weeks_seen`), the line enters with `anim-rise` + `celebrate()` haptic once.
**Edge cases:** timezone (use local midnight weeks, Mon-start); reduced motion → static; user with data gaps → n resets silently to current run.
**Acceptance:** unit tests on the derivation (given timestamp fixtures → n); line absent for n<2; no red/fire/warning visuals anywhere; haptic fires once per increment.

### P4-T8 — Community feels alive (`tier: 2`)
**Files:** `src/pages/CommunityPage.tsx` *(sequential lane with P4-T3's indicator edit — one builder owns this file)*
1. Post cards → `SurfaceCard` (interactive where tappable, static otherwise): spring press on like/comment/share row targets ≥44px.
2. Composer focus choreography: on textarea focus, the composer card lifts (`shadow-design-md`, border→`--border-hover`, scale 1→1.01 on `springs.glide`) and the Post button transitions from disabled-muted to champagne (P3-T1 variant) as soon as text is non-empty. `tapTick()` on post; `confirm(true)` on successful post.
3. Token fixes: liked heart `text-red-400` (`:433`) → `text-[hsl(var(--accent-crimson))]` (keep `heart-bounce` + wire `tapTick()` on like); mute `text-amber-400` (`:450`) → `text-muted-foreground`.
4. Scope toggle (`:286-304`): rebuild on Learn's segmented pattern — cream `layoutId` pill on `springs.glide`, ARIA tabs contract, ≥44px targets (currently h-8 white pill).
5. Kill the `document.querySelector('textarea[placeholder=…]')` prompt-chip hack (`:387`): pass a ref/callback so chips call `composerRef.current?.focus()` and pre-fill the prompt text into the composer state.
6. Post entrance: new/refreshed posts stagger in via `anim-stagger` on the feed container (first page only — no re-stagger on "load more").
7. Hand-rolled error block (`:363-371`) → `patterns/ErrorState`.
**Edge cases:** optimistic like revert keeps color/token change; muted threads unaffected; peer-review scope board untouched; empty feed keeps prompt chips (now ref-driven).
**Acceptance:** all interactive elements press + tick; scope pill slides; composer choreography plays; grep in file for `red-400|amber-400|querySelector` → 0; reduced motion → all instant.

### P4-T9 — Login/OTP micro-polish (`tier: 2`)
**Files:** `src/pages/Login.tsx`, `src/components/auth/OtpEntryStep.tsx`
1. All OTP-step controls ≥44px: resend chip, "use email instead", back link (`OtpEntryStep.tsx:190-228` — set `min-h-[44px] px-4`, visual text size unchanged).
2. Per-digit haptic: `tapTick()` on each OTP digit input (guard: only on len increase); keep the existing success/error notifications.
3. Form sheet rise: the mobile bottom-sheet form (`formOpen`) animates on `springs.glide` via framer (y: 24→0, opacity) instead of any CSS one-off; back button (`Login.tsx:518`) drops `active:scale-95` in favor of Button/`pressTap` path.
4. Fix the proof-strip truncation at 375 (`shots/login_real_m375.png`): the "LEARN FROM …" line clamps to one line with `line-clamp-1` ONLY after rendering full text at `text-[13px]`; if still overflowing, drop the trailing descriptor — never mid-word ellipsis of the first item. Container gets `pb-safe`.
**Edge cases:** reserved review number path untouched (`:131,156`); email fallback flow untouched; reduced motion → sheet appears instantly.
**Acceptance:** every tappable on login/OTP ≥44px at 360; digit ticks on device; sheet springs; proof line renders clean at 360 AND 375.

### P4-T10 — Profile coherence (`tier: 2`)
**Files:** `src/pages/ProfilePage.tsx`, `src/components/InitialsAvatar.tsx`
1. Enrolment rows (`:578-606`) → `SurfaceCard` + `ArtworkImage` (aspect `video`, 96px wide thumb variant) — kills raw `<img>`, adds press/focus.
2. Invoice "Paid" badge (`:842`) → same token treatment as `InvoiceDetailSheet.tsx:138` (`--accent-emerald` family): one Paid pill, one source — extract a tiny `PaidBadge` local component if needed within this file.
3. Change-password section (`:615-621`): render only when the account has a real email identity (not `@phone.leveluplearning.in` synthetic) — check `profile.email` suffix; OTP-only users see nothing.
4. Invoices hub tile: when order count is 0, tile shows "No invoices yet" caption and does not scroll-to-nothing (disable the scrollIntoView when section absent).
5. `InitialsAvatar`: constrain the generated gradient palette to four brand pairs — cream→gold, indigo→violet-deep, emerald→success, surface-2→border (hash picks among these; red/rose pairs removed).
**Edge cases:** guest-minted accounts (synthetic email) hide password; avatar renders identically wherever used (header, community, admin) — visual spot-check.
**Acceptance:** profile rows press; one Paid style (grep `emerald-500` in ProfilePage → 0); OTP-only account shows no password section (test with synthetic-email fixture); avatars only brand pairs.

---

# PHASE 5 — Hardening & the two-hundred-cut sweep
**Goal:** one voice, one toast, one empty state, one skeleton, token police, 44px floor. This phase makes "nothing anywhere looks like a default component" true, and is the first production-promotion candidate.
**Gate routes:** ALL student routes + one admin dialog spot-check.
**Sequencing:** P5-T1 (toast) and P5-T2 (blur) first — both Tier 1, one council. T3–T8 parallel after.

### P5-T1 — One toast system (`tier: 1` — app-wide primitive, council)
**Files:** `src/App.tsx`, `src/components/ui/toaster.tsx`, `src/components/ui/use-toast.ts` *(shim only — do not delete)*, `src/lib/toast.ts`
1. Retire the mounted Radix `<Toaster/>` (`App.tsx:290`); Sonner (already styled via `.lu-sonner-toast`, tokenized enter/exit) becomes the only renderer.
2. **Do not rewrite 34 call sites.** Convert `use-toast.ts` into a compatibility shim: its `toast({title, description, variant})` maps to `lib/toast.ts` Sonner calls (`variant:"destructive"` → `toast.error(title, {description})`, default → `toast(title, {description})`). Exported types preserved so admin files compile untouched.
3. `lib/toast.ts` gains `toast.success` mapping with the success icon in `--success`.
4. Visual spec for Sonner options (set once in `ui/sonner.tsx`): `position: bottom-center` mobile / `bottom-right` desktop, `bg-surface-2 border-border text-foreground rounded-xl shadow-design-md`, duration 4000 (error 8000 — existing), max 3 visible.
**Edge cases:** toasts fired during route transitions; Android back-to-exit toast (App.tsx:150-156) — verify it still renders; reduced motion (Sonner exit collapses — already handled in index.css:648-663).
**Acceptance:** exactly one toaster in the tree; admin CRUD toasts render via Sonner with correct variants (spot-check 3 admin pages); suite green; council sign-off.

### P5-T2 — Backdrop-blur diet on always-mounted chrome (`tier: 1` — layout chrome, council)
**Files:** `src/components/layout/StudentLayout.tsx` *(coordinate: lands after P4-T4 merges)*, `src/components/FloatingSupport.tsx`, `src/components/NotificationDropdown.tsx` *(after P4-T2)*, `src/components/HeroCarousel.tsx`
1. Header + mobile tab bar: `backdrop-blur-xl` → `backdrop-blur-md` AND raise fill opacity `bg-canvas/80` → `bg-canvas/90` (compensates the weaker blur; visually near-identical on black).
2. FloatingSupport launcher + NotificationDropdown panel + HeroCarousel chrome: `backdrop-blur-xl` → `backdrop-blur-md`, same fill-opacity compensation, or solid `bg-surface-2` where the element is small (<64px) — builder chooses solid for anything smaller than 64px.
3. Budget rule enforced from here on (gate greps): `backdrop-blur-xl` count in `src/` must be 0 outside `src/pages/admin/`; total `backdrop-filter` occurrences must not exceed the post-task count (record it in the task summary).
**Edge cases:** scrolled content behind header/tab bar still legible at 30% screen brightness (manual check per DESIGN-STRATEGY §6); iOS WKWebView renders blur differently — device verify.
**Acceptance:** grep budget holds; side-by-side screenshots (before/after) show no perceived quality loss; scroll FPS unchanged or better at 4× throttle; council sign-off + real-device confirmation before promote.

### P5-T3 — The 44px floor (`tier: 2`)
**Files:** `src/pages/CourseDetail.tsx`, `src/components/chapter/ChapterNotes.tsx`, `src/components/chapter/ResumePill.tsx`, `src/components/certificates/CertificateGallery.tsx`, `src/pages/ChapterViewer.tsx` *(icon buttons only)*, `src/components/InitialsAvatar.tsx` *(hit-area wrapper only, after P4-T10)*
Close every student-surface sub-44px target found in the audit: CourseDetail chapter rows `min-h-[40px]` → `min-h-[44px]` (`:587`); ChapterNotes timestamp chip + delete (`:233,244`) → 44px hit areas (visual size may stay 28px via padding); ResumePill/AutoAdvance "Play now"/"Cancel" (`:154,165`) → `min-h-[44px]`; CertificateGallery download anchor (`:188`) → `min-h-[44px]`; ChapterViewer `h-8/9` icon buttons → 44px hit areas. Rule: expand the HIT AREA (padding/min-h/min-w or an absolutely-positioned ::after), never blow up the glyph.
**Acceptance:** DevTools measurement of each listed control ≥44×44 at 360; the QA gate's layout lens tap-target check passes on all gate routes; zero visual-regression complaints on the touched rows (screenshots).

### P5-T4 — Microcopy: one voice (`tier: 3`)
**Files:** `src/pages/CheckoutPage.tsx` *(strings only)*, `src/pages/EventsPage.tsx`, `src/pages/EventDetail.tsx`, `src/components/home/UpcomingEvents.tsx`, `src/pages/DeleteAccount.tsx`, `src/pages/MySessionsPage.tsx`, `src/components/ui/searchable-select.tsx`
Voice rules (write them at the top of the task PR): second person, warm, specific, no exclamation marks in errors, no "please", no system nouns (gateway/edge/function/request). Replacements (final copy):
- "Something went wrong, please try again" → "That didn't go through. Try once more?"
- "Please fill in all required fields" → "A couple of fields still need you."
- "Payment failed / Please try again." → "The payment didn't complete. Nothing was charged — try again when ready."
- "Failed to load payment gateway / Please refresh the page." → "The payment screen didn't load. Pull to refresh and try again."
- "Please enter a valid email address." → "That email doesn't look right."
- "No sessions scheduled" → "Nothing on the calendar yet."
- "No results found." (student-facing surfaces only) → "Nothing matches — try another word."
**Acceptance:** `grep -rn "Something went wrong" src/pages src/components --include=*.tsx | grep -v admin` → 0; no "✓"/emoji in any student-facing toast; tone review against the rules on the diff.

### P5-T5 — Player + edge failure states in the brand voice (`tier: 2`)
**Files:** `src/components/VdoCipherPlayer.tsx`, `src/components/chapter/ChapterMediaPlayer.tsx`
1. Any player-load failure renders a branded state INSIDE the player frame: `bg-surface`, grain, film-slate icon (lucide `Clapperboard`) in a cream-ringed 56px circle, serif-italic headline "The reel didn't load", `.body-muted` line "Check your connection and try again.", outline Retry button ≥44px (existing retry logic reused). Raw error strings (e.g. "Failed to send a request to the Edge Function") NEVER render to students — log them to Sentry/console instead.
2. Replace emoji icons (`ChapterMediaPlayer.tsx:268` "📄", `:277` "📚") with lucide `FileText`/`BookOpen` in `text-cream` 32px on `bg-surface-2` circles.
**Edge cases:** retry succeeds mid-state → player mounts cleanly; DRM-specific failures keep any legally-required messaging; offline → same state (OfflineBanner already covers global messaging).
**Acceptance:** simulate OTP-fn failure (block the request in DevTools) → branded state shows, no technical string anywhere in the DOM; retry works; emoji grep in `src/components/chapter/` → 0.

### P5-T6 — One EmptyState, one skeleton (`tier: 2`)
**Files:** `src/components/EmptyState.tsx` *(the old serif one — becomes the canonical implementation)*, `src/components/patterns/EmptyState.tsx`, `src/components/skeletons/CourseCardSkeleton.tsx`, `src/components/skeletons/EventCardSkeleton.tsx`, `src/components/skeletons/PostSkeleton.tsx`, `src/components/chapter/QuizBlock.tsx` *(skeleton bit only — color tokens are P5-T7's)*
1. Merge the two EmptyStates: the **patterns/EmptyState API** (`icon/title/description/action`) with the **serif visual** (cream-ringed 56px icon circle, `font-serif-italic` title in `text-cream` at `text-[24px]`, `.body-muted` description, single action Button). patterns/EmptyState becomes the sole export; `components/EmptyState.tsx` re-exports it (deprecation comment) so old imports keep compiling; migrate its two consumers' props.
2. All three `skeletons/*` migrate `animate-pulse bg-surface-2` → `.skeleton-shimmer` blocks with identical dimensions; `QuizBlock.tsx:108` likewise.
**Acceptance:** every student empty state renders the serif register (visual sweep of /learn zero-state, /my-courses zero-state, community empty, certificates empty, notifications rest state); `grep -rn "animate-pulse" src/components/skeletons src/components/chapter` → 0; zero CLS deltas (dimensions preserved).

### P5-T7 — Token police: the status-color map (`tier: 2`)
**Files:** `src/components/chapter/QuizBlock.tsx`, `src/pages/ChapterViewer.tsx` *(line 1183 class only)*, `src/pages/CourseDetail.tsx` *(lines 533, 591 classes only)*, `src/pages/MySessionsPage.tsx`, `src/pages/CohortDashboard.tsx`, `src/components/cohort/PeerReviewBoard.tsx`, `src/components/cohort/AssignmentSubmissionForm.tsx`, `src/components/live/TimeStateBadge.tsx`
The semantic map (uses EXISTING tokens only — no index.css edits): success/complete → `--success`; error/failed → `--destructive`; warning/pending → `--accent-amber`; info/neutral → `--accent-indigo`; LIVE → `--accent-crimson`; stars/ratings → `--gold`. Replacements: QuizBlock emerald/rose set (`:128-182`) → success/destructive; ChapterViewer `text-emerald-500` (`:1183`) → `text-[hsl(var(--accent-emerald))]` (match its twin at `:1290`); CourseDetail star (`:533`) → gold, completed check (`:591`) → accent-emerald; MySessions emerald/blue (`:134-136,197`) → success/indigo; CohortDashboard's green/amber/blue/orange status system (`:192-611`) → the map (orange → amber); PeerReviewBoard (`:179-181`) + AssignmentSubmissionForm (`:177`) → map; TimeStateBadge red set (`:100-105`) → `--accent-crimson` (keep the ping, `motion-safe` gated).
**Acceptance:** `grep -rnE "(text|bg|fill|border)-(red|green|emerald|rose|orange|blue|sky|yellow|amber)-[0-9]" src/pages src/components --include=*.tsx | grep -v admin/ | grep -v ui/toast` → 0 lines on student surfaces; visual sweep confirms statuses still distinguishable; contrast ≥4.5:1 for text usages (the violet-deep precedent at index.css:144-148 is the model if any fail).

### P5-T8 — A11y closure (`tier: 2`)
**Files:** `src/pages/CommunityPage.tsx` *(comment textarea label — after P4-T8 merges)*, `src/components/auth/InstructorProof.tsx`, `src/pages/StudioSecondBrain.tsx`, `src/components/ui/carousel.tsx` *(aria attributes only — investigate first)*
1. Every student-facing form control gets an associated label or `aria-label` (community comment box, any remaining placeholder-only inputs found by an axe sweep of the gate routes).
2. Run `npx playwright` + axe (or the gate's a11y lens) across all gate routes; fix every `critical/serious` finding on student surfaces in these files; anything outside the file list gets logged to the phase punch list, not fixed ad hoc.
3. Focus-visible ring (`.focus-ring` utility) on any interactive element the sweep flags as ringless.
**Acceptance:** axe: zero critical/serious on `/home /learn /community /profile /p/* /checkout/*` at 375; keyboard-only walk of Home→Offering→Checkout completes without focus loss.

---

# PHASE 6 — The Curtain: cold start & the data layer
**Goal:** a returning student sees THEIR Home in under a second; a first-time visitor on Slow-3G sees the brand within 2.5s (prod build); the splash hands off seamlessly. Evidence baseline: `design/vision/shots/slow3g-home_t*.png` (24s of black today).
**Gate routes:** `/home` (cold + warm), `/login`, `/p/lokesh-kanagaraj-teaches-film-making` — measured, not just eyeballed (budgets in QA-PROCESS.md §5).
**Sequencing:** P6-T1 → P6-T2 → P6-T3 strictly ordered (same data layer). P6-T4, T5, T6, T7 parallel to that chain. P6-T8 first if phase-2 left the defect open.

### P6-T0 / P6-T8 — Greeting-band occlusion (`tier: 1` — carries phase-2 T7 scope, council)
**Files:** `src/pages/Home.tsx` *(and `src/index.css` ONLY under phase-2 T7's constraints if unavoidable)*
**Verify first:** phase-2 T7 addressed coarse-pointer parking (`8500b6f`), yet live capture on this branch still shows the full-size greeting parked ~90px from top with content slicing beneath it on every frame at 375 AND 360 coarse (`shots/home375_seg1/2/5/7.png`). If the final phase-2 build still exhibits this, execute:
1. The parked state must CONDENSE: when parked, greeting scales to `text-[17px]` single-line ("Good evening, *Rahul*" — serif italic name kept), band height ≤56px, with a 24px gradient scrim below (`from-canvas to-transparent`) so content never hard-clips against it. Transform/opacity only (scale+translate via the existing `useScroll` MotionValues); reserved layout space shrinks accordingly (adjust the spacer element, not html/body).
2. Alternative (builder decides by measurement): full release — greeting scrolls away entirely after 120px and the sticky header remains the only chrome. Pick whichever needs NO index.css change.
3. Reduced motion: condensed state applies instantly past the threshold (no mid-states).
**Acceptance:** at no scroll position does any card/text render partially occluded behind the greeting band at 360/375 coarse; viewport share of parked chrome ≤8%; document root still scrolls (June-14 grep + manual); council (Tier 1 neighborhood).

### P6-T1 — React-query wave 1: one enrolment chain for Home (`tier: 1` — shared data layer, council)
**Files:** `src/hooks/useEnrolledProgress.ts` *(new)*, `src/components/home/YourWeek.tsx`, `src/components/home/ContinueLearning.tsx`, `src/components/home/UpcomingSessions.tsx`, `src/components/home/QuickPick.tsx`, `src/components/home/PopularCommunity.tsx`, `src/components/home/UpcomingEvents.tsx`, `src/components/home/NewMembers.tsx`
1. New hook `useEnrolledProgress(userId)`: ONE react-query query (`["enrolled-progress", userId]`, `staleTime: 5min`) that fetches the enrolment→offering_courses→courses/sections→chapters→chapter_progress chain ONCE (mirror the exact query shapes from ContinueLearning.tsx:49-113 — parallelize independent steps with `Promise.all`) and returns the normalized tree every section derives from.
2. YourWeek/ContinueLearning/UpcomingSessions/QuickPick consume the shared hook (each keeps its own derive functions — yourWeekDerive.ts pattern). PopularCommunity/UpcomingEvents/NewMembers move their own fetches to react-query (`staleTime: 5min`, distinct keys).
3. Loading UI: sections render `SkeletonBlock` placeholders of final dimensions while their query is loading (kills pop-in/CLS); all sections still self-hide when data is empty.
4. Pull-to-refresh invalidates `["enrolled-progress"]` + the section keys instead of remounting via `refreshKey`.
5. **Behavior parity is the acceptance bar:** every card, ordering rule, lock state, and link must be identical to before — this is a plumbing change.
**Edge cases:** signed-out/zero-enrolment (hook returns empty, sections hide — unchanged); error (sections that had ErrorState keep it; others hide + Sentry); query retry default (leave react-query defaults).
**Acceptance:** Home mount fires ≤6 network requests post-auth (count via DevTools; was ~25+); navigating away and back within 5min fires ZERO refetches; visual diff of Home vs before = identical; council + staged rollout (data layer).

### P6-T2 — React-query wave 2: the remaining waterfalls (`tier: 2`)
**Files:** `src/pages/MyCoursesPage.tsx`, `src/pages/CourseDetail.tsx`, `src/pages/CommunityPage.tsx`, `src/pages/ProfilePage.tsx`, `src/pages/CohortDashboard.tsx`
Each page's raw `useEffect` chain moves to react-query (keys: `["my-courses", uid]`, `["course", courseId, uid]`, `["community", scope]`, `["profile-sections", uid]`, `["cohort-dash", offeringId]`; `staleTime: 5min` except community `60s`). CourseDetail's spinner (`:370-378`) is replaced by a structured skeleton (hero block + 6 chapter-row lines, exact dimensions); its network-error path renders `ErrorState` with retry — NOT the not-found screen (`:157-168` splits error vs 404). CohortDashboard's 4 sequential RPCs parallelize where independent (`Promise.all` of get_cohort_progress + get_attendance_pct after the offering fetch). Learn's segment switch stops remounting children: keep all three mounted with `display` toggling (**RAHUL DECISION embedded: recommend YES** — memory cost is trivial, UX + data cost win), or rely on the new query cache if mount-cost proves negligible — builder measures and documents.
**Acceptance:** each route: revisit within staleTime = zero refetches; CourseDetail cold shows skeleton not spinner; simulated network failure on CourseDetail shows retry state, not "Course not found"; behavior parity everywhere.

### P6-T3 — Persisted query cache: instant warm opens (`tier: 1` — app boot path, council)
**Files:** `src/App.tsx`, `package.json` (+`@tanstack/react-query-persist-client`, `@tanstack/query-sync-storage-persister` — justified: first-party tanstack, ~3KB, the entire warm-start strategy)
1. Persist the query cache to localStorage (`buster`: app version string; `maxAge` 24h; whitelist via `shouldDehydrateQuery`: ONLY keys `["catalog"]`, `["enrolled-progress"]`, `["my-courses"]`, `["profile-sections"]` — never payment/auth/coupon queries).
2. Result: warm open renders last-known Home instantly from cache while queries revalidate in background (stale-while-revalidate). Skeletons show ONLY when cache is empty.
3. Sign-out clears the persister (`persister.removeClient()` alongside existing sign-out cleanup); user-switch guarded by including `userId` in persisted keys (already per T1/T2).
**Edge cases:** corrupt/oversized localStorage (persister try/catch → cold start); enrolment purchased on web then opening native (staleTime 5min + `useEnrolledOfferingIds` staleTime:0 stays UNpersisted so entitlements always revalidate — verify the whitelist excludes it); private browsing (storage may throw — must no-op).
**Acceptance:** kill network → reopen app → Home renders last content with OfflineBanner (no empty states) for whitelisted sections; warm online open paints content <1s on a prod build (measure per QA-PROCESS §5); no stale entitlement: a revoked enrolment disappears after revalidation; council (auth-adjacent storage).

### P6-T4 — Auth gate off the critical path (`tier: 1` — auth, council mandatory)
**Files:** `src/contexts/AuthContext.tsx`, `src/components/guards/RequireAuth.tsx` *(read to confirm no change needed)*
1. Cache the profile row in localStorage (`lu_profile_v1`, keyed by user id) when fetched. On cold start: `getSession()` resolves locally → if session exists AND cached profile matches the session user, `setLoading(false)` IMMEDIATELY with the cached profile, then `fetchProfile()` revalidates in background and updates state (+re-caches).
2. No cached profile (first login/new device): current behavior (block on fetch) — correctness over speed there.
3. Role-guard safety: `RequireRole` decisions may briefly use the cached role; on revalidation mismatch (role downgraded), guards re-evaluate and redirect — verify this path with a test. Sign-out/delete-account clears `lu_profile_v1`.
4. NEVER cache session tokens beyond what supabase-js already does; this caches the `users` profile row only.
**Edge cases:** profile deleted server-side (revalidation 404 → sign out); bypass mode untouched (`:143-152`); multi-tab (storage events not required — each tab revalidates).
**Acceptance:** returning-user cold start reaches Home content with ZERO auth-blocking network round-trips (Network tab: profile fetch happens in parallel with Home queries, not before them); role-downgrade test passes; council sign-off (this is the login path).

### P6-T5 — Splash choreography (`tier: 1` — native shell, council)
**Files:** `capacitor.config.ts`, `src/main.tsx`, `public/manifest.webmanifest`
1. `SplashScreen: { launchAutoHide: false, iosFadeOutDuration… }` — investigate exact plugin options; then in `main.tsx`, after `createRoot().render()`, schedule `requestAnimationFrame(() => requestAnimationFrame(() => SplashScreen.hide({ fadeOutDuration: 240 })))` (dynamic import `@capacitor/splash-screen`; no-op on web) — the double-rAF guarantees a painted frame exists before the splash lifts. Add a 4s failsafe timeout that force-hides (never trap users on the splash if JS errors).
2. Manifest: `background_color` `#000000` → `#0a0a0a` (match splash/canvas/theme-color).
**Edge cases:** JS crash before mount → failsafe hides splash into the branded dark canvas + ErrorBoundary; web unaffected; slow devices — splash holds through boot (that is the point).
**Acceptance:** device video (Android + iOS): splash → first React paint with a 240ms fade, no black gap, no double-flash; failsafe verified by throwing in main.tsx locally; council (shell).

### P6-T6 — Self-hosted fonts: kill the render-blocking @import (`tier: 1` — index.css, council mandatory)
**Files:** `src/index.css` *(line 1 + @font-face block ONLY — no other rules)*, `index.html`, `public/fonts/*` *(new woff2 assets)*, `src/lib/fonts.css` *(alternative home for @font-face if preferred — builder picks ONE location)*
1. Download woff2 subsets (latin) for: Inter 400/500/600/700, Instrument Serif 400 + 400-italic, JetBrains Mono 400/500 → `public/fonts/`. Replace `src/index.css:1` `@import url(googleapis…)` with `@font-face` rules: `font-display: swap` for Inter (body must never block), `font-display: swap` for the serif and mono too; correct `unicode-range` latin subset.
2. `index.html`: `<link rel="preload" as="font" type="font/woff2" crossorigin>` for exactly TWO files: Inter-400 and InstrumentSerif-Italic (the first-paint pair). Remove the two Google-Fonts preconnects (`:36-37`) — dead weight after this.
3. The ₹ glyph must render in all three families — verify the latin subset includes U+20B9 or extend the subset (this audience sees ₹ on every money surface).
4. This also removes a GDPR/DPDP data-leak vector (Google Fonts IP logging) — note in PR.
**Edge cases:** FOUT window (swap) — acceptable, the fallback stack is system sans on a black canvas; cached old CSS on native (bundled — ships with the release train); offline native (fonts now bundled = better).
**Acceptance:** prod build waterfall shows zero requests to fonts.googleapis/gstatic; first text paint on Slow-3G (prod preview) ≤2.5s; ₹ renders in serif/mono/sans specimens; visual diff of all gate routes = identical glyphs; council (index.css).

### P6-T7 — Bundle diet (`tier: 2`)
**Files:** `vite.config.ts`, `src/lib/sentry.ts`, `src/main.tsx` *(sentry init line only — coordinate with P6-T5's lane)*
1. Sentry: replace the static `@sentry/react` import with a dynamic `import()` inside `initSentry()` that only executes when `VITE_SENTRY_DSN` is set; init after first paint (`requestIdleCallback` with 3s timeout fallback). ErrorBoundary must queue-or-drop errors pre-init (investigate its current coupling; if it imports Sentry statically, route through a thin `captureError()` facade in sentry.ts).
2. `vite.config.ts` manualChunks: add `"framer": ["framer-motion"]` so the animation runtime caches independently of app code across releases (it stays on the critical path — StudentLayout needs it — but becomes a stable long-cache chunk).
3. Verify recharts is NOT in the entry chunk (`npx vite build` + inspect `dist/assets` sizes; record before/after in the task summary). Budget: entry JS ≤450KB after this task (was 534KB).
**Acceptance:** build succeeds; entry chunk ≤450KB; Sentry still captures a thrown test error in a DSN-set build; no framer-dependent first paint regression (Home renders).

---

# PHASE 7 — The first act & brand moments
**Goal:** login→onboarding plays like a title sequence; every empty/error state speaks the brand; the screening room's built-but-idle furniture gets wired.
**Gate routes:** `/login`, `/signup`, `/onboarding` (no-bypass dev server, port 8088 pattern), `/chapters/:id`, `/courses/:id`.

### P7-T1 — Signup joins the cinema (`tier: 2`)
**Files:** `src/pages/Signup.tsx`
Give Signup the Login welcome treatment (`Login.tsx:466-497` is the reference implementation): full-bleed hero image (reuse Login's asset + kenburns class), wordmark top-center, serif-accented headline "Start making *your best work*.", phone field in the same bottom-sheet form pattern, `btn-champagne` submit. Keep every auth behavior (synthetic email, non-+91 branch, `resolvePostAuthDestination`). Back-to-login link ≥44px.
**Acceptance:** side-by-side with Login reads as one family at 360/375; all flows (IN number, foreign number→email, existing-user redirect) behave identically to before.

### P7-T2 — Onboarding as the trailer (`tier: 2`)
**Files:** `src/pages/Onboarding.tsx`, `src/components/auth/CraftPicker.tsx`, `public/img/crafts/*` *(new assets)*
1. **Self-host the CraftPicker imagery** (currently hotlinked Unsplash — an external CDN on the activation path): export the same/equivalent images to `public/img/crafts/` (8 images, ≤80KB each, 640px wide webp). Swap URLs; add `ArtworkImage` treatment (aspect 4/5, scrim).
2. Step transitions: replace `animate-slide-left-in` one-way cut with framer `AnimatePresence mode="wait"` — exit x:-24/opacity, enter x:24→0 on `springs.glide`.
3. Step indicator: two 6px dots top-center, active dot stretches to 20px pill in cream (`layoutId="onb-step"`, `springs.glide`).
4. On finishing craft selection: `celebrate()` haptic + the Continue button label becomes "Take me in" (final copy).
**Edge cases:** skip path intact; guard for complete accounts intact (`:71-99`); offline images (bundled now — improved); reduced motion → instant steps.
**Acceptance:** zero requests to unsplash.com anywhere in the app (grep + network); steps animate both directions; onboarding completes and routes as before.

### P7-T3 — Empty/error states as brand moments (`tier: 2`)
**Files:** `src/components/patterns/ErrorState.tsx`, `src/pages/EventsPage.tsx` *(empty/error blocks only)*, `src/pages/MySessionsPage.tsx` *(empty/error blocks only)*, `src/components/home/ContinueLearning.tsx` *(error block only)*
1. `ErrorState` gets the SystemState register: grain wrapper, serif-italic title default "That didn't load", cream-ringed icon, single retry Button. API unchanged (`title/description/onRetry` — verify current props and preserve).
2. Every hand-rolled `WifiOff`-style block in the listed files swaps to the upgraded ErrorState. (MyCourses + Community were done in P4/P5 — these are the stragglers.)
**Acceptance:** DevTools-offline each route → the branded state renders with working retry; visual consistency sweep across all error states (screenshot grid into `design/qa/`).

### P7-T4 — Wire the idle screening-room furniture (`tier: 2`)
**Files:** `src/pages/ChapterViewer.tsx`, `src/components/chapter/ChapterNotes.tsx`, `src/components/chapter/MomentsList.tsx`, `src/components/chapter/ResumePill.tsx`
**Investigate first against post-phase-2 reality** (these were built-but-unimported at audit time; a later sprint may have wired some):
1. Notes tab renders `ChapterNotes` (timestamped notes, [MM:SS] jump chips) for app-owned `<video>` media where currentTime is readable; for VdoCipher iframes fall back to the plain textarea (timestamps unavailable cross-origin — document it). Migrate/keep the autosave + flush-on-unmount contract from the current inline implementation (ChapterViewer:625-735) — do not regress persistence.
2. `ResumePill` (resume-where-you-left) and `AutoAdvanceCountdown` wire into the player flow for app-owned media; `MomentsList` renders under an existing tab if data exists, else stays out — builder documents the wiring decision per media type.
3. Episode dot-strip at 375 (15 tiny dots crowding the Next button): replace with "5 / 15" numeric progress in `.caption tabular-nums` when count >8; dots remain for ≤8.
**Edge cases:** chapters without media (article/pdf) hide timestamp affordances; body-lock invariant untouched; 44px on all new chips (28px visual, padded hit area).
**Acceptance:** notes with timestamps work on an HLS chapter (jump chip seeks); VdoCipher chapter falls back cleanly; dot-strip no longer clips at 360/375; autosave regression test still green.

### P7-T5 — Chapter tab strip: labels back (`tier: 2`)
**Files:** `src/pages/ChapterViewer.tsx` *(sequential lane with P7-T4 — one builder owns this file)*
Icon-only tabs (`shots/chapter_m375_tab-Notes.png`) become icon+label at ALL widths: 11px `.heading-eyebrow`-style labels under 20px icons ("Up Next", "Notes", "Overview", "Files", "Q&A"), tab height ≥56px, cream `layoutId` pill retained, ARIA tabs contract retained. If five labeled tabs overflow 360px, the strip becomes horizontally scrollable with `hide-scrollbar` + 16px fade masks — labels are NOT dropped.
**Acceptance:** every tab identifiable by text at 360; pill still springs; no horizontal page overflow (June-14 grep untouched, strip scrolls internally).

### P7-T6 — Login cold-start polish (`tier: 3`)
**Files:** `src/pages/Login.tsx` *(if P4-T9 landed, this is a residual sweep — dedupe against it)*
Residuals: hero image via `ArtworkImage` with `priority` (kills any pop-in); "LEARN FROM" proof strip fixed per P4-T9 spec if not yet landed; auth-loading spinner replaced with the branded dark canvas + wordmark pulse (opacity 0.6→1, `--motion-slow`, transform/opacity only).
**Acceptance:** no unstyled flash between auth-loading and welcome layer; hero never pops.

### P7-T7 — CourseDetail hero: resume carries the register (`tier: 3`)
**Files:** `src/pages/CourseDetail.tsx` *(sequential with P6-T2 if same phase-train; else standalone)*
"Continue Learning" → champagne Button variant; the hero text block gains a stronger bottom scrim (`bg-gradient-to-t from-canvas via-canvas/70 to-transparent`, extend height so body text never sits on face imagery — `shots/course-detail_m375_seg0.png`); progress ring + "N/15 lessons" line move visually adjacent to the CTA (one resume cluster).
**Acceptance:** CTA champagne; all hero text ≥4.5:1 contrast over the darkest AND lightest quartile of the artwork (spot-check 3 courses); 360/375 clean.

---

# PHASE 8 — Re-engagement — **RAHUL DECISION at phase level (recommend YES, transactional-only v1)**
**Goal:** the app can call a student back. Push for moments that already exist as notification types; deep links; scoped strictly to transactional v1 (no marketing sends).
**Gate:** device-heavy — emulators + Rahul's phones; web gate covers permission UX and settings only.
**Sequencing:** P8-T1 → P8-T2 → P8-T3 ordered. P8-T4/T5 parallel after T1.

### P8-T1 — Push infrastructure (`tier: 1` — native shell + backend, council mandatory)
**Files:** `package.json` (+`@capacitor/push-notifications`), `android/app/*` (FCM google-services wiring), `ios/App/*` (APNs capability), `supabase/functions/send-push/index.ts` *(new)*, `supabase/migrations/*_push_tokens.sql` *(new)*, `src/lib/push.ts` *(new)*
1. Client: `src/lib/push.ts` — register on native only, AFTER an in-app pre-permission moment (see P8-T2); store token in new `push_tokens` table (user_id, token, platform, updated_at; RLS: owner-only insert/update). Handle token refresh + `pushNotificationActionPerformed` → route via the deep-link map (P8-T2).
2. Backend: `send-push` edge fn (service-role) sending via FCM HTTP v1 (Android) and APNs (iOS via FCM if the app uses FCM for both — builder investigates the least-key-management path; document the choice). Triggered by the SAME events that already insert `notifications` rows — extend those writers to also call send-push for exactly three types v1: `session_starting` (30 min before), `application_status_changed`, `qna_reply`.
3. Store compliance: Play Data-safety + App Store privacy updates flagged in the release checklist (metadata task for Rahul).
**Edge cases:** permission denied (app fully functional, no re-prompt nagging — settings row shows "off"); logout (delete token row); multiple devices per user (multi-row).
**Acceptance:** on a physical Android + iOS device: each of the three events delivers a push when the app is closed; tapping it deep-links to the right screen (P8-T2); tokens cleaned on logout; council sign-off.

### P8-T2 — Permission moment + deep-link routing (`tier: 2`)
**Files:** `src/components/notifications/PushPrimer.tsx` *(new)*, `src/components/NativeDeepLinks.tsx`, `src/pages/ProfilePage.tsx` *(notification prefs row only — after P4-T10)*
1. Pre-permission sheet (vaul, P4-T1 pattern), shown ONCE, triggered contextually — after first session-RSVP or first Q&A post (not on first launch): serif headline "We'll tap your shoulder", body "Session reminders and replies. Nothing else — no marketing, ever.", champagne "Turn on reminders" + ghost "Not now". Only the champagne CTA triggers the OS prompt.
2. Deep-link map (shared by push taps and NativeDeepLinks): `session_starting → /my-sessions`, `application_status_changed → /application-status/:id`, `qna_reply → /chapters/:chapterId?tab=qna`. Implement as one exported `resolveNotificationRoute(type, payload)` with unit tests.
3. Profile → Notifications: per-type toggles (three rows, Switch primitive, ≥44px) writing to existing notification-prefs storage (investigate `NotificationPreferences` component and extend, don't fork).
**Acceptance:** primer appears exactly once at the contextual trigger; declining never re-prompts; each route resolves correctly from a cold push tap (device test); toggles persist.

### P8-T3 — Session reminders on native done right (`tier: 2`)
**Files:** `src/hooks/useSessionReminder.ts`, `src/pages/MySessionsPage.tsx` *(reminder UI only)*
Replace the browser-`Notification`-API path (which dead-ends on native with a "check Settings" toast, `:286-290`) with: native → server push already covers session_starting (P8-T1) so the Remind-me button becomes a per-session opt-out/in toggle on that push type; web → keep local Notification with permission flow. One `Bell/BellOff` toggle, `tapTick()`, state persisted.
**Acceptance:** native shows no dead-end toast; toggling off suppresses that session's push (server respects the flag); web behavior unchanged.

### P8-T4 — Certificate + completion share moments unified (`tier: 3`)
**Files:** `src/components/progress/CompletionRecap.tsx`
Add a "Share this" ghost button (≥44px) on the course-completion recap final card → invokes the P4-T6 share path with the share-card canvas. `celebrate()` already fires — no new haptics.
**Acceptance:** share sheet opens from the recap on device; recap sequencing/body-lock untouched (regression test green).

### P8-T5 — Re-engagement guardrails doc (`tier: 3`)
**Files:** `design/notifications-doctrine.md` *(new)*
One page codifying: transactional-only v1; max 1 push/day/user hard cap (enforce in send-push); quiet hours 22:00–08:00 IST (deferred sends); every push deep-links; kill-switch env var `PUSH_ENABLED`. This is the contract future marketing asks get argued against.
**Acceptance:** doc exists; send-push implements the cap + quiet hours + kill-switch (unit tests).

---

# PHASE 9 — Discovery & a living community
**Goal:** finding the next thing feels curated, not scrolled; community reads as inhabited.
**Gate routes:** `/home` (catalog), `/community`, `/learn`.

### P9-T1 — Real search over the catalog (`tier: 2`)
**Files:** `src/components/catalog/CatalogSection.tsx`, `src/components/catalog/useCatalog.ts`
1. The existing search input (`CatalogSection.tsx:119`) upgrades from strict filter to fuzzy match: normalize (lowercase, strip diacritics), match against title + instructor + category + description tokens, rank prefix > word-start > substring. Pure function in useCatalog.ts with unit tests. No new deps (~40 lines beats fuse.js here).
2. Results state: matched cards render with the standard grid; zero-results renders EmptyState "Nothing matches — try another word." + a "Browse everything" chip clearing the query.
3. Input gets a clear (×) button ≥44px, `type="search"`, `enterkeyhint="search"`; typing debounced 150ms (useDebounce exists).
4. Filter pills row: active pill moves from white to the cream family (match Learn's segmented control — one language app-wide), `layoutId` pill, `tapTick()`.
**Acceptance:** "lokesh", "editing", "photo" each return the right offerings; zero-results state renders; pills cream + sliding; no layout shift while typing.

### P9-T2 — Catalog rhythm: break the monotone (`tier: 2`)
**Files:** `src/components/catalog/CatalogCard.tsx`, `src/components/catalog/CatalogSection.tsx` *(sequential lane with P9-T1 — same builder)*
1. **Kill the letterbox heuristic properly** (`CatalogCard.tsx:114-122`, evidence `shots/home375_seg2.png`): live-cohort art renders as *blurred-cover backdrop + contained foreground* — the same image `object-cover` at `blur-xl scale-110 opacity-40` behind (small decode: reuse AmbientGlow's small-source discipline — pass the thumbnail URL), sharp `object-contain` foreground on top, fixed `aspect-video` frame. No black bars possible, no logo cropping possible. NOTE: this blur is a static filter on a tiny image, not backdrop-filter — allowed within budget; cap at one per card, decode ≤320px source.
2. Density: at <lg, alternate rhythm per section — first offering renders as the current full-width card, the rest as compact horizontal rows (96px `ArtworkImage` video-aspect thumb left; title, instructor, price+SAVE right; ≥88px row height, SurfaceCard press). Section scroll length drops ~60%.
3. Category section headers: the violet accent bar stays ONLY for cohort sections (violet = cohort per accent discipline); masterclass sections use cream.
**Edge cases:** 1-offering sections (full card only); wishlist heart stays on both card sizes (≥44px); Coming-soon/locked states render on both variants.
**Acceptance:** zero letterboxing on any card at 360/375 (screenshot sweep of all catalog sections); Home total scroll height down ≥40% for the current 12-SKU catalog; all card behaviors (lock, wishlist, ratings, View) intact on both variants.

### P9-T3 — Community identity layer (`tier: 2`)
**Files:** `src/pages/CommunityPage.tsx` *(after P4-T8 — this builds on it)*, `src/components/community/PostCard.tsx` *(new — extract)*
1. Extract `PostCard` from the page (the page is 500+ lines; the card is reused by P9-T4).
2. Identity: `InitialsAvatar` (brand palette per P4-T10) at 36px on every post + comment; author name weight 600; relative timestamp in `.caption`; instructor/admin posts get the existing tokenized badge plus a subtle `border-l-2 border-cream/30` on the card.
3. Comment affordance shows count ("3 replies" in `.caption`); expanding animates height via framer `layout` on `springs.glide`.
**Acceptance:** every post/comment has an avatar + consistent identity row; expansion animates without CLS on surrounding posts; PostCard unit renders standalone.

### P9-T4 — Home: community is alive (`tier: 2`)
**Files:** `src/components/home/PopularCommunity.tsx`
Fix the dead tiles (`:32-45`): each tile becomes a SurfaceCard Link → `/community` (post-level anchor if an id exists — investigate the feed's scroll-to capability; else plain route), with avatar + first 2 lines + like/reply counts. Data via react-query (`["popular-community"]`, staleTime 5min — align with P6 conventions).
**Acceptance:** tiles press + navigate; counts render; section hides when empty (unchanged).

### P9-T5 — Wishlist as a real surface (`tier: 3`)
**Files:** `src/pages/ProfilePage.tsx` *(SavedSection only)*
The existing SavedSection gets the catalog compact-row treatment (P9-T2 rows), remove-from-saved with `tapTick()` + undo toast (Sonner action button). Empty state: "Nothing saved yet. Tap the heart on anything that catches your eye."
**Acceptance:** saved items render as rows; remove/undo works; empty state on-register.

### P9-T6 — Cross-route continuity spike (`tier: 2`, timeboxed investigation — no ship)
**Files:** none (report to `design/vision/spikes/shared-element.md`)
Timeboxed 1-day spike: can Home card → Offering hero share elements without breaking BrowserRouter/PageMotion? Evaluate: (a) framer `AnimatePresence mode="popLayout"` around `<Outlet/>` + `layoutId` with both routes mounted during transition; (b) View Transitions API availability in Android System WebView ≥111 / iOS 18 WKWebView (check real support + reduced-motion story); (c) FLIP hand-off via sessionStorage rect. Deliver: recommendation + cost + perf risk. NO production code.
**Acceptance:** the spike doc exists with a clear go/no-go for Phase 10+.

---

# PHASE 10 — Platform polish & quality of light
**Goal:** the shell disappears; the app's depth reads at 30% brightness; final platform manners.
**Gate:** device matrix per QA-PROCESS §6 (this phase is device-verification-heavy).

### P10-T1 — Keyboard done right (`tier: 1` — native shell, council)
**Files:** `package.json` (+`@capacitor/keyboard`), `capacitor.config.ts`, `android/app/src/main/AndroidManifest.xml`
1. Install `@capacitor/keyboard`; config `Keyboard: { resize: "native", resizeOnFullScreen: true }` (replaces the inert comment at `capacitor.config.ts:79-84`).
2. Android manifest: `android:windowSoftInputMode="adjustResize"` on MainActivity.
3. Device-verify the three worst keyboard surfaces: chapter notes textarea, community composer, checkout guest form — no viewport jump, focused field visible above keyboard, sticky CTAs not detached mid-screen.
**Acceptance:** on-device (both platforms): open each surface, keyboard up/down 3×, no layout jump >4px, no stuck insets; council (shell).

### P10-T2 — Android predictive back + back-motion audit (`tier: 1` — shell + navigation, council)
**Files:** `android/app/src/main/AndroidManifest.xml` *(sequential lane with P10-T1)*, `src/App.tsx` *(back handler only)*
1. Opt in: `android:enableOnBackInvokedCallback="true"` on `<application>`. Verify the Capacitor App-plugin `backButton` listener still receives events on Android 14/15 with the flag on (Capacitor ≥5 supports it — verify installed version; if the listener breaks, document and revert the flag — the double-press-to-exit UX must survive).
2. Back-motion audit: with predictive back active, the system preview shows the current screen peeling — our in-app back remains an instant cut (PageMotion POP = none). Add a `page-motion-pop` class: 160ms opacity 1→0.92→1 micro-settle on the *incoming* screen under POP (transform/opacity, tokens) so back feels acknowledged without fighting the system gesture. Reduced motion → none.
**Acceptance:** Android 14+ device: predictive-back preview renders; overlays still close on back before navigation happens; exit-toast flow intact; POP settle plays ≤160ms.

### P10-T3 — Dynamic status bar + edge treatment (`tier: 2`)
**Files:** `src/lib/statusbar.ts` *(new)*, `src/pages/ChapterViewer.tsx` *(mount/unmount calls only)*, `src/components/progress/CompletionRecap.tsx` *(mount/unmount calls only)*
`statusbar.ts`: `setImmersive()` / `setDefault()` wrapping `@capacitor/status-bar` (installed) — no-ops on web. ChapterViewer sets immersive-friendly styling on mount (keep style DARK; on Android also `setOverlaysWebView(true)` is already global — only toggle `StatusBar.hide()` during native fullscreen video, restore on exit + on unmount + on visibilitychange). CompletionRecap: no bar changes (portal already covers) — include only if device testing shows bar bleed; builder verifies and documents.
**Acceptance:** entering/leaving fullscreen video never strands a hidden status bar (device test incl. app-switch mid-video); no web regressions.

### P10-T4 — Offline grace (`tier: 2`)
**Files:** `src/components/OfflineBanner.tsx`, `src/App.tsx` *(query-client options only — after P6-T3)*
1. react-query: `networkMode: "offlineFirst"` on the client defaults so cached (persisted) data renders offline without retry storms.
2. OfflineBanner v2: on reconnect, banner swaps to "Back online" (success tint) for 2s and fires ONE `queryClient.invalidateQueries()` for active queries — the app self-heals without pull-to-refresh. Banner enter/exit on `springs.glide` via AnimatePresence.
3. Actions that require network (post, like, pay, mark-complete) show the P5-T4 voice when attempted offline: "You're offline — this needs a connection." (toast, once per action attempt).
**Acceptance:** airplane-mode walk: Home/MyCourses render cached content; reconnect auto-refreshes; no infinite spinners anywhere; banner animates.

### P10-T5 — Quality of light pass (`tier: 2`)
**Files:** `src/pages/PublicOffering.tsx` *(shadow classes only)*, `src/pages/ThankYou.tsx` *(shadow classes only)*, `src/components/offering/HeroPlayChip.tsx`, `src/components/catalog/CatalogCard.tsx` *(shadow classes only — after P9-T2)*
1. Replace every bespoke shadow with the ladder: `shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]` (PublicOffering ×4, ThankYou:640) → `shadow-design-lg`; HeroPlayChip's `shadow-[0_20px_45px_-12px_hsl(var(--cream)/0.65)]` → `shadow-glow-cream`.
2. Elevation audit on the gate routes at 30% simulated brightness (screenshot with a 0.3-alpha black overlay in DevTools): every interactive surface must still separate from the canvas. Where it fails, add `shadow-design-sm` — never lighten surface colors.
3. Grain: add the `.grain` class to the PublicOffering hero container (the money page joins the 404/SystemState texture family — currently missing).
**Acceptance:** `grep -rn "shadow-\[0_" src/ --include=*.tsx | grep -v admin` → 0; 30%-brightness screenshots archived in `design/qa/`; grain visible on offering hero without banding (device check).

### P10-T6 — Sound design (`tier: 3`) — **RAHUL DECISION (recommend PARK)**
If greenlit (recommendation: park until after Phase 8 ships): exactly TWO sounds — lesson-complete (soft felt-piano tick ≤300ms) and course-complete (short warm swell ≤1.2s), bundled ≤40KB total, played via a single `src/lib/sound.ts` (WebAudio, pre-decoded, volume 0.35), gated by a Profile toggle DEFAULT OFF, never on web, never over the video's own audio (only after playback ended/paused). No other UI sounds — no taps, no toasts.
**Acceptance (if built):** sounds only on the two completion moments with toggle on; zero playback when toggle off or reduced-motion+silent-mode heuristics apply.

### P10-T7 — iOS DRM track unblock (engineering flag, not a design task)
**Files:** n/a — tracked in `iOS-LAUNCH.md` Track 2
Standing flag: VdoCipher FairPlay in WKWebView needs the native plugin path before iOS can be a full playback citizen. Phases 3–10 must not assume iOS playback parity; any player work (P5-T5, P7-T4) explicitly device-tests Android + web and documents iOS state. Decision on scheduling the native FairPlay work belongs to Rahul + the iOS release plan.

### P10-T8 — Desktop pass (`tier: 3`)
**Files:** `src/pages/Home.tsx` *(desktop-only classes)*, `src/components/layout/StudentLayout.tsx` *(desktop sidebar hover states only — after P5-T2)*
Desktop is currently a scaled-up phone (`shots/home_d1280.png`): (1) FeaturedHero at ≥lg goes taller (`aspect-[21/9]`, title block max-w-xl) filling the canvas; (2) quick-tiles grid `grid-cols-4` at ≥xl; (3) sidebar items get `glide` hover lift + `.focus-ring`; (4) content max-width ladder already exists — verify no line-length >75ch on body text.
**Acceptance:** 1280×800 screenshots show a composed desktop, not a stretched phone; no mobile regression at 360/375.

---

# Cross-phase dependency & parallelization map

**Ordered chains (must be sequential):**
- P3-T1 → (P3-T4, P4-T8, P7-T7, and every later champagne-variant consumer)
- P4-T1 → P4-T2 → P8-T2 (vaul pattern lineage)
- P6-T1 → P6-T2 → P6-T3 → P10-T4 (data layer lineage)
- P6-T5 ∥ P6-T6 but both before any cold-start budget enforcement in the gate (QA-PROCESS §5 activates after Phase 6)
- P4-T4 → P5-T2 (both edit StudentLayout)
- P9-T1 → P9-T2 (both edit catalog files); P4-T8 → P9-T3 (community lineage)
- P10-T1 → P10-T2 (both edit AndroidManifest)

**Single-file sequential lanes within phases** (one builder owns the file): CheckoutPage.tsx (P3-T1/T3/T5/T9), PublicOffering.tsx (P3-T2/T6/T7), ChapterViewer.tsx (P7-T4/T5), CommunityPage.tsx (P4-T3-indicator/P4-T8), CatalogSection.tsx (P9-T1/T2).

**Safe parallel lanes (no file overlap):** within each phase, everything not named in a chain above. Across phases: never parallelize phases themselves — the ORCHESTRATION.md stacked-branch model stands.

**Council accumulation per release:** any release containing P3-T1, P4-T4, P4-T6, P5-T1, P5-T2, P6-T1/T3/T4/T5/T6, P8-T1, P10-T1/T2 runs `bugfix-council` over the accumulated Tier-1 diff (per CLAUDE.md).

**Task count: 61** (P3: 9 · P4: 10 · P5: 8 · P6: 8 (T0/T8 is one task) · P7: 7 · P8: 5 · P9: 6 · P10: 8, of which one is an engineering flag and one a spike).
