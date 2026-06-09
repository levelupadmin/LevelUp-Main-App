# LevelUp × Mobbin — cross-industry design audit (2026-06-10)

Every student-facing screen, benchmarked against best-in-class apps from ANY industry. Each reference links to the Mobbin screen. Grounded in the actual code (file reads per domain).


## Auth & Onboarding

**Today:** Login.tsx (post 2026-05-30 redesign) is already decent: full-bleed cinematic hero ("Make your first film."), glass form card, 2-step phone→OTP with WhatsApp/email fallbacks, mono-uppercase step divider, star-rating social proof. Signup.tsx mirrors it but front-loads a 3-field form (name + phone + email) before any value is shown. Weaknesses grounded in the code: (1) zero onboarding — handleVerify navigates straight to /home after setSession, no personalization question, no instructor-preview moment, no "preparing your experience" beat; (2) Signup demands 3 fields + formValid gate upfront — highest-friction possible start for ad traffic; (3) on the OTP step the hero collapses to an 18vh strip and the glass card sits on flat canvas, so the most anxious moment of the flow is also the least branded; (4) social proof is a generic 5-star row when the actual asset is celebrity instructor faces (Lokesh, Nelson, Ravi Basrur); (5) the phone step wraps a single input in heavy card chrome instead of letting the question breathe directly on the near-black canvas like the best fintech auth.

### References
- **Tesla Robotaxi** — Full-bleed cinematic still, centered wordmark, one champagne-gradient pill (Sign In) + ghost pill (Create Account) — the entire screen is a brand moment before any form appears.
  - *Apply:* Make /login first paint exactly this: hero owns 100dvh with the LevelUp wordmark and the two pills floating at the bottom; the phone sheet only slides up on tap. Also steal the champagne gradient for btn-champagne — it reads more premium than a flat fill.
  - [Mobbin screen](https://mobbin.com/screens/2f18c671-56b9-4037-88b4-16b9e67693e0)
- **Revolut Business** — Phone entry on pure black: giant headline, flag+code inline in one borderless field, single high-contrast pill, keyboard already up — zero card chrome.
  - *Apply:* On the phone step, drop the glass-card wrapper and set the 'What's your number?' headline + PhoneInput directly on bg-canvas at hero scale. The card adds weight, not trust; Revolut proves bare-canvas reads more confident.
  - [Mobbin screen](https://mobbin.com/screens/226dfeb4-a377-4210-b9f7-50735708a157)
- **Eight Sleep** — OTP boxes float over the dimmed product photo (hero never disappears), with a live 'Resend code in 0:56' countdown and a disabled Continue until filled.
  - *Apply:* On the OTP step, keep heroCinematic full-bleed behind a darker scrim instead of collapsing it to h-[18vh] — the verify moment stays cinematic. Replace OtpEntryStep's resend affordance with a live mm:ss countdown chip.
  - [Mobbin screen](https://mobbin.com/screens/9df64111-d94d-4726-9932-a7b483d44261)
- **CRED** — OTP screen styled like a private membership document: mono-uppercase 'MEMBERSHIP APPLICATION' eyebrow, ultra-minimal boxes, monochrome Proceed — exclusivity through restraint.
  - *Apply:* Lean into the existing mono stepDivider: brand the OTP eyebrow (e.g. 'LEVELUP · VERIFYING +91 ·····321') and auto-submit the moment the 4th digit lands so the champagne CTA is a fallback, not a required tap.
  - [Mobbin screen](https://mobbin.com/screens/bcb35260-2096-48af-ac4b-5b64c4813dde)
- **Equinox+** — Dark luxury onboarding quiz — 'What are your main goals?' as 2-col selectable tiles with a slim progress bar (2 of 5) and Skip; selection feels like styling a membership, not filling a survey.
  - *Apply:* Add the missing post-OTP onboarding: after handleVerify succeeds, route to one Equinox-style screen — 'What do you want to make?' (Direction / Editing / Photography / Storytelling tiles, multi-select, Skip) — write to profiles and use it to reorder the /home rails.
  - [Mobbin screen](https://mobbin.com/screens/6bf8f742-662f-4008-8951-f7b9138b03dc)
- **Skillshare** — Topic tiles backed by real class imagery, then an immediate 'Hang on while we personalize your homepage' sheet — selection visibly pays off in seconds.
  - *Apply:* For LevelUp's version of that screen, back the tiles with instructor stills (Lokesh, Nelson, Ravi Basrur, DRK Kiran) so users pick mentors, not abstract topics — then show a 1.5s 'Setting up your craft journey' interstitial (serif-italic cream on black, Artsy-style) before landing on /home.
  - [Mobbin screen](https://mobbin.com/screens/a447647c-5231-46c4-8087-5aae4992c17c)

### Quick wins
- Auto-submit the OTP when the 4th digit is entered (and ensure autocomplete="one-time-code" / WebOTP autofill is wired in OtpEntryStep) — CRED/GOAT pattern, removes one tap at the highest-drop-off moment.
- Replace the resend link with a live countdown chip ('Resend in 0:28') that converts to an active button at zero — Eight Sleep/Opal pattern; sets expectation and cuts duplicate-OTP spam.
- Swap the generic 5-star social proof row for a 'Learn from' strip of 3-4 tiny instructor portraits + names under the phone card — celebrity faces are the brand's real trust signal and the assets already exist.
- Give btn-champagne a subtle vertical gradient (Tesla Robotaxi's gold pill) and add a soft glow on focus — one CSS change that upgrades every auth CTA.
- Stop collapsing the hero to 18vh on the OTP step: keep it full-bleed behind a heavier from-canvas scrim so the verify moment stays cinematic while the keyboard is up.
- Mask the phone number in the OTP subhead as +91 ····· ··321 (Revolut/Coinbase convention) — reads more secure and confirms the number at a glance.

### Bigger bets
- Post-OTP onboarding flow (the biggest gap — today handleVerify goes straight to /home): 2 screens max — (1) 'What do you want to make?' instructor-still tiles (Equinox+/Skillshare hybrid), (2) experience level — then an Artsy-style 'Setting up your craft journey' interstitial. Persist to profiles, reorder /home rails by chosen craft, and Skip always visible.
- Phone-first signup: kill Signup.tsx's 3-field upfront form. One unified entry — number → OTP → then collect name + email as the first onboarding step after the session exists. Requires reworking verify-msg91-otp's signup_requires_email_and_name path (provisional session or deferred profile completion), but it converts ad traffic the way Revolut/CRED do.
- Welcome screen V2: split /login into a full-bleed brand moment (Tesla Robotaxi pattern) using a slow Ken Burns pan or a muted 5s loop cut from existing masterclass footage, wordmark centered, 'Sign in' / 'Create account' pills at the bottom; the phone sheet slides up as a bottom sheet on tap. First-touch ad arrivals get cinema before they get a form.

## Home / Dashboard

**Today:** Home (src/pages/Home.tsx) stacks HeroCarousel + HeroWelcome + 6 self-fetching sections (ContinueLearning, PopularCommunity, UpcomingEvents, UpcomingSessions, BrowsePrograms, NewMembers), each rendered as the same horizontal snap-scroll row of ~78vw rounded-2xl surface cards. HeroWelcome is already strong: a cinematic full-bleed resume hero with gradient scrim, "Lesson X of Y", progress bar and a champagne Play CTA. Weaknesses found in the code: (1) duplicate resume signal — the hero and the first ContinueLearning card are usually the same course, and ContinueLearning is not ordered by recency (courses come back in arbitrary courseIds order, not last-touched); (2) the greeting + date + member number only render in the fallback cream card for users with zero progress — active users are never greeted by name; (3) every section uses an identical Section title + identical card shape, so the page reads as a uniform list-of-lists with no rhythm or "today" anchor; (4) ContinueLearning progress copy is "{pct}% complete" and the progress bar is hidden at 0% and 100%, while the Play affordance is hover-only (invisible on touch, the primary platform); (5) sections fetch independently so skeletons pop in staggered; no streak/momentum or daily-pick element gives a reason to open the app daily.

### References
- **Netflix** — 'Continue watching for Sam' — name-personalized row title, always-visible progress bar under every thumbnail, always-visible play glyph and a per-card options button.
  - *Apply:* Rename the Section title to 'Continue watching for {firstName}', keep the cream progress bar visible whenever pct > 0 (not just 0<pct<100), and make the Play glyph always visible on artwork instead of hover-only — hover never fires on Capacitor touch devices.
  - [Mobbin screen](https://mobbin.com/screens/8e17cb66-fcc6-42a0-93a3-ddf1987419e7)
- **Apple TV** — Compact metadata chip rendered ON the artwork ('S1, E1 · 33m' next to a play glyph) so resume state reads at a glance without body text.
  - *Apply:* Move ContinueLearning's resume metadata onto the thumbnail as a small bottom-left chip ('Lesson 4 of 29 · Resume') over the existing gradient strip — the card body then only needs title + instructor, tightening card height.
  - [Mobbin screen](https://mobbin.com/screens/931b5699-9252-47cc-a9fb-324326addf72)
- **MasterClass** — Continue Watching framed with encouraging subcopy ('You're doing great. Pick up where you left off.') and remaining-work framing ('16 Lessons Left') instead of percent.
  - *Apply:* ContinueLearning already computes total and completed chapters — swap '{pct}% complete · Resume' for '{remaining} lessons left' and add a one-line warm subline under the section title. Percent feels corporate ed-tech; lessons-left feels human.
  - [Mobbin screen](https://mobbin.com/screens/af98bea0-973a-41dc-bd84-65327fae90ca)
- **Open** — Full-bleed atmospheric dark hero with 'Good morning, {name}' floating at top and a dated daily pick ('Daily 12/07 — a new perspective, fresh every day') with a single glowing play button — premium, alive, zero clutter.
  - *Apply:* Overlay 'Good evening, {firstName}' (time-of-day aware) at the top of HeroWelcome's cinematic resume hero so active users get greeted too — today the greeting only exists in the zero-progress cream fallback. The mono date line can migrate up there as well.
  - [Mobbin screen](https://mobbin.com/screens/de590cd4-4006-4504-a451-7c5115348cfe)
- **Spotify** — Time-of-day greeting header over a dense 2-column quick-pick grid of 6 small resume tiles — one-tap re-entry to recent items before any editorial rows start.
  - *Apply:* Add a 2x2 quick-access grid under the hero: last-watched course, next live session, community, latest workshop. On a 78vw-card home, reaching UpcomingSessions takes 4+ swipes; this puts every 'jump back in' destination one tap from paint.
  - [Mobbin screen](https://mobbin.com/screens/9967d66e-2f3d-41c2-9941-bf28c88b16fb)
- **HBO Max** — Rows broken up by a giant typographic editorial module ('TOP 10 SERIES TODAY' in oversized display type) so the home feels curated rather than a stack of identical rails; plus a 'Removed from Continue Watching' undo toast.
  - *Apply:* Insert one full-bleed typographic breaker between ContinueLearning and BrowsePrograms (e.g. 'NEW THIS WEEK' or the next cohort deadline in oversized serif with champagne numerals) and vary card shapes per section — portrait posters for masterclasses, wide cards for events — so the 6 rows stop reading as the same component repeated.
  - [Mobbin screen](https://mobbin.com/screens/9268f63c-845b-4db1-96aa-6b71cbc4fe4e)

### Quick wins
- Order ContinueLearning by last-touched: derive max(updated_at) per course from the chapter_progress rows already fetched and sort courses by it, and skip the course already featured in HeroWelcome so the hero's course is not duplicated as card #1 (src/components/home/ContinueLearning.tsx).
- Make the Play glyph and progress bar always visible on ContinueLearning cards (remove the opacity-0 group-hover gate; show the bar whenever pct > 0) — touch devices never see hover states.
- Swap '{pct}% complete · Resume' for '{n} lessons left' (data already computed) and personalize the row title to 'Continue watching for {firstName}' with a warm one-line subline, per MasterClass/Netflix.
- Add the time-of-day greeting ('Good evening, {firstName}' + mono date) overlaid at the top of the cinematic HeroWelcome hero so engaged users get greeted, not just zero-progress users (src/components/home/HeroWelcome.tsx).
- Move resume metadata onto the artwork as an Apple TV-style chip ('Lesson 4 of 29') over the existing bottom gradient, shortening the card body.

### Bigger bets
- Spotify-style quick-access 2x2 grid directly under the hero (last course, next live session, community, latest workshop) — collapses 4+ swipes of horizontal rails into one-tap re-entry; each tile is a small thumbnail + label on bg-surface.
- Editorial rhythm redesign: stop rendering 6 identical Section rails. One HBO Max-style full-bleed typographic breaker (e.g. 'NEW THIS WEEK' or cohort application deadline in oversized serif), portrait poster cards for BrowsePrograms masterclasses, wide cards for events, compact list for sessions — the variation is what makes a home feel curated and alive instead of a list.
- A 'Today on LevelUp' daily layer (Open/Headspace pattern): one dated daily pick — a hand-chosen lesson, a live session happening today, or a community thread — plus a lightweight learning-streak chip. Gives students a reason to open the app on days they don't plan to binge a course.
- Unified home loader: a single Supabase RPC/edge function returning hero + continue-learning + sessions in one round trip, replacing 6 independent fetch waterfalls — kills the staggered skeleton pop-in, enables cross-section dedupe and recency ranking globally, and makes first paint feel instant on Indian mobile networks.

## Browse & Discovery

**Today:** BrowsePage.tsx (src/pages/BrowsePage.tsx) has a text-only editorial hero (eyebrow + serif-italic headline, lines 219-229), a single search input, 5 wrap-around text filter chips, then tier sections (Mentorship Cohorts / Masterclasses / Programs / Workshops) rendered as uniform grids with a thin accent-bar + heading + count header. Cards are well-engineered (stretched-link, wishlist, notify-me, platform-gated pricing) but visually overloaded: tier badge + Popular badge + Coming Soon + rating + enrolment label + description + mono duration + price/MRP/save% + CTA pill all stacked in one card. Weaknesses: (1) the page opens with zero imagery — no featured/hero content despite 7 celebrity masterclasses to show off; (2) every tier gets identical card treatment and visual weight, so flagship masterclasses and Rs-cheap workshops read the same; (3) duration/lesson metadata is buried as body text instead of on the artwork; (4) filter chips are plain text with no counts, no icons, no scroll affordance; (5) no results-count feedback when filtering/searching; (6) live-cohort logo thumbnails get a contain-on-gradient patch rather than a designed treatment.

### References
- **MasterClass** — Large editorial cards on near-black with instructor portrait as the star and a single '26 lessons · 5h 41m' metadata pill overlaid on the bottom edge of the artwork — body text is just name + one-line topic.
  - *Apply:* Move duration_text (and lesson count if available) out of the card body (line 426-428) into a translucent pill on the thumbnail's bottom edge, and cut the body to title + instructor + price row. Instantly de-clutters every card while keeping the info.
  - [Mobbin screen](https://mobbin.com/screens/f1d860c4-82c2-40b9-aede-4af8afbc7fbe)
- **App Store** — Today-tab editorial hero: one full-bleed poster card with a mono eyebrow (PRE-ORDER), big headline over the art, and a footer strip inside the card holding the app identity + Get CTA.
  - *Apply:* Insert one featured card between the hero copy and search: full-bleed thumbnail of a flagship masterclass, mono eyebrow ('FEATURED' / 'NEW THIS WEEK') matching the existing tracking-[0.22em] eyebrow style, title overlaid, footer strip with instructor name + the existing View/Continue pill logic. Gives Browse the cinematic opening it currently lacks.
  - [Mobbin screen](https://mobbin.com/screens/36d3f02f-2677-4e10-b546-b2ff3647f0c0)
- **Spotify** — 'Browse all' 2-col category tiles on black — each tile is a flat accent color with the category name and a tilted artwork thumbnail peeking out of the corner; categories feel like destinations, not filters.
  - *Apply:* When activeFilter === 'All', render the four tiers as a 2-col tile grid under the search bar (tier accentColor from TIER_SECTION_CONFIG + a tilted course thumbnail from that tier); tapping a tile sets the filter / scrolls to the section. Far more premium entry points than the plain text chips at lines 241-256.
  - [Mobbin screen](https://mobbin.com/screens/f1c26c55-d843-4c9d-a9cb-4653f1449c05)
- **Nike** — Shop Jordan: full-width dark category bands (Clothing / Shoes / Accessories) with a subtle line-art texture and one product cutout per band, followed by an editorial seasonal banner — category nav that feels like art direction.
  - *Apply:* Upgrade the tier section headers (lines 291-295, currently a 1px accent bar + h2 + mono count) into slim full-width bands: tier accent tint, heading, one-line tier descriptor ('Application-only · live with the mentor'), and a representative cutout/portrait fading off the right edge. Also the right fix for the live-cohort square logos — set them into a designed band instead of the contain-on-gradient patch at lines 344-355.
  - [Mobbin screen](https://mobbin.com/screens/0820d42e-f652-473b-a68a-7026fc34c29b)
- **Netflix** — Pure poster grid with zero card chrome — the artwork carries 100% of the browsing decision; density without clutter on a black canvas.
  - *Apply:* Differentiate the workshop tier (already a 4-col grid at lines 296-301): drop description/rating/enrolment from workshop cards and go poster-first — artwork + title + price only. Cheap-tier items become a fast, scannable wall while masterclasses keep the rich editorial card, creating real hierarchy between tiers.
  - [Mobbin screen](https://mobbin.com/screens/6384f693-e128-4f1d-8578-6a54fec7621c)
- **MasterClass** — Library view: horizontally scrolling category chips with tiny icons + a separate FILTERS/CLEAR FILTERS row, above compact thumbnail-left list rows with 'New' badges on the artwork and 'Class · Arts & Entertainment' metadata lines.
  - *Apply:* Make the tier chips a single horizontal-scroll row (no wrap) with per-tier counts ('Masterclasses 7') and a Clear affordance that appears only when a filter or search is active — replaces the buried clear button inside the empty state (lines 278-285) with always-visible filter feedback.
  - [Mobbin screen](https://mobbin.com/screens/9edd1f71-7d9e-440c-a63f-10a877feb7a0)

### Quick wins
- Move duration_text into a translucent metadata pill overlaid on the thumbnail's bottom edge (MasterClass pattern) and remove it from the card body — one-line JSX move, big de-clutter.
- Convert the filter chips to a horizontal-scroll row with per-tier counts ('Masterclasses 7') and add a results-count line ('12 programs') above the grid whenever search or a filter is active, with an inline Clear chip.
- Trim workshop cards to poster + title + price (drop description, rating, enrolment label for that tier only) — the tier === 'workshop' branches already exist at lines 296-301 and 405-408, so it's a conditional render change.
- Move CourseRatingBadge onto the image as a small overlay next to the tier badge so the card body is purely title / instructor / price row.

### Bigger bets
- App Store Today-style featured hero card at the top of Browse: full-bleed poster of one flagship masterclass (rotating or admin-pinned via a featured flag), mono eyebrow, overlaid title, footer strip with instructor + the existing entitlement-aware CTA logic. This is the single biggest gap — the catalog of 7 celebrity classes opens with no imagery today.
- Spotify-style tier entry tiles: when 'All' is active, show a 2-col grid of four tier destination tiles (tier accent color + tilted course art) above the sections; tapping filters/scrolls. Turns the flat chip row into a designed discovery layer.
- Nike-style tier band headers: replace the accent-bar section headers with full-width art-directed bands (tier tint, descriptor line, instructor cutout fading off-edge) — also solves the live-cohort square-logo problem properly by designing the band around the logo.
- Tier-differentiated card system: rich editorial cards for masterclasses/cohorts, poster-wall density for workshops/programs — encode hierarchy of price and prestige into layout instead of rendering every tier with the same card.

## Offering page (sales/PDP)

**Today:** PublicOffering.tsx (/Users/rahulsrinivas/Claude/LevelUp-Main-App/src/pages/PublicOffering.tsx) is a single-column marketing page: HeroBanner (4:5 portrait image, eyebrow + title + serif subtitle over bottom gradient), HeroActions (price + strike MRP + Enrol/Apply CTA, Reader-Rule variants), InstructorCard, FreePreviewPlayer (lazy VdoCipher), Highlights grid, description, WhatYoullLearn thumbnail rail, Curriculum accordion, InstructorBio, AggregatedReviews, Testimonials, FAQs, final CTA card, and a mobile sticky price bar. Weaknesses: the hero is a static image with no play affordance (trailer is a secondary outline button below the fold, the actual player is mid-page); the StatStrip component holding the value facts (lessons, runtime, 4K, subtitles, lifetime access) exists in source but is no longer rendered anywhere, so format/value props never appear; trust signals (rating, review count) sit in AggregatedReviews near the bottom of a very long page; the Curriculum accordion is text-only and partially redundant with WhatYoullLearn; the rating is hardcoded 4.9/5; there is no section navigation for the long scroll; the sticky CTA shows price only with zero supporting context; and application-only cohorts get just a pill + external Tally link with no scarcity, dates, or status framing.

### References
- **MasterClass** — Full-bleed instructor portrait hero with name + 'Teaches Filmmaking', a primary Play Lesson 1 button and Watch Trailer link stacked directly under it, then Lessons/Overview tabs — action lives above the fold.
  - *Apply:* Put the play affordance in the hero itself: overlay a champagne play chip (reuse FreePreviewPlayer's circular Play button) on HeroBanner when freeChapter exists, and make 'Watch the free lesson' the visually primary action next to Enrol in HeroActions instead of a secondary outline button that scrolls mid-page.
  - [Mobbin screen](https://mobbin.com/screens/4e84db72-af9c-4b52-825a-b43afa9454b0)
- **MasterClass** — Lesson list as rich cards: numbered thumbnail + duration chip + 2-3 line description per lesson, dark cards on near-black — the curriculum itself sells production quality.
  - *Apply:* Merge WhatYoullLearn and the text-only Curriculum accordion into one MasterClass-style lesson list: each chapter row gets its thumbnail_url/vdocipher_thumbnail_url, mono duration chip, description, and the Free badge — the data is already in ChapterRow, only the row layout changes.
  - [Mobbin screen](https://mobbin.com/screens/3c32ecd1-3e42-4916-a916-2814eaf36cab)
- **Airbnb** — Trust capsule (4.99 stars | Guest favorite | 239 Reviews) pinned right under the title, plus a sticky bar that pairs price with a reassurance chip ('Free cancellation') so the CTA carries context.
  - *Apply:* Lift a compact 3-cell trust strip (rating · review count · 'Loved for clarity' tag) from AggregatedReviews to directly below HeroActions, and add a one-line reassurance under the sticky-bar price ('Lifetime access · {n} lessons') using the same data StatStrip already computes.
  - [Mobbin screen](https://mobbin.com/screens/1767a7ec-dc2b-4f56-b598-0b39ffb5e689)
- **Apple TV** — Inline metadata badge row (2022 · 30 min · 4K · Dolby Vision · CC · SDH) — dense format facts as tiny bordered badges in one line, cinematic not corporate.
  - *Apply:* Resurrect the unrendered StatStrip as an Apple-TV-style one-line mono badge row under the hero title block: '{lessons} lessons · {h}+ hrs · 4K · Subtitles · Lifetime' — far cheaper visually than the old 5-tile grid and it restores the missing value props.
  - [Mobbin screen](https://mobbin.com/screens/12d90f5a-7ec8-4348-b73c-fdcb95e8cb56)
- **DICE** — Premium dark event page with terse labeled sections (Event info / Lineup / Venue) and a sticky status footer ('You're going · 1x General Admission') that reflects the user's state, not just a buy button.
  - *Apply:* For tally_form_url cohort offerings, replace the bare 'Application-only' pill with a DICE-style info block: cohort start date, application deadline, seat count as labeled rows, and make the sticky bar state-aware ('Applications open · closes {date} — Apply for an invite').
  - [Mobbin screen](https://mobbin.com/screens/2e60a1c2-7122-4739-aed2-b7e28ef434d0)
- **Greg** — Waitlist confirmation with a 'Current Position' progress meter between Early Access and General Admission plus a rendered membership card — makes exclusivity tangible and status-driven.
  - *Apply:* Adapt for application-only cohorts: after the buyer taps Apply, show an in-app 'Application received' state with a position/review-window meter and a champagne 'member card' visual, instead of dead-ending into the external Tally tab with no return state.
  - [Mobbin screen](https://mobbin.com/screens/ea923f0d-d23c-4809-9c15-108442983b2f)

### Quick wins
- Render the lost value facts: convert StatStrip into a one-line Apple-TV-style badge row ('{n} lessons · {h}+ hrs · 4K · Subtitles · Lifetime access') placed under HeroBanner — the component and data already exist in the file, it just isn't mounted.
- Overlay the FreePreviewPlayer's circular play chip on HeroBanner when freeChapter exists, scrolling/auto-starting the preview on tap, so the fold has a play affordance like MasterClass.
- Move a compact trust strip (rating · '{n}+ students' · top tag) from AggregatedReviews to directly under HeroActions; keep the full block below as-is.
- Add a context line to the mobile sticky bar under the price: 'Lifetime access · {n} lessons' (or '{x}% off ends with code' when couponInfo is set) — Airbnb-style reassurance next to the CTA.
- Make WhatYoullLearn cards with make_free tappable to open the free preview (scroll + setPlaying), turning the passive rail into a conversion surface.
- For tally_form_url offerings, add cohort meta chips next to the 'Application-only' pill (next cohort date, application deadline, limited seats) sourced from new offering columns.

### Bigger bets
- Restructure above-the-fold to the MasterClass model: taller portrait hero with 'Teaches Filmmaking'-style eyebrow, stacked primary 'Play Lesson 1' + 'Watch trailer' CTAs inside the hero, and a sticky anchor tab bar (Overview · Lessons · Instructor · Reviews · FAQ) under the header for navigating the long page.
- Merge WhatYoullLearn + Curriculum into a single rich lesson browser: thumbnailed, numbered lesson cards with durations and descriptions per section, with the free lesson playable inline — one section instead of two redundant ones.
- Muted auto-looping trailer video in the hero (MasterClass/Apple TV pattern) with the existing poster as fallback, using a short promo cut per offering.
- Build a real reviews table with computed aggregates and tag counts to replace the hardcoded 4.9/5 and the hand-curated tag list in AggregatedReviews.
- Bring the cohort application in-app: native application form + post-application status screen with review-window/position meter and a membership-card visual (Greg waitlist pattern), replacing the external Tally redirect that currently loses the user.

## Checkout, Thank-You & Invoices

**Today:** CheckoutPage.tsx is a single 560px dark card: back link, title, what-you-get rows, testimonials, value bullets, custom fields, order bumps, guest name/email/phone, promo-code chip with savings line, order summary (MRP strikethrough, discount, GST, emerald total-savings strip), a text-only trust line, then the Pay button at the very bottom of a long scroll — on mobile the CTA and total are below the fold, there is no product imagery (the thumbnail lives only in the desktop-only TrustPanel), every section has equal flat weight, and the Razorpay modal theme is plain #ffffff (off-brand; ThankYou's upsell flow already uses cream #F5F1E8). ThankYou.tsx is already strong (emerald check with infinite animate-ping halo, "You're in." headline, benefit chips, 4-step journey timeline, WhatsApp share, mono receipt strip, upsell grid) but the celebration is a static looped ping rather than a one-shot moment, and the receipt strip has no invoice download even though src/lib/invoice.ts already builds a branded jsPDF GST invoice with share-sheet delivery — that capability is only surfaced in ProfilePage, where the invoices UI is a plain list with no per-payment detail view.

### References
- **Cosmos** — Near-black editorial plan-confirm: serif header, dotted-leader Subtotal/Savings/Total rows, pill CTA with a reassurance line ('Your next bill will be on...') directly beneath it.
  - *Apply:* Restyle CheckoutPage's order-summary block (lines 852-909) with dotted leaders and an Instrument Serif section heading, and move the 7-day-refund/secure-payment microcopy from above the Pay button to directly under it, Cosmos-style. This is the closest visual match to LevelUp's near-black + cream brand.
  - [Mobbin screen](https://mobbin.com/screens/40472949-629b-4f91-8723-f51fc5ae2da3)
- **Fanatics Live** — Dark checkout compressed to four tappable rows (order summary, card, promo, ship-to) under a pinned product header, ending in a slide-to-pay control — the whole purchase fits one screen.
  - *Apply:* Pin a course-thumbnail + instructor header at the top of CheckoutPage on mobile (TrustPanel already has this data but renders desktop-only) and collapse testimonials/bullets/promo into expandable rows so Pay lands near the fold instead of after a long scroll.
  - [Mobbin screen](https://mobbin.com/screens/e88ef2dd-8bac-4dd0-9223-a767fc32a12a)
- **Careem** — Payment summary with a 'saved on this order' badge directly under the total, plus a sticky footer pairing the payment method with a 'Pay <amount>' button.
  - *Apply:* Make the Pay button a sticky bottom bar on mobile showing 'Pay ₹X' with the existing total-savings chip hoisted beside it, so price + savings + action are always visible while the user scrolls testimonials and bumps.
  - [Mobbin screen](https://mobbin.com/screens/575ecfc4-076b-4db5-9d30-414a0ae47ddd)
- **Ladder** — Black-canvas payment success as a moment: one-shot confetti rain, glowing orb checkmark, giant display headline ('IT'S OFFICIAL'), single CTA.
  - *Apply:* On ThankYou, swap the infinite animate-ping halo (lines 625-631) for a one-shot confetti burst + cream radial-glow orb behind CheckCircle2 that plays once on mount; keep 'You're in.' as the oversized headline — it already matches Ladder's voice.
  - [Mobbin screen](https://mobbin.com/screens/6d6e7bea-123b-458e-bf58-df53394f15a3)
- **Revolut** — Dark transaction-detail sheet: big amount header, status timeline, stacked rounded info cards, and an explicit 'Statement → Download' row.
  - *Apply:* For the ProfilePage invoices UI: tapping a payment opens a detail sheet with a large ₹ amount header, 'Paid' status, stacked cards for order ID / Razorpay payment ID / date, and an 'Invoice → Download' row that calls downloadInvoice() from src/lib/invoice.ts (share-sheet path already handles native).
  - [Mobbin screen](https://mobbin.com/screens/b7a4d4f5-b5a7-4f95-a39e-84e7a258996c)
- **HotelTonight** — Dark receipt as clean label/value rows (guest, payment method, booking IDs) with an emphasized total and explicit 'Resend Receipt' + export actions.
  - *Apply:* Structure each invoice entry as label/value pairs (masterclass, date, payment method, total) and give the detail view two actions: Download PDF (existing share-sheet flow) and Email receipt — mirrors ThankYou's 'receipt emailed to' reassurance and kills 'where's my invoice?' support tickets.
  - [Mobbin screen](https://mobbin.com/screens/1e3a8116-1109-4221-837d-d3ced1915ca9)

### Quick wins
- Sticky mobile pay bar (Careem): wrap the Pay button + total-savings chip in a fixed bottom bar below lg breakpoint so 'Pay ₹X' is always visible during the long checkout scroll
- Set the Razorpay modal theme color in CheckoutPage to cream #F5F1E8 (ThankYou's upsell options already use it) so the gateway modal stops flashing off-brand white
- Wire 'Download invoice (PDF)' into the ThankYou receipt strip — order id, total, payment id, guest details are all already loaded; just call downloadInvoice() from src/lib/invoice.ts
- Dotted-leader order summary + move refund/secure microcopy directly under the Pay button (Cosmos) — pure CSS/Tailwind, no logic change
- One-shot confetti burst + cream glow orb on ThankYou mount (Ladder) replacing the infinite animate-ping halo, gated by prefers-reduced-motion
- Upgrade 'Powered by Razorpay · 7-day refund' from loose text lines into a single lock-icon pill above the CTA (MasterClass's 'Secured with iTunes' pattern)

### Bigger bets
- Fanatics-style one-screen checkout: pinned cinematic course-thumbnail + instructor header on mobile, with testimonials/bullets/promo collapsed into expandable rows and order summary as a single tappable row — turns the current flat 8-section scroll into a premium, above-the-fold purchase
- Revolut-grade payments hub in ProfilePage: list rows grouped by month, each opening a detail sheet (big ₹ header, status, ID cards, Download-invoice row, Email-receipt action) instead of a bare invoices list
- Slide-to-pay commitment control (Fanatics) as the final action on web checkout — a deliberate, cinematic gesture that suits the brand and prevents accidental double-taps (paymentInFlightRef guard already exists)
- Cinematic thank-you rework: full-bleed instructor still as the backdrop with the confetti moment layered over it, and the receipt rendered as a ticket-stub card (Blackbird-style) that doubles as the WhatsApp share image

## Lesson Player & Learning

**Today:** ChapterViewer.tsx is already a solid MasterClass-pattern watch page: VdoCipher DRM iframe in a rounded elevated shell, "Lesson X of N" eyebrow + big title, Share/Mark-complete row, prev/next with progress dots, and a 5-tab sidebar (Up Next, Notes, Overview, Files, Q&A) with confetti milestones and an auto-generated certificate. Weaknesses found in the code: (1) UpNextList.tsx shows thumbnails/duration but has NO per-episode watched state — no completed checkmarks, no "x min left" partial-progress, so the rail gives zero sense of where you are; (2) Notes is a bare Textarea with debounced autosave, completely disconnected from playback time even though useVideoProgress already tracks lastPosition; (3) auto-advance after Mark-complete is a silent 800ms setTimeout with no visible countdown or cancel; (4) the course-completion moment is a generic emoji-🎉 card modal, off-brand for a cinematic product; (5) resume is invisible — lastPosition is passed as &t= to the iframe with no "Resume from 12:34" affordance; (6) on mobile the 5 tabs are icon-only (labels hidden below md) and cryptic; (7) no timestamped "moments" navigation inside a lesson — the only granularity is the whole chapter.

### References
- **MasterClass** — Action row (Share/Bookmark/Download) directly under the player, then Up Next / Moments tabs where Moments are instructor-curated timestamps (00:32, 03:43...), plus a floating video/audio mode pill.
  - *Apply:* Add a 'Moments' concept to ChapterViewer: a chapter_moments table (label + seconds) rendered as a tappable timestamp list under the player or as a 6th tab; tap re-mounts VdoCipherPlayer with startPosition. The floating audio-pill is the long-term model for listen-on-the-go masterclasses.
  - [Mobbin screen](https://mobbin.com/screens/dfb62eac-4ae0-48ad-985c-54452c9333ec)
- **MasterClass** — The whole below-player stack on one scroll: numbered lesson title + instructor, editorial description, Moments list with per-moment bookmark, then an Up Next strip with thumbnail + duration chip.
  - *Apply:* This maps 1:1 to ChapterViewer's mobile layout — replace the cryptic icon-only 5-tab strip on mobile with this stacked editorial flow (title > description > moments > up-next), keeping tabs only on lg+ where labels fit.
  - [Mobbin screen](https://mobbin.com/screens/77121755-fcb3-4536-8cba-8269afb69207)
- **Netflix** — Episode rows carry a red watched-progress bar along the bottom edge of the thumbnail plus a checkmark state — instant 'where am I' across the season.
  - *Apply:* In UpNextList.tsx, fetch chapter_progress for all siblings in loadChapter and render a 2px cream progress bar across the bottom of each 16:9 thumbnail + an emerald check badge replacing the number chip on completed lessons.
  - [Mobbin screen](https://mobbin.com/screens/469ae571-ace8-45cd-ab61-75690b6276e4)
- **Spotify** — Audiobook chapter list with three textual states — 'Played ✓', '20 min left' with a partial progress sliver, and the current chapter tinted in accent green — plus a pinned now-playing mini bar.
  - *Apply:* Adopt the state language in UpNextList: 'Played' / '12 min left' / cream-tinted current row. Cheaper than thumbnails-only and reads instantly on the narrow 88px-thumb rows LevelUp already has.
  - [Mobbin screen](https://mobbin.com/screens/74c8e722-d8ff-49a3-b2b0-35b71d05915f)
- **Audible** — Clips & Bookmarks: every note is anchored to a timestamp range with 'Play Clip' and 'Go to Bookmark' actions — notes ARE navigation.
  - *Apply:* Upgrade the Notes tab from a single Textarea to timestamped entries: an 'Add note at 12:34' button captures the live position from useVideoProgress, and each saved note gets a mono timestamp chip that seeks the player (remount with startPosition).
  - [Mobbin screen](https://mobbin.com/screens/8723d23a-b5b2-47dc-b59b-40b778ff8247)
- **Ladder** — Full-screen near-black 'Workout Complete' celebration: metallic medallion, confetti, Share Proof button, streak progress bar, session stats, single Continue CTA.
  - *Apply:* Replace the emoji-🎉 completion card modal in ChapterViewer with a full-screen cinematic takeover: course key art as a champagne-ringed medallion, stats (lessons done, minutes watched), certificate + share CTAs. Confetti component already exists.
  - [Mobbin screen](https://mobbin.com/screens/3a9eda02-3ea8-48fd-9458-73ee3677b059)

### Quick wins
- Per-episode watched state in UpNextList: fetch chapter_progress for siblings in loadChapter, then render an emerald check on completed rows, a thin cream progress bar across the thumbnail bottom for partials, and Spotify-style 'x min left' text instead of plain 'x min'.
- Move the duration onto the thumbnail as a black duration chip (bottom-right, like Netflix/MasterClass) freeing a text line for the description excerpt.
- Visible auto-advance: replace the silent 800ms setTimeout after Mark-complete with a 5s 'Up next' card overlay showing the next lesson's thumbnail + title and a Cancel button (timer ref already exists).
- 'Resume from 12:34' pill: when lastPosition > 30s, overlay a small cream pill on the player shell before load — the &t= param already does the work, this just makes it legible.
- Insert-timestamp button in the Notes tab: a small '+ 12:34' chip above the Textarea that appends the current playback time (already tracked by useVideoProgress) as a [mm:ss] prefix line — day-one step toward Audible-style anchored notes.

### Bigger bets
- Moments (MasterClass's signature pattern): instructor-curated timestamped beats per chapter (new chapter_moments table + admin editor), rendered as a tappable list under the player; tapping seeks via remounting VdoCipherPlayer with startPosition or a VdoCipher postMessage seek API.
- Structured timestamped notes: replace the freeform Textarea with note entries pinned to playback seconds (chapter_notes gains a position column or a sibling chapter_note_entries table), each with a 'Go to' seek chip and a course-level 'All my notes' export — the Kindle-highlights moat for serious students.
- Cinematic completion sequence: full-screen dark lesson-complete and course-complete takeovers (Ladder/Peloton pattern) with course art medallion, watch stats, certificate reveal, share card, and a 'next masterclass' suggestion rail — replaces both the emoji modal and the plain toast.
- Mobile layout rework: drop the icon-only 5-tab strip below md in favour of the MasterClass stacked scroll (title > actions > description > moments > up-next), with the player sticky-docking to a mini-player as you scroll into notes/Q&A.
- Audio-only mode pill for masterclasses (MasterClass's video/headphones toggle) — listen-on-commute is a real India use case; needs a VdoCipher audio rendition or HLS audio track, so scope DRM feasibility first.

## Progress, Certificates & Gamification

**Today:** My Courses (src/pages/MyCoursesPage.tsx) renders a card grid where progress is a 1.5px-tall shadcn Progress bar plus a mono "X% complete" label, and a "Completed" Award icon at 100% — no aggregate stats, no streaks, no celebration. Progress is computed client-side via a 6-query Supabase waterfall (enrolments → offering_courses → courses → sections → chapters → chapter_progress). CourseDetail.tsx shows course progress only as plain text "completedCount/totalChapters completed" next to the CTA button (line ~401); per-chapter resume bars exist but there's no course-level ring, milestones, or certificate state. CertificateGallery.tsx is a flat 2-col grid of earned certificates only; the empty state is one line of text ("No certificates earned yet"), with no locked/upcoming certificates, no progress-toward-next, and no share moment. Net effect: completion feels like bookkeeping, not achievement — nothing pulls the user back daily or makes them want to show off.

### References
- **Apple Fitness** — Awards room on pure black: the freshly earned metallic medal sits large under 'Recent', with locked awards below as grayed line-art showing '0 of N' progress — locked states create want.
  - *Apply:* Rebuild CertificateGallery as a trophy room: most recent certificate hero-sized up top, then locked desaturated certificate silhouettes for every in-progress course with 'N lessons to go'. Replaces the dead one-line empty state — even a zero-cert user sees 7 certificates waiting to be unlocked.
  - [Mobbin screen](https://mobbin.com/screens/eab115a6-7c92-4c0f-843d-70bd983843a0)
- **pliability** — Profile combines a 'Trophy Case' row (completed program covers as collectible art) with a GitHub-style monthly consistency grid plus current/best streak — all on near-black with one accent color.
  - *Apply:* Add a header band above the MyCoursesPage grid: completed-course thumbnails as a trophy case row, and a weekly learning-days grid (derive lit cells from chapter_progress completed_at timestamps) with current streak. Champagne cells on the near-black canvas map 1:1 to LevelUp's palette.
  - [Mobbin screen](https://mobbin.com/screens/e51f880b-c434-4beb-9fd8-8deb9306f769)
- **Tonal** — Achievements as circular milestone tokens on black, each with a thin colored ring-arc showing progress toward the number (10/25/50 workouts) — numbers-first, zero cartoon.
  - *Apply:* On CourseDetail's hero, replace the plain 'completedCount/totalChapters completed' text (line ~401) with a champagne ring-arc token plus milestone ticks at 25/50/75/100%; reuse the same ring component as a thumbnail overlay on MyCourses cards instead of the 1.5px bar.
  - [Mobbin screen](https://mobbin.com/screens/3c610b6a-3c70-47df-9ef5-f83d155cc790)
- **stoic.** — Splits 'Badges unlocked' (elegant glass objects in a dark card) from 'Your next badges' — a list of upcoming unlocks each with a 6/10 fraction and thin progress bar, making the next pull explicit.
  - *Apply:* Under the certificate grid add a 'Your next certificate' section: one row per in-progress course with lessons-remaining fraction (e.g. 21/29) and a thin progress bar linking straight to the next unwatched chapter — the data already exists in MyCoursesPage's completedPerCourse/totalPerCourse maps.
  - [Mobbin screen](https://mobbin.com/screens/8e8f9d8b-df7a-4598-b538-582c059414ad)
- **Spotify** — Wrapped story: one giant stat ('24,404 minutes') full-bleed on black with a percentile hook and a single 'Share this story' CTA — engineered for screenshots.
  - *Apply:* On course completion, show a full-screen cinematic recap before the certificate: hours watched, lessons finished, instructor name over the course key art, with native share. Celebrity instructors (Ravi Basrur, Nelson, Lokesh) make 'I finished X's masterclass' genuinely shareable in India — free acquisition.
  - [Mobbin screen](https://mobbin.com/screens/3b6df3e3-a7f7-4a23-b89f-b9eb7f8716c0)
- **WHOOP** — Near-black dashboard with one clean weekly bar chart per metric, 'VS. LAST 7 DAYS' comparison label, and an embedded explainer card — stats feel premium-clinical, not gamey.
  - *Apply:* Add a 'This week' card to MyCoursesPage: minutes-watched bars for the last 7 days vs previous week (from chapter_progress last_position/completed_at). WHOOP's restrained slate-blue-on-black chart treatment is the right register for LevelUp's cinematic brand — adult, not Duolingo-cute.
  - [Mobbin screen](https://mobbin.com/screens/d9b6d6ef-0718-4ea5-8cdd-c4ce09fc7cae)

### Quick wins
- Swap the 1.5px Progress bar + '% complete' text on MyCourses cards for a small champagne SVG ring-arc overlaid bottom-right of the thumbnail showing the lessons fraction (12/29) — progress_pct and counts are already computed in the component
- Replace CourseDetail's plain 'X/Y completed' text (line ~401) with the same ring component plus milestone ticks at 25/50/75/100%, and show a locked-certificate chip ('Certificate at 100%') next to the CTA so the reward is visible from lesson one
- Rework CertificateGallery's empty state and grid to include locked certificate slots (desaturated/blurred cert silhouette + 'N lessons to go' + thin progress) for every in-progress course, Apple Fitness style — needs only the per-course progress data MyCoursesPage already derives
- Add a 3-stat strip at the top of MyCoursesPage (lessons completed, courses in progress, certificates earned) in mono type on the near-black canvas — all numbers fall out of queries the page already runs plus one cheap certificates count

### Bigger bets
- Completion recap 'Wrapped' moment: full-screen dark story shown when progress hits 100% (hours watched, lessons, instructor key art, certificate number) rendered to an image with native share sheet — turns 7 celebrity masterclasses into organic social proof; needs an aggregate of watch time from chapter_progress and a canvas/server image renderer
- Learning consistency system: pliability-style weekly/monthly learning-days grid with current and best streak on MyCoursesPage, plus a gentle 'keep your streak' push notification via Capacitor — requires deriving daily activity from chapter_progress timestamps (or a small daily_activity table) and a server-side aggregation RPC
- A medal system separate from certificates: monochrome metallic awards (first lesson, 25/100 lessons, first course complete, 'all of Nelson's episodes') in a profile trophy room rendered in Apple Fitness's engraved-on-black style — gives non-finishers intermediate wins; needs an achievements table + award-grant trigger
- Replace MyCoursesPage's 6-query client waterfall with a course_progress_summary Postgres view/RPC returning per-course totals, completions, minutes watched and last-activity date — prerequisite that makes the stats strip, streaks, and recap cards cheap, and fixes a real load-time weakness on mobile networks

## Cohorts, Live Sessions, Events & Community

**Today:** LevelUp's live layer is functionally complete but emotionally flat. CohortDashboard.tsx has a strong skeleton — sticky header with attendance bar + certificate chip, a segmented week progress strip, a "This Week" hero split into Live session / Assignment panes, and a week list — but the live session pane is text-only (title + datetime), the Join button just silently appears at T-60min with no countdown or anticipation, and week rows are uniform text rows with no imagery or momentum cues. MySessionsPage.tsx shows absolute dates only ("Jun 12, 6:00 PM") with a static "Upcoming" badge — no LIVE state, no relative time ("in 43 min"), and every session has equal visual weight; the disabled Join button with "available Xh before" caption is the weakest moment in the app's most important flow. CommunityPage.tsx is a single flat feed with a context-free textarea composer, no sort, and good-but-buried empty-state prompt chips; the cohort scope toggle exists but posts aren't anchored to anything (weeks, assignments). EventsPage.tsx renders an upcoming/past/my tabbed grid with nice image cards but no chronological grouping, no urgency signals, and a tiny text-link register CTA; EventDetail.tsx has a reg count but no countdown and a static "Registered" end-state. Nothing in these five screens ever ticks, pulses, or counts down — for a product whose differentiator is LIVE access to celebrity filmmakers, the UI never makes "live" feel alive.

### References
- **Open** — Dark editorial home with a 'LIVE, TODAY' section: full-bleed class hero card with a running timecode overlay, attendee avatar stack, and 'FULL SCHEDULE →' link — live content feels like a broadcast, not a list row.
  - *Apply:* Give MySessionsPage a 'Next session' hero: full-width card with instructor/course image, live ticking countdown chip in the corner (mono font, cream), and the avatar stack of registered cohort-mates. Demote the rest of the upcoming list below it.
  - [Mobbin screen](https://mobbin.com/screens/56f5156a-eb1e-4761-947d-817f68f9a5c5)
- **Open** — 'Today' agenda where the time column carries state: red 'LIVE ●' and blue 'IN 43 MIN' relative labels next to each row, instructor portrait per row, one-tap add (+) and attended (✓) marks.
  - *Apply:* Replace MySessionsPage's static 'Upcoming' badge with a computed state label in the date block: 'LIVE' (red pulse), 'IN 43 MIN', 'TOMORROW'. date-fns is already imported — formatDistanceToNow does this in one line, and the same logic should drive the Join button enabling.
  - [Mobbin screen](https://mobbin.com/screens/55cf3c49-807a-4a4f-b289-9ad57f831779)
- **Equinox+** — Dark program view: session cards with photo thumbnails and green 'Completed Fri, June 13' stamps, 'Recommended for Wed · Add to Cal' on the next one, plus a sticky bottom sheet — 'Week 1 of 4, 2 of 3 sessions complete, 1d left' with a radial progress ring.
  - *Apply:* CohortDashboard: add a sticky bottom bar with 'Week N of M · X done · assignment due in 2d' + radial ring (the data already exists in progressIdx/completedCount/dueDate), and put an 'Add to Cal' (.ics) action next to every live_session_at. Week list rows get completion date stamps instead of bare badges.
  - [Mobbin screen](https://mobbin.com/screens/f97dc968-1dc0-4f91-863c-69fe70e88140)
- **Fanatics Live** — Pre-show screen: giant hrs/min/sec countdown over the show artwork with a single 'Saved' watchlist pill — the wait itself is designed as a moment that builds anticipation.
  - *Apply:* In CohortDashboard's ThisWeekCard live-session pane and EventDetail, render a ticking hh:mm:ss countdown (mono, cream-on-dark) once the session is <24h away, which morphs into the cream 'Join session' button at T-60min — replacing today's behavior where the button just appears with no warm-up.
  - [Mobbin screen](https://mobbin.com/screens/82cdce39-f1ad-4d74-a4ea-e8cd17cdc9cb)
- **Luma** — Events as a chronological agenda with sticky date-group headers ('17 July / Thursday'), compact thumbnail rows, and time/venue/price rendered as scannable metadata chips.
  - *Apply:* EventsPage 'Upcoming' tab: group the grid under date headers ('14 June · Saturday') so the page reads as a calendar, not a catalog — events.filter already returns starts_at-sorted rows, so grouping is a reduce(). Keep the image cards but show price as a chip on the card, not buried in the footer link.
  - [Mobbin screen](https://mobbin.com/screens/331782b6-d487-4d7f-8842-92cd9ba9de27)
- **Mindvalley** — Dark 'Discussions' tab scoped to a specific lesson: persistent 'Write something…' composer pinned at top, Sort by Popular control, post titles + rich reaction pills ('You and 13 reacted') — community anchored to the content, not floating free.
  - *Apply:* CommunityPage: add a Recent/Popular sort (like_count is already computed), give posts an optional title line, and upgrade the like row to a reaction pill showing stacked count. Bigger: anchor 'My Cohort' posts to the current week's theme like Mindvalley anchors to a lesson.
  - [Mobbin screen](https://mobbin.com/screens/43010728-1fe2-4317-a7ea-3e3b8a4fd3e1)

### Quick wins
- Relative-time state labels (Open-style): in MySessionsPage and CohortDashboard, replace the static 'Upcoming' badge with computed 'LIVE ●' (red pulse) / 'IN 43 MIN' / 'TOMORROW 7 PM' labels — date-fns is already a dependency, ~30 lines
- Ticking countdown that morphs into Join (Fanatics Live-style): a useCountdown hook rendering hh:mm:ss in the existing mono/cream type style on ThisWeekCard's live-session pane and the MySessions card, swapping to the cream Join button at T-60min
- Add-to-calendar everywhere (Equinox+ 'Add to Cal'): generate an .ics blob / Google Calendar URL from live_session_at + duration_minutes on CohortDashboard, MySessionsPage and EventDetail — no backend change
- Luma-style date-group headers on EventsPage upcoming tab ('14 June · Saturday') via a single reduce over the already-sorted events array
- Community sort toggle Recent/Popular (Mindvalley): like_count and comment_count are already computed client-side, so it's one sort comparator + a small segmented control matching the existing scope toggle
- Surface the empty-state prompt chips ('Introduce yourself', 'Ask for feedback') above the composer permanently, not only when the feed is empty — they're already built in CommunityPage

### Bigger bets
- 'Next session' broadcast hero on MySessionsPage (Open): full-bleed instructor imagery, ticking countdown, cohort-mate avatar stack (a get_session_registrants RPC), with past sessions demoted to compact 'Replay' rows — turns the calendar page into the app's live anchor
- Sticky week-progress footer on CohortDashboard (Equinox+): persistent 'Week 3 of 8 · 1 of 2 done · assignment due in 2d' bar with radial ring replacing the thin top strip, plus instructor/theme thumbnails on week rows so the 8-week journey reads like a season of episodes
- Countdown lobby: tapping a session inside T-60min opens a full-screen dark pre-live screen — big timecode, 'who's here' avatars, week theme, pinned mentor note — then deep-links to Zoom at zero; this is the single moment that would most differentiate LevelUp cohorts from a Zoom link in an email
- Week-anchored community (Mindvalley/MasterClass): each cohort week gets a discussion thread auto-created from its theme, the composer is pre-seeded with week context, and PeerReviewBoard items surface inline in that thread — merging the currently-disconnected CommunityPage scope toggle, CohortDashboard peer-review tab, and assignment feedback into one social spine

## Profile, Account & Application Status

**Today:** ProfilePage.tsx is a single flat ~8-section scroll separated by `border-t` dividers: hero card (InitialsAvatar + inline edit form), certificates gallery, notification prefs, enrolments list, an inline-expanding change-password form, an "Account" section whose only content is email + a destructive-styled Sign out button, an invoices list (good bones: FileText icon tile, invoice number, Paid badge, download button), and a danger zone. There is no grouping, hierarchy, or sub-navigation — utilities (password, invoices, deletion) carry the same visual weight as identity and achievements, and the premium 'member #' detail is buried as a mono caption. ApplicationStatus.tsx renders a 7-step vertical timeline with lucide Circle/Check icons, but it uses stock green-500/red-500/amber colors plus an 11-hue STATUS_BADGE_COLORS map (gray/blue/amber/cyan/green/red/violet/indigo/emerald/orange/yellow) that fights the near-black + cream brand; steps have labels only — no per-step dates, no expectation copy ('we review within 48h'), no progress summary — and the critical Pay Confirmation / Pay Balance CTAs are small inline buttons easy to scroll past.

### References
- **Revolut** — Dark account hub: centered avatar header, two quick-action tiles, then grouped rounded-card menus of icon rows — utilities tucked into scannable clusters instead of a long scroll.
  - *Apply:* Restructure ProfilePage into a hub: identity header up top, 2 quick-action tiles (My Certificates / Invoices & receipts), then grouped cards of rows — Account (email, password, notifications), Learning (enrolments), Legal/Danger — replacing the 8 border-t stacked sections.
  - [Mobbin screen](https://mobbin.com/screens/8b0c7aa9-1dd5-45e5-92c4-35dc1ffb5559)
- **pliability** — Pure-black profile with name + 'Edit Profile' pill, a journey/progress card, and a 'Trophy Case' shelf — identity and achievement get the hero treatment, settings are demoted to a gear.
  - *Apply:* Style the hero exactly like this: large name, Edit Profile as a small pill, and rename/reframe CertificateGallery as a horizontal 'Trophy Case' shelf directly under the hero — certificates are the most brand-affirming asset on this page and currently sit below the fold.
  - [Mobbin screen](https://mobbin.com/screens/79ad9201-f4b2-4de5-9232-cd28aa9675bf)
- **GOAT** — Order progress on pure black: letter-spaced uppercase title, thin monochrome vertical timeline, filled-check vs hollow circles — luxury restraint with zero color noise.
  - *Apply:* Recolor the ApplicationStatus timeline to this monochrome language: cream filled-check for completed, pulsing cream ring for current, dim hollow for upcoming — replacing green-500/amber/red icons and collapsing the 11-hue STATUS_BADGE_COLORS map to 3 semantic tints (in-progress cream, enrolled positive, rejected/withdrawn muted red).
  - [Mobbin screen](https://mobbin.com/screens/1e916a9e-8cfd-4970-bfe6-a2294b892bae)
- **Alan** — Claim-status timeline where every step carries a timestamp, a one-line human description, inline document rows, and expectation-setting copy ('done in less than 3 days') on the in-review step.
  - *Apply:* Add per-step substance to ApplicationStatus STEPS: a date for each completed step, a one-line description, and expectation copy under the current step ('Applications are reviewed within 48 hours', 'Your interview link arrives by email'). Surface the paid app-fee/confirmation receipts inline as document rows on their steps.
  - [Mobbin screen](https://mobbin.com/screens/751decaa-80b3-4dfd-bb78-4f39c3718578)
- **Deel** — Onboarding tracker with a completion progress bar + '2/5 steps completed' summary, and each step as a card with status chip, completion date, and due date.
  - *Apply:* Add a summary header above the timeline: thin cream progress bar + 'Step 4 of 7 — Accepted' computed from currentStepIndex, so the user gets the state in one glance before reading the timeline. Give the actionable step (Pay Confirmation/Balance) a card treatment with a due date instead of a bare inline button.
  - [Mobbin screen](https://mobbin.com/screens/2fae5426-969d-411a-8262-3b6ae5e4d0b2)
- **Starlink** — Dark billing history grouped by year with quiet uniform rows (title, period, amount, chevron) and a 'Preview next invoice PDF' utility row pinned on top.
  - *Apply:* Slim InvoicesSection rows to this density (title / invoice no + date / amount right-aligned, chevron or download icon) and group by year once history grows; keep the emerald Paid badge but drop per-row button chrome so 10+ purchases stay scannable.
  - [Mobbin screen](https://mobbin.com/screens/d099b8fb-e053-44b2-95fe-dba3463687e0)

### Quick wins
- ApplicationStatus: replace the green-500/amber/red lucide icon colors and the 11-hue STATUS_BADGE_COLORS map with the brand monochrome scheme (cream completed/current, dim upcoming, muted red only for rejected/withdrawn) — pure Tailwind class changes in one file (GOAT reference).
- ApplicationStatus: add a one-line description and expectation copy per step (extend the STEPS array with a `description` field) plus the applied/paid dates the data already has — Alan-style trust copy like 'Applications are reviewed within 48 hours'.
- ApplicationStatus: add a 'Step N of 7' summary line + thin cream progress bar above the timeline, derived from the existing currentStepIndex (Deel reference).
- ProfilePage: make Pay-step CTAs and the hero polish cheap wins — change 'Edit Profile' to a small pill, move Sign out out of the 'Account' section to a quiet row at the page bottom (Revolut puts Log out last), and merge the redundant standalone 'Account' section (it only repeats the email already shown in the hero).
- InvoicesSection: tighten rows to title / mono invoice no + date / right-aligned amount with a single download icon (Starlink density) — markup-only change.

### Bigger bets
- Rebuild ProfilePage as a Revolut-style account hub: identity hero + 2 quick-action tiles (Certificates, Invoices), then grouped rounded-card menus (Account: email/password/notifications; Learning: enrolments; Danger zone) — either collapsing sections into sub-routes or accordion cards, killing the 8-divider mega-scroll on mobile.
- Turn the 'Member #' into a cinematic membership-card moment: a champagne-on-black card element in the hero (name, member number, join year) that doubles as the brand flex MasterClass-adjacent apps lead with — currently it is a throwaway mono caption.
- ApplicationStatus as a living tracker: inline receipt/document rows on paid steps (Alan), a celebratory full-bleed 'Enrolled' terminal state, push notification on every status transition, and a sticky bottom payment bar (web/Android) when status is accepted or confirmation_paid so the money step can never be scrolled past.
- Promote certificates to a 'Trophy Case' shelf directly under the profile hero (pliability) with share-to-social actions — certificates from celebrity instructors are LevelUp's strongest social proof and currently render as a generic gallery mid-page.

## System polish (loading/empty/error/notifications)

**Today:** LevelUp's connective tissue is functional but uneven. RouteFallback.tsx is the strongest piece — a branded shimmer skeleton on bg-canvas, safe-area aware, with thoughtful design notes. But the older skeletons (CourseCardSkeleton etc.) use a different system entirely (animate-pulse + bg-surface-2 blocks) so loaders don't breathe together. NotificationDropdown.tsx has a bare-text "Loading..." state, a generic faded lucide Inbox icon for empty ("You're all caught up" with zero brand personality), an off-brand blue-500 unread dot on a cream/champagne design system, and a flat ungrouped list with tiny gray type icons. NotFoundPage.tsx is tasteful (mono 404, serif-italic headline, grain) but pure text — no cinematic art for a brand built on 7 celebrity filmmakers. OfflineBanner.tsx is the weakest: a harsh red bg-destructive bar fixed at top-0 with no safe-area inset (it will tuck under the iOS Dynamic Island) whose alarming tone fights the premium near-black aesthetic. FloatingSupport.tsx is a nice glassy pill but deep-links straight to WhatsApp with the prefilled text "Hi" — no reply-time expectation, no topic routing, no human face.

### References
- **GitHub** — Dark inbox empty state with a single-accent line-art illustration (Mona + orange fox) and warm copy 'All caught up! Take a break, write some code.'
  - *Apply:* Replace NotificationDropdown's faded Inbox icon with one cream line-art SVG (clapperboard / director's chair on near-black) plus craft copy like 'All caught up. Go make something.' Same illustration style can seed every empty state in the app.
  - [Mobbin screen](https://mobbin.com/screens/5c06a4a8-7e97-4661-81e3-e25f8616e2ef)
- **Netflix** — Loading skeleton as barely-lighter-than-black blocks that exactly mirror the final layout (hero billboard + card row) — no borders, no high-contrast gray, reads as cinematic anticipation.
  - *Apply:* Tune CourseCardSkeleton/EventCardSkeleton to this contrast level and to RouteFallback's .skeleton-shimmer cadence — today they use animate-pulse + bg-surface-2 with visible borders, which reads more corporate than the route-level skeleton they hand off to.
  - [Mobbin screen](https://mobbin.com/screens/e9a7866f-bd41-4a10-b520-2326b0133563)
- **HBO Max** — Offline/error screen backed by full-bleed cinematic key art (Iron Throne) fading into black, with plain-spoken copy and a single RETRY button — system failure becomes a brand moment.
  - *Apply:* Give NotFoundPage (and a future full-screen offline/error state) a dimmed masterclass still or instructor portrait fading into bg-canvas behind the existing serif-italic headline + grain. LevelUp literally sells cinema; the 404 should look like it.
  - [Mobbin screen](https://mobbin.com/screens/2d62a1e9-a9c4-446b-b1cf-5c9a0c6a4f16)
- **Spotify** — Offline state in calm brand voice — 'We'll be here when you're back online' with a quiet glyph — reassuring instead of alarming, no red anywhere.
  - *Apply:* Rewrite OfflineBanner: drop bg-destructive red for a surface/90 backdrop-blur pill with a cream WifiOff icon and copy like 'You're offline — we'll reconnect automatically', plus safe-area top padding so it clears the Dynamic Island.
  - [Mobbin screen](https://mobbin.com/screens/430d2c09-a884-471d-afed-fbcc0f7ad2d4)
- **Open** — Premium near-black notification feed grouped under TODAY / YESTERDAY / THIS WEEK with rich content thumbnails and streak badges per row — feels editorial, not utilitarian.
  - *Apply:* Add date-group headers to NotificationDropdown and swap the tiny gray lucide type icons for 36px rounded thumbnails (course art / instructor avatar) where the notification has a link target; keep the icon only as fallback.
  - [Mobbin screen](https://mobbin.com/screens/13568582-bf4e-4cc3-96fc-18c48bc5c7c5)
- **IDAGIO** — Support entry as a warm sheet: 'Hello' headline, real team avatars, 'Typically replies in…' expectation, then one Send-us-a-message CTA — human before channel.
  - *Apply:* Make FloatingSupport open a small bottom sheet (team avatar, 'Typically replies within minutes on WhatsApp', 2-3 topic chips that prefill the message text) instead of cold-launching WhatsApp with 'Hi'.
  - [Mobbin screen](https://mobbin.com/screens/a9fba01f-3c33-4589-aea8-863603503527)

### Quick wins
- OfflineBanner detox: replace the red bg-destructive bar with a calm surface/90 backdrop-blur strip, cream icon, Spotify-voice copy, and pt-[env(safe-area-inset-top)] so it no longer tucks under the iOS notch; add a 2s green 'Back online' flash on reconnect (src/components/OfflineBanner.tsx).
- NotificationDropdown loading state: swap the bare 'Loading...' text for 3 skeleton notification rows using the shared .skeleton-shimmer class so it matches RouteFallback (src/components/NotificationDropdown.tsx line 110-113).
- Change the unread dot from bg-blue-500 to the cream accent (bg-cream) — the only blue pixel in an otherwise champagne system (NotificationDropdown.tsx line 134).
- Notification empty state with personality: one inline cream line-art SVG (clapperboard) + 'All caught up. Go make something.' replacing the opacity-40 Inbox icon (GitHub pattern).
- Unify skeleton systems: port CourseCardSkeleton/EventCardSkeleton/PostSkeleton from animate-pulse + bg-surface-2 to SkeletonLine/SkeletonBlock from @/components/patterns, and lower block contrast toward the Netflix barely-lighter-than-canvas level.
- WhatsApp prefill upgrade: change FloatingSupport's '?text=Hi' to a context-bearing message like 'Hi, I need help with LevelUp' (optionally appending the current page) so support chats arrive pre-routed.

### Bigger bets
- Cinematic system-state family (HBO Max pattern): one shared <SystemState> component for 404 / fatal error / full-page offline that layers a dimmed masterclass still or instructor portrait fading into bg-canvas behind the existing serif-italic + grain treatment, with rotating one-line instructor quotes — turns every dead end into a brand impression.
- Notification center v2 (Open pattern): date-grouped sections (Today/Yesterday/This week), rich 36px course/instructor thumbnails per row, filter chips (All / Courses / Community / Account), swipe-to-mark-read, and a dedicated /notifications page for mobile instead of the fixed-position dropdown overlay.
- Support sheet instead of a raw link (IDAGIO pattern): FloatingSupport opens a branded bottom sheet with a team avatar, reply-time expectation, and topic chips (Payments, Playback issue, Cohort application) that prefill the WhatsApp deep link — keeps the premium feel and pre-triages every conversation.
- Per-route RouteFallback variants: key the Suspense skeleton on the destination pathname (player routes get a 16:9 video-block skeleton, library routes get the card-grid skeleton, profile gets avatar+rows) so chunk loads always shimmer in the shape of what's coming — the Netflix trick applied app-wide.
