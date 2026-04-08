-- =====================================================================
-- SECURITY FIX: Remove anonymous read access to captured guest orders
-- =====================================================================
--
-- Migration 20260408054042 added payment_orders_guest_read which allowed
-- any anonymous user to SELECT captured payment orders with a guest_email.
-- Since payment_order_ids appear in URLs and logs, this exposed guest
-- customer PII (email, phone, name, order total, offering_id) to anyone
-- who ever saw or harvested a payment order ID.
--
-- This policy is removed. The ThankYou page should load guest orders via
-- an authenticated edge function that requires a signed one-time token
-- stored on the payment_orders row (thank_you_token_hash). Building that
-- token flow is a separate frontend task; for now, this migration only
-- removes the permissive policy to stop the bleeding.
-- =====================================================================

DROP POLICY IF EXISTS payment_orders_guest_read ON public.payment_orders;
