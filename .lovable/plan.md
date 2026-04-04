
Diagnosis:
- The success page and route already exist. The reason you never reach them is earlier in the flow.
- `Checkout.tsx` treats the user as authenticated via the dev auth wrapper, so the CTA runs the enrollment mutation.
- But `useEnrollInCourse()` still relies on `supabase.auth.getUser()`. In preview/dev mode that returns `null`, so the mutation throws `"Not authenticated"`.
- `Checkout.tsx` swallows that failure by only setting `enrollFailed` and never showing a toast/alert, so the button appears to do nothing.

Implementation plan:
1. Unify checkout/auth behavior for preview and real usage
   - Keep real backend enrollment for real signed-in users.
   - Add a preview-safe fallback for the current forced dev-auth setup so checkout can still complete in preview when no backend session exists.

2. Add a small preview enrollment layer
   - Create a tiny helper to store/read “simulated enrollments” keyed by mock user + course slug/id.
   - This is only for preview/dev mode so the CTA can complete and the app can behave consistently after success.
   - No backend writes, UTM writes, or notifications should be faked in this mode.

3. Update `useEnrollment` and `useEnrollInCourse`
   - `useEnrollment`: first read the real backend enrollment; if there is no backend session but there is a dev-auth user, fall back to the preview enrollment store.
   - `useEnrollInCourse`: if a real backend user exists, insert normally; otherwise create the preview enrollment marker and return a success result.
   - Invalidate the same React Query keys in both paths so checkout/course detail refresh correctly.

4. Fix the checkout page UX
   - Keep CTA behavior the same, but make success navigation happen after either real or preview enrollment succeeds.
   - Replace the silent `setEnrollFailed(true)` path with a visible toast and/or inline error message.
   - Clean up unused state like `enrollLoading` if it remains unnecessary.

5. Make the thank-you page reliable for conversions
   - Keep `/enrollment-success/:slug` as the landing page after enrollment.
   - Add a small guard so GA4/Meta events fire once per successful arrival, not repeatedly on every revisit/refresh.
   - Keep the course metadata in the event payload: course id, title, category, and INR value.

6. Keep post-purchase navigation consistent
   - Update `CourseDetail.tsx` to respect the same preview enrollment fallback so “Start Learning” from the thank-you page doesn’t drop the user back into a non-enrolled state in preview.
   - Verify the dashboard/start-learning path works after success for both preview-mode users and real authenticated users.

Files to update:
- `src/hooks/useCourseData.ts`
- `src/pages/Checkout.tsx`
- `src/pages/EnrollmentSuccess.tsx`
- `src/pages/CourseDetail.tsx`
- likely one small shared helper file for preview enrollment state

Technical details:
- No database migration is needed for this fix.
- The core bug is the mismatch between forced dev auth in `AuthContext` and real-session checks inside the course hooks.
- The minimum reliable fix is not “change the button”; it is “make enrollment succeed or visibly fail under the same auth model the UI is using.”
