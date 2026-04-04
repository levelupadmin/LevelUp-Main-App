

# Bug: Free Students Can Access Paid Course Lessons

## What's happening

When a non-enrolled user clicks **"Start Course · ₹4,999"** on a paid course that has **no `payment_page_url` set**, the button calls `handleStartCourse()` which — instead of redirecting to checkout — navigates directly to the first lesson.

### Root cause (CourseDetail.tsx, lines 118–134)

```text
handleStartCourse logic:
  1. If enrolled → go to dashboard        ✅
  2. If course is free → enroll + dashboard ✅
  3. If paid + no enrollment:
     a. If free lessons exist → navigate to freeLessons[0]  ← misleading but OK
     b. Else → navigate to lessons[0]                       ← BUG: bypasses payment
```

The CTA button (line 361–364) renders **"Start Course · ₹4,999"** when there's no `payment_page_url` and the course isn't free. Clicking it runs `handleStartCourse`, which skips payment entirely and sends users to lessons.

The `LessonDetail` page does have an enrollment gate (line 64), but only for non-free lessons. If the first lesson is marked `is_free`, users get full video access. And the button label "Start Course · ₹4,999" is deceptive regardless.

### Additionally: the play button in the hero (line 388) also calls `handleStartCourse`, giving another entry point.

## Fix

1. **`handleStartCourse`**: For paid courses without enrollment, redirect to `/checkout/${course.slug}` instead of navigating to lessons directly.

2. **CTA label**: When no `payment_page_url` exists for a paid course, the button should still say "Enroll Now" and redirect to checkout — not imply the user can start immediately.

3. **Hero play button**: For non-enrolled users on paid courses, either hide it or make it navigate to the first free preview lesson only (not `handleStartCourse`).

## Files to change

- **`src/pages/CourseDetail.tsx`** — Fix `handleStartCourse` to route paid/non-enrolled users to checkout; update CTA label logic; guard hero play button.

