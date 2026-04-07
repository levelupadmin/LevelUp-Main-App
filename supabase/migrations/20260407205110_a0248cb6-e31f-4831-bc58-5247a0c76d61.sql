
-- 1. Atomic coupon increment function
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id uuid)
RETURNS void AS $$
  UPDATE coupons SET used_count = used_count + 1 WHERE id = p_coupon_id;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

-- 2. Drop stale users_read_public if it exists
DROP POLICY IF EXISTS users_read_public ON users;
