

# Replace all courses with real LevelUp programs

## Summary
Delete all fake/test courses from the database and seed the exact 12 programs from the LevelUp Home Page reference project. Update all frontend mock/fallback data to match.

## Real Programs to Seed

**7 Masterclasses:**
1. Karthik Subbaraj — Filmmaking, ₹2499
2. Anthony Gonsalvez — Film Editing, ₹1999
3. G Venket Ram — Photography, ₹2499
4. DRK Kiran — Art Direction, ₹999
5. Ravi Basrur — Music, ₹1999
6. Lokesh Kanagaraj — Filmmaking, ₹2499
7. Nelson Dilipkumar — Filmmaking, ₹2499

**5 Live Cohorts:**
1. Breakthrough Filmmakers' Program (BFP) — Filmmaking
2. Video Editing Academy — Video Editing
3. Creator Academy — Content Creation
4. UI/UX Design Academy — Product Design
5. Screenwriting & Storytelling — Writing

## Implementation

### 1. Database migration — wipe and seed courses
- Delete all rows from `lessons`, `course_modules`, `course_resources`, `course_pricing_variants`, `course_schedules`, `course_access_grants`, `sales_page_courses`, `enrollments`, `lesson_progress`, `waitlists`, `utm_tracking`, `certificates`, `assignment_submissions`, `assignments`, `qna_questions`, `qna_answers`, `lesson_comments`, `lesson_resources` (cascade-safe order)
- Delete all rows from `courses`
- Insert 7 masterclass courses with real titles, slugs, instructor names, descriptions, prices, categories, `status = 'published'`, `course_type = 'masterclass'`
- Insert 5 cohort courses with real titles, slugs, descriptions, `course_type = 'cohort'`, `status = 'published'`
- Insert modules and lessons for the 3 masterclasses with full lesson data (G Venket Ram — 21 lessons, Anthony Gonsalvez — 19 lessons, DRK Kiran — 20 lessons)

### 2. Update `src/data/mockData.ts`
- Replace fake `courses` array with entries matching the 7 real masterclasses
- Replace `featuredCreators` with real instructor data
- Update `featuredBanner` to reference a real course
- Remove fake workshop data or replace with placeholder

### 3. Update `src/components/home/ForgeCrossSection.tsx`
- Update locations/dates to match reference: Writing Retreat → "Coorg, June 2026", Filmmaking Bootcamp → "Goa, April 2026", Creator Residency → "Goa, May 2026 / Bali, June 2026"
- Update subtitles to match reference project descriptions
- Update CTA links to match reference

### 4. Update `src/components/home/LiveCohortShowcase.tsx`
- Fallback data already matches the reference — verify and adjust any minor differences

### 5. Update `src/components/home/MasterclassGrid.tsx`
- No code changes needed — it reads from DB. Will automatically show the 7 real masterclasses after seeding.

## Files to modify
- **Database migration** — delete + insert ~12 courses, ~60 lessons, modules
- **`src/data/mockData.ts`** — replace with real program data
- **`src/components/home/ForgeCrossSection.tsx`** — update locations, dates, CTAs
- **`src/components/home/LiveCohortShowcase.tsx`** — minor fallback adjustments if needed

## Technical notes
- Deleting courses will cascade-remove all enrollments, progress, comments, etc. This is intentional since this is dev data.
- The 4 masterclasses without detailed lesson data (Karthik, Ravi, Lokesh, Nelson) are hosted externally — they'll be seeded as courses with metadata only (no modules/lessons).
- Existing `course_type` enum supports `masterclass`, `cohort`, `workshop` — no schema changes needed.

