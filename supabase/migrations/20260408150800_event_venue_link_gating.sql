-- =====================================================================
-- SECURITY FIX: Hide event venue_link from non-registered users
-- =====================================================================
--
-- The events table holds the Zoom / venue join URL in venue_link, and
-- the existing RLS policy allows any authenticated user to SELECT *.
-- That means a non-paying student can read the join link for every
-- paid live session, walk in, and Zoom-bomb the cohort.
--
-- RLS in PostgreSQL only filters rows, not columns, so we have to
-- defend the column with a column-level GRANT/REVOKE plus a helper
-- view that omits venue_link for the regular read path.
--
-- After this migration, application code MUST:
--   - Read events from the `events_safe` view (no venue_link)
--   - Call public.get_event_venue_link(event_id) to display the link,
--     which only returns it when the caller is admin or has an active
--     registered row in event_registrations
--   - Continue to use the events table directly only for INSERT /
--     UPDATE / DELETE (admin write paths). Direct SELECT * on events
--     will fail at PostgREST because venue_link is no longer readable.
-- =====================================================================

-- 1. The gated accessor for venue_link.
CREATE OR REPLACE FUNCTION public.get_event_venue_link(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  IF is_admin() THEN
    SELECT venue_link INTO v_link FROM public.events WHERE id = p_event_id;
    RETURN v_link;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.event_registrations
    WHERE event_id = p_event_id
      AND user_id = auth.uid()
      AND status IN ('registered', 'attended')
  ) THEN
    SELECT venue_link INTO v_link FROM public.events WHERE id = p_event_id;
    RETURN v_link;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_venue_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_venue_link(uuid) TO authenticated, anon;

COMMENT ON FUNCTION public.get_event_venue_link(uuid) IS
  'Returns the venue_link for an event only if the caller is admin or '
  'has a registered/attended row in event_registrations. Returns NULL '
  'otherwise. The events table column is REVOKE-d for direct read.';

-- 2. View exposing all event columns EXCEPT venue_link.
-- security_invoker = true so RLS on the underlying table still applies.
DROP VIEW IF EXISTS public.events_safe;
CREATE VIEW public.events_safe
  WITH (security_invoker = true)
AS
SELECT
  id, title, description, event_type, image_url,
  starts_at, ends_at, duration_minutes,
  venue_type, venue_label, city,
  host_name, host_title, host_avatar_url,
  pricing_type, price_inr, max_capacity,
  is_featured, is_active, sort_order, status,
  created_at, updated_at
FROM public.events;

GRANT SELECT ON public.events_safe TO authenticated, anon;

COMMENT ON VIEW public.events_safe IS
  'Public-safe projection of public.events that omits venue_link. '
  'Frontend code should read from this view; the venue_link must be '
  'fetched via public.get_event_venue_link().';

-- 3. Revoke direct column-level read on venue_link from the regular
-- API roles. Service_role (used by edge functions) is unaffected.
REVOKE SELECT (venue_link) ON public.events FROM anon, authenticated;
