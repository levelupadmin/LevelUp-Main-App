-- ============================================================================
-- legacy_enrolments — pre-seeded entitlements for users migrating from the
-- TagMango-built LevelUp app. Records "this phone owns this offering",
-- claimed automatically the first time that user signs in.
-- ============================================================================
--
-- Why a separate table instead of pre-creating auth.users:
-- - 2k+ TagMango users; only some fraction will actually return. Creating
--   auth rows for the rest would mean orphan accounts forever.
-- - User might re-sign-up with a different identifier (e.g. email changed).
--   The phone-keyed pre-seed survives that.
-- - Trigger-based claim is atomic; no race with the user actually signing
--   in mid-migration.
--
-- How it flows:
-- 1. We ingest TagMango's CSV export into this table (one row per
--    purchase: phone + offering_id + the legacy txn metadata).
-- 2. When a user signs in with MSG91 OTP, verify-msg91-otp upserts the
--    public.users row with phone + email confirmed.
-- 3. The claim_legacy_enrolments trigger fires AFTER INSERT OR UPDATE OF
--    phone, email on public.users. It finds matching unclaimed legacy
--    rows and inserts real enrolments rows, marking the legacy rows
--    claimed.
-- 4. The user lands on Home and sees their owned content unlocked
--    immediately, no support ticket needed.

CREATE TABLE IF NOT EXISTS public.legacy_enrolments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Phone normalised to +91XXXXXXXXXX. We index on this for fast trigger
  -- lookup; the CSV ingest script handles the normalisation.
  phone               text        NOT NULL,
  -- Email is a secondary match key. TagMango exports often have email
  -- but phone is the more reliable identifier (Indian users routinely
  -- use multiple emails, but the OTP phone is sticky).
  email               text,
  offering_id         uuid        NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  -- Provenance: where the entitlement came from. Defaulting to
  -- "tagmango" since that's the only source today; future migrations
  -- (e.g. from a different platform) can use a different value.
  source              text        NOT NULL DEFAULT 'tagmango',
  -- Audit fields. Useful for finance reconciliation and customer
  -- support ("hey, I bought this on Jan 10 2024 for ₹2999 - I have
  -- the receipt"). Not used by the auto-claim logic itself.
  legacy_order_id     text,
  legacy_amount_inr   numeric(10, 2),
  legacy_purchased_at timestamptz,
  -- Claim tracking. NULL until the matching user signs in for the
  -- first time and the trigger grants their enrolment.
  claimed_by_user_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- A given phone shouldn't get the same offering granted twice. The
  -- unique constraint also acts as the natural idempotency key for the
  -- CSV ingest (re-running the ingest is safe).
  CONSTRAINT legacy_enrolments_phone_offering_uniq UNIQUE (phone, offering_id)
);

-- Lookup indexes for the trigger's claim path. Phone is the primary
-- key; email is the fallback when the user's phone in our system
-- doesn't exactly match what TagMango had on file.
CREATE INDEX IF NOT EXISTS legacy_enrolments_phone_unclaimed_idx
  ON public.legacy_enrolments (phone) WHERE claimed_by_user_id IS NULL;

CREATE INDEX IF NOT EXISTS legacy_enrolments_email_unclaimed_idx
  ON public.legacy_enrolments (email) WHERE claimed_by_user_id IS NULL AND email IS NOT NULL;

-- RLS: anon should never see this table; only service role (edge
-- functions, the trigger running as SECURITY DEFINER) and admins.
-- Regular users don't read it directly - the trigger does the work on
-- their behalf.
ALTER TABLE public.legacy_enrolments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read legacy enrolments"   ON public.legacy_enrolments;
DROP POLICY IF EXISTS "admins write legacy enrolments"  ON public.legacy_enrolments;

CREATE POLICY "admins read legacy enrolments"
  ON public.legacy_enrolments FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admins write legacy enrolments"
  ON public.legacy_enrolments FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legacy_enrolments TO authenticated;

-- ────────────────────────────────────────────────────────────────────
-- Auto-claim trigger. Fires whenever a user's phone or email is
-- inserted/updated on public.users. Looks for matching unclaimed
-- legacy entitlements and converts them to real enrolments.
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_legacy_enrolments_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_norm text;
BEGIN
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

  -- Create enrolments rows for any unclaimed legacy entitlements that
  -- match this user by normalised phone OR by exact email.
  -- ON CONFLICT DO NOTHING handles the (unlikely) case where the user
  -- already has an enrolment for the same offering via some other
  -- path - we don't want to double-grant or fail the trigger.
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
    );

  -- Mark the matched legacy rows as claimed. Same predicate as the
  -- INSERT above so we don't claim rows we didn't actually grant.
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

DROP TRIGGER IF EXISTS users_claim_legacy_enrolments ON public.users;
CREATE TRIGGER users_claim_legacy_enrolments
  AFTER INSERT OR UPDATE OF phone, email ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_legacy_enrolments_for_user();

COMMENT ON TABLE public.legacy_enrolments IS
  'Pre-seeded entitlements from the old TagMango-built LevelUp app. Auto-claimed on user signin via users_claim_legacy_enrolments trigger.';

COMMENT ON FUNCTION public.claim_legacy_enrolments_for_user() IS
  'Fires when a user signs in (phone/email lands on public.users). Grants any matching unclaimed legacy entitlements as real enrolments. Idempotent.';
