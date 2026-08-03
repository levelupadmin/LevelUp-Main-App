-- Cohort rooms R4: Demo Day write window + alumni revision grace.
--
-- This migration changes enforcement, not visibility. Existing room access RLS
-- remains authoritative. Client module flags are UX only and never consulted.

BEGIN;

-- The phase flip needs a durable clock. `updated_at` is unsuitable because a
-- later theme/module edit would silently extend the fourteen-day grace.
ALTER TABLE public.cohort_room_configs
  ADD COLUMN IF NOT EXISTS alumni_since timestamptz;

UPDATE public.cohort_room_configs
   SET alumni_since = COALESCE(alumni_since, updated_at)
 WHERE phase = 'alumni'
   AND alumni_since IS NULL;

CREATE OR REPLACE FUNCTION public._room_stamp_alumni_since()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.phase = 'alumni'
     AND (TG_OP = 'INSERT' OR OLD.phase IS DISTINCT FROM 'alumni') THEN
    NEW.alumni_since := COALESCE(NEW.alumni_since, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS room_stamp_alumni_since ON public.cohort_room_configs;
CREATE TRIGGER room_stamp_alumni_since
  BEFORE INSERT OR UPDATE ON public.cohort_room_configs
  FOR EACH ROW EXECUTE FUNCTION public._room_stamp_alumni_since();

COMMENT ON COLUMN public.cohort_room_configs.alumni_since IS
  'Server-stamped first transition into alumni. Drives the fixed 14-day needs_revision grace.';

-- Demo rows are members-only through the original RLS. This trigger adds the
-- temporal contract that RLS did not carry: members may write only during wrap,
-- and only until the authored demo-day event ends. Service/admin maintenance is
-- intentionally exempt; auth.uid() NULL is the migration/worker path.
CREATE OR REPLACE FUNCTION public._room_guard_demo_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.cohort_demo_entries%ROWTYPE;
  v_phase text;
  v_event_end timestamptz;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF v_row.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the entry owner can change this Demo Day submission.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.user_id IS DISTINCT FROM OLD.user_id OR
    NEW.offering_id IS DISTINCT FROM OLD.offering_id OR
    NEW.batch_id IS DISTINCT FROM OLD.batch_id
  ) THEN
    RAISE EXCEPTION 'A Demo Day entry cannot be moved to another member or room.'
      USING ERRCODE = '42501';
  END IF;

  v_phase := public.cohort_room_phase(v_row.offering_id, v_row.batch_id);
  IF v_phase IS DISTINCT FROM 'wrap' THEN
    RAISE EXCEPTION 'Demo Day submissions open when this room enters wrap.'
      USING ERRCODE = '42501';
  END IF;

  SELECT max(
           ls.scheduled_at
           + make_interval(mins => COALESCE(NULLIF(ls.duration_minutes, 0), 60))
         )
    INTO v_event_end
    FROM public.live_sessions ls
    JOIN public.cohort_weeks cw ON cw.id = ls.week_id
   WHERE cw.cohort_batch_id = v_row.batch_id
     AND lower(COALESCE(ls.session_type, '')) = 'demo_day'
     AND lower(COALESCE(ls.status, 'scheduled')) <> 'cancelled';

  IF v_event_end IS NOT NULL AND now() > v_event_end THEN
    RAISE EXCEPTION 'This Demo Day entry is read-only because the event has ended.'
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS room_guard_demo_write ON public.cohort_demo_entries;
CREATE TRIGGER room_guard_demo_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.cohort_demo_entries
  FOR EACH ROW EXECUTE FUNCTION public._room_guard_demo_write();

-- Demo files reuse the private cohort-submissions bucket. Owners already have
-- access; this additional read policy admits a room-mate only after the exact
-- object path is attached to a demo entry they may access.
DROP POLICY IF EXISTS cohort_demo_files_member_read ON storage.objects;
CREATE POLICY cohort_demo_files_member_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cohort-submissions'
    AND EXISTS (
      SELECT 1
        FROM public.cohort_demo_entries d
       WHERE name = ANY(d.file_urls)
         AND public.cohort_room_can_access(d.offering_id, d.batch_id)
    )
  );

-- Alumni preserves old work but retires new assignment writes. The sole member
-- exception is a mentor-requested revision, through day 14 after the durable
-- phase stamp. Admins/workers can still close or correct records afterward.
CREATE OR REPLACE FUNCTION public._room_guard_alumni_submission_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offering uuid;
  v_batch uuid;
  v_phase text;
  v_alumni_since timestamptz;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT b.offering_id, b.id
    INTO v_offering, v_batch
    FROM public.cohort_weeks w
    JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
   WHERE w.id = NEW.cohort_week_id;

  IF v_offering IS NULL THEN
    RETURN NEW;
  END IF;

  v_phase := public.cohort_room_phase(v_offering, v_batch);
  IF v_phase IS DISTINCT FROM 'alumni' THEN
    RETURN NEW;
  END IF;

  SELECT c.alumni_since
    INTO v_alumni_since
    FROM public.cohort_room_configs c
   WHERE c.offering_id = v_offering
     AND (c.batch_id = v_batch OR c.batch_id IS NULL)
   ORDER BY (c.batch_id = v_batch) DESC
   LIMIT 1;

  IF TG_OP = 'INSERT'
     OR OLD.status IS DISTINCT FROM 'needs_revision'
     OR v_alumni_since IS NULL
     OR now() > v_alumni_since + interval '14 days' THEN
    RAISE EXCEPTION 'Assignments are read-only in this alumni room.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS room_guard_alumni_submission_write ON public.cohort_week_submissions;
CREATE TRIGGER room_guard_alumni_submission_write
  BEFORE INSERT OR UPDATE ON public.cohort_week_submissions
  FOR EACH ROW EXECUTE FUNCTION public._room_guard_alumni_submission_write();

COMMIT;

-- Reversal (manual, only if R4 is intentionally withdrawn):
-- DROP TRIGGER IF EXISTS room_guard_alumni_submission_write ON public.cohort_week_submissions;
-- DROP FUNCTION IF EXISTS public._room_guard_alumni_submission_write();
-- DROP POLICY IF EXISTS cohort_demo_files_member_read ON storage.objects;
-- DROP TRIGGER IF EXISTS room_guard_demo_write ON public.cohort_demo_entries;
-- DROP FUNCTION IF EXISTS public._room_guard_demo_write();
-- DROP TRIGGER IF EXISTS room_stamp_alumni_since ON public.cohort_room_configs;
-- DROP FUNCTION IF EXISTS public._room_stamp_alumni_since();
-- ALTER TABLE public.cohort_room_configs DROP COLUMN IF EXISTS alumni_since;
