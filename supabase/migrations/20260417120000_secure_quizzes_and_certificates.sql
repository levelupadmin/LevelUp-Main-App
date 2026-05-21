-- ════════════════════════════════════════════════════════════════════
-- Secure quizzes and certificates (P0 security fixes)
-- ════════════════════════════════════════════════════════════════════
-- Two holes being closed in this migration:
--
--   1. quiz_options.is_correct was readable by any authenticated user
--      via `students_read_options FOR SELECT USING (true)`. The client
--      (ChapterViewer.tsx QuizBlock) fetched the `is_correct` column
--      and scored locally, meaning any student could read the answer
--      key straight out of the REST API. We keep a narrow read path
--      (text + ordering only) for students and move scoring + attempt
--      insertion into a SECURITY DEFINER RPC (`submit_quiz`).
--
--   2. certificates had `certificates_own_insert WITH CHECK
--      (auth.uid() = user_id)`, meaning any logged-in user could
--      forge a certificate for themselves for any course/template
--      by calling insert directly — the client-side generator was
--      the only gate. We drop the insert policy and force issuance
--      through a SECURITY DEFINER RPC (`issue_certificate`) that
--      verifies enrolment, completion threshold, template ownership,
--      and generates the certificate_number server-side.
--
-- NOTE FOR FRONTEND: after this migration lands, these callers must
-- be updated to use RPCs instead of direct inserts/selects:
--
--   - src/pages/ChapterViewer.tsx (QuizBlock): fetch options WITHOUT
--     is_correct (use the new view `quiz_options_public`), and call
--     `rpc('submit_quiz', { p_quiz_id, p_answers })` instead of
--     inserting into quiz_attempts directly.
--
--   - src/lib/certificate-generator.ts +
--     src/hooks/useCertificateAutoGenerate.ts: after uploading the
--     rendered PNG to storage, call
--     `rpc('issue_certificate', { p_course_id, p_template_id,
--      p_image_url, p_variable_values })` instead of inserting into
--     `certificates` directly. The RPC returns { certificate_id,
--     certificate_number }.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- PART A — QUIZ INTEGRITY
-- ─────────────────────────────────────────────────────────────

-- A.1 Drop the permissive student read policy on quiz_options.
-- From now on, only admins/authors can SELECT the base table
-- (their existing `admin_manage_quiz_options FOR ALL` policy already
-- covers this, since FOR ALL implies SELECT). Students read through
-- the `quiz_options_public` view below, which never exposes is_correct.
DROP POLICY IF EXISTS "students_read_options" ON public.quiz_options;

-- A.2 Safe public view of quiz options.
-- Why a view-with-security_invoker=false (SECURITY DEFINER semantics)?
--   * RLS on quiz_options now blocks non-admins from the base table.
--   * We still want students to see (id, question_id, option_text,
--     sort_order) so they can render the question.
--   * Postgres 15+ views default to `security_invoker = false`, which
--     means the view runs with the view owner's privileges and
--     bypasses the caller's RLS on the underlying table. That is
--     exactly what we want: the view acts as a narrow, column-filtered
--     window. We do NOT select is_correct here, so there is no way
--     for a student to read it via the view.
--   * We add a WHERE clause that restricts to options whose question
--     belongs to an active quiz on a chapter in a published course
--     the caller has access to (or the caller is admin). That keeps
--     us from leaking options of unpublished / unauthorized content.
CREATE OR REPLACE VIEW public.quiz_options_public
WITH (security_invoker = false) AS
SELECT
  o.id,
  o.question_id,
  o.option_text,
  o.sort_order
FROM public.quiz_options o
JOIN public.quiz_questions q   ON q.id = o.question_id
JOIN public.chapter_quizzes cq ON cq.id = q.quiz_id
JOIN public.chapters ch        ON ch.id = cq.chapter_id
JOIN public.sections s         ON s.id  = ch.section_id
JOIN public.courses c          ON c.id  = s.course_id
WHERE cq.is_active = true
  AND (
    public.is_admin()
    OR (c.status = 'published' AND public.has_course_access(c.id))
  );

-- Lock the view down to authenticated users only.
REVOKE ALL ON public.quiz_options_public FROM PUBLIC;
GRANT SELECT ON public.quiz_options_public TO authenticated;

COMMENT ON VIEW public.quiz_options_public IS
  'Student-safe projection of quiz_options. Never exposes is_correct. '
  'Scoring must go through submit_quiz RPC.';

-- A.3 submit_quiz RPC — server-side scoring + attempt insert.
CREATE OR REPLACE FUNCTION public.submit_quiz(
  p_quiz_id uuid,
  p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_course_id     uuid;
  v_pass_pct      integer;
  v_total         integer := 0;
  v_score         integer := 0;
  v_passed        boolean := false;
  v_attempt_id    uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Resolve the quiz → course chain and access-check in one shot.
  SELECT c.id, cq.pass_percentage
    INTO v_course_id, v_pass_pct
  FROM public.chapter_quizzes cq
  JOIN public.chapters ch ON ch.id = cq.chapter_id
  JOIN public.sections s  ON s.id  = ch.section_id
  JOIN public.courses  c  ON c.id  = s.course_id
  WHERE cq.id = p_quiz_id
    AND cq.is_active = true;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'quiz not found or inactive' USING ERRCODE = '42704';
  END IF;

  IF NOT (public.is_admin() OR public.has_course_access(v_course_id)) THEN
    RAISE EXCEPTION 'no access to this quiz' USING ERRCODE = '42501';
  END IF;

  -- Score server-side. Expected p_answers shape:
  --   { "<question_id>": "<option_id>", ... }
  -- For each question in the quiz, count it as correct iff the
  -- caller's chosen option exists AND has is_correct = true.
  SELECT COUNT(*)::int INTO v_total
  FROM public.quiz_questions q
  WHERE q.quiz_id = p_quiz_id;

  SELECT COUNT(*)::int INTO v_score
  FROM public.quiz_questions q
  JOIN public.quiz_options o
    ON o.question_id = q.id
   AND o.id::text    = p_answers ->> q.id::text
  WHERE q.quiz_id = p_quiz_id
    AND o.is_correct = true;

  IF v_total > 0 THEN
    v_passed := ((v_score::numeric / v_total::numeric) * 100) >= v_pass_pct;
  END IF;

  INSERT INTO public.quiz_attempts
    (quiz_id, user_id, score, total, passed, answers)
  VALUES
    (p_quiz_id, v_user_id, v_score, v_total, v_passed, COALESCE(p_answers, '{}'::jsonb))
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'score',      v_score,
    'total',      v_total,
    'passed',     v_passed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_quiz(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_quiz(uuid, jsonb) TO authenticated;

-- A.4 Revoke direct INSERT on quiz_attempts from students.
-- Admins still have full access via `admin_read_all_attempts` + the
-- default permissions the service role has. Students must now route
-- through submit_quiz (which runs as definer).
DROP POLICY IF EXISTS "students_insert_attempts" ON public.quiz_attempts;

-- (We leave `students_read_own_attempts` in place so the UI can
--  fetch past attempts for a user.)

-- ─────────────────────────────────────────────────────────────
-- PART B — CERTIFICATE INTEGRITY
-- ─────────────────────────────────────────────────────────────

-- B.1 Kill the forgeable insert policy.
DROP POLICY IF EXISTS certificates_own_insert ON public.certificates;

-- B.2 issue_certificate RPC — server-verified issuance.
CREATE OR REPLACE FUNCTION public.issue_certificate(
  p_course_id       uuid,
  p_template_id     uuid,
  p_image_url       text,
  p_variable_values jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id          uuid := auth.uid();
  v_threshold        integer;
  v_template_course  uuid;
  v_template_active  boolean;
  v_total_chapters   integer;
  v_done_chapters    integer;
  v_completion_pct   numeric;
  v_existing_id      uuid;
  v_existing_number  text;
  v_number           text;
  v_cert_id          uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Enrolment check: user must have an active enrolment on an
  -- offering that includes this course.
  IF NOT EXISTS (
    SELECT 1
    FROM public.enrolments e
    JOIN public.offering_courses oc ON oc.offering_id = e.offering_id
    WHERE e.user_id   = v_user_id
      AND oc.course_id = p_course_id
      AND e.status    = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'not enrolled in this course' USING ERRCODE = '42501';
  END IF;

  -- Template check: must belong to this course and be active.
  SELECT t.course_id, t.is_active, t.completion_threshold
    INTO v_template_course, v_template_active, v_threshold
  FROM public.certificate_templates t
  WHERE t.id = p_template_id;

  IF v_template_course IS NULL THEN
    RAISE EXCEPTION 'template not found' USING ERRCODE = '42704';
  END IF;

  IF v_template_course <> p_course_id OR v_template_active = false THEN
    RAISE EXCEPTION 'template does not match course or is inactive'
      USING ERRCODE = '42501';
  END IF;

  -- Completion check: % of course chapters with completed_at set.
  SELECT COUNT(*) INTO v_total_chapters
  FROM public.chapters ch
  JOIN public.sections s ON s.id = ch.section_id
  WHERE s.course_id = p_course_id;

  IF v_total_chapters = 0 THEN
    RAISE EXCEPTION 'course has no chapters' USING ERRCODE = '42704';
  END IF;

  SELECT COUNT(*) INTO v_done_chapters
  FROM public.chapter_progress cp
  JOIN public.chapters ch ON ch.id = cp.chapter_id
  JOIN public.sections s  ON s.id  = ch.section_id
  WHERE cp.user_id      = v_user_id
    AND s.course_id     = p_course_id
    AND cp.completed_at IS NOT NULL;

  v_completion_pct := (v_done_chapters::numeric / v_total_chapters::numeric) * 100;

  IF v_completion_pct < v_threshold THEN
    RAISE EXCEPTION
      'course completion %%%% (%%) is below required threshold %%%% (%%)',
      v_completion_pct, v_threshold
      USING ERRCODE = '42501';
  END IF;

  -- Idempotency: one cert per (user_id, course_id). Return the
  -- existing row instead of duplicating.
  SELECT id, certificate_number
    INTO v_existing_id, v_existing_number
  FROM public.certificates
  WHERE user_id = v_user_id AND course_id = p_course_id;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'certificate_id',     v_existing_id,
      'certificate_number', v_existing_number,
      'already_issued',     true
    );
  END IF;

  -- Generate the number server-side (never trust the client).
  v_number := public.next_certificate_number();

  INSERT INTO public.certificates
    (user_id, course_id, template_id, image_url,
     certificate_number, generated_by, metadata)
  VALUES
    (v_user_id, p_course_id, p_template_id, p_image_url,
     v_number, 'auto',
     jsonb_build_object(
       'variable_values', COALESCE(p_variable_values, '{}'::jsonb),
       'issued_at',       now()
     ))
  RETURNING id INTO v_cert_id;

  RETURN jsonb_build_object(
    'certificate_id',     v_cert_id,
    'certificate_number', v_number,
    'already_issued',     false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_certificate(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_certificate(uuid, uuid, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.issue_certificate(uuid, uuid, text, jsonb) IS
  'Server-verified certificate issuance. Verifies active enrolment, '
  'template ownership, and completion threshold before inserting. '
  'Replaces the removed certificates_own_insert RLS policy.';

COMMIT;
