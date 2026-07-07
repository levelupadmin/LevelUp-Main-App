# LevelUp — The Vision Report
### From a 5/10 experience to a 10/10 consumer app
*Authored 2026-07-07 on branch `design/phase-2` (phases 0–1 shipped, phase 2 mid-flight — commits `0d7fb0c`…`3f1206b` present). Method: full repo sweep (4 parallel audit crews over pages, money path, native shell/perf, primitives/system) + live walkthrough at 375×812, 360×740 and 1280×800 with touch emulation, a reduced-motion pass, a Slow-3G cold start, and a 4× CPU-throttled scroll check. All screenshots referenced live in `design/vision/shots/`. Companion deliverables: `EXECUTION-BACKLOG.md` (the hand-off plan), `QA-PROCESS.md` (the gate doctrine).*

---

## (a) Executive verdict

**Today the app is a 5.2/10 experience sitting on 9/10 bones — and the gap is no longer "add motion." Phases 0–2 largely won the interaction-feel battle. What separates LevelUp from Family/Amie/Opal/Netflix-mobile now is: the first 10 seconds, the data layer that makes every screen feel slow, the money moment that doesn't dress up, the total absence of re-engagement, and roughly two hundred small craft violations that individually read as "template" and collectively cap the ceiling.**

The strategy's north star — *a private screening room, not a SaaS dashboard* — is correct and partially real: the login welcome (`shots/login_real_m375.png`), the 404 (`shots/notfound_m375.png`), the offering hero (`shots/offering375_seg0.png`) and the completion arc are already the best-in-class register. The job from here is to make the *rest of the app* deserve those screens.

### Scorecard (juror mode, screenshot-cited)

| # | Dimension | Score | The one-line reason |
|---|---|---|---|
| 1 | First impression / cold start | **3.5** | On Slow-3G the user stares at pure black for 24+ seconds — no wordmark, no skeleton, nothing (`shots/slow3g-home_t3000.png`, `t10000`, `t24000`). Splash hand-off is uncoordinated (`launchAutoHide:true`, zero `SplashScreen.hide()` calls). |
| 2 | Navigation & spatial model | **6** | Tab-bar pill + push slide are good; but back is an instant cut, no route exits (PageMotion is a keyed CSS swap, no `AnimatePresence`), no shared elements, Learn remounts its whole child per segment switch. |
| 3 | Motion & interaction feel | **6.5** | Spring press is shipped app-wide (button.tsx/SurfaceCard) — but half the surfaces still run legacy `.pressable`/`.card-hover`, `PopularCommunity` cards are dead `<div>`s, StudentLayout's two hand-rolled overlays pop out with no exit. |
| 4 | Visual design & depth | **6** | The token system and hero register are real; undermined live by the parked greeting band occluding content on every Home frame (`shots/home375_seg1/2/5/7.png`), letterboxed cohort art (`shots/home375_seg2.png`), ~75 off-palette raw-Tailwind color hits, two toast systems mounted at once. |
| 5 | Content presentation | **5.5** | Offering page is strong (`shots/offering375_seg0–2.png`); catalog is a 6,500px single-column monotone of identical cards; strike-price renders "₹4, 999" with a broken gap (`shots/offering375_seg0.png`); chapter tabs are unlabeled icons (`shots/chapter_m375_tab-Notes.png`). |
| 6 | Progress & emotional systems | **5.5** | The phase-2 completion arc + ProgressRing + momentum line ("LESSON 1 OF 15 · 0% COMPLETE", `shots/chapter_m375_top.png`) are genuinely sophisticated; but Home doesn't know a zero-state user, MyCourses stats pop in unskeletoned, certificates are a bare canvas PNG. |
| 7 | Speed (perceived + actual) | **4** | ~25+ uncached Supabase queries per Home open (7 sections on raw `useEffect`); every route gated on a `users`-table round-trip in AuthContext; no query persistence; render-blocking Google-Fonts `@import` at `src/index.css:1`. Throttled scroll itself is clean (16.7ms avg frame at 4× CPU — the motion budget is working). |
| 8 | Utility & retention hooks | **3.5** | Zero push infrastructure, zero offline caching, no global search (only a mid-page catalog filter), no native share, notifications die when the app closes. The product has no way to call a student back. |
| 9 | Platform-native feel | **5** | Haptics doctrine, FLAG_SECURE, fullscreen-video chrome client, iOS edge-swipe — all present. Missing: `@capacitor/keyboard` (documented in-repo as the keyboard-jank cause), predictive back opt-in, dynamic StatusBar, `navigator.share`, and the iOS DRM gap. |
| 10 | Accessibility | **6** | Reduced-motion discipline is exemplary and ARIA-tabs patterns exist; but 232 instances of 10–11px text, 51 sub-44px touch targets, placeholder-only form labels, NotificationDropdown with no Esc/focus-trap. |

**Overall: 5.2/10.** (For calibration: phase-0's audit called the pre-revamp app "6/10 with 9/10 bones" scored generously on structure; scored as a juror against Family/Opal/Airbnb, with cold start and retention on the card, today's honest number is 5.2 — motion up, everything the phases haven't touched still dragging.)

### The 5 moves that matter most

1. **Open like a screening room, not a buffering TV (Phase 6).** Kill the black-void cold start: self-hosted fonts, coordinated splash→skeleton hand-off, a persisted query cache so a returning student sees *their* Home (stale-while-revalidate) in under a second, and one data layer (react-query everywhere) instead of 25 popcorn queries. This single phase moves scores #1, #7 and half of #6.
2. **The money moment gets the money treatment (Phase 3).** The Pay button — the highest-intent tap in the company — is a plain white default button while marketing CTAs are champagne. Champagne pay bar, tabular numerals across every price, a receipt that assembles itself, a ThankYou with a haptic payoff. This is the one phase with a direct revenue KPI.
3. **Finish the one motion grammar (Phases 4–5).** Kill the second press system (`.pressable`/`.card-hover` legacy), give the last two hand-rolled overlays exits, adopt vaul for every sheet, unify on ONE toast system, ONE EmptyState, ONE skeleton. Coherence — not more animation — is what reads as world-class.
4. **Give the product a voice that calls you back (Phase 8 — RAHUL DECISION).** Push notifications for the moments that already exist as in-app notification types (session starting, application accepted, instructor replied), deep-linked; native share for certificates. Retention is currently structurally impossible.
5. **The two-hundred-cut craft sweep (Phase 5).** Token-police the ~75 off-palette colors into a semantic status map, 44px floor everywhere, one microcopy voice (the error layer currently speaks SaaS: "Failed to send a request to the Edge Function" is user-visible in the player — `shots/chapter_m375_top.png`), fix the letterbox heuristic and the parked-greeting occlusion.

---

## (b) Per-screen findings

Severity scale: **S1** breaks trust/task · **S2** visibly undermines premium feel · **S3** craft debt · **S4** polish.

### Cold start (all platforms)
| Sev | Finding | Evidence |
|---|---|---|
| S1 | Slow-3G first visit: pure black at 3s, 10s, 16s, 24s. No wordmark, no progress. Dev-server caveat (unbundled module graph) inflates the absolute number, but the mechanism ships to prod: `src/index.css:1` is a render-blocking `@import url('https://fonts.googleapis.com/…')` chained *inside* the compiled CSS, and no pixel paints until CSS + the 534KB entry JS arrive. The inline `index.html` style only guarantees the black is brand-colored. | `shots/slow3g-home_t3000/…t24000.png` |
| S1 | Returning user sees up to four visual states before content: native splash → dark gap → `RouteFallback` skeleton (auth gate awaits a `users` round-trip, `AuthContext.tsx:161-222`) → `HomeFeedSkeleton` → sections popping in one by one. Two different skeletons and a fetch storm. | code + `shots/home_m375.png` |
| S2 | `SplashScreen.hide()` never called (`launchAutoHide:true`) — the app can't hold the splash through JS boot; manifest `background_color #000000` disagrees with the `#0a0a0a` used by splash/canvas/theme-color. | `capacitor.config.ts:65`, `public/manifest.webmanifest` |

### Login / Onboarding
| Sev | Finding | Evidence |
|---|---|---|
| — | **The welcome layer is the app's best screen.** Cinematic hero, serif-italic accent, champagne CTA — keep as the register benchmark. | `shots/login_real_m375.png` |
| S3 | Instructor-proof line truncates mid-word at 375px ("Design Leads, Industry Edito…"); avatar strip crops at the fold. | `shots/login_real_m375.png` (bottom) |
| S3 | OTP resend / email-fallback / back controls are `h-9` (36px), below the 44px floor (`OtpEntryStep.tsx:190-228`); no per-digit haptic tick. | code |
| S3 | Signup has no welcome layer — a slim strip + form, visibly poorer sibling of Login (`Signup.tsx:367-400`). CraftPicker imagery is hotlinked Unsplash (external CDN on the signup path, `CraftPicker.tsx:26-63`). | code |

### Home
| Sev | Finding | Evidence |
|---|---|---|
| S1 | **The parked greeting band occludes content on every scroll frame.** Under coarse-pointer at 375 AND 360, "Good evening, Rahul" parks full-size (~140px incl. band) ~90px from the top and card content slides beneath it, sliced mid-glyph with a hard edge — permanently costing ~17% of the viewport. Whether this is the intended park or the coarse-pointer fallback misfiring, as shipped it reads broken. It also persists identically under reduced motion. | `shots/home375_seg1.png`, `seg2`, `seg5`, `seg7`, `rm-home_m375_scrolled.png` |
| S2 | Cohort-card letterboxing is back via the logo heuristic: `CatalogCard.tsx:114-122` routes live-cohort thumbnails to `object-contain`, so the wide "Video Editing Academy" banner floats letterboxed inside its card. The heuristic (cohort ⇒ square logo) misclassifies wide art. | `shots/home375_seg2.png`, `shots/rm-home_m375_scrolled.png` |
| S2 | ~25+ uncached queries per Home open; `YourWeek`/`ContinueLearning`/`UpcomingSessions` each independently re-fetch the same enrolment→courses→progress chain (`src/components/home/*.tsx`); sections pop in with no skeleton (CLS). | code |
| S2 | `PopularCommunity` tiles are non-interactive `<div>`s — content you cannot open (`PopularCommunity.tsx:32-45`). | code |
| S3 | `UpcomingSessions` date chip + "Join" pill are `--accent-amber` — an off-discipline second CTA color on the marquee screen (`UpcomingSessions.tsx:121-138`); Razorpay modal theme is hardcoded `#F5F1E8` (not a token) in 4 files. | code |
| S3 | Catalog = identical full-width cards for 6,500px; one violet section bar + white filter pills (`shots/home375_seg1.png`) vs cream pills elsewhere — two segmented-control languages. | `shots/home375_seg1.png` |

### Learn / MyCourses / CourseDetail
| Sev | Finding | Evidence |
|---|---|---|
| — | Learn's empty state (serif headline + mini-catalog below) is the right pattern (`shots/learn_m375.png`). | |
| S2 | CourseDetail loads behind a full-page spinner (`CourseDetail.tsx:370-378`) — the only top-level student screen still spinner-gated; network errors fall through to "Course not found" (mislabeled failure, `:157-168`). | code |
| S2 | CourseDetail "Continue Learning" is a plain white pill — the resume moment doesn't carry the champagne register. | `shots/course-detail_m375_seg0.png` |
| S3 | Learn segment switches unmount+remount the child page, re-firing full waterfalls (`Learn.tsx` AnimatePresence `mode="wait"` around conditional pages). MyCourses stats/WeeklyStats gated on `!loading` → pop-in (`MyCoursesPage.tsx:274`). Chapter rows `min-h-[40px]` (`CourseDetail.tsx:587`). Old serif EmptyState here, patterns EmptyState elsewhere. | code |

### ChapterViewer (the screening room, phase-2 in flight)
| Sev | Finding | Evidence |
|---|---|---|
| — | Momentum UI ("LESSON 1 OF 15 · 0% COMPLETE" + ring), champagne Mark-complete, staged completion arc with a single body-lock owner, notes autosave with flush-on-unmount — this is award-grade engineering. | `shots/chapter_m375_top.png` + code |
| S1 | Player failure surfaces a raw technical string to students: "Failed to send a request to the Edge Function" + Retry. (Captured via localhost CORS, but the copy path is real for any edge-fn failure.) The single most watched surface has the app's worst sentence. | `shots/chapter_m375_top.png` |
| S2 | The sidebar tab strip is icon-only (play/pencil/info/file/?) — Q&A vs Overview vs Files is a guess. Labels exist at desktop widths only. | `shots/chapter_m375_tab-Notes.png` |
| S2 | Built-but-unwired primitives: `ChapterNotes` (timestamped notes with [MM:SS] jump chips), `MomentsList`, `ResumePill`/`AutoAdvanceCountdown` exist as finished components with zero imports — the Notes tab ships a plain `<Textarea>` instead. | code (grep) |
| S3 | Episode dot-strip renders 15 ~10px dots that crowd and clip against the Next button at 375px; `QuizBlock` is entirely off-token (emerald/rose raw Tailwind, `QuizBlock.tsx:128-182`); top-bar "Completed" pill uses raw `text-emerald-500` while its twin 100 lines later uses the token (`ChapterViewer.tsx:1183` vs `:1290`); article/fallback media icons are emoji (`ChapterMediaPlayer.tsx:268,277`). | `shots/chapter_m375_top.png` + code |

### PublicOffering / Checkout / ThankYou (the money path)
| Sev | Finding | Evidence |
|---|---|---|
| — | Offering hero + sticky pay bar + info chips are the strongest commercial surface (`shots/offering375_seg0.png`, `seg2`). | |
| S1 | **Checkout's Pay button is a default white Button; StickyPayBar likewise** (`CheckoutPage.tsx:858-880`, `StickyPayBar.tsx:56`) — the emphasis hierarchy inverts exactly at the point of payment. | code |
| S2 | Strike price renders "₹4, 999" (broken gap — `font-mono` formatting artifact) beside the ₹1,499 hero price; prices are non-tabular everywhere except the checkout receipt. | `shots/offering375_seg0.png` |
| S2 | ThankYou celebration has confetti but **no haptic on arrival** (`hapticNotification("success")` only fires on invoice-share); its CTA is solid cream, not champagne; "Enhance Your Learning / Special offers just for you" breaks the voice. | code |
| S3 | Checkout loading is a spinner ("Loading secure checkout…") vs the offering's structured skeleton; coupon-remove target is 24px (`CheckoutPage.tsx:732`); guest phone field is a hand-rolled +91 prefix, not the app's PhoneInput; FAQ accordion cuts open/closed with no height animation (`PublicOffering.tsx:941-945`); TrustPanel stars/checks are raw `yellow-400`/`emerald-500`. | code |
| S1* | *Guard, not defect:* `ApplicationStatus.tsx:319,337` deliberately uses `isIOS()` (not `isNative()`) so Android staged-cohort payments keep working. Any "normalization" here breaks revenue. Documented in the backlog as a DO-NOT-TOUCH. | code |

### Community / Events / Profile
| Sev | Finding | Evidence |
|---|---|---|
| — | Community's serif hero ("Talk to *your* people") and prompt-chip empty state are on-register. | `shots/community375_seg0.png` |
| S2 | Community is a static feed: plain-div post cards (no press), `text-red-400` like / `text-amber-400` mute, 32px scope-toggle pills in a *white* active style (third segmented-control language), disabled Post button renders muddy brown. | `shots/community375_seg0.png` + code |
| S2 | Profile is clean but brandless — no serif, no cream moments; InitialsAvatar assigns an off-palette red gradient; invoice "Paid" badge raw emerald here, tokenized in the sheet (`ProfilePage.tsx:842` vs `InvoiceDetailSheet.tsx:138`); change-password section shows for OTP-only accounts that have no password. | `shots/profile375_seg0.png` + code |
| S3 | EventDetail register CTAs are a fourth idiom (mono-uppercase cream blocks, `EventDetail.tsx:338-356`); events "Registered" badge raw green; notification dropdown has 10 badge colors, none tokens, no Esc-close/focus-trap. | code |

### System states, notifications, platform
| Sev | Finding | Evidence |
|---|---|---|
| — | The 404/SystemState is the most on-brand surface in the app — grain + serif + single cream action ("We lost the reel"). It proves the register; the error/empty layer elsewhere just doesn't use it. | `shots/notfound_m375.png` |
| S1 | No push infrastructure of any kind (no FCM/APNs/plugin/web-push); realtime notifications die when the app closes. No re-engagement loop exists. | code (grep-verified) |
| S2 | `@capacitor/keyboard` absent — the in-repo config comment names it as the cause of keyboard viewport jank (`capacitor.config.ts:79-84`); no Android `windowSoftInputMode`; no predictive-back opt-in; StatusBar style is static; no `navigator.share` anywhere (certificate sharing = window.open intents only). | code |
| S2 | Offline = cosmetic banner only; no service worker, no query persistence — native shell boots offline into empty states. | code |
| S3 | Two toast systems mounted simultaneously (Sonner + Radix, `App.tsx:289-290`, 34 files on the Radix API); `vaul` installed with zero consumers; `backdrop-blur-xl` on always-mounted chrome (header/tab bar/FloatingSupport/NotificationDropdown) — the single heaviest compositing risk class on mid-range Android. | code |

### Throttled-scroll + reduced-motion (live measurements)
- 4× CPU throttle, programmatic flick-scroll: Home avg frame 16.7ms, 0 jank frames; Offering avg 16.7ms, 1 frame >32ms. **The transform/opacity budget is holding** (emulated Chromium; real-device confirmation still required per CLAUDE.md).
- Reduced-motion: choreography collapses correctly app-wide; the parked greeting occlusion persists (it's positional, not animated); 4 elements >40px tall computed at `opacity:0` on Home under reduce — likely inactive carousel slides, but the gate should assert none are content (see QA-PROCESS).

---

## (c) Gap analysis vs the world-class bar

Each gap names the reference pattern, then LevelUp's version — extending the existing brand (pure black, champagne/cream, Instrument Serif italic, calm luxury), never fighting it.

1. **Opal's "app opens into your ritual" / Netflix's billboard-first cold start → "The Curtain."** Reference apps paint identity in frame one and personal state by second one. LevelUp's version: native splash holds (explicit `hide()`) until React's first paint; the first paint is a *branded* shell (wordmark + greeting skeleton in the exact final geometry); a persisted query cache hydrates last-known Home instantly, then revalidates silently. The serif greeting becomes the first thing that ever renders — the curtain rising, not a loading state.
2. **Airbnb's shared-element card→detail → "Continuity, honestly scoped."** True cross-route `layoutId` needs route-architecture work (the router unmounts the source tree — already flagged in phase-1). LevelUp's version until then: the offering hero's scale-settle entrance keyed off the *same artwork* the card showed (perceptual continuity), plus route-level `AnimatePresence` so the outgoing screen fades/settles instead of vanishing. Full shared elements become a Phase-9+ architecture decision, not a hack.
3. **Amie/Family's sheet physics → "Everything that interrupts, slides."** vaul is already installed. Invoice detail, notification center (mobile), share moments, chapter notes on mobile — all become drag-dismissable sheets with spring settle and background scale-down. One overlay physics for the whole app.
4. **Opal's session ring / Duolingo's progress legibility (calm register) → "The needle always moves."** The phase-2 ring arc is the seed. Extend: Your-Week ring animates on every Home arrival from cache→fresh delta; MyCourses stats become CountUp stat cards; a *weekly consistency* line ("3 weeks of showing up") in serif — Duolingo's legibility, zero fire emoji (RAHUL DECISION).
5. **Netflix's image discipline → "No pixel arrives naked."** ArtworkImage everywhere (raw `<img>` still lives in UpcomingEvents/Profile/certificates), the cohort-logo heuristic replaced by *blurred-cover-backdrop + contained logo* (the poster-wall pattern — logo never crops, frame never letterboxes), and a blur-up LQIP step added to ArtworkImage (it currently only opacity-fades).
6. **Arc's spring vocabulary → "One grammar, zero dialects."** The springs exist (`snap/glide/bounce`) and are half-adopted. The gap is the *dialects*: `.pressable` CSS presses, `.card-hover` lifts, white/cream/mono-uppercase competing active states. The fix is finishing adoption + deleting the legacy classes from call sites (Phases 4–5 tasks), then the token-police gate keeps it dead.
7. **Apple's error-as-care (and LevelUp's own 404) → "Failure in the brand's voice."** SystemState already proves it. Every hand-rolled `WifiOff` block, the player's edge-function string, the "Something went wrong, please try again" toasts — all route through one ErrorState/SystemState register with warm copy and a real retry.
8. **WhatsApp-class re-engagement for an Indian audience → "The app can tap your shoulder."** Session-starting, application-accepted, instructor-replied pushes with deep links. This is the single biggest retention lever the codebase structurally lacks (RAHUL DECISION: scope to transactional only — calm luxury extends to notifications: no streak-guilt, no marketing blasts v1).
9. **Spotify Wrapped's shareable moments → "Certificates as social objects."** The canvas PNG exists; add `navigator.share`/Capacitor Share with a designed share card (black, grain, serif, student name in champagne) — organic acquisition from the proudest moment in the funnel.
10. **iOS/Android platform manners → "The shell disappears."** Keyboard plugin (`resize: native`), predictive-back opt-in, dynamic StatusBar over the player/fullscreen, safe-area already solid. These are table stakes for "native feel" scores above 7.

---

## (d) The phase plan

Phases 0–2 stand as shipped/in-flight. Phases 3–5 below are **deepened with real specs**; 6–10 are **new**. Full task-level specs, file ownership, tiers, dependencies and lanes: `design/vision/EXECUTION-BACKLOG.md`. Sequencing note: Phase 6 (cold start/data layer) is deliberately scheduled straight after the money pages — it is the highest score-mover and everything later (offline grace, instant warm opens) builds on it. Phases 7–10 can flex order against business needs.

| Phase | Name | One-line goal | Tasks | Headline KPI |
|---|---|---|---|---|
| 3 | The money pages | The purchase path carries the strongest treatment in the app | 9 | Checkout→payment conversion (instrument first — RAHUL DECISION on PostHog) |
| 4 | Tactility & sheets | Every interruption slides; every stat counts up; legacy press system dies | 10 | Zero `.pressable`/`.card-hover` on student surfaces |
| 5 | Hardening & the two-hundred-cut sweep | One voice, one toast, one empty state, 44px floor, token police | 8 | Gate greps return zero; first production-promotion candidate |
| 6 | The curtain (cold start & data layer) | Returning users see their Home < 1s; first paint is branded at any network speed | 8 | p75 cold-start-to-content; Home query count 25+→≤6 |
| 7 | The first act & brand moments | Login→onboarding as cinema; every error/empty state in the brand voice; screening-room leftovers wired | 7 | New-user activation to first lesson |
| 8 | Re-engagement (RAHUL DECISION) | Push + deep links + native share — the app can call you back | 5 | D7 return rate; session-join rate |
| 9 | Discovery & a living community | Real search, denser catalog browsing, community that feels inhabited | 6 | Catalog→offering CTR; community DAU |
| 10 | Platform polish & quality of light | Keyboard, predictive back, status bar, offline grace, elevation/glow pass, (sound — RAHUL DECISION) | 8 | Native-feel review pass on device matrix |

**Standing RAHUL DECISIONS carried in the backlog** (each has a default recommendation): PostHog conversion instrumentation (recommend YES), weekly consistency streak (recommend YES, calm register), push notifications (recommend YES, transactional-only v1), sound design (recommend PARK), Learn-tab remount fix via persistent mounting (recommend YES — it's also a data-cost fix).

---

## (e) What I would NOT do

Fashionable, and wrong for this brand/audience:

1. **No light mode.** The screening room is dark. Half the perf budget and all of the depth system assume it.
2. **No custom cursors, no cursor-following blobs** (also a standing user red-line for LevelUp web properties).
3. **No dopamine-casino gamification** — fire streaks, XP, leagues, confetti-per-tap. The consistency mechanic, if greenlit, stays in the calm serif register ("3 weeks of showing up").
4. **No trendy-serif folio rebrand / bento-grid restyle.** Instrument Serif italic is an *accent*, not a display system; the brand's power is restraint. (This is also Rahul's explicit AI-slop test.)
5. **No Lottie/Rive or any new animation runtime.** framer-motion + CSS is sufficient and already in the bundle; a second runtime is bundle weight and a second grammar.
6. **No skeleton-shimmer-everywhere.** Persisted cache + stale-while-revalidate beats better spinners; skeletons are for true first loads only.
7. **No urgency dark patterns on the money pages** — fake countdowns, "3 people are viewing". Calm luxury converts on trust; the guarantee/refund line is the brand's pressure valve.
8. **No bottom-sheet-ification of primary navigation.** Sheets are for interruptions and details; the tab bar + push stack stays the spatial model.
9. **No marketing push blasts in v1 of notifications.** Transactional only, or the permission grant (the scarcest resource on Android 13+/iOS) gets burned.
10. **No offline video downloads.** DRM (Widevine/FairPlay) makes it a quarter-scale native project; offline grace = cached UI + clear messaging, not media.
11. **No AI-concierge chat surface.** Out of register, out of scope, and the support path (WhatsApp FloatingSupport) already matches how this audience actually communicates.
12. **No admin restyle to match the student app.** The mono/amber terminal register is a *feature* — it keeps the two products visually unconfusable.

---

*Deliverables: this report · `design/vision/EXECUTION-BACKLOG.md` (61 execution-ready tasks) · `design/vision/QA-PROCESS.md` (gate doctrine). Screenshots: `design/vision/shots/` (96 captures). Live-run artifacts (console errors, FPS numbers, link harvests) were generated fresh on this branch, 2026-07-07; localhost-only artifacts (401 under dev bypass, VdoCipher CORS) are flagged where cited and are not app defects.*
