-- Give the cohort-room Weeks surface its own authorization contract.
--
-- `get_cohort_progress` is the shipped student dashboard API. Its row source is
-- deliberately an active enrolment plus cohort_batch_members, so a legitimate
-- room host/mentor (whose authority lives in cohort_room_members) receives an
-- empty set. Keep that legacy/native contract unchanged and add a room-only
-- reader that derives its batch from the same caller scope as every other room
-- RPC.
--
-- The room route is `/weeks/:n`, so one response must never fan several batches
-- with duplicate week numbers into one rail. Offering-wide staff/admin callers
-- therefore discover their authorized batches through a metadata-only RPC and
-- then call get_room_weeks with one explicit batch. The data RPC remains
-- fail-closed when a multi-batch offering is not narrowed.

CREATE OR REPLACE FUNCTION public.get_room_week_batches(p_offering uuid)
RETURNS TABLE (
  batch_id uuid,
  batch_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_batch uuid;
  v_wide boolean;
BEGIN
  -- This is curriculum-adjacent metadata, not a public offering directory.
  -- Use the same full-member assertion as get_room_weeks; lobby occupants and
  -- unauthenticated callers receive neither batch names nor identifiers.
  IF auth.uid() IS NULL OR NOT public.cohort_room_is_member(p_offering) THEN
    RAISE EXCEPTION 'not a member of this room'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.batch_id, s.offering_wide
    INTO v_member_batch, v_wide
  FROM public.cohort_room_caller_scope(p_offering) s;

  -- Admins can have no cohort_room_members row, so the published scope helper
  -- remains the sole authority for widening an empty caller-scope result.
  v_wide := COALESCE(v_wide, public.cohort_room_is_offering_wide(p_offering));

  IF NOT v_wide AND v_member_batch IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT b.id, b.name
  FROM public.cohort_batches b
  WHERE b.offering_id = p_offering
    AND (v_wide OR b.id = v_member_batch)
    AND public.cohort_room_can_access(p_offering, b.id)
  ORDER BY lower(b.name), b.id;
END
$$;

REVOKE ALL ON FUNCTION public.get_room_week_batches(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_week_batches(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_room_week_batches(uuid) IS
  'Metadata-only batch choices for the room Weeks surface. Offering-wide staff/admin receive all batches in the offering; members/alumni receive only their server-resolved batch; lobby and anonymous callers are denied.';

CREATE OR REPLACE FUNCTION public.get_room_weeks(
  p_offering uuid,
  p_batch uuid DEFAULT NULL
)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_batch uuid;
  v_role text;
  v_wide boolean;
  v_target_batch uuid;
  v_batch_count integer;
BEGIN
  -- Room reads raise on denial. An empty set is reserved for a legitimate room
  -- whose batch has no authored weeks (or whose old student-progress contract
  -- correctly stands down after enrolment revocation).
  IF auth.uid() IS NULL OR NOT public.cohort_room_is_member(p_offering) THEN
    RAISE EXCEPTION 'not a member of this room'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.batch_id, s.member_role, s.offering_wide
    INTO v_member_batch, v_role, v_wide
  FROM public.cohort_room_caller_scope(p_offering) s;

  -- An admin may legitimately have no cohort_room_members row. The published
  -- helper is the single owner of that widening; do not restate role logic.
  v_wide := COALESCE(v_wide, public.cohort_room_is_offering_wide(p_offering));

  IF v_wide THEN
    IF p_batch IS NOT NULL THEN
      SELECT b.id INTO v_target_batch
      FROM public.cohort_batches b
      WHERE b.id = p_batch
        AND b.offering_id = p_offering;

      IF v_target_batch IS NULL THEN
        RAISE EXCEPTION 'batch does not belong to this offering'
          USING ERRCODE = '22023';
      END IF;
    ELSE
      SELECT count(*)::integer INTO v_batch_count
      FROM public.cohort_batches b
      WHERE b.offering_id = p_offering;

      IF v_batch_count = 0 THEN
        RETURN;
      ELSIF v_batch_count > 1 THEN
        RAISE EXCEPTION 'batch selection required for offering-wide room staff'
          USING ERRCODE = '22023';
      END IF;

      SELECT b.id INTO v_target_batch
      FROM public.cohort_batches b
      WHERE b.offering_id = p_offering
      LIMIT 1;
    END IF;
  ELSE
    -- Batch-less member/alumni rows unlock offering-level chrome only. They do
    -- not acquire a batch merely because the client supplied one.
    IF v_member_batch IS NULL THEN
      IF p_batch IS NOT NULL THEN
        RAISE EXCEPTION 'not a member of this room'
          USING ERRCODE = '42501';
      END IF;
      RETURN;
    END IF;

    IF p_batch IS NOT NULL AND p_batch IS DISTINCT FROM v_member_batch THEN
      RAISE EXCEPTION 'not a member of this room'
        USING ERRCODE = '42501';
    END IF;
    v_target_batch := v_member_batch;
  END IF;

  IF NOT public.cohort_room_can_access(p_offering, v_target_batch) THEN
    RAISE EXCEPTION 'not a member of this room'
      USING ERRCODE = '42501';
  END IF;

  -- Preserve the existing student contract byte-for-byte: active enrolment
  -- revocation, own submission/attendance, representative-session election and
  -- join-link window all remain owned by get_cohort_progress. The room wrapper
  -- only narrows its result to the server-resolved batch.
  IF v_role IN ('member', 'alumni') AND NOT public.is_admin() THEN
    RETURN QUERY
    SELECT gp.*
    FROM public.get_cohort_progress(auth.uid(), p_offering) gp
    WHERE gp.cohort_batch_id = v_target_batch;
    RETURN;
  END IF;

  -- Staff/admin have room authority without a student enrolment. Keep the row
  -- shape and representative-session semantics exactly aligned with the
  -- canonical progress RPC, while joining only the caller's own optional
  -- submission/attendance state.
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
  FROM public.cohort_batches cb
  JOIN public.cohort_weeks cw ON cw.cohort_batch_id = cb.id
  LEFT JOIN LATERAL (
    SELECT
      lsx.id,
      lsx.title,
      lsx.scheduled_at,
      lsx.zoom_link,
      lsx.status,
      lsx.duration_minutes
    FROM public.live_sessions lsx
    WHERE lsx.week_id = cw.id
    ORDER BY (COALESCE(lsx.status, 'scheduled') = 'cancelled') ASC,
             (lsx.scheduled_at
                + make_interval(mins => COALESCE(lsx.duration_minutes, 60)) >= now())
               DESC NULLS LAST,
             CASE
               WHEN lsx.scheduled_at
                      + make_interval(mins => COALESCE(lsx.duration_minutes, 60)) >= now()
               THEN lsx.scheduled_at
             END ASC,
             lsx.scheduled_at DESC
    LIMIT 1
  ) ls ON true
  LEFT JOIN public.cohort_week_submissions s
    ON s.cohort_week_id = cw.id
   AND s.user_id = auth.uid()
  LEFT JOIN public.cohort_week_attendance a
    ON a.cohort_week_id = cw.id
   AND a.user_id = auth.uid()
  WHERE cb.id = v_target_batch
    AND cb.offering_id = p_offering
  ORDER BY cw.week_number, cw.sort_order;
END
$$;

REVOKE ALL ON FUNCTION public.get_room_weeks(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_weeks(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_room_weeks(uuid, uuid) IS
  'Room-authorized, single-batch week metadata. Members retain the canonical active-enrolment progress contract; batch-scoped hosts/mentors and authorized admins can read curriculum without a student enrolment.';

-- Migration-time ACL certificate. Supabase default privileges can grant a new
-- function directly to anon, so a PUBLIC-only revoke is not sufficient proof.
DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.get_room_week_batches(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.get_room_week_batches(uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.get_room_weeks(uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.get_room_weeks(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'room week RPC ACLs must be authenticated-only';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid IN (
        'public.get_room_week_batches(uuid)'::regprocedure,
        'public.get_room_weeks(uuid, uuid)'::regprocedure
      )
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC can execute a room week RPC';
  END IF;
END
$$;

-- Manual rollback:
--   DROP FUNCTION public.get_room_weeks(uuid, uuid);
--   DROP FUNCTION public.get_room_week_batches(uuid);
