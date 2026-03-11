

## Recreate Admin Course Builder — Premium, Modular Architecture

### Problem
The current `AdminCourses.tsx` is a 1656-line monolith handling listing, detail view, curriculum, schedule, resources, settings, and all mutations in one file. The UI uses a horizontal tab bar that gets cramped. The listing is a table, not a visual card grid. Content types are limited to video/pdf/text/quiz/assignment. There's no clone course, no Reviews tab, no QnA Chatbot tab, and no "Upload to Cloud" affordance.

### What We'll Build

**Screen 1: Course Listing** (`/admin/courses`)
- Card grid (not table) with thumbnail, title, status badge, section/chapter counts, "Edit Course" CTA
- Overflow menu per card: View as Customer, Course Overview, Clone Course, Unpublish, Delete
- Search + filters bar retained
- "Create Course" action with existing dialog

**Screen 2: Course Builder** (`/admin/courses/:id`)
- New route with its own layout: left sidebar nav (vertical) + main content area
- Left sidebar tabs: Curriculum, Information, Drip, Report, Comments, QnA, Assignment Responses, Reviews, QnA Chatbot
- Top-right: "Preview Changes" button
- Each tab is its own component file

**Screen 3: Curriculum Tab** (default tab in builder)
- Sections → Chapters → Content blocks (3-level hierarchy using existing modules/lessons)
- Expand/collapse chapters, drag handle affordance (visual only for now)
- "Add Content" dropdown inside chapters with all content types: Video, MCQ/Quiz, Audio, Image, PDF, Link, Article/Text, Cloud Upload
- "Add Chapter" and "Add Section" buttons
- Chapter overflow menu (rename, delete, move)

**Screen 4: Information Tab**
- Clean form layout: default video thumbnail upload, thumbnail upload area, validity toggle, "show as locked" toggle, save button
- Uses existing course fields but presented in a cleaner card-based form

### File Architecture

```text
src/pages/admin/
  AdminCourses.tsx          ← REWRITE: card grid listing only (~300 lines)
  AdminCourseBuilder.tsx    ← NEW: builder layout with sidebar + tab routing

src/components/admin/course-builder/
  BuilderSidebar.tsx        ← Left nav for builder tabs
  CurriculumTab.tsx         ← Sections/chapters/content management
  InformationTab.tsx        ← Course settings form
  DripTab.tsx               ← Drip settings (extract from existing)
  ReviewsTab.tsx            ← NEW: placeholder for reviews
  QnAChatbotTab.tsx         ← NEW: placeholder for QnA chatbot
  ContentTypeSelector.tsx   ← Dropdown/popover for adding content types
  SectionBlock.tsx          ← Single section with its chapters
  ChapterBlock.tsx          ← Single chapter with content items
  ContentItemRow.tsx        ← Single lesson/content row
```

### Routing Change
- Add route: `/admin/courses/:courseId` → `AdminCourseBuilder`
- Existing `/admin/courses` stays as listing
- Clicking "Edit Course" on a card navigates to `/admin/courses/:courseId`

### Data Layer
- All existing hooks (`useCourses`, `useModules`, `useLessons`, etc.) and mutations will be extracted into a shared `src/hooks/useCourseAdmin.ts` file so both listing and builder can use them
- No database changes needed — uses existing `courses`, `course_modules`, `lessons` tables
- Mock data supplements for cards (section/chapter counts derived from modules/lessons queries)

### Content Types
The lesson type selector in `ContentTypeSelector.tsx` will show all 8 types with icons:
- Video (existing), MCQ/Quiz (existing), Assignment (existing)
- Audio, Image, PDF (existing), Link, Article/Text (existing)
- "Upload to Cloud" CTA (visual placeholder, no real integration)

Audio/Image/Link types will store URLs in existing `video_url` or `file_url` fields and render appropriate previews.

### Design Rules Applied
- Dark theme tokens throughout (`bg-card`, `border-border`, `text-foreground`)
- Card grid with `rounded-xl`, subtle shadows, hover states
- Builder sidebar: compact vertical nav with icons + labels, highlight accent color
- Clean form layouts with proper spacing, grouped in bordered cards
- No generic LMS look — premium, minimal, structured

### Implementation Order
1. Extract data hooks into `useCourseAdmin.ts`
2. Build `AdminCourseBuilder.tsx` with `BuilderSidebar.tsx` layout
3. Build `CurriculumTab.tsx` with `SectionBlock`, `ChapterBlock`, `ContentItemRow`, `ContentTypeSelector`
4. Build `InformationTab.tsx`
5. Rewrite `AdminCourses.tsx` as card grid listing
6. Add route for builder, wire navigation
7. Add placeholder tabs (Reviews, QnA Chatbot, Drip) and connect existing tabs (Comments, QnA, Report, Assignments)

