

## Problem Summary

The Learn page displays **hardcoded mock data** from `src/data/learningData.ts` and `src/data/cohortData.ts` — six masterclasses with instructor images, three cohort programs with banners, and workshops. None of this is connected to the database. Meanwhile, the admin backend (`AdminCourses.tsx`) already manages courses in the DB but:

1. The Learn page ignores the DB and reads from static files
2. The DB courses have **no thumbnails, no instructor images**, and no modules/lessons populated
3. Cohorts and workshops exist only as mock data — no DB tables for their unique fields (cohort banners, workshop instructor photos, etc.)
4. The `courses` table already has fields for `thumbnail_url`, `instructor_name`, `course_type` (masterclass/workshop/cohort), but is missing an `instructor_image_url` column and a `banner_url` column

---

## What We Will Build

### 1. Database Changes
- Add `instructor_image_url` (text) and `banner_url` (text) columns to the `courses` table so admins can upload instructor portraits and cohort/workshop banners
- These columns will be used by the Learn page to display the correct images per course type

### 2. Admin Backend — Enhanced Course Editor
Update `AdminCourses.tsx` detail view to add:
- **Instructor image upload** — a separate upload field for the instructor's photo (stored in `course-content` bucket, saved to `instructor_image_url`)
- **Banner image upload** — for cohort programs and workshops, a banner/hero upload (saved to `banner_url`)
- A new **"Details" tab** in the course editor for editing `short_description`, `description`, `estimated_duration`, `tags` (what you'll learn), and the new image fields — so all the content that appears on the frontend can be controlled from the admin

### 3. Learn Page — Connect to Database
Rewrite `Learn.tsx` to fetch courses from the database instead of mock data:
- Query `courses` table filtered by `status = 'published'`, grouped by `course_type` (masterclass, cohort, workshop)
- Use `thumbnail_url` for masterclass card images, `banner_url` for cohort banners, `instructor_image_url` for workshop instructor photos
- Keep the existing layout structure (masterclass grid, cohort banners, workshop horizontal scroll) but render DB data
- "Continue Learning" section will query `enrollments` + `lesson_progress` for the current user to show real progress
- Fall back to placeholder images when URLs are not set

### 4. Seed Modules & Lessons for Existing Masterclasses
The existing published masterclasses in the DB (Cinematography, Video Editing, Sound Design, Documentary, Screenwriting) have zero modules/lessons. We will:
- Use the data insert tool to create 2-3 modules per course with 3-4 lessons each, matching the mock data themes
- This ensures that when a student clicks a masterclass, the dashboard and curriculum are populated

---

## Files to Modify
- `src/pages/Learn.tsx` — replace mock data imports with React Query hooks fetching from `courses` table
- `src/pages/admin/AdminCourses.tsx` — add instructor image and banner upload fields in the detail view

## Files NOT Changed
- `src/data/learningData.ts` and `src/data/cohortData.ts` — kept as fallback references but no longer imported by `Learn.tsx`
- `CourseDetail.tsx`, `MasterclassDashboard.tsx` — already connected to DB, no changes needed

## Database Changes
- Migration: add `instructor_image_url text` and `banner_url text` to `courses`
- Data inserts: seed modules and lessons for the 5 published masterclass courses

