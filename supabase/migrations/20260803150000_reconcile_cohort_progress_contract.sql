-- Reconcile the cohort progress contract after the standalone August 1
-- security patch. 20260801130000 intentionally preserved the April fan-out
-- shape because R0 was not yet present on that train; once both trains coexist,
-- that later timestamp would otherwise overwrite R0's one-session-per-week
-- LATERAL selection. This definition keeps the own-user guard and join-link
-- window, restores the R0 collapse, and rejects revoked enrolments.

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
    -- B5.4a / GAP-3 CLOSED: the join link now carries the SAME window
    -- `get_live_session_zoom_link` (20260408151600) enforces — T-60 to end + 1h,
    -- never for a cancelled class, with the same unconditional admin bypass.
    --
    -- IT SHIPPED RAW UNTIL 2026-08-01, and the column-grant fix could never have
    -- reached it: this function is SECURITY DEFINER, so it runs as the owner and
    -- column-level GRANTs are STRUCTURALLY INVISIBLE to its body. Revoking
    -- `zoom_link` from `authenticated` therefore closes the direct
    -- `select=zoom_link` path and leaves this one wide open. CohortDashboard
    -- does check a T-60 window before rendering the link, but that is a CLIENT
    -- check on a row the server already handed over, which is not enforcement.
    --
    -- The shape is deliberately unchanged, so the two shipped Capacitor call
    -- sites keep working: the column stays, only its VALUE goes null outside
    -- the window, and the client already renders conditionally on null.
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
  -- ONE session per week: the one that has not ENDED yet — the class in
  -- progress if there is one, else the next upcoming — falling back to the most
  -- recent past session when the week is over.
  --
  -- The bucket key is the session's END (scheduled_at + duration), never its
  -- start. Keying on the start put a CURRENTLY-RUNNING session in the past
  -- bucket, so a week that also held a later session sorted the later one first
  -- and the dashboard swapped the Join link off the class the student was
  -- supposed to be in — mid-class, with no way back in. duration_minutes
  -- defaults to 60 for a row that never set one, matching
  -- get_live_session_zoom_link (20260408151600:93).
  --
  -- A CANCELLED SESSION IS DEMOTED, NOT EXCLUDED — and the distinction is the
  -- whole point. Collapsing a week to one row forces a choice this function
  -- never had to make before, so "which session represents the week" is R-3's
  -- own decision and a cancelled class must never win it over a real one:
  -- get_cohort_progress ships zoom_link raw (no time gate — inherited, B5.4a),
  -- so electing the called-off session drew a live "Join session" button
  -- (CohortDashboard.tsx:510) for a class nobody would be in. The FIRST sort key
  -- below therefore ranks a cancelled row last, and it is applied ahead of every
  -- timing key: a cancelled class running right now still loses to a real one
  -- that finished two days ago.
  --   It is a sort key and NOT a WHERE clause because excluding the row would
  --   change what a week LOOKS like, and that is inherited behaviour this phase
  --   is not allowed to touch: the prior definition (20260526180000:278) is a
  --   bare LEFT JOIN with no cancelled handling at all, so a week whose ONLY
  --   session is cancelled has always rendered that session's title and date.
  --   Filtering it out would blank those columns, and CohortDashboard.tsx:521
  --   renders the literal 'Not scheduled yet' for a NULL title — a false
  --   statement about a class that WAS scheduled and then called off, shipped to
  --   Capacitor bundles that cannot be updated, in a phase whose acceptance is
  --   zero client-visible change. Demotion keeps §6 and §3 telling the same
  --   story: §3 LISTS a cancelled session and withholds only its link, and now
  --   so does §6 — the week still shows it when it is all there is, and the link
  --   question stays where B5.4a books it.
  -- COALESCE(status,'scheduled') is right for THIS job (a blank status is
  -- "unspecified", which is not "cancelled" when choosing a week's session) and
  -- deliberately differs from §3's stricter gate, where a blank status denies.
  LEFT JOIN LATERAL (
    SELECT lsx.id, lsx.title, lsx.scheduled_at, lsx.zoom_link, lsx.status, lsx.duration_minutes
    FROM public.live_sessions lsx
    WHERE lsx.week_id = cw.id
    ORDER BY (COALESCE(lsx.status, 'scheduled') = 'cancelled') ASC,
             (lsx.scheduled_at
                + make_interval(mins => COALESCE(lsx.duration_minutes, 60)) >= now())
               DESC NULLS LAST,
             CASE WHEN lsx.scheduled_at
                         + make_interval(mins => COALESCE(lsx.duration_minutes, 60)) >= now()
                  THEN lsx.scheduled_at END ASC,
             lsx.scheduled_at DESC
    LIMIT 1
  ) ls ON true
  LEFT JOIN public.cohort_week_submissions s
    ON s.cohort_week_id = cw.id AND s.user_id = p_user_id
  LEFT JOIN public.cohort_week_attendance a
    ON a.cohort_week_id = cw.id AND a.user_id = p_user_id
  WHERE e.user_id = p_user_id
    AND e.status = 'active'
    AND cb.offering_id = p_offering_id
  ORDER BY cw.week_number, cw.sort_order;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_cohort_progress(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cohort_progress(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_cohort_progress(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_cohort_progress(uuid, uuid) IS
  'Own-user-or-admin cohort progress, active enrolments only, one representative session per week, with server-gated join links.';
