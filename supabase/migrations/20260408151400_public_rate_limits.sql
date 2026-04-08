-- Generic rate-limit bucket for unauthenticated edge-function endpoints.
--
-- Anything that MUST be callable by anonymous users (guest checkout flows,
-- coupon validation, user-exists checks) needs a per-key rate limit that
-- doesn't depend on auth.uid(). This table stores one row per (key,
-- window_start) and an RPC atomically increments the counter while
-- enforcing a cap.
--
-- The edge function supplies a stable key — typically
--   `${endpoint}:${client_ip}` or `${endpoint}:${client_ip}:${offering_id}`
-- — a max_count, and a window_seconds. The RPC returns true if the call is
-- allowed, false if it has exceeded the cap.

CREATE TABLE IF NOT EXISTS public.public_rate_limits (
  key          text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (SECURITY DEFINER RPC) may touch it.

CREATE INDEX IF NOT EXISTS public_rate_limits_window_idx
  ON public.public_rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_key             text,
  p_max_count       integer,
  p_window_seconds  integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  -- Floor current time to the start of the bucket window.
  v_window_start := to_timestamp(
    (floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds)
  );

  INSERT INTO public.public_rate_limits (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.public_rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_max_count;
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) TO service_role;

-- Housekeeping: a best-effort cleanup RPC you can call from pg_cron daily.
CREATE OR REPLACE FUNCTION public.purge_old_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.public_rate_limits
  WHERE window_start < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION public.purge_old_rate_limits() FROM public;
GRANT EXECUTE ON FUNCTION public.purge_old_rate_limits() TO service_role;
