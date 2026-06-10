-- Fix: phone-first signups are permanently stuck on onboarding.
--
-- Onboarding.tsx saved the real name + email with a plain
--   supabase.from('users').update({ full_name, email })
-- through the anon client. The identity-freeze policy
-- (20260531000000_freeze_user_identity_columns.sql) rightly forbids
-- self-service email changes, so the WHOLE update fails (name included)
-- and every phone-first user loops on "Couldn't save your details."
--
-- The freeze exists because a self-served email/phone write fires
-- users_claim_legacy_enrolments, which grants unclaimed TagMango
-- entitlements keyed on that email WITHOUT ownership proof (full
-- paywall bypass). So the fix must let onboarding set the real email
-- while keeping that attack dead:
--
--   1. set_onboarding_profile(p_full_name, p_email): SECURITY DEFINER
--      RPC (bypasses the RLS freeze) that:
--        - only acts on auth.uid(), live (deleted_at IS NULL) rows;
--        - allows the email write ONLY while the row still carries the
--          synthetic "<digits>@phone.leveluplearning.in" placeholder the
--          phone signup minted (or when the email is unchanged) - a user
--          with a real email can never relabel themselves through this;
--        - suppresses the legacy-claim trigger for this statement via a
--          transaction-local GUC, because the onboarding email is
--          UNVERIFIED. Phone-keyed claims already happened at signup
--          (verified by MSG91 OTP); email-keyed claims must wait for a
--          flow that actually verifies email ownership.
--        - raises 'email_taken' on the UNIQUE(email) collision so the
--          client can show a useful message instead of a generic retry.
--
--   2. claim_legacy_enrolments_for_user gains the suppress-GUC guard.

-- ── 1. Trigger guard ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_legacy_enrolments_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_norm text;
BEGIN
  -- Caller opted out for this transaction (onboarding writes an
  -- UNVERIFIED email; it must not claim entitlements).
  IF current_setting('app.suppress_legacy_claim', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Normalise the incoming phone to +91XXXXXXXXXX so it matches the
  -- format we store in legacy_enrolments. The CSV ingest also
  -- normalises - both sides agree on this canonical form.
  IF NEW.phone IS NOT NULL THEN
    v_phone_norm := regexp_replace(NEW.phone, '\D', '', 'g');
    IF length(v_phone_norm) = 10 THEN
      v_phone_norm := '+91' || v_phone_norm;
    ELSIF length(v_phone_norm) = 12 AND v_phone_norm LIKE '91%' THEN
      v_phone_norm := '+' || v_phone_norm;
    ELSE
      v_phone_norm := NEW.phone;  -- leave as-is for non-Indian numbers
    END IF;
  END IF;

  INSERT INTO public.enrolments (user_id, offering_id, payment_order_id, status, source)
  SELECT NEW.id, le.offering_id, NULL, 'active', 'tagmango_migration'
  FROM public.legacy_enrolments le
  WHERE le.claimed_by_user_id IS NULL
    AND (
      (v_phone_norm IS NOT NULL AND le.phone = v_phone_norm)
      OR (NEW.email IS NOT NULL AND le.email = NEW.email)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.enrolments e
      WHERE e.user_id = NEW.id AND e.offering_id = le.offering_id
    )
  ON CONFLICT DO NOTHING;

  UPDATE public.legacy_enrolments le
  SET claimed_by_user_id = NEW.id,
      claimed_at = now()
  WHERE le.claimed_by_user_id IS NULL
    AND (
      (v_phone_norm IS NOT NULL AND le.phone = v_phone_norm)
      OR (NEW.email IS NOT NULL AND le.email = NEW.email)
    );

  RETURN NEW;
END;
$$;

-- ── 2. Onboarding identity RPC ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_onboarding_profile(
  p_full_name text,
  p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current_email text;
  v_name text := btrim(p_full_name);
  v_email text := lower(btrim(p_email));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  SELECT email INTO v_current_email
  FROM public.users
  WHERE id = v_uid AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_profile';
  END IF;

  -- Email may only be (re)set while the row still carries the synthetic
  -- phone-signup placeholder, or when it isn't changing. Real emails
  -- stay frozen on the self-service path (see header comment).
  IF v_current_email IS NOT NULL
     AND v_current_email <> v_email
     AND v_current_email NOT LIKE '%@phone.leveluplearning.in' THEN
    RAISE EXCEPTION 'email_locked';
  END IF;

  -- This email is unverified: do not let the write claim legacy
  -- entitlements (transaction-local, resets on commit/rollback).
  PERFORM set_config('app.suppress_legacy_claim', 'on', true);

  BEGIN
    UPDATE public.users
    SET full_name = v_name,
        email = v_email
    WHERE id = v_uid;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'email_taken';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.set_onboarding_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_onboarding_profile(text, text) TO authenticated;
