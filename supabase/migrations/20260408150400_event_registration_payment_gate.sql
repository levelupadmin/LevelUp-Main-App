-- =====================================================================
-- CRITICAL SECURITY FIX: Block direct insert to event_registrations
-- for paid events (payment bypass)
-- =====================================================================
--
-- The existing er_insert_own policy allows any authenticated user to
-- INSERT an event_registrations row as long as auth.uid() = user_id.
-- It does NOT verify that the event is free or that payment was made.
-- A user can run `supabase.from('event_registrations').insert({
--   event_id: <paid_event>, amount_paid: 0 })` from the browser console
-- and register for a paid event for free.
--
-- This migration:
--   1. DROPs er_insert_own
--   2. CREATEs er_insert_free — direct insert only allowed for events
--      with pricing_type = 'free' and is_active = true
--   3. Paid events must go through register-for-event edge function which
--      runs with service_role and bypasses RLS
--   4. Adds a CHECK constraint: amount_paid >= 0
--
-- The register-for-event edge function is not modified here; it already
-- uses service role for paid flow.
-- =====================================================================

DROP POLICY IF EXISTS er_insert_own ON public.event_registrations;

CREATE POLICY er_insert_free ON public.event_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND e.pricing_type = 'free'
        AND e.is_active = true
    )
  );

-- Defense in depth: no negative or suspicious amounts
ALTER TABLE public.event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_amount_paid_nonneg;

ALTER TABLE public.event_registrations
  ADD CONSTRAINT event_registrations_amount_paid_nonneg
  CHECK (amount_paid IS NULL OR amount_paid >= 0);

COMMENT ON POLICY er_insert_free ON public.event_registrations IS
  'Only allows direct insert for FREE active events. Paid events must '
  'go through the register-for-event edge function which runs with '
  'service_role and verifies payment before inserting.';
