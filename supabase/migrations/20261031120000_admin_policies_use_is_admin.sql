-- Stage 2 of the backend plan: the 12 policies that checked the admin role
-- inline now call is_admin(), like the other 209.
--
-- Each one ran `EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role ...)`
-- with its own role list: 6 allowed only 'admin', 3 allowed 'admin' or
-- 'author', 3 allowed 'admin' or 'superadmin'. None allowed 'owner', so the
-- two owners could not use these tables. 'author' and 'superadmin' are not
-- roles any user holds. is_admin() allows admin and owner.
--
-- ALTER POLICY keeps each policy's name, command and roles; only the
-- expressions change. The call is wrapped in (select ...) so Postgres runs it
-- once per query instead of once per row.

alter policy "admin_manage_quizzes" on public.chapter_quizzes
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy "admin_manage_quiz_questions" on public.quiz_questions
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy "admin_manage_quiz_options" on public.quiz_options
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy "admin_read_all_attempts" on public.quiz_attempts
  using ((select public.is_admin()));

alter policy "admin_manage_applications" on public.cohort_applications
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy "Admins manage cohort_batches" on public.cohort_batches
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy "Admins manage cohort_batch_members" on public.cohort_batch_members
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy "live_sessions_admin_all" on public.live_sessions
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy "Admins manage attendance" on public.session_attendance
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy "admin_manage_permissions" on public.role_permissions
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy "Admin delete notifications" on public.notifications
  using ((select public.is_admin()));

-- Signed-in users may still add notifications for themselves.
alter policy "Admin insert notifications" on public.notifications
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
