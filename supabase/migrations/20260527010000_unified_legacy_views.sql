-- Unified views + RPCs that surface the 73K+ TagMango legacy_enrolments
-- alongside live data in AdminUsers / AdminEnrolments / AdminRevenue.
--
-- The CSV ingest already populated:
--   public.legacy_enrolments  — 73,926 rows (~₹5L revenue in the last 30d)
--   public.legacy_program_mapping — pending vs mapped programs
--
-- These views + RPCs let the admin UI query both halves in one shot.

/* ──────── users_unified ────────
   Real users (from public.users) UNION distinct phantom users from
   legacy_enrolments who have NOT signed up yet (no matching users row by
   phone OR by email). Each row has the same shape regardless of source.
*/
CREATE OR REPLACE VIEW public.users_unified AS
WITH real_users AS (
  SELECT
    u.id, u.email, u.phone, u.full_name, u.role, u.member_number,
    u.created_at, u.last_active_at,
    true AS is_real,
    u.is_legacy,
    u.legacy_source,
    u.city, u.state, u.country,
    u.program_vertical, u.specific_vertical,
    COALESCE(u.lifetime_revenue_inr, 0) AS lifetime_revenue_inr,
    u.first_purchase_at, u.last_purchase_at,
    COALESCE(u.purchase_count, 0) AS purchase_count
  FROM public.users u
),
phantom_legacy AS (
  -- One row per distinct phone in legacy_enrolments that doesn't already
  -- have a real users row. We coalesce per-phone aggregates so the table
  -- shows a single row per ghost user with their total spend.
  SELECT
    NULL::uuid                          AS id,
    MIN(le.email)                        AS email,
    le.phone                             AS phone,
    NULL::text                           AS full_name,
    'student'::text                      AS role,
    NULL::integer                        AS member_number,
    MIN(le.created_at)                   AS created_at,
    NULL::timestamptz                    AS last_active_at,
    false                                AS is_real,
    true                                 AS is_legacy,
    'tagmango'::text                     AS legacy_source,
    NULL::text                           AS city,
    NULL::text                           AS state,
    'India'::text                        AS country,
    NULL::text                           AS program_vertical,
    NULL::text                           AS specific_vertical,
    COALESCE(SUM(le.legacy_amount_inr), 0)::integer AS lifetime_revenue_inr,
    MIN(le.legacy_purchased_at)          AS first_purchase_at,
    MAX(le.legacy_purchased_at)          AS last_purchase_at,
    COUNT(*)::integer                    AS purchase_count
  FROM public.legacy_enrolments le
  WHERE NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.phone = le.phone
       OR (u.email IS NOT NULL AND le.email IS NOT NULL AND lower(u.email) = lower(le.email))
  )
  GROUP BY le.phone
)
SELECT * FROM real_users
UNION ALL
SELECT * FROM phantom_legacy;

GRANT SELECT ON public.users_unified TO authenticated;
ALTER VIEW public.users_unified SET (security_invoker = true);

COMMENT ON VIEW public.users_unified IS
  'Real users + phantom legacy customers (distinct phones from legacy_enrolments without a matching users row). is_real=false means phantom. AdminUsers reads this view.';

/* ──────── enrolments_unified ────────
   Live enrolments + legacy_enrolments in one shape. Adds an
   "enrolment_kind" column so the UI can badge them differently.
*/
CREATE OR REPLACE VIEW public.enrolments_unified AS
SELECT
  e.id,
  e.user_id,
  e.offering_id,
  e.payment_order_id,
  e.status,
  e.starts_at,
  e.expires_at,
  e.source,
  e.created_at,
  e.total_paid_inr::integer  AS total_paid_inr,
  NULL::timestamptz          AS legacy_purchased_at,
  NULL::text                 AS legacy_program_name,
  u.email                    AS user_email,
  u.phone                    AS user_phone,
  u.full_name                AS user_full_name,
  o.title                    AS offering_title,
  o.slug                     AS offering_slug,
  'live'::text               AS enrolment_kind
FROM public.enrolments e
LEFT JOIN public.users u     ON u.id = e.user_id
LEFT JOIN public.offerings o ON o.id = e.offering_id

UNION ALL

SELECT
  le.id,
  le.claimed_by_user_id      AS user_id,
  le.offering_id,
  NULL::uuid                 AS payment_order_id,
  CASE WHEN le.claimed_by_user_id IS NULL THEN 'pending' ELSE 'active' END AS status,
  le.legacy_purchased_at     AS starts_at,
  NULL::timestamptz          AS expires_at,
  le.source                  AS source,
  le.created_at,
  COALESCE(le.legacy_amount_inr, 0)::integer AS total_paid_inr,
  le.legacy_purchased_at,
  le.legacy_program_name,
  le.email                   AS user_email,
  le.phone                   AS user_phone,
  NULL::text                 AS user_full_name,
  o.title                    AS offering_title,
  o.slug                     AS offering_slug,
  'legacy'::text             AS enrolment_kind
FROM public.legacy_enrolments le
LEFT JOIN public.offerings o ON o.id = le.offering_id;

GRANT SELECT ON public.enrolments_unified TO authenticated;
ALTER VIEW public.enrolments_unified SET (security_invoker = true);

COMMENT ON VIEW public.enrolments_unified IS
  'Live enrolments + legacy_enrolments. Distinguished by enrolment_kind column. AdminEnrolments reads this view.';

/* ──────── revenue_in_range — REPLACE w/ combined ────────
   Returns combined live + legacy revenue for a date window. Same
   shape as before but with extra columns for the legacy half so
   the UI can show "live: ₹X, legacy: ₹Y, combined: ₹X+Y".
*/
DROP FUNCTION IF EXISTS public.revenue_in_range(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.revenue_in_range(
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  live_paid_inr      bigint,
  live_order_count   integer,
  live_unique_buyers integer,
  legacy_paid_inr    bigint,
  legacy_order_count integer,
  legacy_unique_buyers integer,
  total_paid_inr     bigint,
  total_order_count  integer,
  refunded_inr       bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH live AS (
    SELECT
      COALESCE(SUM(total_inr) FILTER (WHERE status = 'captured'), 0)::bigint AS paid,
      COUNT(*) FILTER (WHERE status = 'captured')::integer                    AS orders,
      COUNT(DISTINCT user_id) FILTER (WHERE status = 'captured')::integer     AS buyers,
      COALESCE(SUM(total_inr) FILTER (WHERE status = 'refunded'), 0)::bigint  AS refunded
    FROM public.payment_orders
    WHERE created_at >= p_from AND created_at < p_to
  ),
  legacy AS (
    SELECT
      COALESCE(SUM(legacy_amount_inr), 0)::bigint               AS paid,
      COUNT(*)::integer                                          AS orders,
      COUNT(DISTINCT phone)::integer                             AS buyers
    FROM public.legacy_enrolments
    WHERE legacy_purchased_at >= p_from AND legacy_purchased_at < p_to
  )
  SELECT
    live.paid, live.orders, live.buyers,
    legacy.paid, legacy.orders, legacy.buyers,
    (live.paid + legacy.paid)::bigint, (live.orders + legacy.orders)::integer,
    live.refunded
  FROM live, legacy;
$$;

GRANT EXECUTE ON FUNCTION public.revenue_in_range(timestamptz, timestamptz) TO authenticated;

/* ──────── revenue_daily — REPLACE w/ combined ──────── */

DROP FUNCTION IF EXISTS public.revenue_daily(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.revenue_daily(
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  day date,
  live_paid_inr bigint,
  legacy_paid_inr bigint,
  total_paid_inr bigint,
  order_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH live AS (
    SELECT
      date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
      COALESCE(SUM(total_inr) FILTER (WHERE status = 'captured'), 0)::bigint AS paid,
      COUNT(*) FILTER (WHERE status = 'captured')::integer AS orders
    FROM public.payment_orders
    WHERE created_at >= p_from AND created_at < p_to
    GROUP BY 1
  ),
  legacy AS (
    SELECT
      date_trunc('day', legacy_purchased_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
      COALESCE(SUM(legacy_amount_inr), 0)::bigint AS paid,
      COUNT(*)::integer AS orders
    FROM public.legacy_enrolments
    WHERE legacy_purchased_at >= p_from AND legacy_purchased_at < p_to
    GROUP BY 1
  ),
  all_days AS (
    SELECT day FROM live UNION SELECT day FROM legacy
  )
  SELECT
    ad.day,
    COALESCE(live.paid, 0) AS live_paid_inr,
    COALESCE(legacy.paid, 0) AS legacy_paid_inr,
    (COALESCE(live.paid, 0) + COALESCE(legacy.paid, 0))::bigint AS total_paid_inr,
    (COALESCE(live.orders, 0) + COALESCE(legacy.orders, 0))::integer AS order_count
  FROM all_days ad
  LEFT JOIN live ON live.day = ad.day
  LEFT JOIN legacy ON legacy.day = ad.day
  ORDER BY ad.day;
$$;

GRANT EXECUTE ON FUNCTION public.revenue_daily(timestamptz, timestamptz) TO authenticated;

/* ──────── revenue_by_offering_in_range — NEW ────────
   Per-offering revenue split into live vs legacy. Drives the
   per-offering breakdown panel on /admin/revenue.
*/
CREATE OR REPLACE FUNCTION public.revenue_by_offering_in_range(
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  offering_id uuid,
  offering_title text,
  offering_slug text,
  offering_type text,
  live_paid_inr bigint,
  live_order_count integer,
  legacy_paid_inr bigint,
  legacy_order_count integer,
  total_paid_inr bigint,
  total_order_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH live AS (
    SELECT
      po.offering_id,
      COALESCE(SUM(po.total_inr) FILTER (WHERE po.status = 'captured'), 0)::bigint AS paid,
      COUNT(*) FILTER (WHERE po.status = 'captured')::integer AS orders
    FROM public.payment_orders po
    WHERE po.created_at >= p_from AND po.created_at < p_to
    GROUP BY po.offering_id
  ),
  legacy AS (
    SELECT
      le.offering_id,
      COALESCE(SUM(le.legacy_amount_inr), 0)::bigint AS paid,
      COUNT(*)::integer AS orders
    FROM public.legacy_enrolments le
    WHERE le.legacy_purchased_at >= p_from AND le.legacy_purchased_at < p_to
      AND le.offering_id IS NOT NULL
    GROUP BY le.offering_id
  ),
  all_offering_ids AS (
    SELECT offering_id FROM live UNION SELECT offering_id FROM legacy
  )
  SELECT
    o.id, o.title, o.slug, o.type,
    COALESCE(live.paid, 0)::bigint   AS live_paid_inr,
    COALESCE(live.orders, 0)         AS live_order_count,
    COALESCE(legacy.paid, 0)::bigint AS legacy_paid_inr,
    COALESCE(legacy.orders, 0)       AS legacy_order_count,
    (COALESCE(live.paid, 0) + COALESCE(legacy.paid, 0))::bigint AS total_paid_inr,
    (COALESCE(live.orders, 0) + COALESCE(legacy.orders, 0))      AS total_order_count
  FROM all_offering_ids aoi
  JOIN public.offerings o ON o.id = aoi.offering_id
  LEFT JOIN live ON live.offering_id = aoi.offering_id
  LEFT JOIN legacy ON legacy.offering_id = aoi.offering_id
  ORDER BY total_paid_inr DESC;
$$;

GRANT EXECUTE ON FUNCTION public.revenue_by_offering_in_range(timestamptz, timestamptz) TO authenticated;

/* ──────── unmapped_legacy_revenue — NEW ────────
   Shows revenue from legacy_enrolments where offering_id IS NULL —
   i.e. CSV rows whose program_name hasn't been mapped in
   legacy_program_mapping yet. Visible as a "needs attention" card
   on /admin/revenue. */

CREATE OR REPLACE FUNCTION public.unmapped_legacy_revenue(
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  legacy_program_name text,
  rows_count integer,
  paid_inr bigint,
  first_purchase_at timestamptz,
  last_purchase_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    legacy_program_name,
    COUNT(*)::integer AS rows_count,
    COALESCE(SUM(legacy_amount_inr), 0)::bigint AS paid_inr,
    MIN(legacy_purchased_at) AS first_purchase_at,
    MAX(legacy_purchased_at) AS last_purchase_at
  FROM public.legacy_enrolments
  WHERE offering_id IS NULL
    AND legacy_purchased_at >= p_from
    AND legacy_purchased_at < p_to
  GROUP BY legacy_program_name
  ORDER BY paid_inr DESC;
$$;

GRANT EXECUTE ON FUNCTION public.unmapped_legacy_revenue(timestamptz, timestamptz) TO authenticated;
