-- ============================================================================
-- identity-fixtures.sql — preconditions for the PHASE SP adversarial identity
-- suite (`qa-harness/identity-spine.spec.mjs`; brief `design/briefs/cohort-sp.md`
-- task S-6).
--
-- WHAT IT BUILDS
--   1. A fixture offering wired to a fake Tally form id, so synthetic signed
--      submissions can be driven through `tally-application-webhook` — which
--      runs the SAME `_shared/identity.ts` provisioning sequence as the live
--      poller (see the two "KEPT DELIBERATELY IDENTICAL" blocks in those files).
--   2. THE COLLISION PRECONDITIONS — three pre-existing auth users:
--        • P owns the phone a later application will submit  -> phone_taken
--        • A owns the email a later application will submit  -> the email side
--        • B owns the phone THAT application submits         -> cross_linked
--      Without these rows the collision cases prove nothing, because there is
--      nothing to collide with. A and B additionally give the claim case two
--      real, mail-capable accounts, so a second-channel OTP can actually be
--      issued and the claim can be driven end to end. Each incumbent is built
--      as a COMPLETE GoTrue account — empty-string token columns and matching
--      `auth.identities` rows, per this repo's own seeding precedent — so a
--      session/admin call against one fails only for reasons about identity.
--   3. Two read-only, service_role-only helpers the suite uses to count and
--      snapshot `auth.users` (PostgREST cannot see the `auth` schema, and
--      GoTrue's admin list endpoint returns no dependable total — so
--      "ZERO users were minted" is not otherwise assertable over HTTP).
--
-- WHERE IT RUNS — SHADOW PROJECTS ONLY. This file writes directly to
-- `auth.users`. It hard-codes NO project ref; the connection string comes from
-- the environment (`SHADOW_DB_URL`). Two independent tripwires must both pass
-- before a single row is touched:
--   • the caller must set `identity_fixtures.confirm_shadow = 'yes'` in the same
--     session but OUTSIDE this file (a guard a file can set for itself is not a
--     guard), and
--   • `auth.users` must hold fewer than `identity_fixtures.max_users` rows
--     (default 5000). Production carries ~74k legacy accounts, so a misdirected
--     run aborts on row count alone, before any write.
--
-- HOW TO RUN
--   psql "$SHADOW_DB_URL" -v ON_ERROR_STOP=1 \
--     -c "SET identity_fixtures.confirm_shadow = 'yes'" \
--     -f qa-harness/identity-fixtures.sql
--   (`identity-spine.spec.mjs` issues exactly this on every live run;
--    SHADOW_DB_URL is REQUIRED by that suite, because this file is the only
--    thing that clears the previous run's rows and the suite is not re-runnable
--    without it.)
--
-- IDEMPOTENT + SELF-CLEANING. Every run first deletes everything a previous run
-- (or a previous suite run) created. All fixture state is namespaced by the
-- `@identity-fixture.invalid` email domain — `.invalid` is reserved by RFC 2606
-- and can never receive mail — and by the `+9199000000xx` phone block. Running
-- this twice leaves the database exactly as running it once does.
-- ============================================================================

-- ── 0. Tripwires ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_confirm text   := coalesce(current_setting('identity_fixtures.confirm_shadow', true), '');
  v_max     bigint := coalesce(nullif(current_setting('identity_fixtures.max_users', true), '')::bigint, 5000);
  v_users   bigint;
BEGIN
  IF v_confirm <> 'yes' THEN
    RAISE EXCEPTION 'identity-fixtures: refusing to run. This file writes to auth.users and is for SHADOW projects only. If this really is a shadow project, run it as: psql "$SHADOW_DB_URL" -v ON_ERROR_STOP=1 -c "SET identity_fixtures.confirm_shadow = ''yes''" -f qa-harness/identity-fixtures.sql';
  END IF;

  SELECT count(*) INTO v_users FROM auth.users;
  IF v_users > v_max THEN
    RAISE EXCEPTION 'identity-fixtures: ABORTED — auth.users holds % rows (limit %). A project this large is production, not a shadow. Nothing was written.', v_users, v_max;
  END IF;
END $$;

-- ── 1. Schema precondition: pending_claim must exist (task S-2) ─────────────
-- `pending_claim` is BRAND NEW in this phase; it does not exist on main. The
-- suite must never assume it. If S-2's migration has not been applied to this
-- shadow project, say so by name here rather than failing later with an opaque
-- PostgREST 400 about an unknown column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cohort_applications'
      AND column_name = 'pending_claim'
  ) THEN
    RAISE EXCEPTION 'identity-fixtures: public.cohort_applications.pending_claim is MISSING. It is introduced by task S-2 (supabase/migrations/20260727120000_cohort_applications_pending_claim.sql). Apply this phase''s migrations to the shadow project before running the identity suite.';
  END IF;
END $$;

-- ── 2. Wipe everything a previous run left behind ──────────────────────────
-- Order matters: applications first (they reference users), then auth.users
-- (public.users cascades from it — users_id_fkey is ON DELETE CASCADE).
DELETE FROM public.cohort_applications
 WHERE email LIKE '%@identity-fixture.invalid'
    OR coalesce(phone, '') LIKE '%99000000%';

DELETE FROM auth.users
 WHERE email LIKE '%@identity-fixture.invalid'
    OR coalesce(phone, '') LIKE '%99000000%';

-- Defensive: a public.users row orphaned by an older, less careful cleanup.
DELETE FROM public.users
 WHERE email LIKE '%@identity-fixture.invalid'
    OR coalesce(phone, '') LIKE '%99000000%';

DELETE FROM public.offerings WHERE slug = 'identity-fixture-cohort';

-- Login secrets and rate-limit buckets from the previous run. Without this a
-- second run inside the 15-minute window trips verify-email-otp's per-email
-- send ceiling (OTP_SEND_MAX_PER_WINDOW) and the suite fails for a reason that
-- has nothing to do with identity.
DELETE FROM public.email_otp_codes WHERE email LIKE '%@identity-fixture.invalid';

-- EVERY email-OTP bucket, not just the per-address ones. verify-email-otp also
-- keeps PER-IP buckets (`email-otp-send-ip:<ip>` and `email-otp-send-ip-day:<ip>`,
-- verify-email-otp/index.ts:248-252) keyed on the caller's IP and NOT on the
-- address — so an address-scoped wipe leaves them accumulating across runs, and
-- the day bucket in particular would eventually 429 the suite for a reason that
-- has nothing to do with identity. Every run of this suite issues a handful of
-- codes from one machine; on a shadow project there is no other traffic whose
-- buckets this could disturb.
DELETE FROM public.public_rate_limits WHERE key LIKE 'email-otp-%';

-- ── 3. The fixture offering ────────────────────────────────────────────────
-- `tally-application-webhook` matches an offering by `tally_form_url`
-- CONTAINING the envelope's formId, and only considers `payment_mode = 'staged'`
-- rows — so those two columns are load-bearing, not decoration.
-- `intake_opens_at` is backdated so the poller's window resolution
-- (`_shared/tally.ts` resolveIntakeWindow) would accept the same submission
-- too; `application_deadline` is left NULL (no ceiling). `status = 'draft'` so
-- the fixture can never surface on a public surface even by accident.
INSERT INTO public.offerings (
  title, slug, type, price_inr, status, payment_mode,
  app_fee_inr, confirmation_amount_inr,
  tally_form_url, intake_opens_at, application_deadline
) VALUES (
  'IDENTITY FIXTURE — cohort (qa-harness, never for sale)',
  'identity-fixture-cohort',
  'onetime',
  1,
  'draft',
  'staged',
  1,
  1,
  'https://tally.so/r/IDFIXT01',
  now() - interval '30 days',
  NULL
);

-- ── 4. THE COLLISION PRECONDITIONS ─────────────────────────────────────────
-- Written straight into auth.users because that is what "an account that
-- existed before the test started" IS; there is no API for it. Ids are fixed
-- UUIDs so the suite can address each incumbent without a lookup race.
--
-- `encrypted_password` is deliberately the empty string — an invalid bcrypt
-- digest. These accounts can only ever be reached by OTP, which is the whole
-- point of the phase: no password exists anywhere in the applicant flow.
--
-- Confirmed on both channels because a real incumbent would be. That is what
-- makes a merge onto them so dangerous, and it is the state the suite proves
-- provisioning refuses to touch.
--
-- ⚠️ THE TOKEN COLUMNS ARE NOT DECORATION. GoTrue is Go, and it scans
-- `confirmation_token`, `recovery_token`, `email_change`,
-- `email_change_token_new`, `email_change_token_current`, `phone_change`,
-- `phone_change_token` and `reauthentication_token` into non-nullable strings.
-- A hand-inserted row that leaves them NULL makes every admin/session call
-- touching that user fail with "converting NULL to string is unsupported" — an
-- ENVIRONMENTAL failure the suite would otherwise report as a claim defect
-- (S-LIVE-4 mints a session for incumbent B through verify-email-otp, which is
-- exactly that path). They are therefore set to '' here, matching this repo's
-- own precedent for the same operation:
-- supabase/migrations/20260410150000_seed_admin_user.sql:30-60.
INSERT INTO auth.users (
  instance_id, id, aud, role,
  email, phone,
  encrypted_password,
  email_confirmed_at, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token,
  reauthentication_token,
  is_sso_user
) VALUES
  -- P — owns the phone the "collide" application will submit. Its email is
  -- unrelated to that application, so the outcome must be phone_taken.
  (
    '00000000-0000-0000-0000-000000000000',
    'f1c70000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated',
    'idfix-incumbent-phone@identity-fixture.invalid',
    '+919900000002',
    '',
    now() - interval '90 days', now() - interval '90 days',
    '{"provider":"phone","providers":["phone"]}'::jsonb,
    '{"full_name":"Identity Fixture Incumbent P"}'::jsonb,
    now() - interval '90 days', now() - interval '90 days',
    '', '',
    '', '', '',
    '', '',
    '',
    false
  ),
  -- A — owns the EMAIL the "cross" application will submit.
  (
    '00000000-0000-0000-0000-000000000000',
    'f1c70000-0000-4000-8000-000000000011',
    'authenticated', 'authenticated',
    'idfix-incumbent-email@identity-fixture.invalid',
    '+919900000011',
    '',
    now() - interval '80 days', now() - interval '80 days',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Identity Fixture Incumbent A"}'::jsonb,
    now() - interval '80 days', now() - interval '80 days',
    '', '',
    '', '', '',
    '', '',
    '',
    false
  ),
  -- B — owns the PHONE the "cross" application will submit. A and B together
  -- are the cross_linked collision: one application, two different accounts,
  -- one on each identifier. Both carry a real (if undeliverable) address, so
  -- the claim case can drive a second-channel email OTP end to end.
  (
    '00000000-0000-0000-0000-000000000000',
    'f1c70000-0000-4000-8000-000000000012',
    'authenticated', 'authenticated',
    'idfix-incumbent-cross@identity-fixture.invalid',
    '+919900000012',
    '',
    now() - interval '70 days', now() - interval '70 days',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Identity Fixture Incumbent B"}'::jsonb,
    now() - interval '70 days', now() - interval '70 days',
    '', '',
    '', '', '',
    '', '',
    '',
    false
  );

-- ── 4b. THE IDENTITY ROWS THE INCUMBENTS MUST CARRY ────────────────────────
-- An `auth.users` row on its own is not a complete GoTrue account. GoTrue
-- resolves a user through `auth.identities`, and several admin/session paths
-- read or update it; an incumbent with no identity row is a shape production
-- never produces, and it makes those paths behave in ways that have nothing to
-- do with what this suite is measuring. S-LIVE-4 mints a real session for
-- incumbent B (verify-email-otp), so this is on the suite's critical path, not
-- a nicety. Same precedent as the token columns above:
-- supabase/migrations/20260410150000_seed_admin_user.sql:72,100.
--
-- Each incumbent is confirmed on BOTH channels, so each carries BOTH an email
-- and a phone identity. The identity `id` is a fresh uuid (NOT the user id,
-- which the single-identity precedent could get away with) because one user
-- here owns two identity rows. Deletion is handled by the section-2 wipe:
-- auth.identities.user_id is ON DELETE CASCADE from auth.users.
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  u.email,
  'email',
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', true
  ),
  u.created_at, u.created_at, u.created_at
FROM auth.users u
WHERE u.email LIKE '%@identity-fixture.invalid'
ON CONFLICT (provider_id, provider) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  u.phone,
  'phone',
  jsonb_build_object(
    'sub', u.id::text,
    'phone', u.phone,
    'phone_verified', true
  ),
  u.created_at, u.created_at, u.created_at
FROM auth.users u
WHERE u.email LIKE '%@identity-fixture.invalid'
  AND u.phone IS NOT NULL
ON CONFLICT (provider_id, provider) DO NOTHING;

-- ── 5. Read-only helpers for the suite ─────────────────────────────────────
-- Both are read-only, both are service_role-only, and neither can be created
-- outside a shadow project because this file cannot run outside one.

CREATE OR REPLACE FUNCTION public.identity_fixture_auth_user_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT count(*) FROM auth.users;
$$;

REVOKE ALL ON FUNCTION public.identity_fixture_auth_user_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_fixture_auth_user_count() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_fixture_auth_user_count() TO service_role;

COMMENT ON FUNCTION public.identity_fixture_auth_user_count() IS
  'qa-harness/identity-fixtures.sql — total auth.users count, so the identity suite can prove a collision '
  'minted ZERO new users. Read-only, service_role-only, shadow projects only.';

-- DROPPED, not just replaced: CREATE OR REPLACE cannot change a function's
-- RETURNS TABLE signature, and this one gains columns (the confirmation
-- timestamps and app_metadata the suite reads to prove a minted account is
-- INERT). Without the DROP, a shadow project that ran an earlier version of
-- this file keeps the old four-column function and the suite fails on missing
-- fields rather than on anything about identity.
DROP FUNCTION IF EXISTS public.identity_fixture_auth_users();

CREATE OR REPLACE FUNCTION public.identity_fixture_auth_users()
RETURNS TABLE (
  id uuid,
  email text,
  phone text,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  app_metadata jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    u.id,
    u.email::text,
    u.phone::text,
    u.email_confirmed_at,
    u.phone_confirmed_at,
    u.raw_app_meta_data,
    u.created_at
  FROM auth.users u
  WHERE u.email LIKE '%@identity-fixture.invalid'
     OR coalesce(u.phone, '') LIKE '%99000000%'
  ORDER BY u.created_at ASC, u.id ASC;
$$;

REVOKE ALL ON FUNCTION public.identity_fixture_auth_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.identity_fixture_auth_users() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_fixture_auth_users() TO service_role;

COMMENT ON FUNCTION public.identity_fixture_auth_users() IS
  'qa-harness/identity-fixtures.sql — the fixture-tagged auth.users rows (id/email/phone/confirmation '
  'timestamps/app_metadata/created_at), so '
  'the identity suite can prove both-identifier binding, prove a minted account is inert (neither channel '
  'confirmed, levelup_unverified_intake stamped), and prove the incumbent rows were never merged '
  'into. Read-only, service_role-only, shadow projects only.';

-- ── 6. Report ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_incumbents int;
  v_offerings  int;
BEGIN
  SELECT count(*) INTO v_incumbents FROM auth.users WHERE email LIKE '%@identity-fixture.invalid';
  SELECT count(*) INTO v_offerings  FROM public.offerings WHERE slug = 'identity-fixture-cohort';
  RAISE NOTICE 'identity-fixtures: ready. offering rows: % (must be 1, form IDFIXT01); incumbent accounts: % (must be 3: P/A/B).',
    v_offerings, v_incumbents;
END $$;
