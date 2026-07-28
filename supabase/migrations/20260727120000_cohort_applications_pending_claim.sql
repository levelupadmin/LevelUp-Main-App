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
--   2. A DISCOVERY RPC so the CLAIMANT (and only the claimant) can find their
--      parked row — and learns from it only that it exists, never its contents.
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

-- The claim path scans `WHERE pending_claim AND user_id IS NULL ORDER BY
-- created_at DESC` — inside `get_my_pending_claim()` (part 2), which the client
-- calls with NO arguments at all. The matching is done in that function against
-- the caller's own stored identity, so the query surface is not an enumeration
-- oracle. This index is built for THAT predicate and that ordering, and nothing
-- else.
--
-- It is PARTIAL on exactly the two flags the scan fixes, so it holds only the
-- vanishing fraction of rows that are actually parked; the function's
-- normalised comparisons then run over that handful of rows rather than the
-- table. (A plain btree on the raw `(email, phone)` columns would be dead
-- weight: the comparison is `lower(btrim(email))` and
-- `right(regexp_replace(phone, …), 10)`, which no index on the raw columns can
-- answer, and it ORs the two, which no composite index can serve either.)
DROP INDEX IF EXISTS public.idx_cohort_apps_pending_claim;
CREATE INDEX IF NOT EXISTS idx_cohort_apps_pending_claim
  ON public.cohort_applications (created_at DESC)
  WHERE pending_claim AND user_id IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 2. DISCOVERY — the claimant learns their row EXISTS, and nothing else
-- ════════════════════════════════════════════════════════════════════════
--
-- THE PROBLEM. `students_read_own_applications` is `user_id = auth.uid()`, and
-- a pending row has `user_id` NULL by construction. So the one person who must
-- see it — the signed-in claimant — is precisely the person it hides it from,
-- and S-4 cannot function. (`admin_manage_applications` is unaffected: admins
-- already see every row. Neither existing policy is touched below.)
--
-- WHY THIS IS NOT AN RLS POLICY, though an earlier revision of this file made it
-- one (`claimants_read_pending_applications`, dropped at the end of this part).
-- A permissive SELECT policy grants the WHOLE ROW, and `cohort_applications` is
-- a WIDE table:
--   • `bio` is the applicant's 100-word essay. NFR-COPY-1 is categorical — the
--     essay text is never surfaced in any UI — and a policy that hands it to the
--     client has already broken that before any component is written.
--   • `tally_data` is the raw submission, essay included, plus every other
--     answer the form ever collects.
--   • `city` and `occupation` ride along too.
-- The narrow `select=` list the client happened to send was never the gate: the
-- POLICY is the gate, and any holder of a session could have asked PostgREST for
-- `select=*` on the same rows instead.
--
-- And it granted all of that PRE-CLAIM, on a SINGLE-channel match. The entire
-- premise of parking a collision is that we do NOT yet know the row is the
-- caller's — that is why intake refused to stamp `user_id`. A caller who matched
-- only on the phone could read the SUBMITTER's email, city, occupation and
-- essay: precisely the disclosure the collision defer exists to prevent, handed
-- over by the mechanism meant to resolve it.
--
-- THE REPLACEMENT is the shape phase DC uses for public admission reads: a
-- SECURITY DEFINER function WHOSE SELECT LIST IS THE WHITELIST. There is no
-- `select=*` against a function. It answers five values — the application id,
-- its offering and title, the channel still to prove, and a MASK of that
-- channel's target — and it can answer nothing else, because nothing else is
-- named in it. No `bio`, no `tally_data`, no `city`, no `occupation`, and never
-- a counterpart identifier in full.
--
-- THE CONSTRAINT ON MATCHING is unchanged and still the load-bearing one. The
-- match must be made on the caller's OWN identity as recorded on `auth.users`,
-- never on a value the client supplies — a function that took the email as an
-- ARGUMENT would let anyone probe for any applicant by guessing addresses. So
-- the two helpers below take NO arguments: they read `auth.users` for
-- `auth.uid()` and return the caller's own keys, normalised the same way
-- `find_login_identity` normalises them (lower/trimmed email; last-10 subscriber
-- digits for phone). There is no input to poison, and a caller invoking them
-- directly learns only their own email/phone, which they already know.
--
-- WHY SECURITY DEFINER AT ALL. `authenticated` has no SELECT on `auth.users`,
-- so an inline `EXISTS (SELECT 1 FROM auth.users …)` would fail with permission
-- denied for every caller. STABLE so the planner evaluates each once per
-- statement rather than once per row.
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

-- `anon` KEEPS ITS GRANT. Nothing on the anonymous path calls these any more
-- (the policy that did is dropped below, and `get_my_pending_claim()` is
-- `authenticated`-only), so this is no longer load-bearing — but revoking it
-- would be a permission change with no security value: for `anon`, `auth.uid()`
-- is NULL, both helpers match no row and return NULL, so an anonymous caller
-- learns exactly nothing by invoking them. Left granted so the helpers keep the
-- shape any future RLS predicate would need, rather than reintroducing the
-- latent, data-dependent 42501 that withholding EXECUTE used to cause.
GRANT EXECUTE ON FUNCTION public.auth_identity_email() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_identity_phone10() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.auth_identity_email() IS
  'The CALLER''s own auth.users email, lower/trimmed. Argument-free by design: '
  'RLS must match on the signed-in identity, never on a client-supplied value. '
  'Returns NULL for anon (no auth.uid()), which is why anon may execute it.';
COMMENT ON FUNCTION public.auth_identity_phone10() IS
  'The CALLER''s own auth.users phone as last-10 subscriber digits (same key as '
  'find_login_identity). Argument-free by design; see auth_identity_email().';

-- ── THE DISCOVERY FUNCTION ───────────────────────────────────────────────
--
-- WHAT EACH RETURNED VALUE IS FOR, and why nothing else is here:
--   application_id — the claim route's parameter (`/claim/:applicationId`) and
--                    the id the attach endpoint takes. Unavoidable, and it is
--                    already an opaque uuid.
--   offering_id    — so the applicant card can scope the offering it names.
--   offering_title — so the card can say WHICH cohort ("Your application to X"),
--                    which is public catalogue copy, not applicant data.
--   claim_channel  — 'email' | 'phone': the channel the caller must still PROVE.
--   masked_target  — a recognisable stub of that channel's target, so the user
--                    knows which address/number to type. Never the value itself.
--
-- DERIVED, NEVER ACCEPTED. `claim_channel` is computed here from the caller's
-- own `auth.users` row: it is the channel on the parked row their identity does
-- NOT already match. It is not a parameter, and this function takes none. Asking
-- a caller which channel they intend to prove is the replay
-- `_shared/identity.ts#canClaim` warns about — proving a channel you ALREADY
-- hold resolves a collision by asserting the very thing in doubt. (The attach
-- endpoint re-derives it from the JWT before it trusts anything; this value is
-- the UI's copy of that derivation, and it must agree with it.)
--
-- WHAT IS DELIBERATELY NOT RETURNED, and cannot be asked for:
--   • `bio` — the 100-word essay (NFR-COPY-1: never in any UI, and this is the
--     layer where "never" is actually enforceable);
--   • `tally_data` — the raw submission, which contains the essay again;
--   • `city`, `occupation`, `full_name`, `status`, and every other column;
--   • the counterpart identifier IN FULL. A caller who matched on their phone
--     gets `r•••@gmail.com`, not the address — enough to recognise their own,
--     useless as a disclosure of somebody else's.
--
-- ROWS IT REFUSES TO RETURN AT ALL:
--   • BOTH channels already the caller's — there is no channel left to prove, so
--     no OTP could ever attach it. (The client used to compute this refusal
--     itself; it is here now, where it is a property of the data rather than of
--     a component.)
--   • The second channel BLANK on the row — the `email_taken`-with-no-usable-
--     phone case part 1 flags. Nothing to send a code to; it needs a human, and
--     surfacing it would be a code entry that cannot succeed.
--   • NEITHER channel matching the caller — i.e. everyone else's parked rows,
--     which is the whole point.
--
-- SECURITY DEFINER because the body reads `auth.users` (through the helpers) and
-- must see rows `students_read_own_applications` hides. STABLE, and search_path
-- pinned, exactly as the helpers are.
DROP FUNCTION IF EXISTS public.get_my_pending_claim();

CREATE FUNCTION public.get_my_pending_claim()
RETURNS TABLE (
  application_id  uuid,
  offering_id     uuid,
  offering_title  text,
  claim_channel   text,
  masked_target   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH caller AS (
    -- Zero rows for an anonymous caller, which makes the CROSS JOIN below empty
    -- and the whole function return nothing — the `auth.uid() IS NOT NULL` gate,
    -- expressed as a row count rather than a predicate that could be forgotten.
    SELECT
      public.auth_identity_email()   AS ident_email,
      public.auth_identity_phone10() AS ident_phone10
    WHERE auth.uid() IS NOT NULL
  ),
  parked AS (
    SELECT
      a.id          AS app_id,
      a.offering_id AS app_offering_id,
      a.created_at  AS app_created_at,
      -- Lower/trimmed like `find_login_identity`, so the mask below is
      -- deterministic for a given address however the form recorded its case.
      NULLIF(lower(btrim(COALESCE(a.email, ''))), '') AS row_email,
      NULLIF(regexp_replace(COALESCE(a.phone, ''), '\D', '', 'g'), '') AS row_digits,
      -- The same two comparisons the dropped policy made, with the same
      -- normalisation as `find_login_identity`.
      (
        NULLIF(btrim(COALESCE(a.email, '')), '') IS NOT NULL
        AND c.ident_email IS NOT NULL
        AND lower(btrim(a.email)) = c.ident_email
      ) AS proven_email,
      (
        length(regexp_replace(COALESCE(a.phone, ''), '\D', '', 'g')) >= 10
        AND c.ident_phone10 IS NOT NULL
        AND right(regexp_replace(a.phone, '\D', '', 'g'), 10) = c.ident_phone10
      ) AS proven_phone
    FROM caller c
    CROSS JOIN public.cohort_applications a
    WHERE a.pending_claim
      AND a.user_id IS NULL
  )
  SELECT
    p.app_id          AS application_id,
    p.app_offering_id AS offering_id,
    o.title           AS offering_title,
    -- Exactly one of the two is proven here (see the WHERE below), so the
    -- unproven one is the channel to ask for.
    (CASE WHEN p.proven_email THEN 'phone' ELSE 'email' END)::text AS claim_channel,
    (CASE
      WHEN p.proven_email
        -- Last 4 subscriber digits, nothing before them. Enough to recognise a
        -- number you own; useless for reconstructing one you do not.
        THEN '••••••' || right(p.row_digits, 4)
      WHEN position('@' IN p.row_email) > 1
        -- First character + the domain: the shape people recognise their own
        -- address by, with the local part gone.
        THEN left(p.row_email, 1) || '•••@' || split_part(p.row_email, '@', 2)
      -- No '@' to split on (an address this malformed cannot receive a code
      -- anyway): still mask rather than return whatever is stored.
      ELSE left(p.row_email, 1) || '•••'
    END)::text AS masked_target
  FROM parked p
  LEFT JOIN public.offerings o ON o.id = p.app_offering_id
  WHERE
    -- Exactly one channel proven: not zero (not the caller's row) and not both
    -- (nothing left to prove).
    (p.proven_email <> p.proven_phone)
    -- ...and the OTHER channel is actually present, or no code could be sent.
    AND (
      (p.proven_email AND length(p.row_digits) >= 10)
      OR (p.proven_phone AND p.row_email IS NOT NULL)
    )
  ORDER BY p.app_created_at DESC
$$;

REVOKE ALL ON FUNCTION public.get_my_pending_claim() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_pending_claim() TO authenticated;

COMMENT ON FUNCTION public.get_my_pending_claim() IS
  'Discovery for the interactive claim (phase SP / S-4): the unclaimed '
  'pending_claim rows carrying ONE of the signed-in caller''s own auth.users '
  'identifiers, as (application_id, offering_id, offering_title, claim_channel, '
  'masked_target) and nothing else. The SELECT list IS the whitelist — bio (the '
  '100-word essay, NFR-COPY-1), tally_data, city, occupation and the raw '
  'counterpart identifier are unreachable through it. claim_channel is DERIVED '
  'from the caller''s own identity, never passed in. Attaching a row (stamping '
  'user_id) stays a service_role write behind a second-channel OTP.';

-- THE POLICY THIS REPLACES. `claimants_read_pending_applications` granted
-- whole-row SELECT on a wide table to any signed-in caller matching on ONE
-- channel — see the header above. Dropped unconditionally: `IF EXISTS` makes
-- this safe on a database that never had it, and dropping it is the only reason
-- the function above is a fix rather than a second door.
DROP POLICY IF EXISTS "claimants_read_pending_applications" ON public.cohort_applications;

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
-- 5. THE EMAIL-KEYED CLAIM — DELIBERATELY NOT SHIPPED
-- ════════════════════════════════════════════════════════════════════════
--
-- An earlier revision of this migration added
-- `claim_legacy_enrolments_on_email_confirm()`, an AFTER UPDATE OF
-- email_confirmed_at trigger that ran the email-keyed legacy claim for
-- intake-tagged identities. IT IS REMOVED. Do not reinstate it without
-- reading this note.
--
-- ITS OWN DEFENCE WAS THE BUG. That revision argued the trigger only matched
-- the bar the shipped signup path already used — Signup.tsx proves a phone,
-- types an email, and `handle_new_user`'s INSERT claims that email's legacy
-- rows — so restoring the behaviour for intake identities lowered nothing.
--
-- THAT PARITY CLAIM IS FALSE, and it was checked against production rather
-- than reasoned about (2026-07-28, project ivkvluezuiojovpotlyb):
--   • The live `claim_legacy_enrolments_for_user` inserts
--     `source = 'tagmango_migration'`. `enrolments_source_check` accepts only
--     (checkout, admin_grant, admin_manual, bulk_import, migration, manual,
--     import, free). `enrolments.offering_id` is NOT NULL and the live body
--     carries no `offering_id IS NOT NULL` filter.
--   • It is an AFTER trigger with no EXCEPTION handler, so ANY match raises
--     and ABORTS the transaction. The shipped signup path therefore grants
--     nothing at all — it fails closed, loudly, and has since 2026-06-11.
--   • Measured: signups since 2026-04 whose phone matches an unclaimed
--     legacy row = 0, 0, 0 by month, against 7 / 139 / 102 that match none.
--     Zero legacy customers have completed signup in three months.
--
-- So the "existing" email-keyed claim is not a precedent — it is an outage.
-- The removed trigger was written correctly (valid `source`, the
-- `offering_id IS NOT NULL` filter, an EXCEPTION handler), which is precisely
-- what made it dangerous: it would have been the FIRST WORKING email-keyed
-- claim on an address nobody proved. `email_confirmed_at` is not email proof —
-- GoTrue stamps it on any magiclink redemption, and verify-msg91-otp mints a
-- magiclink after a PHONE OTP (index.ts mintSession → generateLink +
-- verifyOtp). The full chain was: submit this form with {a paying customer's
-- address, your own number} → one OTP on your own number → their entire
-- unclaimed catalogue, with `claimed_by_user_id` stamped so they can never
-- recover it. Shipping a gate (part 3) and its bypass in one file is not a
-- defensible state.
--
-- WHAT REPLACES IT. Nothing here. Claiming on PROOF belongs to the
-- claim-at-verified-sign-in work (branch feat/student-entitlements,
-- 20260727220000_claim_at_signin.sql), which deletes the signup-time claim
-- outright and re-drives it from a confirmed phone. That is the correct layer:
-- one claim path, gated on a channel the server itself confirmed, rather than
-- two paths disagreeing about what counts as proof.
--
-- THE ACCEPTED COST, stated plainly: an intake-provisioned identity that is
-- also a legacy customer receives no automatic entitlement until that work
-- lands. A stuck entitlement is recoverable by a scripted claim; a stolen one,
-- with `claimed_by_user_id` stamped, is not.

-- ════════════════════════════════════════════════════════════════════════
-- 6. THE DEPLOY-ORDER PROBE
-- ════════════════════════════════════════════════════════════════════════
--
-- `tally-application-poll` is a LIVE cron function. If it is deployed before
-- this migration is applied, it mints intake-tagged auth users while part 3's
-- gate does not yet exist — and the email-keyed claim in
-- `claim_legacy_enrolments_for_user` then runs on an address nobody proved and
-- stamps `claimed_by_user_id` PERMANENTLY. That is the one irreversible step in
-- the whole sequence, and "apply the migration first" is a runbook line, not a
-- control.
--
-- This is the control. The poller calls this RPC once per invocation and mints
-- NOTHING unless it returns true. It exists only in this migration, so a
-- missing function (PGRST202) and an erroring one are the same answer — the
-- probe fails CLOSED, and applications still insert unlinked, which is the
-- recoverable outcome.

CREATE OR REPLACE FUNCTION public.intake_provisioning_gate_ok()
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$ SELECT true $$;

REVOKE ALL ON FUNCTION public.intake_provisioning_gate_ok() FROM public;
GRANT EXECUTE ON FUNCTION public.intake_provisioning_gate_ok() TO service_role;

COMMENT ON FUNCTION public.intake_provisioning_gate_ok() IS
  'Existence probe, service_role only. Returns true iff '
  '20260727120000_cohort_applications_pending_claim.sql is applied, which is '
  'what tells tally-application-poll that part 3''s gate is in place and it is '
  'safe to mint an intake identity. Deliberately trivial: the ANSWER is its '
  'existence, not its body.';

-- ════════════════════════════════════════════════════════════════════════
-- 4a. PROMOTE THE STASHED INTAKE PHONE — ONLY ONCE IT IS PROVEN
-- ════════════════════════════════════════════════════════════════════════
--
-- The poller stashes the applicant's number in
-- `app_metadata.levelup_intake_phone` and NEVER writes `auth.users.phone`,
-- because that column is the phone-OTP login key: `find_login_identity`
-- (20260603120000) matches it on the last 10 digits with no
-- `phone_confirmed_at` predicate, so an unproven value there lets a form
-- submission bind a stranger's number to an account the submitter controls.
--
-- This promotes the stash onto the real column at the only moment it is safe:
-- when a `phone_confirmed_at` lands on THIS row, i.e. the holder has actually
-- passed an OTP on that number. Within-row by construction — it never looks up
-- another row's metadata, so confirming a number can only ever promote it onto
-- the identity that just proved it.

CREATE OR REPLACE FUNCTION public.sync_intake_phone_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_stash text;
BEGIN
  v_stash := NULLIF(btrim(COALESCE(NEW.raw_app_meta_data ->> 'levelup_intake_phone', '')), '');
  IF v_stash IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only when the number just proven IS the stashed one. A different confirmed
  -- number means the applicant proved something else; the stash stays inert
  -- rather than overwriting a proven value with an unproven one.
  IF right(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), 10)
     IS DISTINCT FROM right(regexp_replace(v_stash, '\D', '', 'g'), 10) THEN
    RETURN NEW;
  END IF;

  -- Proven and matching: the stash has done its job. Clear it so this can never
  -- re-fire, and so no unproven value lingers in metadata.
  UPDATE auth.users u
  SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) - 'levelup_intake_phone'
  WHERE u.id = NEW.id;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never abort the auth transaction over a metadata tidy-up.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_intake_phone_on_confirm() IS
  'Retires app_metadata.levelup_intake_phone once GoTrue has confirmed that '
  'same number on the same row. The phone is never written to auth.users.phone '
  'by intake; GoTrue itself owns that column, and this only clears the stash '
  'so an unproven number does not linger. Never raises into auth.';

DROP TRIGGER IF EXISTS auth_users_sync_intake_phone ON auth.users;
CREATE TRIGGER auth_users_sync_intake_phone
  AFTER UPDATE OF phone_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.phone_confirmed_at IS NULL AND NEW.phone_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.sync_intake_phone_on_confirm();

-- Reload PostgREST's schema cache so the new column and helpers are visible to
-- the typed client immediately after `db push`, rather than on the next restart.
NOTIFY pgrst, 'reload schema';

-- ── Reversal (kept for reference; do not run in the forward migration) ──
-- DROP TRIGGER IF EXISTS auth_users_sync_intake_phone ON auth.users;
-- DROP FUNCTION IF EXISTS public.sync_intake_phone_on_confirm();
-- DROP FUNCTION IF EXISTS public.intake_provisioning_gate_ok();
-- DROP TRIGGER IF EXISTS auth_users_sync_confirmed_phone ON auth.users;
-- DROP FUNCTION IF EXISTS public.sync_confirmed_phone_to_users();
-- (claim_legacy_enrolments_for_user: re-apply the body from
--  20260611130000_unbrick_onboarding_for_shipped_clients.sql to drop the gate.)
-- DROP FUNCTION IF EXISTS public.get_my_pending_claim();
-- (`claimants_read_pending_applications` needs NOTHING here: the forward
--  migration DROPs it and never creates it, so there is nothing to undo. Do not
--  "restore" it — it is the whole-row leak this file replaced.)
-- DROP FUNCTION IF EXISTS public.auth_identity_email();
-- DROP FUNCTION IF EXISTS public.auth_identity_phone10();
-- DROP INDEX IF EXISTS public.idx_cohort_apps_pending_claim;
-- ALTER TABLE public.cohort_applications DROP COLUMN IF EXISTS pending_claim;
