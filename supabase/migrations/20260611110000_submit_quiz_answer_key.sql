-- Fix: post-submit quiz feedback never renders.
--
-- 20260417120000_secure_quizzes_and_certificates.sql moved scoring into
-- the submit_quiz RPC and gave students the `quiz_options_public` view,
-- which (correctly) never exposes is_correct. But QuizBlock still tried
-- to highlight right/wrong answers from `o.is_correct` on the fetched
-- options - a field the view strips - so after submitting, students get
-- a score with zero per-question feedback.
--
-- The answer key is only secret BEFORE an attempt is recorded. Once the
-- student has submitted (and the attempt row exists), revealing which
-- option was correct is standard quiz UX and leaks nothing they could
-- exploit pre-submit. So we extend the RPC's return payload with:
--
--   answer_key: { "<question_id>": "<correct_option_id>", ... }
--
-- Existing fields (attempt_id, score, total, passed) and the function
-- signature are unchanged, so older clients keep working untouched and
-- the updated client degrades gracefully (no highlighting) until this
-- migration is applied.

BEGIN;

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
  v_answer_key    jsonb := '{}'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Resolve the quiz -> course chain and access-check in one shot.
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

  -- Per-question answer key, revealed only now that the attempt is
  -- recorded. If a question somehow has multiple is_correct options,
  -- jsonb_object_agg keeps the last one; the UI treats the value as
  -- "an option to highlight", so that is acceptable.
  SELECT COALESCE(jsonb_object_agg(q.id::text, o.id::text), '{}'::jsonb)
    INTO v_answer_key
  FROM public.quiz_questions q
  JOIN public.quiz_options o
    ON o.question_id = q.id
   AND o.is_correct  = true
  WHERE q.quiz_id = p_quiz_id;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'score',      v_score,
    'total',      v_total,
    'passed',     v_passed,
    'answer_key', v_answer_key
  );
END;
$$;

-- CREATE OR REPLACE preserves existing grants, but restate them so this
-- file stands alone if the function is ever dropped and re-created.
REVOKE ALL ON FUNCTION public.submit_quiz(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_quiz(uuid, jsonb) TO authenticated;

COMMIT;
