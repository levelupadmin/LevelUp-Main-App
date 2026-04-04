

# Complete Masterclass Flow — Revised Plan

Since marketing/sales pages live on Framer externally, users arrive at your app already decided to buy. The flow is: **Framer landing page → Checkout page (in-app) → Sign up → Access course**.

## Flow

```text
Framer site → /checkout/:slug → Sign Up/Login → Free Enroll → /learn/course/:slug/dashboard → /learn/lesson/:id
```

## Tasks

### 1. Checkout Page (`/checkout/:slug`)
New page that Framer links to. Loads course by slug, shows a summary card (title, thumbnail, instructor, price — currently free), and a prominent "Get Access" CTA. If not logged in, CTA opens a sign-up/login modal or redirects to `/login?redirect=/checkout/:slug`. If logged in, instantly enrolls and redirects to dashboard.

### 2. Auth Redirect Support
Update the Auth page to accept a `?redirect=` query param so after sign-up/login the user lands back on the checkout page (which then auto-enrolls them).

### 3. Post-Auth Auto-Enrollment
On the checkout page, detect when user is now authenticated and auto-enroll them in the course, then redirect to `/learn/course/:slug/dashboard`.

### 4. Course Dashboard Polish (`MasterclassDashboard.tsx`)
Already exists. Polish:
- Ensure resources tab pulls from `lesson_resources` and `course_resources`
- Wire up the notes tab properly
- Add certificate download when threshold met

### 5. Lesson Player — Full Content Types
Existing `LessonDetail.tsx` + `LessonContentViewer.tsx` already handle video/text/PDF. Add:
- Assignment submission UI (already exists as `AssignmentSubmission.tsx` — ensure it renders for assignment-type lessons)
- Quiz/activity rendering for quiz-type lessons
- Resources list per lesson (already exists as `LessonResourcesList.tsx` — verify wiring)
- Mark complete + next lesson navigation (already exists — verify)

### 6. Access Gating
In `LessonDetail.tsx`, if user is not enrolled in the course, show a locked state with CTA to `/checkout/:slug` instead of lesson content. Free preview lessons (`is_free = true`) remain accessible.

## Files to Create/Edit

| File | Action |
|---|---|
| `src/pages/Checkout.tsx` | **Create** — checkout/enrollment page |
| `src/pages/Auth.tsx` | **Edit** — support `?redirect=` param |
| `src/App.tsx` | **Edit** — add `/checkout/:slug` route |
| `src/pages/MasterclassDashboard.tsx` | **Edit** — wire resources tab, certificate |
| `src/pages/LessonDetail.tsx` | **Edit** — add enrollment gating |
| `src/components/learn/LessonContentViewer.tsx` | **Edit** — ensure all content types render |

No database changes needed — all tables exist.

