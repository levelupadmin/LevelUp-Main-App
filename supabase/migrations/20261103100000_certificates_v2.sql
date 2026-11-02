-- ════════════════════════════════════════════════════════════════════
-- Certificates v2: server-issued PDFs, a design library, a public check
-- page, an evidence log, and revoke-on-refund.
-- ════════════════════════════════════════════════════════════════════
-- What changes and why:
--   * Certificates were drawn in the student's browser and uploaded to the
--     public `certificates` bucket, where any signed-in user could overwrite
--     their own file (a forgery path). Issuing now happens only in the
--     `certificates` edge function (service role). The student upload policy
--     is dropped and `issue_certificate` (the old self-issue RPC) refuses.
--   * `certificate_designs` is the library: one uploaded design (a JPEG
--     with the name area empty) plus where each printed field sits.
--     `certificate_templates` (one per course, as before) now points at a
--     design and says Auto (at the threshold) or Manual.
--   * `certificate_events` is the evidence log and the source of the
--     student limits (re-sends per 48 hours, downloads per day).
--   * `verify_certificate(code)` backs the public check page.
--   * A refund (enrolment -> cancelled/refunded) revokes the certificate
--     unless another active enrolment still covers the course.
--
-- Old app builds (bundled Android/iOS) call checkAndGenerateCertificate,
-- which only acts when `auto_generate` is true. It is forced false here and
-- the new code never sets it, so old builds stay inert.
--
-- Undo: see the matching down notes at the bottom of this file.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Design library ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificate_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  kind text NOT NULL DEFAULT 'masterclass'
    CHECK (kind IN ('masterclass', 'cohort', 'workshop', 'other')),
  image_path text NOT NULL,
  image_width integer NOT NULL CHECK (image_width > 0),
  image_height integer NOT NULL CHECK (image_height > 0),
  fields jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array'),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

DROP TRIGGER IF EXISTS certificate_designs_updated_at ON public.certificate_designs;
CREATE TRIGGER certificate_designs_updated_at
  BEFORE UPDATE ON public.certificate_designs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.certificate_designs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cert_designs_admin ON public.certificate_designs;
CREATE POLICY cert_designs_admin ON public.certificate_designs
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 2. Course assignment (existing table) ───────────────────────────
ALTER TABLE public.certificate_templates
  ADD COLUMN IF NOT EXISTS design_id uuid REFERENCES public.certificate_designs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS issue_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS auto_since timestamptz,
  ADD COLUMN IF NOT EXISTS line_text text;

ALTER TABLE public.certificate_templates
  DROP CONSTRAINT IF EXISTS certificate_templates_issue_mode_check;
ALTER TABLE public.certificate_templates
  ADD CONSTRAINT certificate_templates_issue_mode_check CHECK (issue_mode IN ('auto', 'manual'));

ALTER TABLE public.certificate_templates ALTER COLUMN background_image_url DROP NOT NULL;
ALTER TABLE public.certificate_templates ALTER COLUMN completion_threshold SET DEFAULT 85;
UPDATE public.certificate_templates SET auto_generate = false WHERE auto_generate;

-- Switching a course to Auto stamps auto_since: only students who cross the
-- threshold AFTER that moment are issued automatically. Everyone who was
-- already past it claims their certificate themselves.
CREATE OR REPLACE FUNCTION public.certificate_templates_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.auto_generate := false;
  IF NEW.issue_mode = 'auto'
     AND (TG_OP = 'INSERT' OR OLD.issue_mode IS DISTINCT FROM 'auto') THEN
    NEW.auto_since := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS certificate_templates_stamp ON public.certificate_templates;
CREATE TRIGGER certificate_templates_stamp
  BEFORE INSERT OR UPDATE ON public.certificate_templates
  FOR EACH ROW EXECUTE FUNCTION public.certificate_templates_stamp();

-- ── 3. Certificates (existing table) ────────────────────────────────
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS name_on_certificate text,
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS verify_code text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_reason text,
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_on date,
  ADD COLUMN IF NOT EXISTS email_to text,
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_email_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.certificates ALTER COLUMN image_url DROP NOT NULL;

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_status_check;
ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_status_check CHECK (status IN ('valid', 'revoked'));

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_email_status_check;
ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_email_status_check
  CHECK (email_status IN ('none', 'sent', 'failed', 'waiting', 'no_email', 'skipped'));

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_generated_by_check;
ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_generated_by_check
  CHECK (generated_by IN ('auto', 'admin_manual', 'claim'));

CREATE UNIQUE INDEX IF NOT EXISTS certificates_verify_code_key
  ON public.certificates (verify_code) WHERE verify_code IS NOT NULL;

-- Deleting a course's certificate setup must never delete issued
-- certificates (the old FK cascaded).
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_template_id_fkey;
ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.certificate_templates(id) ON DELETE RESTRICT;

-- ── 4. Evidence log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificate_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  certificate_id uuid REFERENCES public.certificates(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'issued', 'reissued', 'revoked', 'restored',
    'email_sent', 'email_failed', 'email_waiting', 'email_skipped', 'email_no_address',
    'resend_requested', 'downloaded', 'blocked'
  )),
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('student', 'admin', 'system')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cert_events_cert ON public.certificate_events (certificate_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cert_events_user ON public.certificate_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cert_events_kind ON public.certificate_events (kind, created_at DESC);

ALTER TABLE public.certificate_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cert_events_admin_read ON public.certificate_events;
CREATE POLICY cert_events_admin_read ON public.certificate_events
  FOR SELECT USING (public.is_admin());

-- ── 5. Storage ──────────────────────────────────────────────────────
-- Designs (blank images + fonts) are not secret: public read, admin write.
-- Issued PDFs are private: only the edge function (service role) touches
-- them; people get 5-minute signed links.
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificate-designs', 'certificate-designs', true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificate-files', 'certificate-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins manage certificate designs" ON storage.objects;
CREATE POLICY "Admins manage certificate designs"
  ON storage.objects FOR ALL
  USING (bucket_id = 'certificate-designs' AND public.is_admin())
  WITH CHECK (bucket_id = 'certificate-designs' AND public.is_admin());

-- The forgery path: students could upsert any image into their folder.
DROP POLICY IF EXISTS "Authenticated users upload own certificates" ON storage.objects;

-- ── 6. Old self-issue RPC refuses ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.issue_certificate(
  p_course_id uuid,
  p_template_id uuid,
  p_image_url text,
  p_variable_values jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Certificates are issued by the server now. Open the course page and tap "Get my certificate".'
    USING ERRCODE = '42501';
END;
$$;

-- ── 7. Progress maths (server only) ─────────────────────────────────
-- done/total over ALL chapters of the course (the same count the lesson
-- player and the course page show), and crossed_at = when the student
-- completed the k-th lesson, k = ceil(threshold% of total).
CREATE OR REPLACE FUNCTION public.certificate_progress(
  p_user uuid,
  p_course uuid,
  p_threshold integer DEFAULT 85
)
RETURNS TABLE (done integer, total integer, needed integer, crossed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ch AS (
    SELECT c.id
    FROM public.chapters c
    JOIN public.sections s ON s.id = c.section_id
    WHERE s.course_id = p_course
  ),
  t AS (
    SELECT count(*)::int AS total,
           greatest(1, ceil(count(*) * greatest(0, least(100, p_threshold)) / 100.0))::int AS needed
    FROM ch
  ),
  d AS (
    SELECT cp.completed_at,
           row_number() OVER (ORDER BY cp.completed_at) AS rn
    FROM public.chapter_progress cp
    WHERE cp.user_id = p_user
      AND cp.completed_at IS NOT NULL
      AND cp.chapter_id IN (SELECT id FROM ch)
  )
  SELECT (SELECT count(*)::int FROM d),
         t.total,
         t.needed,
         (SELECT d.completed_at FROM d WHERE d.rn = t.needed)
  FROM t;
$$;

REVOKE ALL ON FUNCTION public.certificate_progress(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.certificate_progress(uuid, uuid, integer) TO service_role;

-- Who the sweep should issue to automatically: Auto courses, past the
-- threshold, crossed AFTER the course was switched to Auto, active access,
-- no certificate yet.
CREATE OR REPLACE FUNCTION public.certificate_auto_candidates(p_limit integer DEFAULT 10)
RETURNS TABLE (user_id uuid, course_id uuid, template_id uuid, offering_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH t AS (
    SELECT ct.id, ct.course_id, ct.completion_threshold, ct.auto_since
    FROM public.certificate_templates ct
    WHERE ct.is_active AND ct.issue_mode = 'auto' AND ct.design_id IS NOT NULL
      AND ct.auto_since IS NOT NULL
  ),
  people AS (
    SELECT DISTINCT ON (e.user_id, t.course_id)
           e.user_id, t.course_id, t.id AS template_id, e.offering_id,
           t.completion_threshold, t.auto_since
    FROM t
    JOIN public.offering_courses oc ON oc.course_id = t.course_id
    JOIN public.enrolments e ON e.offering_id = oc.offering_id
    WHERE e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > now())
      AND NOT EXISTS (
        SELECT 1 FROM public.certificates c
        WHERE c.user_id = e.user_id AND c.course_id = t.course_id
      )
      -- Someone the sweep couldn't issue (no usable name) waits a week before
      -- the sweep looks at them again; they can still claim it themselves.
      AND NOT EXISTS (
        SELECT 1 FROM public.certificate_events ev
        WHERE ev.user_id = e.user_id AND ev.course_id = t.course_id
          AND ev.kind = 'blocked' AND ev.created_at > now() - interval '7 days'
      )
      AND EXISTS (
        SELECT 1 FROM public.chapter_progress cp
        JOIN public.chapters ch ON ch.id = cp.chapter_id
        JOIN public.sections s ON s.id = ch.section_id
        WHERE cp.user_id = e.user_id AND s.course_id = t.course_id
          AND cp.completed_at >= t.auto_since
      )
    ORDER BY e.user_id, t.course_id, e.created_at DESC
  )
  SELECT p.user_id, p.course_id, p.template_id, p.offering_id
  FROM people p
  CROSS JOIN LATERAL public.certificate_progress(p.user_id, p.course_id, p.completion_threshold) pr
  WHERE pr.total > 0 AND pr.done >= pr.needed AND pr.crossed_at >= p.auto_since
  LIMIT greatest(1, least(p_limit, 50));
$$;

REVOKE ALL ON FUNCTION public.certificate_auto_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.certificate_auto_candidates(integer) TO service_role;

-- ── 8. Public check page ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_certificate(p_code text)
RETURNS TABLE (
  certificate_number text,
  name_on_certificate text,
  course_title text,
  program_title text,
  completed_on date,
  issued_at timestamptz,
  status text,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.certificate_number,
         c.name_on_certificate,
         co.title,
         o.title,
         c.completed_on,
         c.created_at,
         c.status,
         c.revoked_at
  FROM public.certificates c
  JOIN public.courses co ON co.id = c.course_id
  LEFT JOIN public.offerings o ON o.id = c.offering_id
  WHERE c.verify_code IS NOT NULL
    AND c.verify_code = upper(btrim(p_code))
    AND length(btrim(p_code)) BETWEEN 6 AND 16
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;

-- ── 9. Admin reads ──────────────────────────────────────────────────
-- Email state is stored on the certificate by the edge function at send
-- time (the function sends directly over SMTP, so it knows the outcome).

-- One row per course that has students: setup + counts.
CREATE OR REPLACE FUNCTION public.admin_certificate_overview()
RETURNS TABLE (
  course_id uuid,
  course_title text,
  product_tier text,
  offering_id uuid,
  offering_title text,
  template_id uuid,
  design_id uuid,
  design_name text,
  issue_mode text,
  threshold integer,
  line_text text,
  total_lessons integer,
  students integer,
  eligible integer,
  issued integer,
  emailed integer,
  not_claimed integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH course_offering AS (
    SELECT DISTINCT ON (oc.course_id)
           oc.course_id, o.id AS offering_id, o.title AS offering_title, o.product_tier
    FROM public.offering_courses oc
    JOIN public.offerings o ON o.id = oc.offering_id
    WHERE o.product_tier IN ('masterclass', 'live_cohort', 'workshop')
    ORDER BY oc.course_id, (o.status = 'active') DESC, o.created_at DESC
  ),
  lessons AS (
    SELECT s.course_id, count(c.id)::int AS total
    FROM public.sections s
    JOIN public.chapters c ON c.section_id = s.id
    GROUP BY s.course_id
  ),
  enrolled AS (
    SELECT DISTINCT oc.course_id, e.user_id
    FROM public.offering_courses oc
    JOIN public.enrolments e ON e.offering_id = oc.offering_id
    WHERE e.status = 'active' AND (e.expires_at IS NULL OR e.expires_at > now())
  ),
  done AS (
    SELECT s.course_id, cp.user_id, count(*)::int AS n
    FROM public.chapter_progress cp
    JOIN public.chapters c ON c.id = cp.chapter_id
    JOIN public.sections s ON s.id = c.section_id
    WHERE cp.completed_at IS NOT NULL
    GROUP BY s.course_id, cp.user_id
  ),
  per_student AS (
    SELECT en.course_id, en.user_id,
           coalesce(d.n, 0) AS n,
           coalesce(l.total, 0) AS total,
           coalesce(ct.completion_threshold, 85) AS thr
    FROM enrolled en
    LEFT JOIN done d ON d.course_id = en.course_id AND d.user_id = en.user_id
    LEFT JOIN lessons l ON l.course_id = en.course_id
    LEFT JOIN public.certificate_templates ct ON ct.course_id = en.course_id
  ),
  agg AS (
    SELECT ps.course_id,
           count(*)::int AS students,
           count(*) FILTER (
             WHERE ps.total > 0 AND ps.n >= greatest(1, ceil(ps.total * ps.thr / 100.0))
           )::int AS eligible,
           count(*) FILTER (
             WHERE ps.total > 0 AND ps.n >= greatest(1, ceil(ps.total * ps.thr / 100.0))
               AND NOT EXISTS (
                 SELECT 1 FROM public.certificates c
                 WHERE c.user_id = ps.user_id AND c.course_id = ps.course_id
               )
           )::int AS not_claimed
    FROM per_student ps
    GROUP BY ps.course_id
  ),
  certs AS (
    SELECT c.course_id,
           count(*) FILTER (WHERE c.status = 'valid')::int AS issued,
           count(*) FILTER (WHERE c.status = 'valid' AND c.email_status = 'sent')::int AS emailed
    FROM public.certificates c
    GROUP BY c.course_id
  )
  SELECT co.course_id,
         cr.title,
         co.product_tier,
         co.offering_id,
         co.offering_title,
         ct.id,
         ct.design_id,
         cd.name,
         coalesce(ct.issue_mode, CASE WHEN co.product_tier = 'masterclass' THEN 'auto' ELSE 'manual' END),
         coalesce(ct.completion_threshold, 85),
         ct.line_text,
         coalesce(l.total, 0),
         coalesce(a.students, 0),
         coalesce(a.eligible, 0),
         coalesce(cs.issued, 0),
         coalesce(cs.emailed, 0),
         coalesce(a.not_claimed, 0)
  FROM course_offering co
  JOIN public.courses cr ON cr.id = co.course_id
  LEFT JOIN public.certificate_templates ct ON ct.course_id = co.course_id
  LEFT JOIN public.certificate_designs cd ON cd.id = ct.design_id
  LEFT JOIN lessons l ON l.course_id = co.course_id
  LEFT JOIN agg a ON a.course_id = co.course_id
  LEFT JOIN certs cs ON cs.course_id = co.course_id
  ORDER BY (co.product_tier = 'masterclass') DESC, cr.title;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_certificate_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_certificate_overview() TO authenticated;

-- Everyone with access to one course, with progress and certificate state.
CREATE OR REPLACE FUNCTION public.admin_certificate_people(p_course uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  offering_title text,
  done integer,
  total integer,
  needed integer,
  certificate_id uuid,
  certificate_number text,
  name_on_certificate text,
  cert_status text,
  email_status text,
  email_to text,
  last_emailed_at timestamptz,
  issued_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_thr integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(max(completion_threshold), 85) INTO v_thr
  FROM public.certificate_templates WHERE course_id = p_course;

  RETURN QUERY
  WITH people AS (
    SELECT DISTINCT ON (e.user_id) e.user_id, o.title AS offering_title
    FROM public.offering_courses oc
    JOIN public.enrolments e ON e.offering_id = oc.offering_id
    JOIN public.offerings o ON o.id = oc.offering_id
    WHERE oc.course_id = p_course
      AND e.status = 'active' AND (e.expires_at IS NULL OR e.expires_at > now())
    ORDER BY e.user_id, e.created_at DESC
  )
  SELECT p.user_id, u.full_name, u.email, u.phone, p.offering_title,
         pr.done, pr.total, pr.needed,
         c.id, c.certificate_number, c.name_on_certificate, c.status,
         c.email_status, c.email_to, c.last_emailed_at, c.created_at
  FROM people p
  JOIN public.users u ON u.id = p.user_id
  CROSS JOIN LATERAL public.certificate_progress(p.user_id, p_course, v_thr) pr
  LEFT JOIN public.certificates c ON c.user_id = p.user_id AND c.course_id = p_course
  ORDER BY (c.id IS NULL) DESC, pr.done DESC, u.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_certificate_people(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_certificate_people(uuid) TO authenticated;

-- One student across every course they have access to.
CREATE OR REPLACE FUNCTION public.admin_certificate_student(p_user uuid)
RETURNS TABLE (
  course_id uuid,
  course_title text,
  product_tier text,
  template_ready boolean,
  issue_mode text,
  done integer,
  total integer,
  needed integer,
  certificate_id uuid,
  certificate_number text,
  name_on_certificate text,
  cert_status text,
  email_status text,
  email_to text,
  last_emailed_at timestamptz,
  last_email_error text,
  issued_at timestamptz,
  resends_48h integer,
  downloads integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH courses_for_user AS (
    SELECT DISTINCT ON (oc.course_id) oc.course_id, o.product_tier
    FROM public.enrolments e
    JOIN public.offering_courses oc ON oc.offering_id = e.offering_id
    JOIN public.offerings o ON o.id = e.offering_id
    WHERE e.user_id = p_user
      AND e.status = 'active' AND (e.expires_at IS NULL OR e.expires_at > now())
    ORDER BY oc.course_id, e.created_at DESC
  )
  SELECT cu.course_id, cr.title, cu.product_tier,
         (ct.id IS NOT NULL AND ct.design_id IS NOT NULL AND ct.is_active),
         ct.issue_mode,
         pr.done, pr.total, pr.needed,
         c.id, c.certificate_number, c.name_on_certificate, c.status,
         c.email_status, c.email_to, c.last_emailed_at, c.last_email_error, c.created_at,
         (SELECT count(*)::int FROM public.certificate_events ev
          WHERE ev.certificate_id = c.id AND ev.kind = 'resend_requested'
            AND ev.actor_kind = 'student' AND ev.created_at > now() - interval '48 hours'),
         (SELECT count(*)::int FROM public.certificate_events ev
          WHERE ev.certificate_id = c.id AND ev.kind = 'downloaded')
  FROM courses_for_user cu
  JOIN public.courses cr ON cr.id = cu.course_id
  LEFT JOIN public.certificate_templates ct ON ct.course_id = cu.course_id
  CROSS JOIN LATERAL public.certificate_progress(p_user, cu.course_id, coalesce(ct.completion_threshold, 85)) pr
  LEFT JOIN public.certificates c ON c.user_id = p_user AND c.course_id = cu.course_id
  ORDER BY (c.id IS NOT NULL) DESC, cr.title;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_certificate_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_certificate_student(uuid) TO authenticated;

-- Totals for the Certificates page header.
CREATE OR REPLACE FUNCTION public.admin_certificate_totals()
RETURNS TABLE (issued integer, emailed integer, no_email integer, failed integer, waiting integer, revoked integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT count(*) FILTER (WHERE status = 'valid')::int,
         count(*) FILTER (WHERE status = 'valid' AND email_status = 'sent')::int,
         count(*) FILTER (WHERE status = 'valid' AND email_status = 'no_email')::int,
         count(*) FILTER (WHERE status = 'valid' AND email_status = 'failed')::int,
         count(*) FILTER (WHERE status = 'valid' AND email_status IN ('waiting', 'skipped'))::int,
         count(*) FILTER (WHERE status = 'revoked')::int
  FROM public.certificates;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_certificate_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_certificate_totals() TO authenticated;

-- ── 10. A refund revokes the certificate ────────────────────────────
CREATE OR REPLACE FUNCTION public.certificates_revoke_on_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status IN ('cancelled', 'refunded') THEN
    WITH hit AS (
      UPDATE public.certificates c
      SET status = 'revoked',
          revoked_at = now(),
          revoked_reason = 'Refunded (enrolment ' || NEW.status || ')',
          updated_at = now()
      WHERE c.user_id = NEW.user_id
        AND c.status = 'valid'
        AND c.course_id IN (
          SELECT oc.course_id FROM public.offering_courses oc WHERE oc.offering_id = NEW.offering_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.enrolments e2
          JOIN public.offering_courses oc2 ON oc2.offering_id = e2.offering_id
          WHERE e2.user_id = NEW.user_id
            AND e2.id <> NEW.id
            AND e2.status = 'active'
            AND oc2.course_id = c.course_id
        )
      RETURNING c.id, c.user_id, c.course_id
    )
    INSERT INTO public.certificate_events (certificate_id, user_id, course_id, kind, actor_kind, detail)
    SELECT hit.id, hit.user_id, hit.course_id, 'revoked', 'system',
           jsonb_build_object('reason', 'refund', 'enrolment_id', NEW.id)
    FROM hit;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS certificates_revoke_on_refund ON public.enrolments;
CREATE TRIGGER certificates_revoke_on_refund
  AFTER UPDATE OF status ON public.enrolments
  FOR EACH ROW EXECUTE FUNCTION public.certificates_revoke_on_refund();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Undo (run by hand if this slice is rolled back) ─────────────────
-- DROP TRIGGER certificates_revoke_on_refund ON public.enrolments;
-- DROP FUNCTION public.certificates_revoke_on_refund(), public.admin_certificate_totals(),
--   public.admin_certificate_student(uuid), public.admin_certificate_people(uuid),
--   public.admin_certificate_overview(), public.verify_certificate(text),
--   public.certificate_auto_candidates(integer), public.certificate_progress(uuid, uuid, integer);
-- DROP TRIGGER certificate_templates_stamp ON public.certificate_templates;
-- DROP TABLE public.certificate_events;
-- The added columns are additive and can stay; the old issue_certificate body
-- is in 20260417120000_secure_quizzes_and_certificates.sql.
