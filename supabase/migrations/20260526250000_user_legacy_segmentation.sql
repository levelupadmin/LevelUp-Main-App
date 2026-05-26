-- Legacy + segmentation metadata for users.
--
-- The TagMango exports + Customer Brain v3 + Razorpay extracts have rich
-- data we never pulled into Supabase: city, program vertical, MQL tier,
-- lifetime revenue, payment method, etc. This migration adds the columns
-- so AdminUsers can show the "TagMango replica" view Rahul wants — a
-- single page with both new and legacy users segmentable by every
-- meaningful dimension.

/* ───────────────── users: segmentation columns ───────────────── */

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_legacy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_source text,                       -- 'tagmango' | 'tagmango+razorpay' | 'tally' | 'manual'
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS program_vertical text,                    -- 'Forge' | 'Live' | 'Masterclass' | 'Workshop' | 'Multi'
  ADD COLUMN IF NOT EXISTS specific_vertical text,                   -- 'Forge Creators' | 'BFP' | etc.
  ADD COLUMN IF NOT EXISTS lifetime_revenue_inr integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_purchase_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_purchase_at timestamptz,
  ADD COLUMN IF NOT EXISTS purchase_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS users_is_legacy_idx ON public.users (is_legacy) WHERE is_legacy = true;
CREATE INDEX IF NOT EXISTS users_city_idx ON public.users (city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_program_vertical_idx ON public.users (program_vertical) WHERE program_vertical IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_ltv_idx ON public.users (lifetime_revenue_inr DESC) WHERE lifetime_revenue_inr > 0;

/* ───────── payment_orders: capture the missing Razorpay fields ───────── */

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS payment_method text,                      -- 'card' | 'upi' | 'netbanking' | 'wallet' | 'paylater'
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS card_network text,                        -- 'Visa' | 'MasterCard' | 'RuPay' | …
  ADD COLUMN IF NOT EXISTS bank text,
  ADD COLUMN IF NOT EXISTS wallet text,
  ADD COLUMN IF NOT EXISTS vpa text,                                 -- UPI handle
  ADD COLUMN IF NOT EXISTS fee_inr integer,                          -- Razorpay processing fee
  ADD COLUMN IF NOT EXISTS tax_inr integer,                          -- GST on the fee
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS notes jsonb DEFAULT '{}'::jsonb;          -- razorpay 'notes' object (description, custom keys)

CREATE INDEX IF NOT EXISTS payment_orders_method_idx ON public.payment_orders (payment_method)
  WHERE payment_method IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_orders_coupon_idx ON public.payment_orders (coupon_code)
  WHERE coupon_code IS NOT NULL;

/* ───────── crm_contacts: MQL/lifecycle fields ───────── */

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS mql_tier text,                            -- 'A' | 'B' | 'C' | 'D'
  ADD COLUMN IF NOT EXISTS mql_score integer,
  ADD COLUMN IF NOT EXISTS lifecycle_stage text,                     -- 'Lead' | 'Applied' | 'Converted - Fully Paid' | …
  ADD COLUMN IF NOT EXISTS first_touch_at timestamptz,
  ADD COLUMN IF NOT EXISTS days_to_conversion integer,
  ADD COLUMN IF NOT EXISTS tally_categories text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS data_sources text[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS crm_contacts_mql_tier_idx ON public.crm_contacts (mql_tier)
  WHERE mql_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_contacts_lifecycle_idx ON public.crm_contacts (lifecycle_stage)
  WHERE lifecycle_stage IS NOT NULL;

/* ───────── enrolments: edition label for cohort batches ───────── */

ALTER TABLE public.enrolments
  ADD COLUMN IF NOT EXISTS edition_label text;                       -- e.g. 'Edition 9 Jaipur'

/* ───────── helper view: users_segmented (everything in one row) ─────────
   Used by AdminUsers to show legacy + new users in a single table with
   all the segmentation columns. Cohort_members hydration is by
   subqueries below to keep this simple — no recursive joins. */

CREATE OR REPLACE VIEW public.users_segmented AS
SELECT
  u.id, u.email, u.phone, u.full_name, u.role, u.member_number,
  u.created_at, u.is_legacy, u.legacy_source,
  u.city, u.state, u.country,
  u.program_vertical, u.specific_vertical,
  u.lifetime_revenue_inr, u.first_purchase_at, u.last_purchase_at, u.purchase_count,
  -- live enrolment count (post-migration, only counts active rows)
  (SELECT count(*) FROM public.enrolments e WHERE e.user_id = u.id AND e.status = 'active') AS active_enrolment_count,
  -- legacy enrolments count (pre-migration TagMango imports).
  -- legacy_enrolments has no `status` column; claimed_by_user_id IS NOT NULL
  -- means "already granted" but for the segmented count we want both.
  (SELECT count(*) FROM public.legacy_enrolments le
     WHERE (le.phone = u.phone OR lower(le.email) = lower(u.email))) AS legacy_enrolment_count,
  -- live captured revenue from payment_orders
  COALESCE((SELECT sum(total_inr) FROM public.payment_orders
              WHERE user_id = u.id AND status = 'captured'), 0) AS live_paid_inr,
  -- prefs / opt-in
  ump.email_opt_in, ump.whatsapp_opt_in, ump.sms_opt_in
FROM public.users u
LEFT JOIN public.user_marketing_prefs ump ON ump.user_id = u.id;

GRANT SELECT ON public.users_segmented TO authenticated;

-- RLS is enforced by the underlying users table policies; the view inherits.
ALTER VIEW public.users_segmented SET (security_invoker = true);

/* ───────── RPC: revenue_in_range — fast date-bounded revenue rollup ─────
   Used by AdminRevenue for the date-preset + custom range UI. Returns
   sum + count for a window; tiny, indexed, no view-of-view explosion. */

CREATE OR REPLACE FUNCTION public.revenue_in_range(
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  total_paid_inr bigint,
  total_fees_inr bigint,
  net_paid_inr bigint,
  order_count integer,
  unique_buyer_count integer,
  refunded_inr bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(sum(total_inr) FILTER (WHERE status = 'captured'), 0)::bigint                  AS total_paid_inr,
    COALESCE(sum(fee_inr) FILTER (WHERE status = 'captured'), 0)::bigint                     AS total_fees_inr,
    COALESCE(sum(total_inr - COALESCE(fee_inr,0)) FILTER (WHERE status = 'captured'), 0)::bigint
                                                                                          AS net_paid_inr,
    count(*) FILTER (WHERE status = 'captured')::integer                                      AS order_count,
    count(DISTINCT user_id) FILTER (WHERE status = 'captured')::integer                       AS unique_buyer_count,
    COALESCE(sum(total_inr) FILTER (WHERE status = 'refunded'), 0)::bigint               AS refunded_inr
  FROM public.payment_orders
  WHERE created_at >= p_from AND created_at < p_to;
$$;

GRANT EXECUTE ON FUNCTION public.revenue_in_range(timestamptz, timestamptz) TO authenticated;

/* ───────── RPC: revenue_daily — daily ticker for charts ───────── */

CREATE OR REPLACE FUNCTION public.revenue_daily(
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  day date,
  paid_inr bigint,
  order_count integer,
  unique_buyer_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')::date         AS day,
    COALESCE(sum(total_inr) FILTER (WHERE status = 'captured'), 0)::bigint     AS paid_inr,
    count(*) FILTER (WHERE status = 'captured')::integer                        AS order_count,
    count(DISTINCT user_id) FILTER (WHERE status = 'captured')::integer         AS unique_buyer_count
  FROM public.payment_orders
  WHERE created_at >= p_from AND created_at < p_to
  GROUP BY 1
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.revenue_daily(timestamptz, timestamptz) TO authenticated;

/* ───────── RPC: revenue_by_user_in_range — top buyers in window ───────── */

CREATE OR REPLACE FUNCTION public.revenue_by_user_in_range(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer DEFAULT 100
) RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  phone text,
  paid_inr bigint,
  order_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    u.id, u.email, u.full_name, u.phone,
    COALESCE(sum(po.total_inr), 0)::bigint AS paid_inr,
    count(po.id)::integer                    AS order_count
  FROM public.payment_orders po
  JOIN public.users u ON u.id = po.user_id
  WHERE po.created_at >= p_from
    AND po.created_at < p_to
    AND po.status = 'captured'
  GROUP BY u.id, u.email, u.full_name, u.phone
  ORDER BY paid_inr DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.revenue_by_user_in_range(timestamptz, timestamptz, integer) TO authenticated;

/* ───────── Trigger: keep users.lifetime_revenue_inr fresh ───────── */

CREATE OR REPLACE FUNCTION public._update_user_ltv_from_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
BEGIN
  IF NEW.status = 'captured' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)) THEN
    v_user := NEW.user_id;
    UPDATE public.users SET
      lifetime_revenue_inr = COALESCE(lifetime_revenue_inr, 0) + NEW.total_inr,
      first_purchase_at = COALESCE(first_purchase_at, NEW.captured_at, NEW.created_at),
      last_purchase_at  = GREATEST(COALESCE(last_purchase_at, '1970-01-01'::timestamptz),
                                    COALESCE(NEW.captured_at, NEW.created_at)),
      purchase_count    = COALESCE(purchase_count, 0) + 1
    WHERE id = v_user;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payment_orders_update_ltv ON public.payment_orders;
CREATE TRIGGER payment_orders_update_ltv AFTER INSERT OR UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public._update_user_ltv_from_payment();
