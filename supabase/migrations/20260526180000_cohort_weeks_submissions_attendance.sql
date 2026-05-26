-- Cohort weekly sprint infrastructure
--
-- Shipping the four-pillar cohort learning loop:
--   R1 — Weekly Sprint Cohort Dashboard
--   R2 — Assignment submission + mentor feedback
--   R3 — Cohort-scoped community + peer review
--   R5 — Attendance marking + certificate gating
--
-- See LIVE-COHORT-PLAN.md (Apr 12, 2026) for the original blueprint.
-- This migration creates the four new tables, extends community_posts +
-- live_sessions, wires triggers + RPCs + RLS, and updates the certificate
-- auto-generation function to factor in attendance.

----------------------------------------------------------------------
-- 1. cohort_weeks — one row per (batch, week_number)
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_batch_id uuid NOT NULL REFERENCES public.cohort_batches(id) ON DELETE CASCADE,
  week_number integer NOT NULL CHECK (week_number >= 1 AND week_number <= 52),
  theme text NOT NULL,
  description text,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  assignment_prompt text,
  assignment_due_at timestamptz,
  feedback_session_at timestamptz,
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming','active','completed','archived')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_weeks_unique_per_batch UNIQUE (cohort_batch_id, week_number)
);
CREATE INDEX cohort_weeks_batch_idx ON public.cohort_weeks (cohort_batch_id, week_number);
CREATE INDEX cohort_weeks_status_idx ON public.cohort_weeks (status) WHERE status IN ('upcoming','active');

----------------------------------------------------------------------
-- 2. live_sessions <-> cohort_weeks FK (column already exists)
----------------------------------------------------------------------
ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_week_id_fkey;
ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_week_id_fkey
  FOREIGN KEY (week_id) REFERENCES public.cohort_weeks(id) ON DELETE SET NULL;

----------------------------------------------------------------------
-- 3. cohort_week_submissions — student assignment uploads
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_week_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_week_id uuid NOT NULL REFERENCES public.cohort_weeks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text_content text,
  file_urls text[] NOT NULL DEFAULT '{}',
  link_url text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft','submitted','under_review','reviewed','cleared','needs_revision','late')),
  late boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  feedback_text text,
  rating smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  open_to_peer_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_week_submissions_one_per_user UNIQUE (cohort_week_id, user_id)
);
CREATE INDEX cohort_week_submissions_week_idx ON public.cohort_week_submissions (cohort_week_id, status);
CREATE INDEX cohort_week_submissions_user_idx ON public.cohort_week_submissions (user_id, submitted_at DESC);
CREATE INDEX cohort_week_submissions_review_queue_idx ON public.cohort_week_submissions (status, submitted_at)
  WHERE status IN ('submitted','under_review');

----------------------------------------------------------------------
-- 4. cohort_week_attendance — per-user-per-week attendance
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_week_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_week_id uuid NOT NULL REFERENCES public.cohort_weeks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  attended boolean NOT NULL DEFAULT false,
  marked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  marked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_week_attendance_unique UNIQUE (cohort_week_id, user_id)
);
CREATE INDEX cohort_week_attendance_user_idx ON public.cohort_week_attendance (user_id, attended);
CREATE INDEX cohort_week_attendance_week_idx ON public.cohort_week_attendance (cohort_week_id, attended);

----------------------------------------------------------------------
-- 5. peer_review_assignments — who reviews whose submission
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.peer_review_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.cohort_week_submissions(id) ON DELETE CASCADE,
  reviewer_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','submitted','skipped')),
  feedback_text text,
  rating smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT peer_review_unique UNIQUE (submission_id, reviewer_user_id),
  CONSTRAINT peer_review_no_self CHECK (true)  -- enforced via trigger below
);
CREATE INDEX peer_review_reviewer_idx ON public.peer_review_assignments (reviewer_user_id, status);

CREATE OR REPLACE FUNCTION public._peer_review_no_self_assignment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  submission_owner uuid;
BEGIN
  SELECT user_id INTO submission_owner
  FROM public.cohort_week_submissions WHERE id = NEW.submission_id;
  IF submission_owner = NEW.reviewer_user_id THEN
    RAISE EXCEPTION 'A user cannot peer-review their own submission';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS peer_review_no_self_trigger ON public.peer_review_assignments;
CREATE TRIGGER peer_review_no_self_trigger
  BEFORE INSERT OR UPDATE ON public.peer_review_assignments
  FOR EACH ROW EXECUTE FUNCTION public._peer_review_no_self_assignment();

----------------------------------------------------------------------
-- 6. community_posts: add cohort_batch_id + post_type
----------------------------------------------------------------------
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS cohort_batch_id uuid REFERENCES public.cohort_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'discussion'
    CHECK (post_type IN ('discussion','peer_review_request','peer_review_response','announcement','wins')),
  ADD COLUMN IF NOT EXISTS linked_submission_id uuid REFERENCES public.cohort_week_submissions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS community_posts_cohort_idx
  ON public.community_posts (cohort_batch_id, created_at DESC)
  WHERE cohort_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS community_posts_type_idx
  ON public.community_posts (post_type, created_at DESC);

----------------------------------------------------------------------
-- 7. Triggers for updated_at on all new tables
----------------------------------------------------------------------
CREATE TRIGGER cohort_weeks_updated_at BEFORE UPDATE ON public.cohort_weeks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cohort_week_submissions_updated_at BEFORE UPDATE ON public.cohort_week_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cohort_week_attendance_updated_at BEFORE UPDATE ON public.cohort_week_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER peer_review_assignments_updated_at BEFORE UPDATE ON public.peer_review_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

----------------------------------------------------------------------
-- 8. Trigger: notify student when their submission is reviewed
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._notify_on_submission_reviewed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('reviewed','cleared','needs_revision')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.reviewed_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link_url)
    VALUES (
      NEW.user_id,
      'submission_reviewed',
      'Your assignment was reviewed',
      COALESCE(left(NEW.feedback_text, 140), 'Open your cohort dashboard to read the feedback.'),
      '/cohort?submission=' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS submission_reviewed_notify ON public.cohort_week_submissions;
CREATE TRIGGER submission_reviewed_notify
  AFTER UPDATE ON public.cohort_week_submissions
  FOR EACH ROW EXECUTE FUNCTION public._notify_on_submission_reviewed();

----------------------------------------------------------------------
-- 9. RPC: get_cohort_progress(user_id, offering_id)
--    One round-trip for the entire student dashboard.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cohort_progress(p_user_id uuid, p_offering_id uuid)
RETURNS TABLE (
  cohort_batch_id uuid,
  batch_label text,
  week_id uuid,
  week_number integer,
  theme text,
  description text,
  starts_on date,
  ends_on date,
  assignment_prompt text,
  assignment_due_at timestamptz,
  feedback_session_at timestamptz,
  week_status text,
  live_session_id uuid,
  live_session_title text,
  live_session_at timestamptz,
  live_session_zoom_link text,
  submission_id uuid,
  submission_status text,
  submission_rating smallint,
  submission_feedback text,
  submission_submitted_at timestamptz,
  attended boolean,
  attendance_marked boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    cb.id AS cohort_batch_id,
    cb.name AS batch_label,
    cw.id AS week_id,
    cw.week_number,
    cw.theme,
    cw.description,
    cw.starts_on,
    cw.ends_on,
    cw.assignment_prompt,
    cw.assignment_due_at,
    cw.feedback_session_at,
    cw.status AS week_status,
    ls.id AS live_session_id,
    ls.title AS live_session_title,
    ls.scheduled_at AS live_session_at,
    ls.zoom_link AS live_session_zoom_link,
    s.id AS submission_id,
    s.status AS submission_status,
    s.rating AS submission_rating,
    s.feedback_text AS submission_feedback,
    s.submitted_at AS submission_submitted_at,
    COALESCE(a.attended, false) AS attended,
    (a.id IS NOT NULL) AS attendance_marked
  FROM public.cohort_batch_members cbm
  JOIN public.enrolments e ON e.id = cbm.enrolment_id
  JOIN public.cohort_batches cb ON cb.id = cbm.batch_id
  JOIN public.cohort_weeks cw ON cw.cohort_batch_id = cb.id
  LEFT JOIN public.live_sessions ls ON ls.week_id = cw.id
  LEFT JOIN public.cohort_week_submissions s
    ON s.cohort_week_id = cw.id AND s.user_id = p_user_id
  LEFT JOIN public.cohort_week_attendance a
    ON a.cohort_week_id = cw.id AND a.user_id = p_user_id
  WHERE e.user_id = p_user_id
    AND cb.offering_id = p_offering_id
  ORDER BY cw.week_number, cw.sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_cohort_progress(uuid, uuid) TO authenticated;

----------------------------------------------------------------------
-- 10. RPC: get_attendance_pct(user_id, offering_id)
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_attendance_pct(p_user_id uuid, p_offering_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH weeks AS (
    SELECT cw.id
    FROM public.cohort_batch_members cbm
    JOIN public.enrolments e ON e.id = cbm.enrolment_id
    JOIN public.cohort_batches cb ON cb.id = cbm.batch_id
    JOIN public.cohort_weeks cw ON cw.cohort_batch_id = cb.id
    WHERE e.user_id = p_user_id
      AND cb.offering_id = p_offering_id
      AND cw.status IN ('active','completed','archived')
  ),
  marked AS (
    SELECT count(*) FILTER (WHERE a.attended) AS attended_count,
           count(*) AS total_count
    FROM weeks
    LEFT JOIN public.cohort_week_attendance a
      ON a.cohort_week_id = weeks.id AND a.user_id = p_user_id
  )
  SELECT CASE WHEN total_count = 0 THEN 0
              ELSE round((attended_count::numeric / total_count) * 100, 1) END
  FROM marked;
$$;

GRANT EXECUTE ON FUNCTION public.get_attendance_pct(uuid, uuid) TO authenticated;

----------------------------------------------------------------------
-- 11. Update certificate auto-generation to factor in attendance.
--     The existing useCertificateAutoGenerate hook auto-issues a
--     certificate when course completion is reached. We now also
--     require attendance >= offerings.attendance_threshold_pct.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_certificate_eligible(
  p_user_id uuid, p_offering_id uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  threshold integer;
  actual numeric;
  is_live_cohort boolean;
BEGIN
  SELECT
    coalesce(o.attendance_threshold_pct, 0),
    (o.payment_mode = 'staged')
  INTO threshold, is_live_cohort
  FROM public.offerings o WHERE o.id = p_offering_id;

  -- Self-paced offerings: just need completion (handled elsewhere)
  IF NOT is_live_cohort OR threshold = 0 THEN
    RETURN true;
  END IF;

  actual := public.get_attendance_pct(p_user_id, p_offering_id);
  RETURN actual >= threshold;
END $$;

GRANT EXECUTE ON FUNCTION public.user_is_certificate_eligible(uuid, uuid) TO authenticated;

----------------------------------------------------------------------
-- 12. RLS — enable + policies
----------------------------------------------------------------------
ALTER TABLE public.cohort_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_week_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_week_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_review_assignments ENABLE ROW LEVEL SECURITY;

-- cohort_weeks: students see weeks of batches they're in; mentors+admins see all
CREATE POLICY cohort_weeks_admin_all ON public.cohort_weeks
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY cohort_weeks_student_read ON public.cohort_weeks FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cohort_batch_members cbm
    JOIN public.enrolments e ON e.id = cbm.enrolment_id
    WHERE cbm.batch_id = cohort_weeks.cohort_batch_id
      AND e.user_id = auth.uid()
  ));

-- cohort_week_submissions: students CRUD own + reviewers (mentors+admins) all
CREATE POLICY cwsub_admin_all ON public.cohort_week_submissions
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY cwsub_own_read ON public.cohort_week_submissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin());
CREATE POLICY cwsub_own_insert ON public.cohort_week_submissions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY cwsub_own_update ON public.cohort_week_submissions FOR UPDATE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status IN ('draft','submitted','needs_revision'))
    OR is_admin()
  )
  WITH CHECK (
    (user_id = auth.uid() AND status IN ('draft','submitted','needs_revision'))
    OR is_admin()
  );
-- Peer reviewers can read submissions opted-in for peer review
CREATE POLICY cwsub_peer_review_read ON public.cohort_week_submissions FOR SELECT
  TO authenticated
  USING (
    open_to_peer_review = true
    AND EXISTS (
      SELECT 1
      FROM public.cohort_batch_members me_m
      JOIN public.enrolments me_e ON me_e.id = me_m.enrolment_id
      JOIN public.cohort_batch_members them_m ON them_m.batch_id = me_m.batch_id
      JOIN public.enrolments them_e ON them_e.id = them_m.enrolment_id
      JOIN public.cohort_weeks cw ON cw.cohort_batch_id = me_m.batch_id
      WHERE me_e.user_id = auth.uid()
        AND them_e.user_id = cohort_week_submissions.user_id
        AND cw.id = cohort_week_submissions.cohort_week_id
    )
  );

-- cohort_week_attendance: students read own + admins all
CREATE POLICY cwa_admin_all ON public.cohort_week_attendance
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY cwa_own_read ON public.cohort_week_attendance FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin());

-- peer_review_assignments: reviewer CRUD own + admins all
CREATE POLICY pra_admin_all ON public.peer_review_assignments
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY pra_reviewer_read ON public.peer_review_assignments FOR SELECT
  TO authenticated
  USING (reviewer_user_id = auth.uid() OR is_admin());
CREATE POLICY pra_reviewer_update ON public.peer_review_assignments FOR UPDATE
  TO authenticated
  USING (reviewer_user_id = auth.uid())
  WITH CHECK (reviewer_user_id = auth.uid());
-- Submitters can read assignments on their own submission
CREATE POLICY pra_owner_read ON public.peer_review_assignments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cohort_week_submissions s
    WHERE s.id = peer_review_assignments.submission_id AND s.user_id = auth.uid()
  ));

----------------------------------------------------------------------
-- 13. Storage bucket: cohort-submissions (private)
----------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cohort-submissions',
  'cohort-submissions',
  false,
  2147483648,  -- 2 GB per file
  ARRAY[
    'video/mp4','video/quicktime','video/x-matroska','video/webm',
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'audio/mpeg','audio/mp4','audio/wav',
    'application/zip','application/x-rar-compressed'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS — students upload + read own files; admins all
CREATE POLICY "cohort_submissions_user_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cohort-submissions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "cohort_submissions_user_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cohort-submissions'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_admin()
    )
  );
CREATE POLICY "cohort_submissions_user_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cohort-submissions'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_admin()
    )
  );
