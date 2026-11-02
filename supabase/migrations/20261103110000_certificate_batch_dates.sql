-- ════════════════════════════════════════════════════════════════════
-- Certificates: batch dates and the printed sentence.
-- ════════════════════════════════════════════════════════════════════
-- A cohort certificate says "...conducted from <start> to <end>". The
-- sentence belongs to the design (same wording for every batch of a
-- program); the dates belong to the batch (the course), set by the team
-- on the Issue screen before issuing.
--
--   certificate_designs.line_template  the sentence, with {start} and {end}
--                                      where the dates go and **bold** parts
--   certificate_templates.period_start / period_end  the batch dates
--   certificate_templates.date_style   'month' = "July 2025",
--                                      'day'   = "19 July 2025"
--
-- certificate_templates.line_text (added in 20261103100000) stays as an
-- optional per-course override of the design's sentence.
--
-- Undo: drop the four columns; re-run the admin_certificate_overview body
-- from 20261103100000.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.certificate_designs
  ADD COLUMN IF NOT EXISTS line_template text;

ALTER TABLE public.certificate_templates
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS date_style text NOT NULL DEFAULT 'month';

ALTER TABLE public.certificate_templates DROP CONSTRAINT IF EXISTS certificate_templates_date_style_check;
ALTER TABLE public.certificate_templates
  ADD CONSTRAINT certificate_templates_date_style_check CHECK (date_style IN ('month', 'day'));

ALTER TABLE public.certificate_templates DROP CONSTRAINT IF EXISTS certificate_templates_period_order_check;
ALTER TABLE public.certificate_templates
  ADD CONSTRAINT certificate_templates_period_order_check
  CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start);

-- The overview now also returns the batch dates and the design's sentence.
-- (A changed return shape needs DROP + CREATE.)
DROP FUNCTION IF EXISTS public.admin_certificate_overview();

CREATE FUNCTION public.admin_certificate_overview()
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
  line_template text,
  period_start date,
  period_end date,
  date_style text,
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
         cd.line_template,
         ct.period_start,
         ct.period_end,
         coalesce(ct.date_style, 'month'),
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

COMMIT;

NOTIFY pgrst, 'reload schema';
