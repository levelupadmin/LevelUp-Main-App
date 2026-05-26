-- Legacy_enrolments was ingested with phone + email only — the source
-- TagMango orders master ALSO has full_name (99.6% filled), state
-- (7.4% sparse), and we can pull city from the Customer Brain v3
-- "Converted Students" sheet by phone-match (96% filled on converts).
--
-- This migration adds the columns + updates users_unified so the
-- AdminUsers page shows actual names + phone + city instead of
-- "unclaimed legacy" placeholders.

ALTER TABLE public.legacy_enrolments
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text;

CREATE INDEX IF NOT EXISTS legacy_enrolments_full_name_idx
  ON public.legacy_enrolments (lower(full_name)) WHERE full_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS legacy_enrolments_city_idx
  ON public.legacy_enrolments (city) WHERE city IS NOT NULL;

/* ──────── users_unified — rebuild with name + city + state ──────── */

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
  -- One row per distinct phone in legacy_enrolments that doesn't have
  -- a matching users row. MAX(full_name) picks the most-recently
  -- populated value; same for city. NULLIF guards against empty strings.
  SELECT
    NULL::uuid                                       AS id,
    NULLIF(MAX(le.email),    '')                      AS email,
    le.phone                                          AS phone,
    NULLIF(MAX(le.full_name),'')                      AS full_name,
    'student'::text                                   AS role,
    NULL::integer                                     AS member_number,
    MIN(le.created_at)                                AS created_at,
    NULL::timestamptz                                 AS last_active_at,
    false                                             AS is_real,
    true                                              AS is_legacy,
    'tagmango'::text                                  AS legacy_source,
    NULLIF(MAX(le.city),  '')                         AS city,
    NULLIF(MAX(le.state), '')                         AS state,
    'India'::text                                     AS country,
    NULL::text                                        AS program_vertical,
    NULL::text                                        AS specific_vertical,
    COALESCE(SUM(le.legacy_amount_inr), 0)::integer   AS lifetime_revenue_inr,
    MIN(le.legacy_purchased_at)                       AS first_purchase_at,
    MAX(le.legacy_purchased_at)                       AS last_purchase_at,
    COUNT(*)::integer                                 AS purchase_count
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

/* ──────── enrolments_unified — surface full_name on legacy rows ──────── */

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
  le.full_name               AS user_full_name,
  o.title                    AS offering_title,
  o.slug                     AS offering_slug,
  'legacy'::text             AS enrolment_kind
FROM public.legacy_enrolments le
LEFT JOIN public.offerings o ON o.id = le.offering_id;

GRANT SELECT ON public.enrolments_unified TO authenticated;
ALTER VIEW public.enrolments_unified SET (security_invoker = true);

/* ──────── Dashboard RPC: combined snapshot for /admin ────────
   Returns ALL the headline KPIs the admin dashboard wants, sourced
   from BOTH live tables and legacy_enrolments, for any date window.
   Single round-trip — cheap. */

CREATE OR REPLACE FUNCTION public.admin_dashboard_combined(
  p_from timestamptz,
  p_to   timestamptz
) RETURNS TABLE (
  -- People
  total_students_unified      integer,  -- distinct users (real + phantom legacy) ever
  new_students_in_window      integer,  -- signups in the window (real users only — phantom = pre-app)
  legacy_buyers_in_window     integer,  -- distinct legacy phones with a purchase in window

  -- Enrolments
  active_enrolments_total     integer,  -- live + legacy combined (active or claimed)
  enrolments_in_window        integer,  -- live + legacy created in window

  -- Money
  total_revenue_inr_in_window bigint,   -- live captured + legacy combined
  live_revenue_inr            bigint,
  legacy_revenue_inr          bigint,
  order_count_in_window       integer,  -- live + legacy

  -- Offerings
  active_offerings_count      integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH
  -- People
  unified_users AS (
    SELECT COUNT(*)::integer AS c FROM public.users_unified
  ),
  new_live AS (
    SELECT COUNT(*)::integer AS c FROM public.users
    WHERE created_at >= p_from AND created_at < p_to
  ),
  legacy_buyers AS (
    SELECT COUNT(DISTINCT phone)::integer AS c FROM public.legacy_enrolments
    WHERE legacy_purchased_at >= p_from AND legacy_purchased_at < p_to
  ),
  -- Enrolments
  active_live AS (
    SELECT COUNT(*)::integer AS c FROM public.enrolments WHERE status = 'active'
  ),
  total_legacy AS (
    SELECT COUNT(*)::integer AS c FROM public.legacy_enrolments
  ),
  enrols_window_live AS (
    SELECT COUNT(*)::integer AS c FROM public.enrolments
    WHERE created_at >= p_from AND created_at < p_to
  ),
  enrols_window_legacy AS (
    SELECT COUNT(*)::integer AS c FROM public.legacy_enrolments
    WHERE legacy_purchased_at >= p_from AND legacy_purchased_at < p_to
  ),
  -- Money
  rev_live AS (
    SELECT COALESCE(SUM(total_inr), 0)::bigint AS s,
           COUNT(*)::integer AS c
    FROM public.payment_orders
    WHERE status = 'captured'
      AND created_at >= p_from AND created_at < p_to
  ),
  rev_legacy AS (
    SELECT COALESCE(SUM(legacy_amount_inr), 0)::bigint AS s,
           COUNT(*)::integer AS c
    FROM public.legacy_enrolments
    WHERE legacy_purchased_at >= p_from AND legacy_purchased_at < p_to
  ),
  -- Offerings
  active_off AS (
    SELECT COUNT(*)::integer AS c FROM public.offerings WHERE status = 'active'
  )
  SELECT
    unified_users.c,
    new_live.c,
    legacy_buyers.c,
    (active_live.c + total_legacy.c)::integer,
    (enrols_window_live.c + enrols_window_legacy.c)::integer,
    (rev_live.s + rev_legacy.s)::bigint,
    rev_live.s,
    rev_legacy.s,
    (rev_live.c + rev_legacy.c)::integer,
    active_off.c
  FROM unified_users, new_live, legacy_buyers,
       active_live, total_legacy, enrols_window_live, enrols_window_legacy,
       rev_live, rev_legacy, active_off;
$$;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_combined(timestamptz, timestamptz) TO authenticated;

/* ──────── offering_performance_in_range ────────
   Per-offering metrics for the dashboard's "Offering Performance"
   table. Combines live + legacy. */

CREATE OR REPLACE FUNCTION public.offering_performance_in_range(
  p_from timestamptz,
  p_to   timestamptz
) RETURNS TABLE (
  offering_id uuid,
  offering_title text,
  offering_slug text,
  offering_type text,
  total_enrolments integer,        -- ALL-TIME (live + legacy)
  active_enrolments integer,
  live_orders_in_window integer,
  legacy_orders_in_window integer,
  total_orders_in_window integer,
  live_revenue_in_window bigint,
  legacy_revenue_in_window bigint,
  total_revenue_in_window bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH per_offering AS (
    SELECT
      o.id   AS offering_id,
      o.title AS offering_title,
      o.slug  AS offering_slug,
      o.type  AS offering_type,
      ((SELECT COUNT(*) FROM public.enrolments WHERE offering_id = o.id)
       + (SELECT COUNT(*) FROM public.legacy_enrolments WHERE offering_id = o.id))::integer
        AS total_enrolments,
      (SELECT COUNT(*) FROM public.enrolments WHERE offering_id = o.id AND status = 'active')::integer
        AS active_enrolments,
      (SELECT COUNT(*) FROM public.payment_orders
         WHERE offering_id = o.id AND status = 'captured'
           AND created_at >= p_from AND created_at < p_to)::integer
        AS live_orders_in_window,
      (SELECT COUNT(*) FROM public.legacy_enrolments
         WHERE offering_id = o.id
           AND legacy_purchased_at >= p_from AND legacy_purchased_at < p_to)::integer
        AS legacy_orders_in_window,
      COALESCE((SELECT SUM(total_inr) FROM public.payment_orders
         WHERE offering_id = o.id AND status = 'captured'
           AND created_at >= p_from AND created_at < p_to), 0)::bigint
        AS live_revenue_in_window,
      COALESCE((SELECT SUM(legacy_amount_inr) FROM public.legacy_enrolments
         WHERE offering_id = o.id
           AND legacy_purchased_at >= p_from AND legacy_purchased_at < p_to), 0)::bigint
        AS legacy_revenue_in_window
    FROM public.offerings o
    WHERE o.status = 'active' OR EXISTS (
      SELECT 1 FROM public.legacy_enrolments le WHERE le.offering_id = o.id
    )
  )
  SELECT
    offering_id, offering_title, offering_slug, offering_type,
    total_enrolments, active_enrolments,
    live_orders_in_window, legacy_orders_in_window,
    (live_orders_in_window + legacy_orders_in_window)::integer AS total_orders_in_window,
    live_revenue_in_window, legacy_revenue_in_window,
    (live_revenue_in_window + legacy_revenue_in_window)::bigint AS total_revenue_in_window
  FROM per_offering
  ORDER BY (live_revenue_in_window + legacy_revenue_in_window) DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.offering_performance_in_range(timestamptz, timestamptz) TO authenticated;

/* ──────── daily_signups_combined ────────
   For the dashboard's "Daily Signups" chart. Per-day rows in window
   showing new live users + legacy purchases (= legacy "signups").
*/
CREATE OR REPLACE FUNCTION public.daily_signups_combined(
  p_from timestamptz,
  p_to   timestamptz
) RETURNS TABLE (
  day date,
  new_users integer,
  legacy_buyers integer,
  total integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH live AS (
    SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')::date AS d,
           COUNT(*)::integer AS c
    FROM public.users
    WHERE created_at >= p_from AND created_at < p_to
    GROUP BY 1
  ),
  legacy AS (
    SELECT date_trunc('day', legacy_purchased_at AT TIME ZONE 'Asia/Kolkata')::date AS d,
           COUNT(DISTINCT phone)::integer AS c
    FROM public.legacy_enrolments
    WHERE legacy_purchased_at >= p_from AND legacy_purchased_at < p_to
    GROUP BY 1
  ),
  all_days AS (SELECT d FROM live UNION SELECT d FROM legacy)
  SELECT
    ad.d AS day,
    COALESCE(live.c, 0) AS new_users,
    COALESCE(legacy.c, 0) AS legacy_buyers,
    (COALESCE(live.c, 0) + COALESCE(legacy.c, 0)) AS total
  FROM all_days ad
  LEFT JOIN live   ON live.d   = ad.d
  LEFT JOIN legacy ON legacy.d = ad.d
  ORDER BY ad.d;
$$;

GRANT EXECUTE ON FUNCTION public.daily_signups_combined(timestamptz, timestamptz) TO authenticated;
