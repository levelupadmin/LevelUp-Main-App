-- ───────────────────────────────────────────────────────────────────────────
-- SECURITY HARDENING: admin-only revenue/PII RPCs + team-API-key oracle
--
-- AUDIT FINDING (2026-05-29): every SECURITY DEFINER analytics RPC added in
-- the legacy-segmentation work (20260526250000 / 20260527010000 /
-- 20260527020000) was GRANTed to PUBLIC/anon/authenticated with NO internal
-- admin check. Because they are SECURITY DEFINER they bypass RLS, so ANY
-- logged-in student could call e.g. revenue_by_user_in_range() and read every
-- buyer's name/email/phone + full company revenue.
--
-- These RPCs are only ever called from the admin dashboard with the admin's
-- own JWT (supabase.rpc(...)) — never by the admin-api edge function (which
-- runs as service_role and only calls lead_capture / *_team_api_key). So
-- gating on public.is_admin() is safe: admins (auth.uid() resolves) are
-- unaffected; everyone else gets zero rows.
--
-- Mechanism: these are LANGUAGE sql (cannot RAISE), so we inject
-- `public.is_admin()` into the outer query's predicate. is_admin() is
-- STABLE SECURITY DEFINER and reads auth.uid(), so it evaluates the CALLER's
-- identity even inside a definer function.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. revenue_in_range ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revenue_in_range(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(live_paid_inr bigint, live_order_count integer, live_unique_buyers integer, legacy_paid_inr bigint, legacy_order_count integer, legacy_unique_buyers integer, total_paid_inr bigint, total_order_count integer, refunded_inr bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
  FROM live, legacy
  WHERE public.is_admin();
$function$;

-- 2. revenue_by_user_in_range (returns buyer PII) ─────────────────────────
CREATE OR REPLACE FUNCTION public.revenue_by_user_in_range(p_from timestamptz, p_to timestamptz, p_limit integer DEFAULT 100)
RETURNS TABLE(user_id uuid, email text, full_name text, phone text, paid_inr bigint, order_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT
    u.id, u.email, u.full_name, u.phone,
    COALESCE(sum(po.total_inr), 0)::bigint AS paid_inr,
    count(po.id)::integer                    AS order_count
  FROM public.payment_orders po
  JOIN public.users u ON u.id = po.user_id
  WHERE po.created_at >= p_from
    AND po.created_at < p_to
    AND po.status = 'captured'
    AND public.is_admin()
  GROUP BY u.id, u.email, u.full_name, u.phone
  ORDER BY paid_inr DESC
  LIMIT p_limit;
$function$;

-- 3. admin_dashboard_combined ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_dashboard_combined(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(total_students_unified integer, new_students_in_window integer, legacy_buyers_in_window integer, active_enrolments_total integer, enrolments_in_window integer, total_revenue_inr_in_window bigint, live_revenue_inr bigint, legacy_revenue_inr bigint, order_count_in_window integer, active_offerings_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH
  unified_users AS (SELECT COUNT(*)::integer AS c FROM public.users_unified),
  new_live AS (
    SELECT COUNT(*)::integer AS c FROM public.users
    WHERE created_at >= p_from AND created_at < p_to
  ),
  legacy_buyers AS (
    SELECT COUNT(DISTINCT phone)::integer AS c FROM public.legacy_enrolments
    WHERE legacy_purchased_at >= p_from AND legacy_purchased_at < p_to
  ),
  active_live AS (SELECT COUNT(*)::integer AS c FROM public.enrolments WHERE status = 'active'),
  total_legacy AS (SELECT COUNT(*)::integer AS c FROM public.legacy_enrolments),
  enrols_window_live AS (
    SELECT COUNT(*)::integer AS c FROM public.enrolments
    WHERE created_at >= p_from AND created_at < p_to
  ),
  enrols_window_legacy AS (
    SELECT COUNT(*)::integer AS c FROM public.legacy_enrolments
    WHERE legacy_purchased_at >= p_from AND legacy_purchased_at < p_to
  ),
  rev_live AS (
    SELECT COALESCE(SUM(total_inr), 0)::bigint AS s, COUNT(*)::integer AS c
    FROM public.payment_orders
    WHERE status = 'captured' AND created_at >= p_from AND created_at < p_to
  ),
  rev_legacy AS (
    SELECT COALESCE(SUM(legacy_amount_inr), 0)::bigint AS s, COUNT(*)::integer AS c
    FROM public.legacy_enrolments
    WHERE legacy_purchased_at >= p_from AND legacy_purchased_at < p_to
  ),
  active_off AS (SELECT COUNT(*)::integer AS c FROM public.offerings WHERE status = 'active')
  SELECT
    unified_users.c, new_live.c, legacy_buyers.c,
    (active_live.c + total_legacy.c)::integer,
    (enrols_window_live.c + enrols_window_legacy.c)::integer,
    (rev_live.s + rev_legacy.s)::bigint, rev_live.s, rev_legacy.s,
    (rev_live.c + rev_legacy.c)::integer, active_off.c
  FROM unified_users, new_live, legacy_buyers,
       active_live, total_legacy, enrols_window_live, enrols_window_legacy,
       rev_live, rev_legacy, active_off
  WHERE public.is_admin();
$function$;

-- 4. revenue_daily ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revenue_daily(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(day date, live_paid_inr bigint, legacy_paid_inr bigint, total_paid_inr bigint, order_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH live AS (
    SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
      COALESCE(SUM(total_inr) FILTER (WHERE status = 'captured'), 0)::bigint AS paid,
      COUNT(*) FILTER (WHERE status = 'captured')::integer AS orders
    FROM public.payment_orders
    WHERE created_at >= p_from AND created_at < p_to
    GROUP BY 1
  ),
  legacy AS (
    SELECT date_trunc('day', legacy_purchased_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
      COALESCE(SUM(legacy_amount_inr), 0)::bigint AS paid, COUNT(*)::integer AS orders
    FROM public.legacy_enrolments
    WHERE legacy_purchased_at >= p_from AND legacy_purchased_at < p_to
    GROUP BY 1
  ),
  all_days AS (SELECT day FROM live UNION SELECT day FROM legacy)
  SELECT
    ad.day,
    COALESCE(live.paid, 0) AS live_paid_inr,
    COALESCE(legacy.paid, 0) AS legacy_paid_inr,
    (COALESCE(live.paid, 0) + COALESCE(legacy.paid, 0))::bigint AS total_paid_inr,
    (COALESCE(live.orders, 0) + COALESCE(legacy.orders, 0))::integer AS order_count
  FROM all_days ad
  LEFT JOIN live ON live.day = ad.day
  LEFT JOIN legacy ON legacy.day = ad.day
  WHERE public.is_admin()
  ORDER BY ad.day;
$function$;

-- 5. offering_performance_in_range ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.offering_performance_in_range(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(offering_id uuid, offering_title text, offering_slug text, offering_type text, total_enrolments integer, active_enrolments integer, live_orders_in_window integer, legacy_orders_in_window integer, total_orders_in_window integer, live_revenue_in_window bigint, legacy_revenue_in_window bigint, total_revenue_in_window bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH per_offering AS (
    SELECT
      o.id AS offering_id, o.title AS offering_title, o.slug AS offering_slug, o.type AS offering_type,
      ((SELECT COUNT(*) FROM public.enrolments WHERE offering_id = o.id)
       + (SELECT COUNT(*) FROM public.legacy_enrolments WHERE offering_id = o.id))::integer AS total_enrolments,
      (SELECT COUNT(*) FROM public.enrolments WHERE offering_id = o.id AND status = 'active')::integer AS active_enrolments,
      (SELECT COUNT(*) FROM public.payment_orders WHERE offering_id = o.id AND status = 'captured'
         AND created_at >= p_from AND created_at < p_to)::integer AS live_orders_in_window,
      (SELECT COUNT(*) FROM public.legacy_enrolments WHERE offering_id = o.id
         AND legacy_purchased_at >= p_from AND legacy_purchased_at < p_to)::integer AS legacy_orders_in_window,
      COALESCE((SELECT SUM(total_inr) FROM public.payment_orders WHERE offering_id = o.id AND status = 'captured'
         AND created_at >= p_from AND created_at < p_to), 0)::bigint AS live_revenue_in_window,
      COALESCE((SELECT SUM(legacy_amount_inr) FROM public.legacy_enrolments WHERE offering_id = o.id
         AND legacy_purchased_at >= p_from AND legacy_purchased_at < p_to), 0)::bigint AS legacy_revenue_in_window
    FROM public.offerings o
    WHERE o.status = 'active' OR EXISTS (SELECT 1 FROM public.legacy_enrolments le WHERE le.offering_id = o.id)
  )
  SELECT
    offering_id, offering_title, offering_slug, offering_type,
    total_enrolments, active_enrolments, live_orders_in_window, legacy_orders_in_window,
    (live_orders_in_window + legacy_orders_in_window)::integer AS total_orders_in_window,
    live_revenue_in_window, legacy_revenue_in_window,
    (live_revenue_in_window + legacy_revenue_in_window)::bigint AS total_revenue_in_window
  FROM per_offering
  WHERE public.is_admin()
  ORDER BY (live_revenue_in_window + legacy_revenue_in_window) DESC NULLS LAST;
$function$;

-- 6. daily_signups_combined ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.daily_signups_combined(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(day date, new_users integer, legacy_buyers integer, total integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH live AS (
    SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')::date AS d, COUNT(*)::integer AS c
    FROM public.users WHERE created_at >= p_from AND created_at < p_to GROUP BY 1
  ),
  legacy AS (
    SELECT date_trunc('day', legacy_purchased_at AT TIME ZONE 'Asia/Kolkata')::date AS d,
           COUNT(DISTINCT phone)::integer AS c
    FROM public.legacy_enrolments WHERE legacy_purchased_at >= p_from AND legacy_purchased_at < p_to GROUP BY 1
  ),
  all_days AS (SELECT d FROM live UNION SELECT d FROM legacy)
  SELECT ad.d AS day, COALESCE(live.c, 0) AS new_users, COALESCE(legacy.c, 0) AS legacy_buyers,
         (COALESCE(live.c, 0) + COALESCE(legacy.c, 0)) AS total
  FROM all_days ad
  LEFT JOIN live ON live.d = ad.d
  LEFT JOIN legacy ON legacy.d = ad.d
  WHERE public.is_admin()
  ORDER BY ad.d;
$function$;

-- 7. revenue_by_offering_in_range ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revenue_by_offering_in_range(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(offering_id uuid, offering_title text, offering_slug text, offering_type text, live_paid_inr bigint, live_order_count integer, legacy_paid_inr bigint, legacy_order_count integer, total_paid_inr bigint, total_order_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH live AS (
    SELECT po.offering_id,
      COALESCE(SUM(po.total_inr) FILTER (WHERE po.status = 'captured'), 0)::bigint AS paid,
      COUNT(*) FILTER (WHERE po.status = 'captured')::integer AS orders
    FROM public.payment_orders po
    WHERE po.created_at >= p_from AND po.created_at < p_to GROUP BY po.offering_id
  ),
  legacy AS (
    SELECT le.offering_id, COALESCE(SUM(le.legacy_amount_inr), 0)::bigint AS paid, COUNT(*)::integer AS orders
    FROM public.legacy_enrolments le
    WHERE le.legacy_purchased_at >= p_from AND le.legacy_purchased_at < p_to AND le.offering_id IS NOT NULL
    GROUP BY le.offering_id
  ),
  all_offering_ids AS (SELECT offering_id FROM live UNION SELECT offering_id FROM legacy)
  SELECT
    o.id, o.title, o.slug, o.type,
    COALESCE(live.paid, 0)::bigint AS live_paid_inr, COALESCE(live.orders, 0) AS live_order_count,
    COALESCE(legacy.paid, 0)::bigint AS legacy_paid_inr, COALESCE(legacy.orders, 0) AS legacy_order_count,
    (COALESCE(live.paid, 0) + COALESCE(legacy.paid, 0))::bigint AS total_paid_inr,
    (COALESCE(live.orders, 0) + COALESCE(legacy.orders, 0)) AS total_order_count
  FROM all_offering_ids aoi
  JOIN public.offerings o ON o.id = aoi.offering_id
  LEFT JOIN live ON live.offering_id = aoi.offering_id
  LEFT JOIN legacy ON legacy.offering_id = aoi.offering_id
  WHERE public.is_admin()
  ORDER BY total_paid_inr DESC;
$function$;

-- 8. unmapped_legacy_revenue ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unmapped_legacy_revenue(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(legacy_program_name text, rows_count integer, paid_inr bigint, first_purchase_at timestamptz, last_purchase_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT
    legacy_program_name, COUNT(*)::integer AS rows_count,
    COALESCE(SUM(legacy_amount_inr), 0)::bigint AS paid_inr,
    MIN(legacy_purchased_at) AS first_purchase_at, MAX(legacy_purchased_at) AS last_purchase_at
  FROM public.legacy_enrolments
  WHERE offering_id IS NULL AND legacy_purchased_at >= p_from AND legacy_purchased_at < p_to
    AND public.is_admin()
  GROUP BY legacy_program_name
  ORDER BY paid_inr DESC;
$function$;

-- 9. Tighten grants: no anon/PUBLIC on the analytics RPCs (admins are
--    `authenticated` and keep their grant; the is_admin() body gate does the
--    real filtering).
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'revenue_in_range(timestamptz,timestamptz)',
    'revenue_by_user_in_range(timestamptz,timestamptz,integer)',
    'admin_dashboard_combined(timestamptz,timestamptz)',
    'revenue_daily(timestamptz,timestamptz)',
    'offering_performance_in_range(timestamptz,timestamptz)',
    'daily_signups_combined(timestamptz,timestamptz)',
    'revenue_by_offering_in_range(timestamptz,timestamptz)',
    'unmapped_legacy_revenue(timestamptz,timestamptz)'
  ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon;', fn);
  END LOOP;
END $$;

-- 10. Lock the team-API-key verifier to service_role ONLY. It loops every
--     active key doing crypt() per row — exposed to anon it is an
--     unauthenticated brute-force/timing oracle against the key hashes.
--     Only the admin-api edge function (service_role) legitimately calls it.
REVOKE ALL ON FUNCTION public.verify_team_api_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_team_api_key(text) TO service_role;
