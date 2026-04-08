-- =====================================================================
-- SECURITY FIX: Lock down coupon read access
-- =====================================================================
--
-- The coupons_read_active policy (if present) allowed any authenticated
-- user to SELECT every active coupon in the system, exposing all promo
-- codes, discount values, and caps to anyone with an account. Marketing
-- campaigns leak and the highest-discount codes get used by anyone.
--
-- This migration:
--   1. Drops coupons_read_active and coupons_public_read if they exist
--   2. Adds coupons_admin_read so admins can still manage coupons
--   3. All coupon validation must happen server-side via
--      create-razorpay-order / guest-create-order / (future) validate-coupon
--      edge functions, which use service_role and bypass RLS.
--
-- Frontend coupon UI should stop reading the coupons table directly.
-- CheckoutPage.tsx and PublicOffering.tsx should call a validate-coupon
-- edge function (to be built in a follow-up) that returns only the
-- discount amount and a valid/invalid flag, with no coupon metadata.
-- =====================================================================

DROP POLICY IF EXISTS coupons_read_active ON public.coupons;
DROP POLICY IF EXISTS coupons_public_read ON public.coupons;

-- Admins can still read everything for management purposes.
DROP POLICY IF EXISTS coupons_admin_read ON public.coupons;
CREATE POLICY coupons_admin_read ON public.coupons
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Admins can still write.
DROP POLICY IF EXISTS coupons_admin_write ON public.coupons;
CREATE POLICY coupons_admin_write ON public.coupons
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
