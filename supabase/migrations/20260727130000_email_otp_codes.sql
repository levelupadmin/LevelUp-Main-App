-- ============================================================================
-- email_otp_codes — server-side storage for the EMAIL sign-in OTP
-- ============================================================================
--
-- Backs `verify-email-otp` (design/briefs/cohort-sp.md S-3), the additive
-- second login channel alongside the untouched MSG91 phone path.
--
-- WHY THERE IS NOTHING TO MIRROR. The phone path keeps NO local OTP state:
-- `phone_otp_attempts` was deliberately dropped in
-- 20260524110000_drop_dead_tables.sql when we moved to the MSG91 widget, which
-- owns the code, the expiry and the attempt ceiling inside MSG91's own
-- infrastructure. `verify-msg91-otp` therefore has no storage and no rate-limit
-- call at all. The email channel has no such third party, so this migration is
-- where those guarantees are defined rather than inherited:
--
--   • the code is HASHED at rest (HMAC-SHA256 via supabase/functions/_shared/
--     crypto.ts `hmacSha256Hex`, keyed on the EMAIL_OTP_PEPPER edge-function
--     secret — set it with `npx supabase secrets set EMAIL_OTP_PEPPER=<32+
--     random bytes>`; the function fails closed with 503 while it is unset,
--     and never falls back to the service-role key). A 6-digit space is
--     exhaustively rainbow-tableable, so a bare digest would be barely better
--     than plaintext, and plaintext in a backup is a live session for every
--     account with a code in flight. The hash is DOMAIN-SEPARATED by the
--     normalised email as well, so two accounts holding the same six digits do
--     not store the same `code_hash` — otherwise a leaked backup could be
--     matched against a code requested for an attacker's own address, with no
--     attack on the pepper needed at all.
--   • single-use is enforced by `consumed_at`, set in a conditional UPDATE
--     (`WHERE consumed_at IS NULL`) so two racing verifies cannot both win.
--   • `attempt_count` is FORENSICS, NOT A CEILING. It records wrong guesses
--     against one issued code (atomically, through bump_email_otp_attempt()
--     below, so concurrent guesses cannot pin it) and rejects nobody. It cannot
--     be a ceiling: the verify path has to compare the hash before anything
--     else, or the verdict itself tells an attacker whether a code is in
--     flight, which means a count checked after the compare would only ever
--     reject the caller holding the CORRECT code. Five anonymous guesses would
--     then kill the real owner's code. The binding ceiling is the per-address
--     failed-guess budget the function spends in public_rate_limits (OTP_FAIL_*
--     in supabase/functions/_shared/otp.ts), which no resend can reset and
--     which a correct submission never spends.
--   • RATE LIMITING IS NOT HERE. It reuses the existing
--     public.check_and_increment_rate_limit() RPC from
--     20260408151400_public_rate_limits.sql. Request-shaped caps are keyed on
--     the client IP; the address-keyed caps are charged per code DELIVERED and
--     per FAILED guess, so knowing someone's address is not on its own enough
--     to spend their budget. No second rate limiter is introduced.
--
-- GRANT DISCIPLINE. These rows are login secrets. RLS is on with NO policies
-- and every privilege is revoked from PUBLIC/anon/authenticated, so the table
-- is reachable ONLY by the service role that the edge function runs as. Same
-- posture as public_rate_limits (20260408151400:55-56) and find_login_identity
-- (20260603120000).

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_otp_codes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Always the normalised (trimmed + lowercased) address, matching
  -- `normalizeEmail` in supabase/functions/_shared/otp.ts, so a user who types
  -- a differently-cased address on verify still resolves to their code.
  email         text        NOT NULL,
  -- HMAC-SHA256 hex of (email, code) under the pepper. The plaintext is never
  -- stored anywhere, and the address is inside the hashed message so this
  -- value is only ever comparable with a code issued for the SAME address.
  code_hash     text        NOT NULL,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  -- Wrong guesses seen against this one code. Observability only; nothing
  -- rejects on it (see the header).
  attempt_count integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- The verify path reads exactly one row: the newest still-unconsumed code for
-- an address. The send path marks that address's live codes consumed before
-- issuing a new one, so "newest" is also "the only live one".
CREATE INDEX IF NOT EXISTS email_otp_codes_email_created_idx
  ON public.email_otp_codes (email, created_at DESC);

-- Supports the purge helper below.
CREATE INDEX IF NOT EXISTS email_otp_codes_expires_idx
  ON public.email_otp_codes (expires_at);

ALTER TABLE public.email_otp_codes ENABLE ROW LEVEL SECURITY;
-- No policies, on purpose: nothing but the service role may see login secrets.

REVOKE ALL ON TABLE public.email_otp_codes FROM PUBLIC;
REVOKE ALL ON TABLE public.email_otp_codes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_otp_codes TO service_role;

COMMENT ON TABLE public.email_otp_codes IS
  'Hashed, single-use, expiring email sign-in codes for the verify-email-otp '
  'edge function. service_role-only: RLS on with no policies and all grants '
  'revoked from anon/authenticated. The phone path has no equivalent table '
  'because MSG91 owns that state (see 20260524110000_drop_dead_tables.sql).';

-- ────────────────────────────────────────────────────────────────────
-- Atomic attempt increment
-- ────────────────────────────────────────────────────────────────────
-- The edge function must NOT read attempt_count and write back count + 1: N
-- concurrent wrong guesses would all read the same stale value and all write
-- the same number, undercounting the run. One UPDATE ... SET attempt_count =
-- attempt_count + 1 does the arithmetic inside the row lock, so every guess is
-- counted exactly once. Returns the new value (NULL if the row is gone), which
-- the function logs once it crosses OTP_ATTEMPT_ALERT_THRESHOLD. Nothing is
-- rejected on the result.
CREATE OR REPLACE FUNCTION public.bump_email_otp_attempt(p_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.email_otp_codes
     SET attempt_count = attempt_count + 1
   WHERE id = p_id
  RETURNING attempt_count;
$$;

REVOKE ALL ON FUNCTION public.bump_email_otp_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_email_otp_attempt(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_email_otp_attempt(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────
-- Housekeeping — same shape as purge_old_rate_limits()
-- ────────────────────────────────────────────────────────────────────
-- Best-effort cleanup, safe to schedule from pg_cron daily. Consumed and
-- expired rows carry no further meaning; we keep a day of slack so a support
-- question about "I did request a code" is still answerable.
CREATE OR REPLACE FUNCTION public.purge_expired_email_otp_codes()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.email_otp_codes
  WHERE expires_at < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION public.purge_expired_email_otp_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_email_otp_codes() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_email_otp_codes() TO service_role;

-- ────────────────────────────────────────────────────────────────────
-- The delivery template
-- ────────────────────────────────────────────────────────────────────
-- `queue-transactional-email` 404s with "No active template found" unless an
-- ACTIVE row exists for the template_key (queue-transactional-email/
-- index.ts:62-70), so the send path is inert without this seed. Idempotent and
-- DO NOTHING rather than DO UPDATE: once this is live, an admin edit in the
-- templates UI is the source of truth and a re-run must not clobber it.
-- `student_name` and `app_url` are auto-populated by the queue function.
INSERT INTO public.email_templates (template_key, name, subject, html_body, text_body, variables, is_active)
VALUES (
  'login_email_otp',
  'Login: Email Sign-in Code',
  'Your LevelUp sign-in code is {{otp_code}}',
  $$<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <p>Hi {{student_name}},</p>
  <p>Use this code to sign in to LevelUp:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0;color:#1a1a2e;">{{otp_code}}</p>
  <p>It works once and expires in {{expiry_minutes}} minutes.</p>
  <p style="color:#666;font-size:13px;margin-top:32px;">If you did not ask to sign in, you can ignore this email. Nobody can get into your account with this message alone.</p>
  <p style="color:#666;font-size:13px;">The LevelUp Learning Team</p>
</div>$$,
  $$Hi {{student_name}}, your LevelUp sign-in code is {{otp_code}}. It works once and expires in {{expiry_minutes}} minutes. If you did not ask to sign in, you can ignore this email.$$,
  '[{"key":"otp_code","label":"Sign-in Code"},{"key":"expiry_minutes","label":"Minutes Until Expiry"},{"key":"student_name","label":"Student Name"}]',
  true
)
ON CONFLICT (template_key) DO NOTHING;

COMMIT;

-- ────────────────────────────────────────────────────────────────────
-- …and actually SCHEDULE the purge
-- ────────────────────────────────────────────────────────────────────
-- A defined-but-unscheduled purge is not housekeeping. This table takes a row
-- per issued code on an endpoint anyone on the internet can call, so without a
-- schedule it only ever grows. Nightly at 20:45 UTC (02:15 IST), off the hour
-- so it does not pile onto the other nightly jobs. Same pg_cron pattern as
-- 20260722140100_tally_poll_cron.sql, and re-runnable.
--
-- To disable:  SELECT cron.unschedule('purge_expired_email_otp_codes_nightly');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;

DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'purge_expired_email_otp_codes_nightly';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'purge_expired_email_otp_codes_nightly',
  '45 20 * * *',
  $cmd$ SELECT public.purge_expired_email_otp_codes(); $cmd$
);

-- Ask PostgREST to reload its schema cache so the new table + RPCs are
-- reachable immediately after deploy.
NOTIFY pgrst, 'reload schema';
