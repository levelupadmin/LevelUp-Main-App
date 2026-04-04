

# Redesign Home Page — LevelUp Brand, Real Course Data, Forge Cross-Sell

## Overview

Transform the logged-in home page from a generic LMS dashboard into a branded LevelUp experience that mirrors the marketing site's cinematic editorial feel, while pulling real course data from the backend and cross-selling Forge offline programs.

The home page will serve two audiences:
- **Enrolled students**: Continue Learning, Streak, Community
- **All visitors (including prospects)**: Masterclass grid, Live Cohort showcase, Forge cross-sell — driving exploration and conversion

---

## Architecture

```text
Index.tsx (orchestrator — no business logic)
├── HeroCarousel.tsx        ← REWRITE: DB-driven banners OR hardcoded brand slides
├── StreakCard.tsx           ← Keep as-is (already wired to backend)
├── ContinueLearning.tsx    ← Keep as-is (already wired to backend)
├── MasterclassGrid.tsx     ← NEW: queries courses where course_type='masterclass'
├── LiveCohortShowcase.tsx  ← NEW: queries courses where course_type='cohort'
├── ForgeCrossSection.tsx   ← NEW: static Forge data with external CTAs
├── CommunityHighlights.tsx ← Keep as-is (already wired to backend)
├── FeaturedCreators        ← Keep inline in Index.tsx (already wired)
└── CredibilityBar.tsx      ← NEW: static stats bar (67K+ learners, 821+ cities)
```

---

## What Changes

### 1. Brand Alignment (CSS + Tailwind)

**`index.css`** — Add the reference project's brand tokens:
- Add `--hero-headline`, `--hero-subtext`, `--gradient-amber-gold`, `--text-shadow-hero` CSS variables
- Add `font-serif-display` and `font-sans-body` utility classes (mapped to Sora font)
- Add film grain `body::after` overlay and ambient vignette `body::before`
- Add `animate-hero-stagger` keyframe for staggered entrance animations
- Import Sora font alongside existing Plus Jakarta Sans

**`tailwind.config.ts`** — Add `font-serif` family mapping for Sora, add `hero-headline`/`hero-subtext` color tokens.

### 2. HeroCarousel.tsx — Cinematic Rebrand

Rewrite to match the reference site's hero style:
- Full-bleed cinematic hero with gradient overlays (from-background via-background/60)
- Rotating headline text: "Where India's next great [filmmakers/editors/storytellers] are made"
- Gradient amber accent on the rotating word
- "See all Programs" CTA button (rounded-full, primary bg)
- Keep autoplay carousel of background images using existing assets (`hero-filmmaking-1.jpg`, `hero-editing-1.jpg`, `hero-cinematography-1.jpg`)
- Ken Burns zoom animation on active slide
- Staggered entrance animation on headline, subtext, CTA

### 3. MasterclassGrid.tsx — NEW

Pulls **published masterclass courses** from backend:
```sql
SELECT * FROM courses WHERE course_type = 'masterclass' AND status = 'published'
```

Renders a 2x4 grid of portrait-aspect cards (matching reference site's 3:4 ratio):
- Course thumbnail as full-bleed background
- Instructor name overlay at bottom
- 3D perspective tilt on hover (matching reference `perspective(600px) rotateY`)
- Glow shadow on hover: `shadow-[0_0_20px_2px_hsl(38_75%_55%/0.35)]`
- Click navigates to `/learn/course/:slug`
- Falls back to local masterclass images (`mc-karthik-subbaraj.png`, etc.) when no thumbnail_url

Section header: "On-Demand Masterclasses" pill + "India's greatest creative minds. Now your mentors." headline with gradient amber accent.

### 4. LiveCohortShowcase.tsx — NEW

Pulls **published cohort courses** from backend:
```sql
SELECT * FROM courses WHERE course_type = 'cohort' AND status = 'published'
```

Renders a single-card carousel with animated transitions (matching reference's `AnimatePresence` pattern):
- Filter pills: "Make Films", "Edit Videos", "Create Content", "Design Products", "Write Stories"
- Each pill maps to a course by index
- Card shows: tag, headline, one-liner (from `short_description`), stats pills (from `tags`), course bullets (from `description` parsed), CTA button linking to `payment_page_url` or course detail
- Left-right navigation arrows, dot indicators
- Auto-advance every 4s, pause on hover
- Section header: "LIVE MENTORSHIP COHORTS" pill + "From Learner to [Creator/Editor/Designer]." rotating word headline

Falls back to hardcoded program data (from reference project's `programs.ts`) when no cohort courses exist in DB.

### 5. ForgeCrossSection.tsx — NEW (Static Cross-Sell)

Entirely static — links to external Forge marketing pages. Content copied from reference project:

Three cards in an Embla carousel:
1. **Writing Retreat** — Coorg, June 2026 → `https://tally.so/r/nPJydd`
2. **Filmmaking Bootcamp** — Goa, April 2026 → `https://www.forgebylevelup.com/`
3. **Creator Residency** — Goa/Bali → `https://creators.forgebylevelup.com/`

Each card: full-bleed image, gradient overlay, location badge, title, subtitle, "REQUEST AN INVITE" CTA.

Section header: "Offline Residencies" pill + Forge logo + "Learn. Do. Become." tagline + 3 feature points (Learn by doing, Build with community, Immersive & offline) + stats (11 Cities, 25+ Editions, 600+ Dreamers).

Uses existing assets: `cohort-filmmaking-banner.jpg` and similar images. Will copy Forge-specific assets (`forge-logo.png`, `forge-filmmaking-banner.jpg`, `forge-writing-banner.jpg`, `forge-creators-banner.jpg`) from the reference project.

### 6. CredibilityBar.tsx — NEW (Static)

Simple 4-column stats strip placed between Hero and Continue Learning:
- 67,746+ Learners | 4.86 Rating | 821+ Cities | 3,000+ Collaborations
- Animated counter on scroll-into-view
- Subtle gradient background

### 7. Index.tsx — Recompose

New section order:
1. HeroCarousel (cinematic rebrand)
2. CredibilityBar (trust strip)
3. StreakCard (existing, logged-in only)
4. ContinueLearning (existing, logged-in only)
5. MasterclassGrid (DB-driven)
6. LiveCohortShowcase (DB-driven)
7. ForgeCrossSection (static cross-sell)
8. CommunityHighlights (existing)
9. Featured Creators (existing)

Remove the "Explore more courses" placeholder section. Remove UpcomingEvents (mock data, no backend).

---

## Assets to Copy from Reference Project

Copy these image assets into `src/assets/`:
- `forge-logo.png`
- `forge-filmmaking-banner.jpg`
- `forge-writing-banner.jpg`
- `forge-creators-banner.jpg`

The masterclass instructor images already exist in this project (`mc-karthik-subbaraj.png`, `mc-lokesh-kanagaraj.png`, etc.).

---

## Files Modified / Created

| File | Action |
|---|---|
| `src/index.css` | Edit — add brand tokens, vignette, grain, stagger animation |
| `tailwind.config.ts` | Edit — add Sora font, hero color tokens |
| `src/pages/Index.tsx` | Rewrite — new section composition |
| `src/components/home/HeroCarousel.tsx` | Rewrite — cinematic branded hero |
| `src/components/home/MasterclassGrid.tsx` | Create — DB-driven masterclass grid |
| `src/components/home/LiveCohortShowcase.tsx` | Create — DB-driven cohort carousel |
| `src/components/home/ForgeCrossSection.tsx` | Create — static Forge cross-sell |
| `src/components/home/CredibilityBar.tsx` | Create — stats strip |

No database changes needed — all data comes from existing `courses` table.

---

## Dependencies

- `framer-motion` — for AnimatePresence carousel transitions and rotating word animations (check if already installed, add if not)
- `embla-carousel-react` + `embla-carousel-autoplay` — for Forge carousel (check if already installed)

