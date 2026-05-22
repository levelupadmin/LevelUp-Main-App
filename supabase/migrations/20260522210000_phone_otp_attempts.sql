-- Phone OTP attempts table — backs SMS auth via MSG91 Flow API.
-- We generate the OTP ourselves, hash it, store the hash, then send the
-- plain OTP to the user's phone via MSG91. On verify, we compare hashes.
-- 10-minute TTL, max 5 attempts per OTP, single-use (consumed_at).

CREATE TABLE IF NOT EXISTS public.phone_otp_attempts (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text          NOT NULL,
  otp_hash    text          NOT NULL,
  attempts    int           NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at  timestamptz   NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_otp_attempts_phone_idx
  ON public.phone_otp_attempts (phone, expires_at DESC);

-- Lock down: only service role can read/write. Frontend never touches this.
ALTER TABLE public.phone_otp_attempts ENABLE ROW LEVEL SECURITY;

-- Hourly cleanup of stale rows (call from a cron later).
CREATE OR REPLACE FUNCTION public.cleanup_phone_otps()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.phone_otp_attempts
  WHERE expires_at < now() - interval '1 hour';
$$;
