-- ============================================================
-- HOTFIX: students who already bought something cannot sign up
-- ============================================================
--
-- SEVERITY: production incident. `claim_legacy_enrolments_for_user` runs as
-- `AFTER INSERT OR UPDATE OF phone, email ON public.users`. An exception in an
-- AFTER trigger ABORTS THE TRANSACTION, so the failures below do not merely
-- skip a claim — they prevent the `users` row being written at all. Any student
-- whose phone or email matches one of the 73,865 unclaimed `legacy_enrolments`
-- rows cannot complete signup, and cannot change their phone or email after.
-- 247 accounts against 67,722 buyers is not slow adoption; it is a blocked door.
--
-- FOUR DEFECTS (1-3 verified against prod 2026-07-27; 4 found by the council):
--
-- 1. `source = 'tagmango_migration'` violates `enrolments_source_check`, which
--    allows only checkout/admin_grant/admin_manual/bulk_import/migration/
--    manual/import/free.  → 23514 on EVERY claim. Proof it has never once
--    succeeded: enrolments carries migration=59, checkout=2, manual=2 and
--    tagmango_migration=0. The 59 predate the regression.
--    'migration' is not merely legal, it is the ONLY non-conflating choice —
--    the sibling granter `grant_enrolment_after_offering_resolved` already
--    writes 'migration' for this identical population
--    (20260524180000_legacy_enrolments_v2.sql:236). Any other value would give
--    the same student a different source depending only on whether their
--    mapping happened to be resolved at signup time.
--
-- 2. The INSERT selects `le.offering_id` with no NOT NULL filter while
--    `enrolments.offering_id` is NOT NULL, and 779 unclaimed rows carry a NULL
--    offering.  → 23502.  (`ON CONFLICT DO NOTHING` suppresses UNIQUE
--    violations only — it absorbs neither 23514 nor 23502.)
--
-- 3. The claiming UPDATE marked those pending rows claimed, which permanently
--    disqualifies them: `grant_enrolment_after_offering_resolved` fires only
--    when `OLD.offering_id IS NULL AND NEW.offering_id IS NOT NULL AND
--    NEW.claimed_by_user_id IS NULL`. Claiming early strands the purchase.
--
-- 4. ⚠️ SECURITY — the 23514 has been an ACCIDENTAL ACCESS CONTROL since
--    2026-06-11. Simply repairing 1-3 would arm an anon-reachable entitlement
--    theft: `Signup.tsx:110` sends `data: { full_name, phone }` through
--    `signInWithOtp` using the anon key that ships in the client bundle, and
--    `handle_new_user` copies `raw_user_meta_data->>'phone'` VERBATIM into
--    `public.users.phone` (20260530120000:35). Both WHERE branches would then
--    match attacker-supplied values and stamp `claimed_by_user_id`
--    PERMANENTLY — after which the real buyer can never claim, because the
--    trigger requires `claimed_by_user_id IS NULL`. The auth row is created at
--    link-REQUEST time, so the attacker never needs to receive the email.
--    THE FIX IS NOT to drop the email branch: `options.data.phone` is equally
--    forgeable and reaches the phone branch by the same path.
--    THE FIX IS to trust only CONFIRMED AUTH FACTS. `verify-msg91-otp`
--    (index.ts:266-272) creates users with `phone_confirm: true`, so a genuine
--    OTP buyer has `auth.users.phone_confirmed_at` set; `signInWithOtp` never
--    populates `auth.users.phone` at all. Gating on the confirmed auth row
--    keeps every real buyer claiming and closes the forged path.
--
-- HISTORY: 20260603120000 fixed 1 and 2; 20260611130000 rewrote the function
-- eight days later to add the `app.suppress_legacy_claim` GUC and the
-- TG_OP='INSERT' email latch and silently reintroduced both. This is the third
-- time this function has shipped broken, which is why the body is now wrapped
-- in its own exception block: a MISSED CLAIM IS RECOVERABLE, A BLOCKED SIGNUP
-- IS NOT. `handle_new_user`'s own handler catches only `unique_violation`
-- (20260530120000:65-76), so without this wrapper any future constraint,
-- deadlock or statement_timeout in here becomes another signup outage.
--
-- Idempotent (CREATE OR REPLACE), reversible, and contains no RAISE EXCEPTION
-- so it can never abort a `db push`.

CREATE OR REPLACE FUNCTION public.claim_legacy_enrolments_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- widened from `public` to reach auth.users for the confirmed-fact gate (4)
SET search_path = public, auth
AS $$
DECLARE
  v_phone_norm  text;
  v_auth_phone  text;
  v_auth_email  text;
  v_phone_ok    boolean := false;
  v_email_ok    boolean := false;
BEGIN
  -- KEPT from 20260611130000: per-transaction opt-out (the onboarding RPC
  -- writes an UNVERIFIED email and must not claim).
  IF current_setting('app.suppress_legacy_claim', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- ── EXCEPTION ISOLATION (defect 4's structural half) ──────────────────
  -- Everything below is best-effort. A claim that fails must never take the
  -- signup down with it.
  BEGIN
    -- Trust the AUTH row, never the mirrored public.users values, which carry
    -- attacker-supplied signup metadata.
    SELECT au.phone,
           au.email,
           (au.phone IS NOT NULL AND au.phone_confirmed_at IS NOT NULL),
           (au.email IS NOT NULL AND au.email_confirmed_at IS NOT NULL)
      INTO v_auth_phone, v_auth_email, v_phone_ok, v_email_ok
      FROM auth.users au
     WHERE au.id = NEW.id;

    -- Normalise the CONFIRMED auth phone to +91XXXXXXXXXX, the canonical form
    -- legacy_enrolments stores.
    IF v_phone_ok THEN
      v_phone_norm := regexp_replace(v_auth_phone, '\D', '', 'g');
      IF length(v_phone_norm) = 10 THEN
        v_phone_norm := '+91' || v_phone_norm;
      ELSIF length(v_phone_norm) = 12 AND v_phone_norm LIKE '91%' THEN
        v_phone_norm := '+' || v_phone_norm;
      ELSE
        v_phone_norm := v_auth_phone;  -- non-Indian numbers pass through
      END IF;
    END IF;

    -- Nothing confirmed → nothing to claim. A magic-link signup lands here,
    -- which is exactly the forged path we are closing. Such a student is
    -- claimed later by claim_my_student_enrolments() once a fact is confirmed.
    IF NOT v_phone_ok AND NOT v_email_ok THEN
      RETURN NEW;
    END IF;

    -- FIX 1: 'migration' is legal and matches the sibling granter.
    -- FIX 2: skip NULL offerings — enrolments.offering_id is NOT NULL.
    INSERT INTO public.enrolments (user_id, offering_id, payment_order_id, status, source)
    SELECT NEW.id, le.offering_id, NULL, 'active', 'migration'
    FROM public.legacy_enrolments le
    WHERE le.claimed_by_user_id IS NULL
      AND le.offering_id IS NOT NULL
      AND (
        (v_phone_ok AND v_phone_norm IS NOT NULL AND le.phone = v_phone_norm)
        OR (v_email_ok AND le.email = v_auth_email)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.enrolments e
        WHERE e.user_id = NEW.id AND e.offering_id = le.offering_id
      )
    ON CONFLICT DO NOTHING;

    -- FIX 3: only claim what we could actually grant. A row whose offering is
    -- not mapped yet stays UNCLAIMED on purpose so
    -- grant_enrolment_after_offering_resolved can still grant it later.
    UPDATE public.legacy_enrolments le
    SET claimed_by_user_id = NEW.id,
        claimed_at = now()
    WHERE le.claimed_by_user_id IS NULL
      AND le.offering_id IS NOT NULL
      AND (
        (v_phone_ok AND v_phone_norm IS NOT NULL AND le.phone = v_phone_norm)
        OR (v_email_ok AND le.email = v_auth_email)
      );

  EXCEPTION WHEN OTHERS THEN
    -- Never abort the signup. Surface it loudly instead.
    RAISE WARNING 'claim_legacy_enrolments_for_user failed for user %: % %',
      NEW.id, SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.claim_legacy_enrolments_for_user() IS
  'Claims a student''s already-in-the-system purchases on users INSERT/UPDATE of phone/email. Trusts only CONFIRMED auth.users facts (never the forgeable signup metadata mirrored into public.users), writes source=''migration'', skips NULL-offering rows so they stay eligible for grant_enrolment_after_offering_resolved, and can never abort a signup. Fixed 2026-07-27 after 20260611130000 reintroduced a 23514/23502 that blocked signup for every buyer.';

-- ── Reversal (reference only) ──
-- Re-apply the body from 20260611130000_unbrick_onboarding_for_shipped_clients.sql:53-110.
-- NOTE: doing so restores the signup-blocking defects AND the forgeable-claim path.
