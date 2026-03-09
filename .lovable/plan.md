

# Comprehensive LMS Module Plan: Masterclass, Workshop, Cohort + Presale System

## Current State

- **3 course types** exist in the DB (`course_type` enum: masterclass, workshop, cohort)
- **Admin panel** (`AdminCourses.tsx`, 1400 lines) handles all types in one view with tabs: Details, Content, Schedule, Pricing, Settings
- **CourseDetail.tsx** already differentiates enrolled vs non-enrolled for masterclass
- **WorkshopDetail.tsx** uses mock data (not connected to DB)
- **CohortDetail/Dashboard/Application** use mock data from `cohortData.ts`
- DB has: `courses`, `course_modules`, `lessons`, `enrollments`, `lesson_progress`, `course_schedules`, `course_access_grants`
- Missing: presale/pricing variants table, resource attachments for workshops, assignment visibility controls, Zoom link per-enrollment display

---

## Phase 1: Database Schema Changes

### New table: `course_pricing_variants`
```
id, course_id, label (e.g. "Early Bird"), price, currency, payment_link (Razorpay URL),
is_active_on_site (boolean — which one shows in-app), is_active_for_ads (boolean),
valid_from, valid_until, sort_order, created_at
```
- RLS: admins manage, anyone can read active variants
- This enables price testing: 4 variants, 1 shown on site, all 4 usable via ad links. Purchasing any variant grants same course access.

### New table: `course_resources`
```
id, course_id, module_id (nullable), title, type (slide/template/recording/link),
file_url, is_unlocked (boolean, default false), sort_order, created_at
```
- RLS: admins manage, enrolled users read unlocked resources
- Used for workshop slides, recordings, templates; cohort session recordings

### Alter `lessons` table
- Add `is_locked_until_enabled` boolean default false — for assignments/content that admin must manually unlock

### Alter `courses` table
- Add `presale_description` text — rich description for the presale/sales page
- Add `trailer_url` text — preview video for non-enrolled users
- Add `zoom_link` text already exists on courses table

---

## Phase 2: Presale / Pricing Admin Section

### New admin tab: "Presale" (in AdminCourses detail view)
What admin fills in:
- **Presale page content**: headline, description, preview video/trailer URL, feature bullets, testimonials
- **Pricing variants**: create up to 4 price points, each with:
  - Label (e.g. "Standard", "Early Bird", "Premium Bundle")
  - Price amount
  - Razorpay payment link
  - Toggle: "Show on website" (only one active at a time on the site)
  - Toggle: "Active for ads" (can be used in ad campaign links)
  - Valid date range
- **Free preview content**: select which lessons are marked `is_free = true` (already exists)
- All variants map to the same `course_id`, so purchasing any variant auto-enrolls into the same content

### How it works end-to-end:
1. Admin creates course + 4 pricing variants in backend
2. Sets one as "active on site" — this shows on the in-app course detail page
3. All 4 Razorpay links can be used in ads
4. When user pays via any link, webhook/manual enrollment grants access to the same course content

---

## Phase 3: Masterclass (Pre-recorded Course)

### Non-enrolled view (Sales/Presale page):
- Cinematic hero with course banner, instructor image, trailer play button
- "What you'll learn" tags, social proof (student count, rating)
- Locked curriculum: module/lesson list with lock icons, free lessons marked "Preview"
- Active pricing variant displayed with CTA button linking to Razorpay
- Instructor bio section
- Sticky bottom CTA bar on scroll

### Enrolled view (Learning dashboard):
- Progress ring + "Continue Learning" button → next incomplete lesson
- Full curriculum with completion checkmarks, all lessons unlocked
- Lesson player page (already built: `LessonDetail.tsx`)
- Notes tab, certificate progress card
- Resources section (downloadable files from `course_resources`)

### Admin backend fields to fill:
- Title, slug, description, short_description, tags
- Instructor name/image, banner, thumbnail
- Trailer URL (for presale hero)
- Modules → Lessons (with type, video_url/file, duration, is_free toggle)
- Pricing variants (presale tab)
- Certificate settings (enable, threshold %)
- Drip settings (optional)

---

## Phase 4: Workshop (Live Event → Post-event Resources)

### Non-enrolled view:
- Workshop details: instructor, date/time, duration, seats remaining
- "What you'll learn" bullets
- Pricing CTA (from active pricing variant)
- Past workshop? Show "Access Recording" CTA instead

### Enrolled view — BEFORE workshop happens:
- Only show: Zoom/webinar link, date/time countdown, calendar add button
- No curriculum, no resources visible yet
- Simple card: "Your workshop is on [date]. Join via the link below."

### Enrolled view — AFTER workshop (admin unlocks resources):
- Recording appears (admin uploads to `course_resources` with `is_unlocked = true`)
- Slides, templates, extra resources become visible
- Same resource card UI as masterclass

### Admin backend fields:
- All standard course fields + `course_type = workshop`
- Schedule tab: date, time, Zoom link
- Resources tab: upload slides/recording/templates, toggle `is_unlocked` per resource
- After workshop: admin flips `is_unlocked` on resources → students see them immediately

---

## Phase 5: Cohort (Live Classes → Recordings Later)

### Non-enrolled view:
- Cohort landing page: mentors, syllabus (week-by-week), outcomes, selection criteria
- Application CTA → multi-step application form
- Pricing display, seats remaining, deadline

### Enrolled view — DURING cohort:
- Dashboard with: upcoming session Zoom links, schedule calendar
- Assignments list (locked by default, admin unlocks via `is_locked_until_enabled`)
- Community space link
- Progress tracking

### Enrolled view — AFTER sessions:
- Admin uploads recordings as lessons/resources → they appear in curriculum
- Completed assignments show mentor feedback
- Certificate available when threshold met

### Admin backend fields:
- Standard course fields + `course_type = cohort`
- Schedule tab: recurring sessions with Zoom links
- Content tab: modules/lessons (initially empty or locked, populated as cohort progresses)
- Assignments: lessons of type "assignment" with `is_locked_until_enabled = true`
- Resources: session recordings, slides uploaded post-session

### Backend migration: Move cohort data from mock to DB
- Cohort detail, application, and dashboard pages will read from `courses` + `course_modules` + `lessons` + `course_schedules` + `course_resources` instead of `cohortData.ts`

---

## Phase 6: Frontend Page Changes

| Page | Change |
|------|--------|
| `CourseDetail.tsx` | Add presale pricing variant display, trailer video, handle all 3 course types |
| `WorkshopDetail.tsx` | Rewrite to use DB data; show Zoom-only pre-event, resources post-event |
| `MasterclassDashboard.tsx` | Add resources section from `course_resources` |
| `CohortDetail.tsx` | Migrate from mock to DB |
| `CohortDashboard.tsx` | Migrate from mock to DB; show Zoom links, locked assignments |
| `AdminCourses.tsx` | Add "Presale" tab with pricing variants; add "Resources" tab; add lock toggle for assignments |

---

## Implementation Order

1. **DB migrations**: `course_pricing_variants`, `course_resources`, alter `lessons` + `courses`
2. **Admin Presale tab**: pricing variants CRUD in AdminCourses
3. **Admin Resources tab**: upload/manage resources per course, unlock toggle
4. **Workshop flow**: rewrite WorkshopDetail to DB, pre/post event states
5. **Cohort flow**: migrate from mock data to DB
6. **Masterclass resources**: add resources section to dashboard
7. **CourseDetail presale**: show active pricing variant, trailer, unified sales page

