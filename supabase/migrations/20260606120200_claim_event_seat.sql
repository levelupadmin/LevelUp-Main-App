-- Atomic event seat claim — prevents capacity oversell.
--
-- register-for-event (free path) and verify-event-payment (paid path) both did
-- a non-atomic "count registered seats, then INSERT". Two concurrent
-- registrations could each read count < max_capacity and both insert, pushing a
-- capped event over capacity.
--
-- This RPC serializes the count+insert per event by taking a row lock on the
-- events row (SELECT ... FOR UPDATE). Concurrent claims for the same event
-- queue behind the lock, so the capacity check always sees committed seats.
-- Returns a status string the edge functions map to their HTTP responses:
--   'registered' | 'already' | 'sold_out' | 'unavailable' | 'not_found'
CREATE OR REPLACE FUNCTION public.claim_event_seat(
  p_event_id uuid,
  p_user_id uuid,
  p_amount numeric DEFAULT 0,
  p_payment_id text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_existing public.event_registrations%ROWTYPE;
  v_has_existing boolean := false;
  v_count integer;
BEGIN
  -- Row lock: concurrent claims for the SAME event serialize here.
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_event.is_active IS FALSE OR v_event.status IN ('cancelled', 'completed') THEN
    RETURN 'unavailable';
  END IF;

  SELECT * INTO v_existing
  FROM public.event_registrations
  WHERE event_id = p_event_id AND user_id = p_user_id
  LIMIT 1;
  v_has_existing := FOUND;

  IF v_has_existing AND v_existing.status = 'registered' THEN
    RETURN 'already';
  END IF;

  -- Enforce capacity only when a cap is set. The count runs under the row lock,
  -- so it cannot race a concurrent insert for this event.
  IF v_event.max_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.event_registrations
    WHERE event_id = p_event_id AND status = 'registered';
    IF v_count >= v_event.max_capacity THEN
      RETURN 'sold_out';
    END IF;
  END IF;

  IF v_has_existing THEN
    -- Reactivate a previously cancelled registration.
    UPDATE public.event_registrations
    SET status = 'registered',
        amount_paid = p_amount,
        payment_id = COALESCE(p_payment_id, payment_id),
        registered_at = now()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.event_registrations
      (event_id, user_id, status, amount_paid, payment_id, registered_at)
    VALUES (p_event_id, p_user_id, 'registered', p_amount, p_payment_id, now());
  END IF;

  RETURN 'registered';
END $$;

-- Only edge functions (service_role) call this; never anon/authenticated direct.
REVOKE EXECUTE ON FUNCTION public.claim_event_seat(uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_event_seat(uuid, uuid, numeric, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_event_seat(uuid, uuid, numeric, text) TO service_role;
