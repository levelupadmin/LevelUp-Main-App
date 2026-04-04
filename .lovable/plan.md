

# Fix: Enrollment flow broken in dev/preview mode

## Root Cause

Every enrollment-related query calls `supabase.auth.getUser()`. In dev/preview mode this always returns `null`, so:
1. `useEnrollInCourse` — the mutation falls into the preview fallback, but uses `require()` (broken in Vite ESM), so `devUserId` stays `"anonymous"` instead of the actual dev user ID
2. `useEnrollment` — same broken `require()` pattern, so it never finds the preview enrollment
3. `MyLearning.tsx` — calls `supabase.auth.getUser()` directly, gets `null`, returns `[]` immediately
4. `ContinueLearning.tsx` — queries Supabase with the dev user's fake ID (`"dev-student-free"`), which doesn't exist in the DB, so returns nothing

The result: enrollment appears to succeed (no error shown), but the course never appears anywhere.

## Fix

### 1. Fix `useCourseData.ts` — replace broken `require()` with proper imports

- Import `useDevAuth` directly at the top (ESM import, not `require()`)
- `useEnrollment`: if no real user, read dev user from `useDevAuth()` and check the preview store
- `useEnrollInCourse`: same — use the imported `useDevAuth` hook result for the dev user ID
- Problem: these are inside `queryFn` (not a React component), so we can't call `useDevAuth()` inside them. Instead, we'll restructure the hooks to capture the dev user at hook level and pass it into the `queryFn` closure.

### 2. Fix `MyLearning.tsx` — add preview enrollment awareness

- Import `useAuth` to get the dev user
- If `supabase.auth.getUser()` returns null, fall back to reading preview enrollments from sessionStorage
- For preview enrollments, fetch the course data directly by course ID (the course data is public/readable)
- Show preview-enrolled courses with 0% progress (since lesson_progress also requires a real user)

### 3. Fix `ContinueLearning.tsx` — same pattern

- Already uses `useAuth()` for `user?.id`, but then queries `enrollments` table with a fake dev ID that doesn't exist in DB
- Add preview enrollment fallback: if no real session, read from sessionStorage and fetch course metadata separately

### 4. Enhance `previewEnrollment.ts` — add ability to list all enrollments

- Add `getPreviewEnrollments(userId: string): string[]` to return all course IDs a dev user is enrolled in
- This lets MyLearning and ContinueLearning enumerate preview enrollments

## Files to modify

- **`src/lib/previewEnrollment.ts`** — add `getPreviewEnrollments()` helper
- **`src/hooks/useCourseData.ts`** — replace `require()` with proper hook-level dev auth; restructure `useEnrollment` and `useEnrollInCourse` to capture dev user outside `queryFn`
- **`src/pages/MyLearning.tsx`** — add preview enrollment fallback when no real Supabase session
- **`src/components/home/ContinueLearning.tsx`** — same preview fallback

## Technical notes

- The key constraint: React hooks (`useDevAuth`) can only be called at hook/component level, not inside `queryFn`. So each hook needs to call `useDevAuth()` at the top and capture the user in the closure.
- No database changes needed.
- Preview enrollments are ephemeral (sessionStorage) — this is intentional for dev/preview mode.

