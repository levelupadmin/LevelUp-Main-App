

## Masterclass Complete Module — Plan

### Current State vs. Goal

**Cohort flow (rich):** Learn → CohortDetail (hero, syllabus, mentors, testimonials, demo projects, pricing, CTAs) → CohortApplication → CohortDashboard (tabs: sessions, assignments, submissions, reviews, resources) → CohortCommunity

**Masterclass flow (thin):** Learn → CourseDetail (hero, overview, curriculum list) → LessonDetail (bare video player + prev/next nav)

The masterclass experience is missing a proper learning dashboard and an immersive lesson player. Based on patterns from MasterClass.com (video player with sidebar notes panel, lesson navigation, class guide), Napper (progress tracking per module, expandable day cards), and Teachable (curriculum sidebar, quiz integration), here is the plan:

---

### What We Will Build

#### 1. Masterclass Dashboard Page (`/learn/course/:slug/dashboard`)
A post-enrollment dashboard (like CohortDashboard) with:
- **Hero progress card** — course thumbnail, overall progress ring/bar, "Continue Learning" CTA resuming last lesson
- **Tabs:**
  - **Curriculum** — module accordion with per-lesson completion status (checkmark / in-progress / locked icons), progress percentage per module
  - **Notes** — aggregated notes across all lessons (pulled from `lesson_progress` or a new lightweight notes field)
  - **Resources** — class guide, downloadable materials placeholder
  - **Reviews** — student reviews section (read + write)
- **Instructor card** — bio, credentials, social links
- **Certificate progress** — if `certificate_enabled`, show threshold bar ("Complete 70% to earn your certificate")

#### 2. Enhanced Lesson Player Page (upgrade existing `LessonDetail`)
Inspired by MasterClass.com's two-column layout:
- **Left: Content viewer** (video/PDF/text — already exists via `LessonContentViewer`)
- **Right: Collapsible sidebar panel** with tabs:
  - **Lessons** — scrollable curriculum list with completion states, current lesson highlighted
  - **Notes** — per-lesson note-taking textarea (saved to DB via `lesson_progress` or new table)
- **Lesson action bar** — Mark as Complete button, lesson duration, progress indicator
- **Auto-advance** — after marking complete, prompt to go to next lesson
- **Mobile:** sidebar collapses into a bottom sheet / drawer

#### 3. Progress Tracking Integration
- Use existing `lesson_progress` and `enrollments` tables (already in DB)
- Add a "Mark as Complete" mutation that upserts `lesson_progress` with `status = 'completed'`
- Compute course-level progress as `completed_lessons / total_lessons * 100`
- Show real progress on the dashboard and in the Learn page "Continue Learning" cards

#### 4. Navigation & Routing Updates
- New route: `/learn/course/:slug/dashboard` → `MasterclassDashboard`
- Update `CourseDetail` CTA: enrolled users get "Go to Dashboard" instead of "Start Course"
- Update Learn page "Continue Learning" cards to navigate to dashboard
- Breadcrumbs on dashboard and lesson pages

#### 5. Certificate Unlock Card
- On dashboard, show a locked/unlocked certificate card based on `certificate_threshold`
- When threshold met, show "Download Certificate" (placeholder — links to existing `certificates` table)

---

### Files to Create
- `src/pages/MasterclassDashboard.tsx` — the main dashboard page
- `src/components/learn/LessonSidebar.tsx` — curriculum + notes sidebar for lesson player

### Files to Modify
- `src/pages/LessonDetail.tsx` — add sidebar panel, mark-complete button, enhanced layout
- `src/pages/CourseDetail.tsx` — add "Go to Dashboard" CTA for enrolled users
- `src/hooks/useCourseData.ts` — add hooks for `lesson_progress`, `enrollments`, mark-complete mutation
- `src/App.tsx` — add `/learn/course/:slug/dashboard` route

### Database
- No new tables needed. Uses existing `enrollments`, `lesson_progress`, and `certificates` tables.
- May add a `notes` text column to `lesson_progress` via migration if not present (currently not in schema).

---

### Technical Approach

```text
Learn Page
  └─ Masterclass Card (click)
       └─ CourseDetail (landing/sales page)
            ├─ "Start Course" → creates enrollment + navigates to dashboard
            └─ "Go to Dashboard" (if enrolled)
                 └─ MasterclassDashboard
                      ├─ Curriculum tab (module accordion + lesson states)
                      ├─ Notes tab (all notes aggregated)
                      ├─ Resources tab
                      ├─ Reviews tab
                      └─ "Continue Learning" → LessonDetail
                           ├─ Video/Content viewer (left)
                           ├─ Sidebar: Lessons list + Notes (right)
                           └─ Mark Complete → upserts lesson_progress
```

This brings the masterclass experience to parity with the cohort module while keeping the existing DB schema intact.

