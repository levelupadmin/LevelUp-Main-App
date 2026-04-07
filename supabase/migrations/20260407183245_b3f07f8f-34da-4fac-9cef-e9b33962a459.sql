CREATE POLICY coupons_public_read ON coupons
  FOR SELECT
  TO anon
  USING (is_active = true AND (valid_until IS NULL OR valid_until > now()));