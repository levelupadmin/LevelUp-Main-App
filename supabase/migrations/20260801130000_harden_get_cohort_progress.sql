-- =====================================================================
-- Harden the LIVE get_cohort_progress: an IDOR, and an ungated join link.
-- =====================================================================
--
-- WHY THIS EXISTS SEPARATELY FROM 20260801100000. That migration closes the
-- column-grant hole. It cannot touch this one: `get_cohort_progress` is SECURITY
-- DEFINER, so it runs as the FUNCTION OWNER and column-level GRANTs are
-- STRUCTURALLY INVISIBLE to its body. Revoking `zoom_link` from `authenticated`
-- therefore closes the direct `select=zoom_link` path and leaves this wide open.
-- Applying the grant fix alone turns the alarm green while the exposure stands.
--
-- WHY NOT JUST SHIP R0. `design/cohort-r0`'s 20260729100200 already redefines
-- this function with both guards. But VERIFIED AGAINST PRODUCTION on 2026-08-01:
-- zero `20260729%` migrations are applied, so shipping that fix would mean
-- shipping R0's ENTIRE room backbone — three migrations, new tables, new RLS —
-- as the carrier for a two-line security patch. That is the wrong blast radius.
-- This file patches the definition that is actually live instead.
--
-- WHAT IS LIVE RIGHT NOW, read from pg_proc on production:
--   SECURITY DEFINER .......... true
--   auth.uid() guard .......... ABSENT
--   time gate on the link ..... ABSENT
--   projects zoom_link ........ true
--   LANGUAGE .................. sql   (the April body, no LATERAL)
--
-- TWO DEFECTS, BOTH CLOSED HERE:
--
--   1. IDOR. The body filters `WHERE e.user_id = p_user_id` — a CLIENT-SUPPLIED
--      argument never compared to `auth.uid()`, on a function granted to
--      `authenticated`. Any signed-in user can pass somebody else's uuid
--      (enumerable from `public_user_profiles`) and receive that student's join
--      links, submission status, RATING and mentor FEEDBACK.
--
--   2. NO WINDOW ON THE JOIN LINK. `ls.zoom_link` ships raw, for every session,
--      at any time. `CohortDashboard` does check a T-60 window before RENDERING
--      it, but that is a client check on a row the server already handed over,
--      which is not enforcement.
--
-- WHAT IS DELIBERATELY *NOT* CHANGED. The joins, the row shape and the ordering
-- are byte-for-byte the live ones. R0's version additionally replaces the plain
-- `LEFT JOIN live_sessions` with a LATERAL that collapses a week's several
-- sessions to the one running now — a REAL improvement, but a behavioural change
-- to what the dashboard receives, and it earned its own council and its own
-- tests over there. A security patch is the wrong vehicle for it, so this file
-- changes only what is required to stop the two leaks.
--
-- FORWARD COMPATIBLE. The guards here are written to match R0's shape exactly —
-- same 42501, same window, same admin bypass — so when R0 eventually ships, its
-- definition supersedes this one with NO behavioural change and no ordering
-- trap. `CREATE OR REPLACE` cannot alter RETURNS TABLE, and this does not: the
-- column stays, only its VALUE becomes conditional, and the two shipped
-- Capacitor call sites already render it conditionally on null.
--
-- LOCK PROFILE: CREATE OR REPLACE FUNCTION takes no lock on any table. Safe to
-- apply during traffic. The undo is the verbatim prior definition, held in
-- 20260526180000.
-- =====================================================================

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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- (1) You may ask about yourself. An admin may ask about anyone. Nobody else.
  --     Raising rather than returning an empty set is deliberate and matches
  --     R0's version: "refused" and "you have no cohort" must not look alike.
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'cohort progress is readable for your own account only'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cb.id,
    cb.name,
    cw.id,
    cw.week_number,
    cw.theme,
    cw.description,
    cw.starts_on,
    cw.ends_on,
    cw.assignment_prompt,
    cw.assignment_due_at,
    cw.feedback_session_at,
    cw.status,
    ls.id,
    ls.title,
    ls.scheduled_at,
    -- (2) The link, only inside the window get_live_session_zoom_link enforces:
    --     T-60 to end + 1h, never for a cancelled class, admin bypass intact.
    CASE
      WHEN ls.zoom_link IS NULL THEN NULL
      WHEN public.is_admin() THEN ls.zoom_link
      WHEN COALESCE(ls.status, 'scheduled') <> 'cancelled'
       AND now() BETWEEN ls.scheduled_at - interval '1 hour'
                     AND ls.scheduled_at
                         + make_interval(mins => COALESCE(ls.duration_minutes, 60))
                         + interval '1 hour'
      THEN ls.zoom_link
      ELSE NULL
    END,
    s.id,
    s.status,
    s.rating,
    s.feedback_text,
    s.submitted_at,
    COALESCE(a.attended, false),
    (a.id IS NOT NULL)
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
END $$;

GRANT EXECUTE ON FUNCTION public.get_cohort_progress(uuid, uuid) TO authenticated;
