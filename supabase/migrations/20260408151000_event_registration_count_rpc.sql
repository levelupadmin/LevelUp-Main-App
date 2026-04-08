-- =====================================================================
-- FIX: Wrong event registration counts on event detail page
-- =====================================================================
--
-- The event_registrations table is RLS-locked to "you can only see your
-- own row," so when EventDetail.tsx does
--   .from('event_registrations').select('id', { count: 'exact' })
--      .eq('event_id', eventId).eq('status', 'registered')
-- it returns 0 or 1 depending on whether the current user is registered,
-- not the true total. The "spots left" UI is meaningless and capacity
-- limits cannot be enforced from the client.
--
-- This migration adds a SECURITY DEFINER function that returns the
-- actual aggregate count of active registrations for an event without
-- exposing any individual rows. Front-end can call:
--   supabase.rpc('get_event_registration_count', { p_event_id: <id> })
-- and trust the number.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_event_registration_count(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::int INTO v_count
  FROM public.event_registrations
  WHERE event_id = p_event_id
    AND status IN ('registered', 'attended');
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_registration_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_registration_count(uuid) TO authenticated, anon;

COMMENT ON FUNCTION public.get_event_registration_count(uuid) IS
  'Returns the total number of registered or attended event_registrations '
  'for an event. Bypasses RLS via SECURITY DEFINER so the count is '
  'accurate regardless of who is asking. Exposes no row-level data.';
