-- ============================================================
-- PHASE SP — The Identity Spine: cohort_applications.pending_claim (S-2)
-- ============================================================
--
-- WHAT THIS IS. Intake (`tally-application-poll`, and the inert
-- `tally-application-webhook` if a signing secret is ever set) now PROVISIONS
-- an auth user for every applicant, so the application arrives already bound to
-- an `auth.uid` and the applicant never sees a signup screen.
--
-- That is a brand-new thing in this system: an `auth.users` row minted from an
-- UNAUTHENTICATED PUBLIC FORM, whose email and phone nobody has proven. So this
-- migration is in five parts, and only the first is about the column:
--
--   1. `pending_claim` — the flag for the collisions intake refuses to resolve.
--   2. RLS so the CLAIMANT (and only the claimant) can find their parked row.
--   3. A gate on `claim_legacy_enrolments_for_user` so an unproven intake
--      identity is granted NOTHING. Without it, provisioning is a paywall
--      bypass (see part 3's header).
--   4. `sync_confirmed_phone_to_users` — a CONFIRMED phone reaches the mirror,
--      which is what lets the phone-keyed claim run with proof.
--   5. `claim_legacy_enrolments_on_email_confirm` — the email-keyed claim runs
--      when the email is finally confirmed. Parts 4 and 5 are the two halves of
--      "the gate lifts by itself"; without 5 the email arm never fires again
--      (it is INSERT-only, and the INSERT is the event part 3 suppresses).
--
-- DEPLOY ORDER: apply this BEFORE deploying tally-application-poll /
-- tally-application-webhook. Ordinary application rows never name
-- `pending_claim`, but a collision row does, so an intake tick in between
-- raises 42703 and does not insert that row (it retries on the next tick).
--
-- Additive, reversible, idempotent, in the style of
-- 20260722120000_reconciled_stage_columns.sql.

-- ════════════════════════════════════════════════════════════════════════
-- 1. THE COLUMN
-- ════════════════════════════════════════════════════════════════════════
--
-- Three of the four provisioning outcomes stamp `user_id` (or leave it NULL
-- because there was no identifier at all). The fourth is a COLLISION: an
-- existing account already owns the applicant's email, or their phone, or the
-- two belong to two DIFFERENT accounts. A collision must NEVER silent-merge —
-- binding an identity on the strength of a form answer is account takeover with
-- extra steps, and intake proves NEITHER identifier — so the row is inserted
-- with `user_id` NULL and this flag set, and the tie is broken INTERACTIVELY at
-- first sign-in by a second-channel OTP (phase SP task S-4).
--
-- ALL THREE collision reasons park, `email_taken` included. Exempting it looks
-- safe ("the phone belongs to nobody, so there is no second identity to merge")
-- and is not: anyone can POST the public Tally form with a stranger's address,
-- and the row — their name, phone, city, occupation, bio — would be stamped
-- onto the stranger's `user_id` and surfaced to the stranger by
-- `students_read_own_applications`. The ordinary "an existing user applies"
-- case does not land here at all: both of their identifiers resolve to the same
-- uid, which intake treats as `existing` and links.
--
-- CONSEQUENCE for S-4: a parked row is NOT guaranteed to carry both channels.
-- An `email_taken` collision on a submission with no usable phone parks a row
-- whose only channel is the email, and a claim must prove the channel the
-- caller has not already used — so that row cannot be self-claimed and needs a
-- human. It is rare (the form asks for a phone) and it is a stuck row rather
-- than a wrong bind, which is the right way round.
--
-- Nothing back-fills: every pre-existing row is `false`, which is exactly right
-- — they were ingested before provisioning existed and are unaffected by it.

ALTER TABLE public.cohort_applications
  ADD COLUMN IF NOT EXISTS pending_claim boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cohort_applications.pending_claim IS
  'intake found an identity collision it may not resolve (email_taken, '
  'phone_taken or cross_linked): user_id is deliberately NULL and the row '
  'awaits an interactive second-channel OTP claim (phase SP). Never merged.';

-- The claim path reads `WHERE pending_claim AND user_id IS NULL ORDER BY
-- created_at DESC` (src/hooks/useClaimApplication.ts) and passes NO identifier
-- — the matching is done by the policy below, against the caller's own stored
-- identity, so that the query surface is not an enumeration oracle. This index
-- is therefore built for THAT predicate and that ordering, and nothing else.
--
-- It is PARTIAL on exactly the two flags the query fixes, so it holds only the
-- vanishing fraction of rows that are actually parked; the policy's normalised
-- comparisons then run over that handful of rows rather than the table. (A
-- plain btree on the raw `(email, phone)` columns would be dead weight: the
-- policy compares `lower(btrim(email))` and `right(regexp_replace(phone, …),
-- 10)`, which no index on the raw columns can answer, and it ORs the two, which
-- no composite index can serve either.)
DROP INDEX IF EXISTS public.idx_cohort_apps_pending_claim;
CREATE INDEX IF NOT EXISTS idx_cohort_apps_pending_claim
  ON public.cohort_applications (created_at DESC)
  WHERE pending_claim AND user_id IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 2. RLS — let the CLAIMANT see their own pending row, and nobody else's
-- ════════════════════════════════════════════════════════════════════════
--
-- THE PROBLEM. `students_read_own_applications` is `user_id = auth.uid()`, and
-- a pending row has `user_id` NULL by construction. So the one person who must
-- see it — the signed-in claimant — is precisely the person it hides it from,
-- and S-4 cannot function. (`admin_manage_applications` is unaffected: admins
-- already see every row. Neither existing policy is touched below.)
--
-- THE CONSTRAINT. The match must be made on the caller's OWN identity as
-- recorded on `auth.users`, never on a value the client supplies — a policy
-- that took the email from the request would let anyone read any applicant's
-- name, phone, city and essay by guessing addresses. So the two helpers below
-- take NO arguments: they read `auth.users` for `auth.uid()` and return the
-- caller's own keys, normalised the same way `find_login_identity` normalises
-- them (lower/trimmed email; last-10 subscriber digits for phone). There is no
-- input to poison, and a caller invoking them directly learns only their own
-- email/phone, which they already know.
--
-- WHY SECURITY DEFINER AT ALL. `authenticated` has no SELECT on `auth.users`,
-- so an inline `EXISTS (SELECT 1 FROM auth.users …)` inside the policy would
-- fail with permission denied for every caller. STABLE so the planner
-- evaluates each once per statement rather than once per row.
--
-- WHY NOT `auth.jwt() ->> 'email'`. It is cheaper, but it is a snapshot taken
-- when the token was minted; a claimant whose email was attached during this
-- very sign-in would carry a stale claim and silently see nothing. The table is
-- the truth, and the claim path is rare enough to afford reading it.

CREATE OR REPLACE FUNCTION public.auth_identity_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT lower(btrim(u.email))
  FROM auth.users u
  WHERE u.id = auth.uid()
    AND NULLIF(btrim(COALESCE(u.email, '')), '') IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.auth_identity_phone10()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT right(regexp_replace(u.phone, '\D', '', 'g'), 10)
  FROM auth.users u
  WHERE u.id = auth.uid()
    AND length(regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g')) >= 10
$$;

REVOKE ALL ON FUNCTION public.auth_identity_email() FROM public;
REVOKE ALL ON FUNCTION public.auth_identity_phone10() FROM public;

-- `anon` IS GRANTED ON PURPOSE. Supabase grants `anon` table-level SELECT on
-- public tables, so RLS is the only gate and EVERY permissive SELECT policy is
-- evaluated for an unauthenticated PostgREST read — including this one, whose
-- USING clause calls both helpers. Postgres does not guarantee that the
-- `auth.uid() IS NOT NULL` conjunct short-circuits ahead of two equal-cost
-- STABLE functions, so withholding EXECUTE would turn an anonymous read of
-- `cohort_applications` into a 42501 ("permission denied for function
-- auth_identity_email") instead of an empty array — and only once a
-- `pending_claim` row existed, i.e. a latent, data-dependent break.
-- Granting costs nothing: for `anon`, `auth.uid()` is NULL, both helpers match
-- no row and return NULL, and the policy is false regardless.
GRANT EXECUTE ON FUNCTION public.auth_identity_email() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_identity_phone10() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.auth_identity_email() IS
  'The CALLER''s own auth.users email, lower/trimmed. Argument-free by design: '
  'RLS must match on the signed-in identity, never on a client-supplied value. '
  'Returns NULL for anon (no auth.uid()), which is why anon may execute it.';
COMMENT ON FUNCTION public.auth_identity_phone10() IS
  'The CALLER''s own auth.users phone as last-10 subscriber digits (same key as '
  'find_login_identity). Argument-free by design; see auth_identity_email().';

-- ADDITIVE. Postgres ORs multiple permissive policies together, so this widens
-- SELECT by exactly one shape — a row that is BOTH pending and unclaimed AND
-- carries one of the caller's own identifiers — and changes nothing else.
DROP POLICY IF EXISTS "claimants_read_pending_applications" ON public.cohort_applications;

CREATE POLICY "claimants_read_pending_applications" ON public.cohort_applications
  FOR SELECT USING (
    pending_claim
    AND user_id IS NULL
    AND auth.uid() IS NOT NULL
    AND (
      (
        NULLIF(btrim(COALESCE(email, '')), '') IS NOT NULL
        AND public.auth_identity_email() IS NOT NULL
        AND lower(btrim(email)) = public.auth_identity_email()
      )
      OR
      (
        length(regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) >= 10
        AND public.auth_identity_phone10() IS NOT NULL
        AND right(regexp_replace(phone, '\D', '', 'g'), 10) = public.auth_identity_phone10()
      )
    )
  );

COMMENT ON POLICY "claimants_read_pending_applications" ON public.cohort_applications IS
  'Discovery only: a signed-in user may SELECT an unclaimed pending_claim row '
  'that carries their own auth.users email or phone. Attaching it (stamping '
  'user_id) stays a service_role write behind a second-channel OTP.';

-- ════════════════════════════════════════════════════════════════════════
-- 3. THE GATE — an unproven intake identity is granted NOTHING
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY THIS IS HERE AND NOT OPTIONAL. `users_claim_legacy_enrolments` fires
-- AFTER INSERT OR UPDATE OF (phone, email) on `public.users`, and in the live
-- body `v_email_claims_ok := (TG_OP = 'INSERT')`. Migration 20260611130000 set
-- that INSERT-only carve-out on a premise it states plainly: an INSERT into
-- `public.users` "only ever follows a verified auth flow" (magic-link signup
-- mirrors a confirmed address; phone signups mirror a synthetic one that can
-- never match a legacy row). It even added `app.suppress_legacy_claim` so the
-- one path that writes an UNVERIFIED email — the onboarding RPC — could opt
-- out.
--
-- Intake provisioning breaks that premise. It is a brand-new INSERT path driven
-- entirely by an unauthenticated public form:
--   tally poller -> auth.admin.createUser({ email: <raw form field> })
--     -> handle_new_user() -> INSERT INTO public.users
--       -> users_claim_legacy_enrolments with v_email_claims_ok = TRUE
-- Ungated, anyone who submits the public Tally form with a paying TagMango
-- customer's address gets every unclaimed `legacy_enrolments` row for that
-- address inserted as an ACTIVE enrolment on THEIR uid, and
-- `claimed_by_user_id` stamped so the real customer can never claim them
-- again. That is the whole paid catalogue, for free, with no credentials — the
-- exact class 20260531000000 and 20260611130000 were written to kill.
--
-- WHY NOT THE EXISTING GUC. `app.suppress_legacy_claim` is transaction-local,
-- and the INSERT happens inside GoTrue's own transaction on its own connection.
-- An edge function calling `auth.admin.createUser` has no way to set it. So the
-- signal has to travel ON THE ROW, and `raw_app_meta_data` is the right
-- carrier: `app_metadata` is writable only by the service role (a user can
-- never set it, unlike `user_metadata`), so it is trustworthy as a claim about
-- provenance.
--
-- WHY THE GATE IS NARROW. It suppresses ONLY rows this intake itself marked,
-- and only while NEITHER channel is confirmed. Every pre-existing path is
-- byte-for-byte unaffected: no other caller writes the flag, so for every one
-- of them the EXISTS is false and the body below is the 20260611130000 body
-- unchanged.
--
-- THE GATE STOPS APPLYING once a channel is confirmed — but "stops applying"
-- is not the same as "the claim re-runs", and this function only ever runs when
-- something writes `public.users`. Both arms therefore need a partner:
--   • PHONE — part 4 mirrors a CONFIRMED `auth.users.phone` into
--     `public.users.phone`; that UPDATE re-enters this function with the gate
--     lifted and the phone arm matches.
--   • EMAIL — the email arm is INSERT-only (`v_email_claims_ok := (TG_OP =
--     'INSERT')`, inherited verbatim from 20260611130000), and that INSERT is
--     precisely the event this gate returns early from. Nothing ever re-inserts
--     the row, so without help the email-keyed claim would be suppressed
--     FOREVER — a paying TagMango customer whose legacy row carries an email
--     would apply, sign in, and receive nothing. Part 5 is the help: it runs
--     the email-keyed claim once, when `email_confirmed_at` first lands on an
--     intake-tagged row.
--
-- KNOWN RESIDUAL, stated rather than papered over: a legacy row keyed ONLY by a
-- phone still needs `phone_confirmed_at`, and for an identity intake already
-- created, `verify-msg91-otp` takes its EXISTING-USER branch (find_login_identity
-- matches the phone intake wrote) and mints a session without ever confirming
-- the phone. Part 4 therefore does not fire for that user. Fixing it means
-- confirming the phone on that branch, which is a change to `verify-msg91-otp`
-- — the one file phase SP requires to stay byte-identical. Flagged for its own
-- task, not folded into this one.
--
-- Note this gate covers BOTH channels, not just the email one. Intake writes no
-- `user_metadata.phone` today (an unproven number in `public.users.phone` would
-- fire a phone-keyed claim on somebody else's number AND squat the UNIQUE
-- column against its real owner), so the phone arm is defence in depth against
-- a future caller that does.

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

  -- PHASE SP: an identity minted by unauthenticated intake, with nothing yet
  -- proven, claims nothing on either channel. See the header above.
  -- `auth.users` is schema-qualified so this needs no change to search_path.
  IF EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = NEW.id
      AND au.raw_app_meta_data ->> 'levelup_unverified_intake' = 'true'
      AND au.email_confirmed_at IS NULL
      AND au.phone_confirmed_at IS NULL
  ) THEN
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

  -- The INSERT/UPDATE pair below (and the normalisation above it) is
  -- 20260611130000'S BODY, VERBATIM — reproduced rather than improved so this
  -- CREATE OR REPLACE changes exactly one thing: the gate above. That
  -- verbatim-ness includes source='tagmango_migration',
  -- which 20260603120000's header says enrolments_source_check rejects (its
  -- fix to 'migration' was lost when 20260611100000/130000 re-declared the
  -- function). Correcting it here would be an unrelated, unreviewed change to
  -- which legacy claims succeed, on a constraint whose live definition this
  -- tree cannot see — it is flagged for its own fix, not folded into this one.
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

COMMENT ON FUNCTION public.claim_legacy_enrolments_for_user() IS
  'Grants unclaimed TagMango entitlements to a user. Email-keyed claims run '
  'only on INSERT (20260611130000); NEITHER channel claims for an auth row '
  'tagged levelup_unverified_intake while no channel is confirmed (phase SP) — '
  'that tag marks an identity minted from an unauthenticated public form. Once '
  'a channel IS confirmed the claim is re-driven by sync_confirmed_phone_to_users '
  '(phone) and claim_legacy_enrolments_on_email_confirm (email).';

-- ════════════════════════════════════════════════════════════════════════
-- 4. A CONFIRMED PHONE REACHES THE MIRROR (and only a confirmed one)
-- ════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS REPAIRS. `handle_new_user` reads the mirror phone from
-- `NEW.raw_user_meta_data->>'phone'`, so `public.users.phone` is only ever
-- populated at auth-user CREATION, from metadata. Intake deliberately writes no
-- `user_metadata.phone` (below), so an account it minted has a NULL mirror
-- phone — and every later path that PROVES a number writes `auth.users` only:
-- verify-msg91-otp's legacy recovery branch is `updateUserById(existing.id,
-- { phone, phone_confirm: true })`, and nothing anywhere back-fills the mirror.
-- The phone-keyed arm of `claim_legacy_enrolments_for_user` then never has a
-- phone to match, and a paying TagMango customer whose legacy row carried ONLY
-- a phone receives zero entitlements. (Before intake provisioning, that login
-- CREATED the user, with the phone in metadata, and the trigger granted them.)
--
-- The naive fix — have intake write the phone into `user_metadata` — puts an
-- UNPROVEN number into the UNIQUE `public.users.phone`, which fires the
-- phone-keyed claim against somebody else's number and squats the column so its
-- real owner loses both their mirror phone and their entitlements. So the phone
-- is mirrored HERE instead: after GoTrue has recorded `phone_confirmed_at`,
-- i.e. after an OTP actually proved it. That UPDATE then fires the existing
-- `users_claim_legacy_enrolments` trigger, whose UPDATE arm is the OTP-verified
-- phone match 20260611130000 describes — the claim lands with proof.
--
-- WHAT IT DOES NOT REPAIR, and the honest limit of "the gate lifts by itself":
-- intake now writes the applicant's phone onto `auth.users` (unconfirmed), so
-- their later MSG91 login resolves through `find_login_identity` and takes
-- verify-msg91-otp's EXISTING-USER branch, which mints a session WITHOUT
-- setting `phone_confirmed_at`. This trigger does not fire for them. Their
-- email-keyed entitlements still arrive via part 5 (the magiclink that mints
-- that session confirms the email); a legacy row keyed only by a phone waits
-- for the verify-msg91-otp change flagged in part 3.
--
-- CONSERVATIVE BY CONSTRUCTION: it only ever fills a NULL (never overwrites a
-- mirror phone), it refuses a number another mirror row already owns (the
-- UNIQUE that `handle_new_user` guards the same way), and it swallows every
-- error — this runs inside GoTrue's auth transaction, and a raise here would
-- surface as an opaque login failure, which is precisely the 20260603120000
-- outage shape.

CREATE OR REPLACE FUNCTION public.sync_confirmed_phone_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when this UPDATE is what made a phone proven: either the number
  -- changed, or it just became confirmed. Re-saves of an already-confirmed,
  -- unchanged phone do nothing.
  IF NEW.phone IS NOT DISTINCT FROM OLD.phone
     AND OLD.phone_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.users u
  SET phone = NEW.phone
  WHERE u.id = NEW.id
    AND u.phone IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users o WHERE o.phone = NEW.phone AND o.id <> NEW.id
    );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never abort the auth transaction over a mirror write. The account still
  -- works; the phone is simply not mirrored, exactly as it is today.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_confirmed_phone_to_users() IS
  'Mirrors an OTP-CONFIRMED auth.users.phone into public.users.phone when that '
  'column is still NULL, so the phone-keyed legacy-entitlement claim can run '
  'with proof. Never overwrites, never steals a number another row owns, never '
  'raises into the auth transaction.';

DROP TRIGGER IF EXISTS auth_users_sync_confirmed_phone ON auth.users;
CREATE TRIGGER auth_users_sync_confirmed_phone
  AFTER UPDATE OF phone, phone_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.phone IS NOT NULL AND NEW.phone_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.sync_confirmed_phone_to_users();

-- ════════════════════════════════════════════════════════════════════════
-- 5. THE EMAIL-KEYED CLAIM, ONCE THE EMAIL IS ACTUALLY CONFIRMED
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY THIS EXISTS. Part 3's gate is worthless as a promise unless something
-- re-drives the claim after the gate lifts, and for the EMAIL arm nothing does:
-- `claim_legacy_enrolments_for_user` only allows email-keyed claims when
-- `TG_OP = 'INSERT'`, and that INSERT — `handle_new_user` mirroring the row —
-- is the exact event the gate returns early from. Every later firing is an
-- UPDATE, where `v_email_claims_ok` is false. So without this part, a paying
-- TagMango customer who applies through Tally is suppressed once and never
-- reconsidered: they sign in, prove their email, and still receive nothing.
--
-- WHAT IT DOES. Exactly one thing, for exactly the rows part 3 suppressed: when
-- `email_confirmed_at` first lands on an auth row tagged
-- `levelup_unverified_intake`, run the email-keyed half of the claim for that
-- user. No other row reaches it (every other path already ran its email claim
-- on the INSERT), and it can only ever run once per user, because it fires on
-- the NULL -> NOT NULL transition.
--
-- THE SECURITY LINE IT DOES NOT CROSS. `email_confirmed_at` is not proof that
-- the applicant typed their own address: GoTrue stamps it when a magiclink is
-- redeemed, and verify-msg91-otp mints magiclinks after a PHONE OTP. So the bar
-- this clears is "somebody proved a channel on this identity", not "somebody
-- proved this email". That is deliberately the SAME bar the shipped signup path
-- has always used — Signup.tsx proves a phone, types an email, and
-- `handle_new_user`'s INSERT claims that email's legacy rows on the spot. This
-- part restores parity for intake identities; it does not lower the bar, and
-- the gate still blocks the genuinely new case this phase introduced (a form
-- submission with NO OTP anywhere, which is what would otherwise have handed a
-- stranger's catalogue away for free). Raising the bar for BOTH paths — claim
-- only on a channel that was actually proven — is a real improvement and a
-- separate task; doing it here for one path only would leave the two
-- disagreeing.
--
-- Written fresh rather than reproduced: it carries `source = 'migration'` (the
-- value `enrolments_source_check` accepts — see 20260603120000) and the
-- `offering_id IS NOT NULL` filter from 20260524180000, because a pending
-- legacy row has no offering yet and inserting NULL would raise. It swallows
-- every error: this runs inside GoTrue's auth transaction, and a raise here
-- would surface as an opaque login failure.

CREATE OR REPLACE FUNCTION public.claim_legacy_enrolments_on_email_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only identities minted by unauthenticated intake. Everyone else already
  -- had their email-keyed claim on the public.users INSERT.
  IF COALESCE(NEW.raw_app_meta_data ->> 'levelup_unverified_intake', '') <> 'true' THEN
    RETURN NEW;
  END IF;

  -- One enrolment per DISTINCT resolved offering — 20260603120000's shape,
  -- because two legacy rows mapping to ONE offering would otherwise trip
  -- enrolments_unique_active and (here) lose the whole claim to the handler.
  INSERT INTO public.enrolments (user_id, offering_id, payment_order_id, status, source)
  SELECT NEW.id, x.offering_id, NULL, 'active', 'migration'
  FROM (
    SELECT DISTINCT le.offering_id
    FROM public.legacy_enrolments le
    WHERE le.claimed_by_user_id IS NULL
      AND le.offering_id IS NOT NULL
      AND le.email = NEW.email
      AND NOT EXISTS (
        SELECT 1 FROM public.enrolments e
        WHERE e.user_id = NEW.id AND e.offering_id = le.offering_id
      )
  ) x
  ON CONFLICT DO NOTHING;

  UPDATE public.legacy_enrolments le
  SET claimed_by_user_id = NEW.id,
      claimed_at = now()
  WHERE le.claimed_by_user_id IS NULL
    AND le.offering_id IS NOT NULL
    AND le.email = NEW.email;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never abort the auth transaction over an entitlement grant. The sign-in
  -- succeeds; the claim can be re-run by hand.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.claim_legacy_enrolments_on_email_confirm() IS
  'Runs the email-keyed legacy-entitlement claim for an intake-provisioned '
  'identity when its email is first confirmed — the claim '
  'claim_legacy_enrolments_for_user suppressed at INSERT and, being INSERT-only, '
  'would otherwise never retry. Intake-tagged rows only; never raises.';

DROP TRIGGER IF EXISTS auth_users_claim_legacy_on_email_confirm ON auth.users;
CREATE TRIGGER auth_users_claim_legacy_on_email_confirm
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (
    OLD.email_confirmed_at IS NULL
    AND NEW.email_confirmed_at IS NOT NULL
    AND NEW.email IS NOT NULL
  )
  EXECUTE FUNCTION public.claim_legacy_enrolments_on_email_confirm();

-- Reload PostgREST's schema cache so the new column and helpers are visible to
-- the typed client immediately after `db push`, rather than on the next restart.
NOTIFY pgrst, 'reload schema';

-- ── Reversal (kept for reference; do not run in the forward migration) ──
-- DROP TRIGGER IF EXISTS auth_users_claim_legacy_on_email_confirm ON auth.users;
-- DROP FUNCTION IF EXISTS public.claim_legacy_enrolments_on_email_confirm();
-- DROP TRIGGER IF EXISTS auth_users_sync_confirmed_phone ON auth.users;
-- DROP FUNCTION IF EXISTS public.sync_confirmed_phone_to_users();
-- (claim_legacy_enrolments_for_user: re-apply the body from
--  20260611130000_unbrick_onboarding_for_shipped_clients.sql to drop the gate.)
-- DROP POLICY IF EXISTS "claimants_read_pending_applications" ON public.cohort_applications;
-- DROP FUNCTION IF EXISTS public.auth_identity_email();
-- DROP FUNCTION IF EXISTS public.auth_identity_phone10();
-- DROP INDEX IF EXISTS public.idx_cohort_apps_pending_claim;
-- ALTER TABLE public.cohort_applications DROP COLUMN IF EXISTS pending_claim;
