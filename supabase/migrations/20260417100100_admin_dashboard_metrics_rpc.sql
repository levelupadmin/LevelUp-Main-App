-- =====================================================================
-- admin_dashboard_metrics RPC — single-shot replacement for the 150+
-- queries the React AdminDashboard.tsx fires on load.
-- =====================================================================
--
-- The previous implementation in src/pages/admin/AdminDashboard.tsx
-- did the following:
--
--   1. Fetched offerings list (1 query).
--   2. Counted students, active enrolments, active offerings, summed
--      revenue (4 queries; total of 5 so far).
--   3. Looped 1..days (up to 90 days) firing one COUNT(*) on users per
--      day for the daily-signups bar chart (up to 90 queries).
--   4. Looped over up to 20 published courses, firing 4 queries per
--      course (chapter count, enrolments, offering_courses, progress)
--      to compute completion rates (~80 queries).
--   5. Looped over every active offering, firing 3 queries per
--      offering (total enrolments, active enrolments, revenue) for
--      offering performance (~3N queries; typically 30-60).
--   6. Final 3 queries for recent enrolments + their users + their
--      offerings (3 queries).
--
-- Total: roughly 5 + 90 + 80 + 3N + 3 = 150-200 round-trips per page
-- load. That is why the dashboard takes minutes to load on slow
-- connections, and seconds even on broadband.
--
-- This RPC returns the same data shape in ONE round-trip, computed by
-- the database with proper aggregation, joins, and the indexes added in
-- 20260417100000_foundation_hardening.sql. The function is
-- SECURITY DEFINER but checks is_admin() at the top so only admins can
-- invoke it.
--
-- Return shape (jsonb):
--   {
--     "stats": {
--       "total_students":   <int>,
--       "active_enrolments":<int>,
--       "active_offerings": <int>,
--       "total_revenue":    <numeric>
--     },
--     "daily_signups": [{"date": "DD MMM", "count": <int>}, ...],
--     "course_completions": [{
--       "course_id": <uuid>, "course_title": <text>,
--       "total_enrolled": <int>, "total_chapters": <int>,
--       "avg_completed_chapters": <numeric>, "completion_rate": <int>
--     }, ...],
--     "offering_metrics": [{
--       "offering_id": <uuid>, "offering_title": <text>,
--       "total_enrolments": <int>, "active_enrolments": <int>,
--       "revenue_inr": <numeric>
--     }, ...],
--     "recent_enrolments": [{
--       "id": <uuid>, "status": <text>, "created_at": <ts>,
--       "user_name": <text>, "user_email": <text>,
--       "offering_title": <text>, "offering_id": <uuid>
--     }, ...],
--     "offerings": [{"id": <uuid>, "title": <text>,
--                    "product_tier": <text>}]
--   }
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics(
  p_from        timestamptz DEFAULT NULL,
  p_to          timestamptz DEFAULT NULL,
  p_max_days    int          DEFAULT 90,
  p_max_courses int          DEFAULT 20,
  p_recent_limit int         DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_total_students     bigint  := 0;
  v_active_enrolments  bigint  := 0;
  v_active_offerings   bigint  := 0;
  v_total_revenue      numeric := 0;
  v_signups            jsonb   := '[]'::jsonb;
  v_completions        jsonb   := '[]'::jsonb;
  v_offering_metrics   jsonb   := '[]'::jsonb;
  v_recent             jsonb   := '[]'::jsonb;
  v_offerings          jsonb   := '[]'::jsonb;
  v_signup_start       timestamptz;
  v_signup_end         timestamptz;
  v_signup_days        int;
BEGIN
  -- Gate: admins only. Without this anyone with the anon key could
  -- call the RPC and read aggregated PII (recent enrolments include
  -- email).
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_dashboard_metrics: not authorised';
  END IF;

  -- ── 1. Summary stats ──
  SELECT count(*) INTO v_total_students
  FROM public.users u
  WHERE u.role = 'student'
    AND (p_from IS NULL OR u.created_at >= p_from)
    AND (p_to   IS NULL OR u.created_at <  p_to);

  SELECT count(*) INTO v_active_enrolments
  FROM public.enrolments e
  WHERE e.status = 'active'
    AND (p_from IS NULL OR e.created_at >= p_from)
    AND (p_to   IS NULL OR e.created_at <  p_to);

  SELECT count(*) INTO v_active_offerings
  FROM public.offerings o
  WHERE o.status = 'active';

  SELECT COALESCE(sum(po.total_inr), 0) INTO v_total_revenue
  FROM public.payment_orders po
  WHERE po.status = 'captured'
    AND (p_from IS NULL OR po.created_at >= p_from)
    AND (p_to   IS NULL OR po.created_at <  p_to);

  -- ── 2. Daily signups bucket ──
  -- Build a calendar series and LEFT JOIN users::created_at::date.
  -- Cap at p_max_days so admins choosing a wide custom range don't
  -- generate a 1000-row chart. Date math is in UTC for index alignment;
  -- the front end converts to IST for display.
  v_signup_start := COALESCE(p_from, now() - interval '30 days');
  v_signup_end   := COALESCE(p_to,   now() + interval '1 day');
  v_signup_days  := LEAST(
    GREATEST(
      CEIL(EXTRACT(epoch FROM (v_signup_end - v_signup_start)) / 86400)::int,
      1
    ),
    p_max_days
  );

  WITH cal AS (
    SELECT generate_series(
      date_trunc('day', v_signup_start),
      date_trunc('day', v_signup_start) + ((v_signup_days - 1) || ' days')::interval,
      '1 day'::interval
    )::date AS day
  ),
  signups_per_day AS (
    SELECT date_trunc('day', u.created_at)::date AS day, count(*) AS cnt
    FROM public.users u
    WHERE u.created_at >= date_trunc('day', v_signup_start)
      AND u.created_at <  date_trunc('day', v_signup_start)
                          + ((v_signup_days) || ' days')::interval
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date',  to_char(c.day, 'DD Mon'),
      'count', COALESCE(s.cnt, 0)
    ) ORDER BY c.day
  ), '[]'::jsonb)
  INTO v_signups
  FROM cal c
  LEFT JOIN signups_per_day s ON s.day = c.day;

  -- ── 3. Course completion rates ──
  -- For each published course (capped at p_max_courses, ordered by
  -- enrolment count), compute:
  --   - total_chapters       = COUNT(chapters joined to course via section)
  --   - enrolled_users       = DISTINCT users with active enrolment
  --                            in any offering containing this course
  --   - avg_completed_chapters = average completed chapters per
  --                            enrolled user (zero-padded for users
  --                            with no progress rows)
  --   - completion_rate      = ROUND(avg_completed * 100 / total_chapters)
  WITH course_chapters AS (
    SELECT s.course_id, count(*)::int AS chapter_count
    FROM public.chapters ch
    JOIN public.sections s ON s.id = ch.section_id
    GROUP BY s.course_id
  ),
  course_users AS (
    SELECT oc.course_id, e.user_id
    FROM public.enrolments e
    JOIN public.offering_courses oc ON oc.offering_id = e.offering_id
    WHERE e.status = 'active'
    GROUP BY oc.course_id, e.user_id
  ),
  course_user_counts AS (
    SELECT course_id, count(*)::int AS enrolled_users
    FROM course_users
    GROUP BY course_id
  ),
  user_progress AS (
    SELECT cp.course_id, cp.user_id, count(*) AS done
    FROM public.chapter_progress cp
    WHERE cp.completed_at IS NOT NULL
    GROUP BY cp.course_id, cp.user_id
  ),
  per_course_progress AS (
    SELECT
      cu.course_id,
      sum(COALESCE(up.done, 0))::numeric AS total_done
    FROM course_users cu
    LEFT JOIN user_progress up
      ON up.course_id = cu.course_id AND up.user_id = cu.user_id
    GROUP BY cu.course_id
  ),
  ranked AS (
    SELECT
      c.id   AS course_id,
      c.title AS course_title,
      COALESCE(cuc.enrolled_users, 0) AS enrolled_users,
      COALESCE(cc.chapter_count, 0)   AS chapter_count,
      COALESCE(pcp.total_done, 0)     AS total_done
    FROM public.courses c
    LEFT JOIN course_chapters    cc  ON cc.course_id = c.id
    LEFT JOIN course_user_counts cuc ON cuc.course_id = c.id
    LEFT JOIN per_course_progress pcp ON pcp.course_id = c.id
    WHERE c.status = 'published'
      AND COALESCE(cuc.enrolled_users, 0) > 0
      AND COALESCE(cc.chapter_count, 0)   > 0
    ORDER BY enrolled_users DESC
    LIMIT p_max_courses
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'course_id',              r.course_id,
      'course_title',           r.course_title,
      'total_enrolled',         r.enrolled_users,
      'total_chapters',         r.chapter_count,
      'avg_completed_chapters', ROUND(r.total_done / r.enrolled_users, 1),
      'completion_rate',
        ROUND( (r.total_done / r.enrolled_users)
              / NULLIF(r.chapter_count, 0) * 100 )::int
    )
    ORDER BY r.enrolled_users DESC
  ), '[]'::jsonb)
  INTO v_completions
  FROM ranked r;

  -- ── 4. Offering metrics ──
  WITH per_offering AS (
    SELECT
      o.id    AS offering_id,
      o.title AS offering_title,
      (
        SELECT count(*) FROM public.enrolments e
        WHERE e.offering_id = o.id
          AND (p_from IS NULL OR e.created_at >= p_from)
          AND (p_to   IS NULL OR e.created_at <  p_to)
      )::int AS total_enrolments,
      (
        SELECT count(*) FROM public.enrolments e
        WHERE e.offering_id = o.id AND e.status = 'active'
          AND (p_from IS NULL OR e.created_at >= p_from)
          AND (p_to   IS NULL OR e.created_at <  p_to)
      )::int AS active_enrolments,
      (
        SELECT COALESCE(sum(po.total_inr), 0) FROM public.payment_orders po
        WHERE po.offering_id = o.id AND po.status = 'captured'
          AND (p_from IS NULL OR po.created_at >= p_from)
          AND (p_to   IS NULL OR po.created_at <  p_to)
      ) AS revenue_inr
    FROM public.offerings o
    WHERE o.status = 'active'
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'offering_id',       po.offering_id,
      'offering_title',    po.offering_title,
      'total_enrolments',  po.total_enrolments,
      'active_enrolments', po.active_enrolments,
      'revenue_inr',       po.revenue_inr
    )
    ORDER BY po.revenue_inr DESC
  ), '[]'::jsonb)
  INTO v_offering_metrics
  FROM per_offering po;

  -- ── 5. Recent enrolments (latest p_recent_limit) ──
  WITH recent_e AS (
    SELECT e.id, e.status, e.created_at, e.user_id, e.offering_id
    FROM public.enrolments e
    WHERE (p_from IS NULL OR e.created_at >= p_from)
      AND (p_to   IS NULL OR e.created_at <  p_to)
    ORDER BY e.created_at DESC
    LIMIT p_recent_limit
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',              re.id,
      'status',          re.status,
      'created_at',      re.created_at,
      'user_name',       COALESCE(u.full_name, 'Unknown'),
      'user_email',      COALESCE(u.email, ''),
      'offering_title',  COALESCE(o.title, 'Unknown'),
      'offering_id',     re.offering_id
    )
    ORDER BY re.created_at DESC
  ), '[]'::jsonb)
  INTO v_recent
  FROM recent_e re
  LEFT JOIN public.users     u ON u.id = re.user_id
  LEFT JOIN public.offerings o ON o.id = re.offering_id;

  -- ── 6. Offerings list (for filter dropdowns) ──
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',           o.id,
      'title',        o.title,
      'product_tier', COALESCE(to_jsonb(o.product_tier), 'null'::jsonb)
    )
    ORDER BY o.title
  ), '[]'::jsonb)
  INTO v_offerings
  FROM public.offerings o
  WHERE o.status = 'active';

  RETURN jsonb_build_object(
    'stats', jsonb_build_object(
      'total_students',    v_total_students,
      'active_enrolments', v_active_enrolments,
      'active_offerings',  v_active_offerings,
      'total_revenue',     v_total_revenue
    ),
    'daily_signups',     v_signups,
    'course_completions', v_completions,
    'offering_metrics',  v_offering_metrics,
    'recent_enrolments', v_recent,
    'offerings',         v_offerings
  );
END;
$$;

COMMENT ON FUNCTION public.admin_dashboard_metrics(timestamptz, timestamptz, int, int, int) IS
  'Single-shot dashboard data fetch. Returns stats, daily signups, '
  'course completion rates, offering performance, recent enrolments, '
  'and active offerings as one jsonb. Replaces ~150 client round-trips '
  'in AdminDashboard.tsx. Admin-only — gated by is_admin() check inside '
  'the function body.';

REVOKE ALL ON FUNCTION public.admin_dashboard_metrics(timestamptz, timestamptz, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics(timestamptz, timestamptz, int, int, int) TO authenticated;
