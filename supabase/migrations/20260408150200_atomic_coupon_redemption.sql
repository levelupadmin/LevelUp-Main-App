-- =====================================================================
-- SECURITY / DATA INTEGRITY FIX: Atomic coupon redemption
-- =====================================================================
--
-- The previous increment_coupon_usage(p_coupon_id) function simply did
-- UPDATE coupons SET used_count = used_count + 1 with no cap check. The
-- cap check was done in JavaScript before calling this function, which
-- is a classic read-then-write race: two concurrent checkouts can both
-- read used_count = 99 (cap = 100), both pass the JS check, and both
-- increment to 100 — over-redeeming the coupon.
--
-- This migration replaces it with a new function redeem_coupon(p_coupon_id)
-- that performs the increment atomically using a WHERE clause that
-- enforces the cap, valid dates, and active flag in a single UPDATE.
-- If the UPDATE affects 0 rows, the coupon was either exhausted, expired,
-- or deactivated at race time, and the function returns false.
--
-- The edge functions create-razorpay-order and guest-create-order are
-- updated in separate commits to call redeem_coupon() and handle the
-- false return by aborting the order.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.redeem_coupon(p_coupon_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.coupons
  SET used_count = used_count + 1
  WHERE id = p_coupon_id
    AND is_active = true
    AND (max_redemptions IS NULL OR used_count < max_redemptions)
    AND (valid_from IS NULL OR now() >= valid_from)
    AND (valid_until IS NULL OR now() <= valid_until);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Lock down execution. Only edge functions (service_role) should call this.
REVOKE EXECUTE ON FUNCTION public.redeem_coupon(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_coupon(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.redeem_coupon(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(uuid) TO service_role;

COMMENT ON FUNCTION public.redeem_coupon(uuid) IS
  'Atomically redeems a coupon by incrementing used_count only if the coupon '
  'is active, within its date range, and below max_redemptions. Returns true '
  'on success, false if the cap was hit or the coupon became invalid. '
  'Must be called AFTER successful Razorpay order creation, not before, '
  'so failed payment attempts do not consume redemptions.';

-- Leave the legacy increment_coupon_usage() in place for backwards
-- compatibility during rollout; edge functions will switch to redeem_coupon().
-- Once both edge functions are updated and deployed, the legacy function
-- can be dropped in a follow-up migration.
