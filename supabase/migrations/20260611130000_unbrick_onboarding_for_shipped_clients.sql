-- Incident fix: Android users "locked out" at onboarding.
--
-- Builds 607/608 route every phone-OTP login with empty craft_interests
-- to /onboarding, where the client saves the profile with a plain
--   supabase.from('users').update({ full_name, email })
-- The identity-freeze policy rejects the email change, so phone-first
-- users (synthetic <digits>@phone.leveluplearning.in emails) fail the
-- save forever and are effectively locked out of the app. The proper
-- client fix (set_onboarding_profile RPC, 20260611100000) only ships in
-- build 609, which most devices don't have yet. This migration unbricks
-- the ALREADY-SHIPPED clients server-side:
--
--   1. users_update_own gains one narrow exception: the row owner may
--      change email ONLY while their current email is still the
--      synthetic phone-signup placeholder. Real emails stay frozen, and
--      phone/role/deleted_at stay frozen exactly as before.
--
--   2. That exception alone would resurrect the entitlement hijack the
--      freeze was built against (an unverified self-served email firing
--      users_claim_legacy_enrolments and claiming someone else's
--      TagMango entitlements). So the claim trigger is hardened at the
--      source: EMAIL-based claims now run only on INSERT, where the
--      email comes from a verified auth flow (magic-link signup mirrors
--      a confirmed address; phone signups mirror a synthetic address
--      that can never match a legacy row). On UPDATE only the
--      OTP-verified PHONE match can claim. This closes the email-UPDATE
--      hijack vector for every path, not just onboarding.
--
-- The transaction-local suppress GUC from 20260611100000 is kept so the
-- RPC path stays explicit about never claiming.

-- ── 1. Policy: allow exactly the placeholder -> real email transition ──
DROP POLICY IF EXISTS "users_update_own" ON public.users;

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id AND deleted_at IS NULL)
  WITH CHECK (
    auth.uid() = id
    AND deleted_at IS NULL
    AND role  = (SELECT role  FROM public.users WHERE id = auth.uid())
    AND phone IS NOT DISTINCT FROM (SELECT phone FROM public.users WHERE id = auth.uid())
    AND (
      email IS NOT DISTINCT FROM (SELECT email FROM public.users WHERE id = auth.uid())
      OR (SELECT email FROM public.users WHERE id = auth.uid())
         LIKE '%@phone.leveluplearning.in'
    )
  );

-- ── 2. Trigger: email-based legacy claims only on verified INSERTs ──
CREATE OR REPLACE FUNCTION public.claim_legacy_enrolments_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_norm text;
  v_email_claims_ok boolean := (TG_OP = 'INSERT');
BEGIN
  -- Caller opted out for this transaction (e.g. the onboarding RPC
  -- writes an UNVERIFIED email; it must not claim entitlements).
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
      OR (v_email_claims_ok AND NEW.email IS NOT NULL AND le.email = NEW.email)
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
      OR (v_email_claims_ok AND NEW.email IS NOT NULL AND le.email = NEW.email)
    );

  RETURN NEW;
END;
$$;
