

# Analysis: LevelUp LMS Document vs Current Codebase

## What the Document Specifies

The uploaded document is a comprehensive product spec for rebuilding the LevelUp Learning LMS (currently on TagMango). It covers:

1. **Course Listing Page** — 3-column card grid with admin (Edit/overflow) and student (progress/Continue) views, search/filter bar, reorder capability
2. **Course Editor (Admin)** — 7-tab sidebar: Curriculum, Information, Drip, Report, Comments, QnA, Assignment Responses
3. **Student Learning View** — Two-panel layout (70/30 video+sidebar), collapsible sidebar with progress, Description/Resources/QnA tabs below content
4. **New DB entities** — Comments, QnA (questions+answers), Assignments, AssignmentSubmissions, ChapterResources (per-lesson attachments)
5. **Report/Analytics** — Course completion breakdown, chapter completion stats, leaderboard, assignment response metrics with CSV export
6. **Drip Content** — 4 modes (none, enrollment-date, specific-date, by-completion)
7. **DRM & Settings** — Validity, show-as-locked, DRM toggle, disable QnA/comments toggles

## What Already Exists

- **DB tables**: `courses`, `course_modules`, `lessons`, `enrollments`, `lesson_progress`, `course_schedules`, `course_pricing_variants`, `course_resources`, `certificates`
- **Admin**: `AdminCourses.tsx` (1719 lines) — course CRUD, modules/lessons management, presale tab, resources tab, schedule, pricing, settings
- **Student**: `LessonDetail.tsx` — two-panel layout with video/PDF player + collapsible sidebar, prev/next navigation, mark complete, notes
- **CourseDetail.tsx** — enrolled vs non-enrolled views, progress tracking
- **Hooks**: `useCourseData.ts` — enrollment, progress, lesson completion

## Gap Analysis — What Needs to Be Built

### Phase A: New Database Tables (4 tables)

| Table | Purpose |
|-------|---------|
| `lesson_comments` | Per-lesson threaded comments (parent_id for replies) |
| `qna_questions` | Per-lesson student questions |
| `qna_answers` | Answers to QnA questions |
| `assignments` | Assignment config per lesson (instructions, passing_score, max_score) |
| `assignment_submissions` | Student submissions with grading |
| `lesson_resources` | Per-lesson downloadable attachments (distinct from course_resources) |

Also alter `courses` table to add settings fields: `validity_days`, `show_as_locked`, `drm_enabled`, `disable_qna`, `disable_comments`.

### Phase B: Admin Course Editor Enhancements

The doc specifies 7 sidebar tabs. Currently we have tabs across the top. Changes needed:

1. **Comments tab** — List all comments across lessons, moderate (delete), reply
2. **QnA tab** — View all questions/answers, respond as admin
3. **Assignment Responses tab** — 5 metric cards (submission rate, avg score, passing %, retake %, drop-off) + searchable submission table + CSV export + date filter
4. **Report tab** — 3 sub-tabs: Course Completion (percentage breakdown table + donut chart), Chapter Completion (per-chapter stats), Leaderboard (student rankings)
5. **Drip tab enhancement** — Add "by completion" mode and "specific date" mode (currently only enrollment-date and interval-based exist)
6. **Information tab** — Add settings toggles: Validity, Show as locked, DRM, Disable QnA, Disable comments

### Phase C: Student Learning View Enhancements

The current `LessonDetail.tsx` has the two-panel layout but is missing:

1. **Description/Resources/QnA tabs** below the content viewer — currently only shows notes
2. **Comments thread** inside the Description tab
3. **Per-lesson resources** (downloadable files) in Resources tab
4. **QnA thread** with "Ask a Question" button in QnA tab
5. **Assignment submission UI** for assignment-type lessons
6. **Auto-mark complete at 90% watch** (video progress tracking)
7. **Drip lock icons** on locked lessons in sidebar

### Phase D: Course Listing Page Enhancements

Current listing is admin-only in `AdminCourses.tsx`. The doc wants:

1. **Student-facing course listing** at `/courses` showing only enrolled courses with progress bars and Continue/Start CTAs
2. **Admin listing** with reorder, Comments(N) badge, overflow menu (View/Duplicate/Delete/Share)
3. **Search bar** filtering by course title/description with Course/Section/Chapter scope

## Recommended Implementation Order

Given the scope, I recommend breaking this into 3 implementation batches:

### Batch 1: Database + Admin Tabs (Comments, QnA, Reports, Assignments)
- Create 5 new tables with RLS
- Add course settings columns
- Build admin Comments, QnA, Report, and Assignment Responses tabs

### Batch 2: Student Learning View
- Add Description/Resources/QnA tabs below lesson content
- Build comments thread component
- Build QnA thread component
- Build assignment submission UI
- Add per-lesson resource downloads

### Batch 3: Course Listing + Polish
- Student course listing page with progress
- Search/filter bar
- Drip lock icons in sidebar
- Video auto-complete at 90%
- CSV export for assignments

**Should I start implementing Batch 1 — the database migrations and admin-side tabs for Comments, QnA, Reports, and Assignment Responses?**

