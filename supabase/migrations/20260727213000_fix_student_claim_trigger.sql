-- ============================================================
-- HOTFIX: students who already bought something cannot sign up
--         (and the two claim paths must not become theft paths)
-- ============================================================
--
-- SEVERITY: production incident. `claim_legacy_enrolments_for_user` runs as
-- `AFTER INSERT OR UPDATE OF phone, email ON public.users`. An exception in an
-- AFTER trigger ABORTS THE TRANSACTION, so its failures did not skip a claim —
-- they blocked the signup. Any student matching one of the 73,865 unclaimed
-- `legacy_enrolments` rows could not create an account. 247 accounts against
-- 67,722 buyers was a blocked door, not slow adoption.
--
-- ── The four defects ────────────────────────────────────────────────────
-- 1. `source='tagmango_migration'` violates `enrolments_source_check` (allows
--    checkout/admin_grant/admin_manual/bulk_import/migration/manual/import/
--    free) → 23514 on every claim. Proof it never once succeeded:
--    tagmango_migration=0 rows vs migration=59 (which predate the regression).
--    'migration' is also what the sibling granter already writes for this same
--    population (20260524180000:236), so it is the only non-conflating value.
-- 2. No `offering_id IS NOT NULL` filter while `enrolments.offering_id` is NOT
--    NULL, and 779 unclaimed rows carry a null offering → 23502.
--    `ON CONFLICT DO NOTHING` absorbs neither: it suppresses UNIQUE only.
-- 3. The claiming UPDATE stamped pending rows, permanently disqualifying them
--    from `grant_enrolment_after_offering_resolved`, which requires
--    `claimed_by_user_id IS NULL`.
-- 4. SECURITY. The 23514 has been an accidental access control on the WHOLE
--    SIGNUP since 2026-06-11 — a forged signup currently cannot even commit.
--    Ending the outage lets it commit, so both claim paths must be gated in
--    THE SAME migration or we trade an outage for permanent entitlement theft.
--
-- ── Why the gate is `auth.users.phone IS NOT NULL` ──────────────────────
-- An earlier revision gated on `phone_confirmed_at`. That is INERT: GoTrue's
-- admin createUser inserts the row and applies phone_confirm as a SEPARATE
-- UPDATE, so an AFTER trigger on the INSERT sees NULL. Measured on this
-- database: 242/242 rows have phone_confirmed_at > created_at, ZERO equal,
-- min delta 5.95ms. That gate would have ended the outage and then claimed
-- nothing, forever, silently — and "signups succeed" reads exactly like success.
--
-- `auth.users.phone` is the correct gate: it is written by the server inside
-- the same INSERT (so it is ordering-independent) and only ever by
-- verify-msg91-otp AFTER its MSG91 token↔phone binding check (index.ts:147-150,
-- 266-272). `signInWithOtp` — the anon-key path in Signup.tsx:110 that carries
-- attacker-supplied `options.data.phone` into `public.users.phone` via
-- handle_new_user:35 — never populates `auth.users.phone` at all. Verified:
-- 242 rows have auth phone set; 0 have it set without confirmation following.
--
-- ── Why the email branch is DELETED, not latched ────────────────────────
-- `email_confirmed_at` is not ownership proof here. verify-msg91-otp is
-- verify_jwt=false, takes caller-supplied body.email (index.ts:212), creates
-- the account with it, then mintSession (:368-391) generateLink+verifyOtp
-- CONFIRMS whatever address was supplied. ensureSyntheticEmail (:351-366) sets
-- email_confirm:true outright on an MX-less domain. So the flag can be
-- manufactured. For the +91 population it costs nothing: a trustworthy signup
-- email was itself derived from legacy_enrolments keyed by the OTP-verified
-- phone (:225-244), so the phone branch already claims those exact rows, and
-- auth.users.email is usually the synthetic @phone.leveluplearning.in address
-- which can never match a TagMango row. This also makes the TG_OP='INSERT'
-- latch moot rather than silently reverted.
--   ⚠️ IT IS NOT FREE, AND EARLIER DRAFTS OF THIS HEADER GOT THE SIZE WRONG
--   TWICE. Measured on prod: 73,441 rows match ^\+91[0-9]{10}$, 485 are
--   `foreign:<digits>:<handle>` placeholders, and ZERO are neither — so the
--   "non-+91 OR foreign:" phrasing was vacuous, and 463/366 was a strict subset
--   (foreign AND unclaimed AND mapped). THE REAL BACKFILL DEBT IS 485 ROWS /
--   384 PEOPLE, all of them `foreign:` placeholders reachable by no phone key at
--   all. They are no worse off than under today's outage (nobody claims), so
--   this does not block the fix — but it is paid entitlement and needs a
--   one-off admin backfill, filed as follow-up.
--
-- ⚠️ KNOWN GAP, deliberately not fixed here (decide, don't discover):
--   All three payment paths — razorpay-webhook:112-119, verify-razorpay-payment:
--   412-419, guest-create-order:248-255 — call createUser with NO top-level
--   phone and then `.from("users").update({ phone })`. That UPDATE fires this
--   trigger, which reads auth.users.phone = NULL and returns at the guard below.
--   So every GUEST-CHECKOUT buyer is a silent no-op under this gate. Fixing it
--   means trusting a service-role-written phone, which is a new trust surface
--   and belongs in its own reviewed change — not bolted onto an outage fix.
--
-- HISTORY: 20260603120000 fixed 1 and 2; 20260611130000 rewrote the function
-- eight days later (adding the suppress GUC and the email latch) and silently
-- reintroduced both. Third break. Hence the exception wrapper: A MISSED CLAIM
-- IS RECOVERABLE, A BLOCKED SIGNUP IS NOT. `handle_new_user` catches only
-- unique_violation (20260530120000:65-76), so anything else in here is an outage.
-- NOTE: plain `WHEN OTHERS` does NOT catch query_canceled (57014), so
-- statement_timeout is trapped explicitly.
--
-- Idempotent (CREATE OR REPLACE), reversible, no RAISE EXCEPTION.

-- ────────────────────────────────────────────────────────────────────────
-- 1/2 — the signup-time claim
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_legacy_enrolments_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- auth.users is fully qualified below, so the path stays narrow.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_phone text;
  v_phone_norm text;
  v_phone_ok   boolean := false;
BEGIN
  -- KEPT from 20260611130000: per-transaction opt-out.
  IF current_setting('app.suppress_legacy_claim', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Best-effort. A claim failure must never take a signup down with it.
  BEGIN
    -- Trust the AUTH row, never the public.users mirror, which carries
    -- attacker-supplied signup metadata. COALESCE because SELECT INTO leaves
    -- the flag NULL when no auth row matches, which would fall through.
    -- `NEW.deleted_at IS NULL`: BOTH soft-delete paths
    -- (20260522180000:228-236 and delete-account/index.ts:161-170) UPDATE
    -- public.users SET phone=NULL, email=NULL, deleted_at=now(), which TOUCHES
    -- phone/email and therefore fires this trigger. The previously-deployed body
    -- keyed off NEW.phone — just NULLed — so it was inert. This one keys off
    -- auth.users.phone, which soft-delete PRESERVES by design (measured: 11 of
    -- 11 soft-deleted users still carry one). Without this guard, deleting an
    -- account would claim and PERMANENTLY stamp entitlements. It does not
    -- self-heal: `cleanup_deleted_users` exists but is NOT scheduled — prod has
    -- exactly two cron jobs, neither of them it — so the auth row is never
    -- hard-deleted and the ON DELETE SET NULL never fires.
    IF NEW.deleted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;

    SELECT au.phone, COALESCE(au.phone IS NOT NULL, false)
      INTO v_auth_phone, v_phone_ok
      FROM auth.users au
     WHERE au.id = NEW.id;
    v_phone_ok := COALESCE(v_phone_ok, false);

    IF NOT v_phone_ok THEN
      RETURN NEW;   -- nothing server-verified to match on
    END IF;

    -- Canonicalise to +91XXXXXXXXXX, the form legacy_enrolments stores.
    v_phone_norm := regexp_replace(v_auth_phone, '\D', '', 'g');
    IF length(v_phone_norm) = 10 THEN
      v_phone_norm := '+91' || v_phone_norm;
    ELSIF length(v_phone_norm) = 12 AND v_phone_norm LIKE '91%' THEN
      v_phone_norm := '+' || v_phone_norm;
    ELSE
      v_phone_norm := v_auth_phone;   -- non-Indian numbers pass through
    END IF;

    -- FIX 1 ('migration') + FIX 2 (skip NULL offerings).
    -- `e.status='active'` added so this agrees with the sibling granter.
    INSERT INTO public.enrolments (user_id, offering_id, payment_order_id, status, source)
    SELECT NEW.id, le.offering_id, NULL, 'active', 'migration'
    FROM public.legacy_enrolments le
    WHERE le.claimed_by_user_id IS NULL
      AND le.offering_id IS NOT NULL
      AND le.phone = v_phone_norm
      AND NOT EXISTS (
        SELECT 1 FROM public.enrolments e
        WHERE e.user_id = NEW.id
          AND e.offering_id = le.offering_id
          AND e.status = 'active'
      )
    ON CONFLICT DO NOTHING;

    -- FIX 3: only claim what we could actually grant, so an unmapped purchase
    -- stays eligible for grant_enrolment_after_offering_resolved.
    UPDATE public.legacy_enrolments le
    SET claimed_by_user_id = NEW.id,
        claimed_at = now()
    WHERE le.claimed_by_user_id IS NULL
      AND le.offering_id IS NOT NULL
      AND le.phone = v_phone_norm;

  EXCEPTION
    WHEN query_canceled THEN
      RAISE WARNING 'claim_legacy_enrolments_for_user timed out for user %', NEW.id;
    WHEN OTHERS THEN
      RAISE WARNING 'claim_legacy_enrolments_for_user failed for user %: % %',
        NEW.id, SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.claim_legacy_enrolments_for_user() IS
  'Claims a student''s already-in-the-system purchases on users INSERT/UPDATE of phone/email. Matches ONLY on auth.users.phone (server-written by verify-msg91-otp after its MSG91 binding check, and present at INSERT time so it is ordering-independent) — never the forgeable public.users mirror, and never email, which mintSession can confirm for any supplied address. Writes source=''migration'', skips NULL-offering rows so they stay eligible for grant_enrolment_after_offering_resolved, and can never abort a signup.';

-- ────────────────────────────────────────────────────────────────────────
-- 2/2 — the mapping-resolution granter, gated identically
--
-- This fires BEFORE UPDATE OF offering_id ON legacy_enrolments, i.e. on exactly
-- the mapping resolutions that will cover 1,067 programs / 67,129 students. It
-- matched `u.phone` / `u.email` against public.users — the SAME forgeable
-- mirror — with a bare LIMIT 1 and no ORDER BY, then stamped claimed_by_user_id
-- permanently. Ending the signup outage arms it, so it is gated in this push:
-- match only on the server-written auth phone, and make the pick deterministic.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_enrolment_after_offering_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF OLD.offering_id IS NULL
     AND NEW.offering_id IS NOT NULL
     AND NEW.claimed_by_user_id IS NULL THEN

    -- AUTH phone only. The email fallback is removed for the same reason as
    -- above: a confirmed email is not proof of ownership on this stack.
    --
    -- THE TWO COLUMNS STORE DIFFERENT DIALECTS. `legacy_enrolments.phone` is
    -- '+91XXXXXXXXXX'; GoTrue strips the '+', so `auth.users.phone` is
    -- '91XXXXXXXXXX' (measured here: 241 of 242 rows '91'-prefixed, 1 '+'-
    -- prefixed). A raw `au.phone = NEW.phone` therefore matches ZERO of 73,926
    -- rows — which is exactly why function 1 above canonicalises before
    -- comparing. An earlier revision of THIS file compared them raw and would
    -- have ended the outage while granting nothing, the same silent-no-op class
    -- as the phone_confirmed_at gate it replaced. The IN-list covers all three
    -- storage dialects and keeps `users_phone_key` usable.
    --
    -- The key is derived ONLY from an already-canonical legacy phone. 485 rows
    -- hold `foreign:<digits>:<handle>` placeholders rather than numbers; digit-
    -- stripping those would mint a 10-digit key that can COLLIDE with a real
    -- subscriber and stamp claimed_by_user_id permanently. The regex guard means
    -- they produce no key at all, so they add zero collision space.
    --
    -- `u.deleted_at IS NULL`: soft-delete nulls public.users.phone but PRESERVES
    -- the auth row and its phone (11 of 11 soft-deleted users still carry one),
    -- so without this a deleted account could claim a live buyer's purchases.
    IF NEW.phone ~ '^\+91[0-9]{10}$' THEN
      SELECT u.id INTO v_user_id
      FROM public.users u
      JOIN auth.users au ON au.id = u.id
      WHERE u.deleted_at IS NULL
        AND au.phone IN (right(NEW.phone, 10), '91' || right(NEW.phone, 10), NEW.phone)
      ORDER BY u.created_at ASC, u.id ASC   -- deterministic, was bare LIMIT 1
      LIMIT 1;
    END IF;

    IF v_user_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.enrolments e
        WHERE e.user_id = v_user_id
          AND e.offering_id = NEW.offering_id
          AND e.status = 'active'
      ) THEN
        INSERT INTO public.enrolments (user_id, offering_id, payment_order_id, status, source)
        VALUES (v_user_id, NEW.offering_id, NULL, 'active', 'migration');
      END IF;

      NEW.claimed_by_user_id := v_user_id;
      NEW.claimed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.grant_enrolment_after_offering_resolved() IS
  'Grants the enrolment when an unmapped purchase finally gets an offering_id. Matches ONLY the server-written auth.users.phone (never the forgeable public.users mirror, never email) and picks deterministically, because this stamps claimed_by_user_id permanently and a wrong match locks the real buyer out for good.';

-- ── Reversal (reference only) ──
-- claim_legacy_enrolments_for_user  → 20260611130000_unbrick_onboarding_for_shipped_clients.sql:53-110
-- grant_enrolment_after_offering_resolved → 20260524180000_legacy_enrolments_v2.sql:205-245
-- NOTE: reverting restores the signup-blocking defects AND both forgeable-claim paths.
