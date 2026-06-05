-- "Notify me" interest capture for upcoming courses.
--
-- The Browse page showed a dead "Notify me" label on upcoming courses. This
-- table backs a real capture flow: a signed-in student registers interest in a
-- course that hasn't launched, and an admin can later email everyone who asked
-- (notified_at stamps who's been contacted so a launch blast doesn't double-send).
CREATE TABLE IF NOT EXISTS public.course_notify_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

-- One standing request per (course, user) — repeated taps are idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS course_notify_requests_course_user_key
  ON public.course_notify_requests (course_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_notify_course ON public.course_notify_requests (course_id);
CREATE INDEX IF NOT EXISTS idx_course_notify_unnotified
  ON public.course_notify_requests (course_id) WHERE notified_at IS NULL;

ALTER TABLE public.course_notify_requests ENABLE ROW LEVEL SECURITY;

-- A signed-in user may register, read, and withdraw their OWN interest only.
CREATE POLICY course_notify_insert_own ON public.course_notify_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY course_notify_read_own ON public.course_notify_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY course_notify_delete_own ON public.course_notify_requests
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Admins manage everything (read lists, stamp notified_at).
CREATE POLICY course_notify_admin_all ON public.course_notify_requests
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, DELETE, UPDATE ON public.course_notify_requests TO authenticated;
