-- ============================================================================
-- legacy_login_fix — make all 60k+ legacy (TagMango) customers able to log in
-- ============================================================================
--
-- ROOT CAUSE (confirmed via live catalog + 48h prod logs, 2026-06-04):
-- The DEPLOYED claim_legacy_enrolments_for_user() trigger inserts
--     INSERT INTO enrolments (..., source) SELECT ..., 'tagmango_migration'
-- but the LIVE enrolments_source_check constraint only allows
--     ('checkout','admin_grant','admin_manual','bulk_import','migration',
--      'manual','import','free')
-- — 'tagmango_migration' is NOT in that set. So the instant verify-msg91-otp
-- creates a first-time legacy user, the AFTER-INSERT claim trigger throws
--     [23514] new row ... violates check constraint "enrolments_source_check"
-- which aborts the transaction ([25P02]) and rolls back the auth.users /
-- public.users insert → createUser() returns 500. EVERY first-time legacy
-- login fails this way. Prod evidence: 23 of 23 legacy verify calls in 48h
-- returned 500, each paired 1:1 with a [23514] enrolments_source_check error;
-- the 27 successes are the handful of already-migrated accounts re-logging in.
--
-- This is a DRIFT bug. Migration 20260524180000 (legacy_enrolments_v2) in this
-- repo already inserts 'migration', but the function body actually LIVE in prod
-- still inserts 'tagmango_migration' — only pg_get_functiondef() against the
-- live DB exposed it; reading the repo migrations alone hid it. This
-- CREATE OR REPLACE re-asserts the constraint-VALID 'migration' source, which
-- is what stops the 500s and restores legacy login.
--
-- SECONDARY (NOT the current outage; shipped here as defence-in-depth):
--   • find_login_identity() removes verify-msg91-otp's reliance on GoTrue's
--     admin list `?phone=`/`?email=` filter, which GoTrue silently ignores
--     (it returns page 1 of ALL users). That misclassifies any returning user
--     past page 1 as brand-new — harmless at today's ~10 accounts, a guaranteed
--     failure once the table grows. Deterministic auth.users lookup by last-10
--     phone digits / email fixes it ahead of scale (and closes a createUser
--     account-takeover path on the email-collision branch).
--   • DISTINCT + ON CONFLICT hardening so a user owning two legacy rows that
--     resolve to ONE offering can't trip enrolments_unique_active (Bug 4).

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- find_login_identity — deterministic auth.users lookup for login
-- ────────────────────────────────────────────────────────────────────
-- Returns at most one row: the canonical auth user for a phone and/or email.
-- Matching:
--   • phone — compare the last 10 (subscriber) digits, so "+919788385577",
--     "919788385577" and "9788385577" all resolve to the same user regardless
--     of how GoTrue happened to store it. India-first audience → last-10 is a
--     safe key (a collision would need two different country codes sharing the
--     same 10-digit subscriber number, which this user base doesn't have).
--   • email — case-insensitive exact match, used on the createUser-collision
--     recovery path (user registered by email, now logging in by phone).
-- When both a phone and an email match different rows, or one user matches on
-- both, we prefer the row that actually HAS an email (it can mint a magiclink
-- session) and, failing that, the earliest-created row (the original account,
-- not a later ghost).
--
-- SECURITY: this reads auth.users emails by phone, so it is PII-sensitive.
-- EXECUTE is revoked from PUBLIC/anon/authenticated and granted ONLY to
-- service_role — i.e. only the verify-msg91-otp edge function (service key)
-- can call it. SECURITY DEFINER lets it read the auth schema.

CREATE OR REPLACE FUNCTION public.find_login_identity(
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS TABLE (id uuid, email text, phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH want AS (
    SELECT
      NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '')     AS digits,
      lower(NULLIF(btrim(COALESCE(p_email, '')), ''))                       AS em
  )
  SELECT u.id, u.email, u.phone
  FROM auth.users u, want w
  WHERE
    (
      w.digits IS NOT NULL
      AND length(regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g')) >= 10
      AND right(regexp_replace(u.phone, '\D', '', 'g'), 10) = right(w.digits, 10)
    )
    OR
    (
      w.em IS NOT NULL
      AND u.email IS NOT NULL
      AND lower(u.email) = w.em
    )
  ORDER BY (u.email IS NOT NULL) DESC, u.created_at ASC
  LIMIT 1;
$$;

-- Lock it down: only the service role (edge function) may call it.
REVOKE ALL ON FUNCTION public.find_login_identity(text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.find_login_identity(text, text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.find_login_identity(text, text) TO service_role;

COMMENT ON FUNCTION public.find_login_identity(text, text) IS
  'Deterministic auth.users lookup for the OTP login edge function. Matches by '
  'last-10 phone digits and/or email; returns the canonical (email-bearing, '
  'earliest) row. service_role-only — replaces the broken GoTrue ?phone= list '
  'filter that misclassified every returning legacy user as brand new.';

-- ────────────────────────────────────────────────────────────────────
-- FIX claim_legacy_enrolments_for_user — restore a constraint-VALID source
-- ────────────────────────────────────────────────────────────────────
-- PRIMARY FIX (the outage): the live body inserts source='tagmango_migration',
--   which enrolments_source_check rejects → every first-time legacy claim
--   aborts the transaction and rolls back the user insert (see header). This
--   CREATE OR REPLACE inserts source='migration' (an allowed value), so the
--   claim commits and the user logs in with their entitlement.
-- SECONDARY (Bug 4, duplicate-offering abort): if a single user owns TWO
--   unclaimed legacy_enrolments rows that resolve to the SAME offering_id
--   (duplicate CSV line, re-purchase, two TagMango programs mapped to one new
--   offering), a plain SELECT yields that offering_id twice → the second INSERT
--   trips enrolments_unique_active → the trigger aborts and the user ends up
--   with ZERO entitlements. Fix: SELECT DISTINCT offering_id + ON CONFLICT DO
--   NOTHING on the partial unique index, idempotent against both in-statement
--   dups and pre-existing rows.

CREATE OR REPLACE FUNCTION public.claim_legacy_enrolments_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_norm text;
BEGIN
  -- Normalise phone to +91XXXXXXXXXX for matching legacy_enrolments.phone.
  IF NEW.phone IS NOT NULL THEN
    v_phone_norm := regexp_replace(NEW.phone, '\D', '', 'g');
    IF length(v_phone_norm) = 10 THEN
      v_phone_norm := '+91' || v_phone_norm;
    ELSIF length(v_phone_norm) = 12 AND v_phone_norm LIKE '91%' THEN
      v_phone_norm := '+' || v_phone_norm;
    ELSE
      v_phone_norm := NEW.phone;
    END IF;
  END IF;

  -- Grant one active enrolment per DISTINCT resolved offering this user owns
  -- in legacy_enrolments. Pending rows (offering_id IS NULL) wait for the
  -- mapping → Trigger B (grant_enrolment_after_offering_resolved).
  INSERT INTO public.enrolments (user_id, offering_id, payment_order_id, status, source)
  SELECT NEW.id, x.offering_id, NULL, 'active', 'migration'
  FROM (
    SELECT DISTINCT le.offering_id
    FROM public.legacy_enrolments le
    WHERE le.claimed_by_user_id IS NULL
      AND le.offering_id IS NOT NULL
      AND (
        (v_phone_norm IS NOT NULL AND le.phone = v_phone_norm)
        OR (NEW.email IS NOT NULL AND le.email = NEW.email)
      )
  ) x
  ON CONFLICT (user_id, offering_id) WHERE status = 'active' DO NOTHING;

  -- Mark every matching resolved legacy row claimed (they're all represented
  -- by the single active enrolment now). Pending rows stay unclaimed.
  UPDATE public.legacy_enrolments le
  SET claimed_by_user_id = NEW.id,
      claimed_at = now()
  WHERE le.claimed_by_user_id IS NULL
    AND le.offering_id IS NOT NULL
    AND (
      (v_phone_norm IS NOT NULL AND le.phone = v_phone_norm)
      OR (NEW.email IS NOT NULL AND le.email = NEW.email)
    );

  RETURN NEW;
END;
$$;

COMMIT;

-- Ask PostgREST to reload its schema cache so the new RPC is callable
-- immediately after deploy.
NOTIFY pgrst, 'reload schema';
