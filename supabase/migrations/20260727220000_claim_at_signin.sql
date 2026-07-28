-- ============================================================================
-- PHASE SC-1 — Purchases attach at VERIFIED SIGN-IN, never at signup.
-- ============================================================================
--
-- THE RULE (design/briefs/students-signin-claim.md):
--   A student's already-in-the-system purchases are claimed when they SIGN IN
--   with a phone the server itself confirmed — never at signup, where the
--   account row is written BEFORE any code is verified.
--
-- WHY THE SIGNUP-TIME CLAIM CANNOT BE REPAIRED IN PLACE
--   `claim_legacy_enrolments_for_user` runs as AFTER INSERT OR UPDATE OF
--   phone, email ON public.users. An exception in an AFTER trigger ABORTS THE
--   TRANSACTION, so its failures never merely skipped a claim — they blocked
--   the signup (production outage since 2026-06-11: source='tagmango_migration'
--   violates enrolments_source_check, and NULL offering_id violates NOT NULL).
--   Five revisions tried to make the claim safe at a moment when identity is
--   not yet proven. Every gate available there is either forgeable
--   (public.users.phone, carried from options.data), inert
--   (auth.users.phone_confirmed_at — GoTrue sets it in a LATER UPDATE;
--   measured 242/242 rows confirmed AFTER insert, zero at the same instant),
--   or dialect-mismatched ('+91…' vs '91…', matching 0 of 73,926 rows).
--   So this migration DELETES the claim from signup instead of fixing it.
--   No constraint can be violated by a statement that no longer runs.
--
-- ⚠️ 20260727213000_fix_student_claim_trigger.sql was SUPERSEDED BY THIS FILE
--   and has been DELETED. It was safe to delete rather than leave on disk:
--   `supabase migration list` against ivkvluezuiojovpotlyb showed it absent
--   from the remote table entirely, so no environment had applied it and
--   nothing depends on it. `db push` therefore applies exactly two files —
--   this one and 20260728010000 — both of which must go out together (see the
--   deploy note at the foot). Read this file alone to know the end state.
--
-- ── Documented, NOT silently shipped (the brief's two out-of-scope items) ──
--   These belong here because no other task in this phase delivers them.
--
--   (a) 485 legacy_enrolments rows / 384 people hold `foreign:<digits>:<handle>`
--       placeholders instead of phone numbers. They are reachable by NO phone
--       key at all: neither claim_my_purchases() below nor the granter can ever
--       match them, by design — digit-stripping a placeholder mints a 10-digit
--       key that can COLLIDE with a real subscriber and stamp
--       claimed_by_user_id PERMANENTLY. This is paid entitlement and it needs a
--       one-off ADMIN BACKFILL, filed as a follow-up. It is not guessed at
--       here. Note they are no worse off than under today's outage, in which
--       nobody claims anything, so it does not block this fix.
--
--   (b) GUEST-CHECKOUT BUYERS MAY CLAIM NOTHING UNTIL THEY SIGN IN WITH MSG91.
--       All three payment paths — razorpay-webhook:112-119,
--       verify-razorpay-payment:412-419, guest-create-order:248-255 — call
--       createUser with NO top-level phone and then set it in a later
--       `.from("users").update({ phone })`. That writes the public.users mirror
--       only; auth.users.phone stays NULL and phone_confirmed_at stays NULL.
--       Under the confirmed-phone gate below such a caller claims zero rows
--       until they sign in with MSG91, at which point verify-msg91-otp creates
--       or updates them with phone_confirm:true (index.ts:266-272) and the very
--       next call claims everything. THIS IS THE INTENDED CONSEQUENCE OF THE
--       GATE, NOT AN OVERSIGHT: the alternative is trusting a service-role-
--       written, never-OTP-verified phone as ownership proof, which is exactly
--       the forgeable-identity class this whole phase exists to remove. The
--       claim is idempotent and runs on every sign-in, so nothing is lost —
--       only deferred to the moment the phone is actually proven.
--
--   (c) THE CONFIRMED-PHONE GATE IS NOT GUARANTEED BY THE SIGN-IN PATH ITSELF.
--       verify-msg91-otp sets phone_confirm:true only on the branches that
--       CREATE or repair an account (index.ts:266-272 and the email-collision
--       branch at :288-292). The EXISTING-USER branch (index.ts:187-200) mints
--       a session via mintSession and returns without ever calling
--       updateUserById({ phone_confirm: true }), and the lookup it uses,
--       find_login_identity (20260603120000_legacy_login_fix.sql:82-88),
--       matches purely on the last 10 digits of auth.users.phone with NO
--       phone_confirmed_at filter. So an auth row with a phone set and
--       phone_confirmed_at NULL — precisely what signInWithOtp({ phone })
--       mints, the path the granter's comment below calls one deploy away from
--       live — would take that branch, get a valid session, and then claim
--       NOTHING here, forever, with no error surfaced. Measured zero such rows
--       today (242 auth phones set, 0 unconfirmed), so this is LATENT, not
--       live, and it fails CLOSED (a real owner claims nothing; nobody claims
--       someone else's purchases). The fix belongs in the auth path, not here:
--       filed as a follow-up to add `AND phone_confirmed_at IS NOT NULL` to
--       find_login_identity, or to confirm the phone on the existing-user
--       branch after MSG91 verification. Do not weaken the gate below to
--       compensate — that would reintroduce asserted-phone claiming.
--
-- Additive, idempotent (CREATE OR REPLACE), reversible (undo at the foot of
-- this file), and contains NO `RAISE EXCEPTION` — it must never abort a
-- `db push`, and nothing it installs may ever abort a signup or a sign-in.

-- ────────────────────────────────────────────────────────────────────────────
-- 1/3 — NEUTER the signup-time claim.
--
-- The trigger `users_claim_legacy_enrolments` is deliberately NOT dropped: the
-- rollback stays a one-function CREATE OR REPLACE, and no other object's
-- existence assumptions change. The trigger still fires; it just does nothing.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_legacy_enrolments_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- INTENTIONALLY EMPTY. Claiming moved to public.claim_my_purchases(), which
  -- runs after a verified sign-in where the phone is already confirmed.
  --
  -- Do not reinstate a claim here. This runs on an AFTER trigger during signup:
  --   * anything it raises aborts the signup transaction (that was the outage);
  --   * the only identity available at this instant is ASSERTED, not proven —
  --     the auth row is written before the OTP is even sent.
  -- The trigger is left attached so re-enabling or reverting is a single
  -- CREATE OR REPLACE with no schema change.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.claim_legacy_enrolments_for_user() IS
  'NEUTERED 2026-07-27. Returns NEW and nothing else. Purchases now attach at verified sign-in via public.claim_my_purchases(); a claim at signup acts on an unproven phone and, being in an AFTER trigger, could abort the signup transaction (production outage 2026-06-11 to 2026-07-27). The trigger users_claim_legacy_enrolments is left attached on purpose so this is reversible with one CREATE OR REPLACE.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2/3 — THE CLAIM, at verified sign-in.
--
-- Zero-arg, SECURITY DEFINER, keyed on auth.uid(). The client calls it after a
-- real SIGNED_IN event (SC-2) and ignores the result on failure.
--
-- Why each gate is the right one HERE, having been wrong at signup:
--   * phone_confirmed_at IS NOT NULL — inert at signup because GoTrue confirms
--     in a later UPDATE (242/242 measured), but on the account-creating and
--     account-repairing MSG91 branches confirmation happens as part of
--     verification (phone_confirm:true, index.ts:266-272 / :288-292), so by
--     sign-in time it is exactly the ownership proof we need. It is NOT
--     universally guaranteed by the sign-in path — see item (c) above for the
--     existing-user branch, which is a latent, fail-closed gap tracked as a
--     follow-up, not a reason to weaken this predicate.
--   * public.users.deleted_at IS NULL — soft-delete NULLs the public.users
--     phone/email but PRESERVES auth.users.phone (11 of 11 soft-deleted users
--     still carry one), and `cleanup_deleted_users` is NOT scheduled (prod has
--     exactly two cron jobs, neither of them it), so the auth row is never hard
--     deleted, ON DELETE SET NULL never fires, and a wrong stamp is permanent.
--   * canonicalisation to '+91XXXXXXXXXX' — GoTrue strips the '+', so
--     auth.users.phone is '91XXXXXXXXXX' (241 of 242 rows) while
--     legacy_enrolments.phone is '+91XXXXXXXXXX'. A raw compare matches ZERO of
--     73,926 rows: it would look like a clean success and grant nothing.
--
-- Idempotent: the INSERT is guarded by NOT EXISTS(ANY enrolment for this
-- user+offering, whatever its status) plus a targetless ON CONFLICT DO NOTHING,
-- and the stamping UPDATE marks only rows the caller now holds an ACTIVE
-- enrolment for. A second call is a no-op returning
-- {"claimed": 0, "stamped": 0, "blocked": 0}.
--
-- Returns BOTH counters because they can legitimately differ: a caller who
-- already holds an active enrolment for an offering (e.g. they re-bought through
-- checkout) has the INSERT suppressed by the NOT EXISTS guard, yet the legacy
-- row is still stamped claimed — permanently. Reporting only the INSERT count
-- would log {"claimed": 0} for a call that changed state, and SC-2's log is the
-- only observable signal that this 73,865-row migration is actually landing.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_my_purchases()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- auth.users is fully qualified below, so the path stays narrow.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id    uuid;
  v_auth_phone text;
  v_confirmed  boolean := false;
  v_digits     text;
  v_phone_norm text;
  v_claimed    integer := 0;
  v_stamped    integer := 0;
  v_blocked    integer := 0;
BEGIN
  -- Best effort throughout. A failed claim must never break a sign-in.
  BEGIN
    -- auth.uid() is resolved INSIDE this block, never as a DECLARE initialiser:
    -- initialisers run before the handler is armed, and auth.uid() casts a JWT
    -- claim to uuid ((… ->> 'sub')::uuid), which raises 22P02 on a malformed
    -- 'sub'. Evaluated here it degrades to a zero result like every other
    -- failure, so "never raises" holds for the whole function body.
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0);
    END IF;

    -- Live account only. A soft-deleted caller keeps a usable auth phone, so
    -- without this a deleted account could stamp a live buyer's purchases.
    PERFORM 1
      FROM public.users u
     WHERE u.id = v_user_id
       AND u.deleted_at IS NULL;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0);
    END IF;

    -- Trust the AUTH row, never the public.users mirror, which carries
    -- attacker-supplied signup metadata (options.data.phone).
    SELECT au.phone, au.phone_confirmed_at IS NOT NULL
      INTO v_auth_phone, v_confirmed
      FROM auth.users au
     WHERE au.id = v_user_id;

    -- COALESCE because SELECT INTO leaves the flag NULL when no auth row
    -- matched, and NULL would fall through the NOT below.
    IF NOT COALESCE(v_confirmed, false) OR v_auth_phone IS NULL THEN
      -- nothing proven to match on
      RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0);
    END IF;

    -- Canonicalise to the '+91XXXXXXXXXX' form legacy_enrolments stores.
    v_digits := regexp_replace(v_auth_phone, '\D', '', 'g');
    IF length(v_digits) = 10 THEN
      v_phone_norm := '+91' || v_digits;
    ELSIF length(v_digits) = 12 AND v_digits LIKE '91%' THEN
      v_phone_norm := '+' || v_digits;
    ELSE
      v_phone_norm := v_auth_phone;   -- non-Indian numbers pass through
    END IF;

    -- source='migration': enrolments_source_check allows checkout /
    -- admin_grant / admin_manual / bulk_import / migration / manual / import /
    -- free. It REJECTS 'tagmango_migration' (verified — that 23514 was the
    -- outage), and 'migration' is what the sibling granter already writes for
    -- this same population, so it is the only non-conflating legal value.
    -- offering_id IS NOT NULL: enrolments.offering_id is NOT NULL and 779
    -- unclaimed legacy rows carry a null offering; ON CONFLICT DO NOTHING
    -- suppresses UNIQUE violations only, never 23502.
    INSERT INTO public.enrolments (user_id, offering_id, payment_order_id, status, source)
    SELECT v_user_id, le.offering_id, NULL, 'active', 'migration'
      FROM public.legacy_enrolments le
     WHERE le.claimed_by_user_id IS NULL
       AND le.offering_id IS NOT NULL
       AND le.phone = v_phone_norm
       -- Only an ACTIVE enrolment blocks the grant. This mirrors the shape of
       -- enrolments_unique_active, the PARTIAL unique index ON
       -- (user_id, offering_id) WHERE status = 'active'
       -- (20260408150300_enrolments_unique_active.sql:38-40), so the guard and
       -- the constraint agree exactly: if no active row exists, no unique
       -- violation is possible and the INSERT is safe.
       --
       -- Do NOT widen this to "any status". Non-active rows are produced by
       -- process-refund/index.ts:119 (status='cancelled') and admin-api
       -- /index.ts:299 enrolments.revoke (status='revoked'), and that partial
       -- index's own comment (20260408150300:36-37) states the intent
       -- verbatim: cancelled/expired rows do not count, so users can
       -- legitimately re-enrol after cancellation. A status-blind guard would
       -- SKIP the grant while the stamping UPDATE below still marks the legacy
       -- row claimed, and once claimed_by_user_id is non-NULL neither this
       -- function (le.claimed_by_user_id IS NULL) nor the mapping granter
       -- (NEW.claimed_by_user_id IS NULL) can ever retry it — permanent,
       -- admin-SQL-only data loss, and it would break the self-healing
       -- property that makes running this on every sign-in worthwhile.
       --
       -- SO THE GUARD IS STATUS-BLIND *AND* THE STAMP IS NOT. Both halves are
       -- required and neither works alone:
       --   * ANY existing enrolment blocks the grant. enrolments_status_check
       --     permits active/expired/revoked/cancelled; process-refund writes
       --     'cancelled' and admin-api writes 'revoked', and both are
       --     DELIBERATE end-states. Guarding only on 'active' lets a refunded
       --     student mint a fresh active row on their next sign-in and silently
       --     regain the course — with no audit row, and in bulk across 1,067
       --     mappings the moment one lands.
       --   * The stamping UPDATE below therefore marks ONLY rows this caller
       --     now actually holds an ACTIVE enrolment for. A blocked row stays
       --     claimed_by_user_id IS NULL, so it remains claimable by this
       --     function AND by the mapping granter if the refund is ever
       --     reversed. Skipping the grant while stamping anyway would be
       --     permanent, admin-SQL-only data loss.
       AND NOT EXISTS (
         SELECT 1 FROM public.enrolments e
          WHERE e.user_id = v_user_id
            AND e.offering_id = le.offering_id
       )
    -- Duplicate source rows: 2,329 (phone, offering_id) groups in
    -- legacy_enrolments hold 2,620 extra rows, so this SELECT can yield the
    -- same (user, offering) twice in ONE statement. ON CONFLICT DO NOTHING
    -- (no target, so every unique index arbitrates, including the partial
    -- enrolments_unique_active) skips the repeat instead of raising — the
    -- "cannot affect row a second time" error is DO UPDATE only.
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_claimed = ROW_COUNT;

    -- Stamp ONLY what this caller now actually holds an ACTIVE enrolment for.
    -- claimed_by_user_id is permanent (cleanup_deleted_users is not scheduled
    -- and there is no unstamp path), so a row must never be marked claimed
    -- unless the claim genuinely landed. Two kinds of row are deliberately left
    -- NULL and therefore still claimable on a later sign-in:
    --   * a NULL-offering row (unmapped purchase) — so
    --     grant_enrolment_after_offering_resolved can still serve it when the
    --     mapping lands; that granter requires claimed_by_user_id IS NULL;
    --   * a row whose grant was BLOCKED above by a refunded/revoked/expired
    --     enrolment — so reversing the refund restores the path instead of
    --     needing admin SQL.
    UPDATE public.legacy_enrolments le
       SET claimed_by_user_id = v_user_id,
           claimed_at         = now()
     WHERE le.claimed_by_user_id IS NULL
       AND le.offering_id IS NOT NULL
       AND le.phone = v_phone_norm
       AND EXISTS (
         SELECT 1 FROM public.enrolments e
          WHERE e.user_id = v_user_id
            AND e.offering_id = le.offering_id
            AND e.status = 'active'
       );

    -- Counted separately from the INSERT: the UPDATE's guard is EXISTS(ACTIVE)
    -- while the INSERT's is NOT EXISTS(ANY), so it also stamps rows whose active
    -- enrolment already existed. stamped >= claimed always, and stamped > 0 with
    -- claimed = 0 is the "already entitled, now reconciled" case, not a no-op.
    GET DIAGNOSTICS v_stamped = ROW_COUNT;

    -- BLOCKED: rows that matched this caller's phone and carry an offering, but
    -- were refused because an existing enrolment (refunded / revoked / expired)
    -- says they are not entitled. Without this counter such a caller returns
    -- {claimed: 0, stamped: 0} — byte-identical to "you had nothing to claim" —
    -- and with 73,865 rows draining there would be no way to tell a correct
    -- refusal from a silently broken claim. These rows are deliberately left
    -- unstamped and therefore still claimable, so a non-zero value here is the
    -- ONLY signal that a real purchase is being withheld on purpose.
    SELECT count(*) INTO v_blocked
      FROM public.legacy_enrolments le
     WHERE le.claimed_by_user_id IS NULL
       AND le.offering_id IS NOT NULL
       AND le.phone = v_phone_norm
       AND EXISTS (
         SELECT 1 FROM public.enrolments e
          WHERE e.user_id = v_user_id
            AND e.offering_id = le.offering_id
       );

  EXCEPTION
    -- Plain WHEN OTHERS does NOT catch query_canceled (57014), so a
    -- statement_timeout is trapped explicitly.
    WHEN query_canceled THEN
      RAISE WARNING 'claim_my_purchases timed out for user %', v_user_id;
      RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0);
    WHEN OTHERS THEN
      RAISE WARNING 'claim_my_purchases failed for user %: % %',
        v_user_id, SQLSTATE, SQLERRM;
      RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0);
  END;

  RETURN jsonb_build_object('claimed', v_claimed, 'stamped', v_stamped,
                            'blocked', v_blocked);
END;
$$;

COMMENT ON FUNCTION public.claim_my_purchases() IS
  'Claims a signed-in student''s already-in-the-system purchases. Keyed on auth.uid(); requires auth.users.phone_confirmed_at IS NOT NULL (correct at sign-in, inert at signup) and public.users.deleted_at IS NULL; canonicalises the confirmed auth phone to +91XXXXXXXXXX before matching legacy_enrolments. Writes enrolments with source=''migration'', stamps only rows it could grant so NULL-offering rows stay eligible for grant_enrolment_after_offering_resolved, is idempotent, and never raises (auth.uid() included — it is resolved inside the exception block, not in a DECLARE initialiser). Returns {"claimed": n, "stamped": m, "blocked": k}: n counts enrolments actually inserted, m counts legacy rows marked claimed (they differ when the caller already held an active enrolment, so a state-changing call is never logged as a no-op), and k counts eligible purchases deliberately REFUSED because an existing refunded/revoked/expired enrolment says the caller is not entitled. Those k rows are left unstamped and stay claimable, and k is the only signal distinguishing a correct refusal from a silently broken claim.';

-- A zero-arg SECURITY DEFINER writer must not be anon-reachable: with no
-- arguments there is nothing to authorise on except the caller's own JWT, so
-- an anon caller would be an unauthenticated write endpoint.
REVOKE ALL     ON FUNCTION public.claim_my_purchases() FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.claim_my_purchases() FROM anon;
GRANT  EXECUTE ON FUNCTION public.claim_my_purchases() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3/3 — the mapping-resolution granter, corrected.
--
-- This fires BEFORE UPDATE OF offering_id ON legacy_enrolments — i.e. on the
-- mapping resolutions that will cover 1,067 programs / 67,129 students. It is
-- NOT on the signup path, so it stays; but it stamps claimed_by_user_id
-- permanently, and a wrong match locks the real buyer out for good, so it must
-- be right.
-- ────────────────────────────────────────────────────────────────────────────
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

    -- CONFIRMED AUTH phone only. It previously matched the forgeable
    -- public.users mirror (and email, which is not ownership proof on this
    -- stack: verify-msg91-otp is verify_jwt=false and mintSession confirms
    -- whatever address was supplied).
    --
    -- phone_confirmed_at IS NOT NULL is NOT optional here, and this is the path
    -- that needs it MOST: it stamps claimed_by_user_id permanently, and
    -- cleanup_deleted_users is not scheduled, so there is no self-service
    -- recovery for a wrong stamp. An unconfirmed auth.users.phone is an
    -- ASSERTED phone: GoTrue's signInWithOtp({ phone }) writes the phone at
    -- INSERT and leaves phone_confirmed_at NULL until the code is entered, and
    -- handle_new_user then creates the public.users mirror, so the JOIN and the
    -- deleted_at check below both pass for someone who never proved anything.
    -- With 67,722 legacy buyers against 247 accounts, a victim's number is
    -- almost certainly free of any auth row, so UNIQUE(phone) does not block
    -- the squat either. That path is inert today only because Twilio creds are
    -- null and the send-SMS hook targets an undeployed function — accidental,
    -- not designed, and one deploy away from live. Without this predicate the
    -- comment above ("AUTH phone only") would assert proof of ownership that
    -- the data does not carry.
    --
    -- THE TWO COLUMNS STORE DIFFERENT DIALECTS. legacy_enrolments.phone is
    -- '+91XXXXXXXXXX'; GoTrue strips the '+', so auth.users.phone is
    -- '91XXXXXXXXXX' (241 of 242 rows here, 1 '+'-prefixed). A raw
    -- `au.phone = NEW.phone` matches ZERO of 73,926 rows. The IN-list covers
    -- all three storage dialects and keeps users_phone_key usable.
    --
    -- The key is derived ONLY from an already-canonical legacy phone. 485 rows
    -- hold 'foreign:<digits>:<handle>' placeholders rather than numbers, and
    -- digit-stripping those would mint a 10-digit key that can COLLIDE with a
    -- real subscriber. The regex guard means they produce no key at all, so
    -- they add zero collision space. DO NOT replace it with bare last-10
    -- keying.
    --
    -- u.deleted_at IS NULL: soft-delete NULLs public.users.phone but preserves
    -- the auth row and its phone, so without this a deleted account could
    -- claim a live buyer's purchases.
    IF NEW.phone ~ '^\+91[0-9]{10}$' THEN
      SELECT u.id INTO v_user_id
        FROM public.users u
        JOIN auth.users au ON au.id = u.id
       WHERE u.deleted_at IS NULL
         AND au.phone_confirmed_at IS NOT NULL
         AND au.phone IN (right(NEW.phone, 10), '91' || right(NEW.phone, 10), NEW.phone)
       ORDER BY u.created_at ASC, u.id ASC   -- deterministic; was a bare LIMIT 1
       LIMIT 1;
    END IF;

    IF v_user_id IS NOT NULL THEN
      -- ANY existing enrolment blocks, exactly as in claim_my_purchases, and
      -- the stamp below is moved INSIDE this branch for the same reason: this
      -- path runs in BULK (1,067 mappings covering 67,129 students) with no
      -- counters, so a status-blind guard that stamped anyway would silently
      -- and permanently burn rows. Blocking without stamping instead leaves the
      -- row claimable, so nothing is lost and a refunded student does not
      -- silently regain the course across the whole cohort at once.
      IF NOT EXISTS (
        SELECT 1 FROM public.enrolments e
         WHERE e.user_id = v_user_id
           AND e.offering_id = NEW.offering_id
      ) THEN
        INSERT INTO public.enrolments (user_id, offering_id, payment_order_id, status, source)
        VALUES (v_user_id, NEW.offering_id, NULL, 'active', 'migration');
      END IF;

      -- Stamp only if they now hold an ACTIVE enrolment — i.e. the row we just
      -- inserted, or one they legitimately already had. A caller whose only
      -- enrolment is refunded/revoked/expired falls through UNSTAMPED, so the
      -- purchase stays claimable if that decision is ever reversed.
      IF EXISTS (
        SELECT 1 FROM public.enrolments e
         WHERE e.user_id = v_user_id
           AND e.offering_id = NEW.offering_id
           AND e.status = 'active'
      ) THEN
        NEW.claimed_by_user_id := v_user_id;
        NEW.claimed_at := now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.grant_enrolment_after_offering_resolved() IS
  'Grants the enrolment when an unmapped purchase finally gets an offering_id. Matches ONLY a CONFIRMED auth.users.phone (phone_confirmed_at IS NOT NULL — an unconfirmed one is merely asserted, since GoTrue writes the phone at INSERT and confirms later) across its three storage dialects (never the forgeable public.users mirror, never email), skips foreign: placeholder phones so they mint no colliding key, ignores soft-deleted accounts, and picks deterministically — because this stamps claimed_by_user_id permanently and a wrong match locks the real buyer out for good.';

-- claim_my_purchases() is a BRAND-NEW RPC that SC-2 calls from the auth path on
-- every real sign-in, so it must be resolvable the moment this lands. Supabase's
-- pgrst_ddl_watch event trigger normally handles that, but without an explicit
-- nudge there is a post-push window in which PostgREST answers PGRST202 ("could
-- not find the function in the schema cache"). Login itself survives — the client
-- swallows the failure — but every sign-in in that window claims nothing and
-- fires a Sentry event, which is exactly the signal the counters exist to make
-- observable. 20260603120000_legacy_login_fix.sql:181-183 does the same for the
-- same reason.
NOTIFY pgrst, 'reload schema';

-- ── Reversal (reference only; nothing here needs dropping to roll back) ──
--   1. claim_legacy_enrolments_for_user → restore the body at
--      20260611130000_unbrick_onboarding_for_shipped_clients.sql:53-110
--      (⚠️ that body reintroduces the signup-blocking 23514/23502 outage).
--   2. claim_my_purchases → DROP FUNCTION IF EXISTS public.claim_my_purchases();
--      Safe once SC-2's client call is reverted; the client ignores failures,
--      so a missing function degrades to "no claim", never to a broken login.
--   3. grant_enrolment_after_offering_resolved → restore the body at
--      20260524180000_legacy_enrolments_v2.sql:205-245
--      (⚠️ that body matches the forgeable public.users mirror and picks with a
--      bare LIMIT 1).
-- No trigger, table, column, constraint or index is created or dropped here,
-- so a rollback is three CREATE OR REPLACEs and one DROP FUNCTION.
