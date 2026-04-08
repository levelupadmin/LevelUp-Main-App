-- =====================================================================
-- Add 'needs_review' status to payment_orders
-- =====================================================================
--
-- The webhook and verify-razorpay-payment now mark a payment_order as
-- needs_review when the captured amount does not match the expected
-- total or guest user creation fails. This is distinct from 'failed'
-- because the customer's money WAS taken — support has to look at it
-- and either issue access manually or refund. Operations dashboards
-- can filter on this status.
-- =====================================================================

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_status_check;

ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_status_check
  CHECK (status IN (
    'created',
    'authorized',
    'captured',
    'failed',
    'refunded',
    'needs_review'
  ));
