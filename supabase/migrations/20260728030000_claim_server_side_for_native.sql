
-- ============================================================================
-- PHASE SC-4 — Claim server-side too, so already-shipped apps do not wait.
-- ============================================================================
--
-- THE GAP THIS CLOSES
--   claim_my_purchases() is invoked only from src/contexts/AuthContext.tsx, i.e.
--   only from the web bundle. iOS build 16 and Android 604/3.2.1 are already in
--   users' hands and will not call it until they take a NEW store build — days,
--   across Apple review and a staged Play rollout. That is the recorded
--   2026-06-14 lesson: Capacitor clients lag, so anything that matters must also
--   work server-side for the OLD client's exact call.
--
--   This is a GAP, not a regression: the old signup trigger never once succeeded
--   (source='tagmango_migration' = 0 rows against 59 for 'migration'), so native
--   users are not losing anything they had. But 67k students should not wait on
--   an App Store review to see courses they already paid for.
--
-- THE SHAPE
--   ONE implementation, TWO entry points with different authorisation:
--     * claim_purchases_for_user(uuid) — SERVICE ROLE ONLY. Takes the id
--       explicitly because verify-msg91-otp has already proven the phone via
--       MSG91 before it mints a session.
--     * claim_my_purchases() — unchanged signature, still authenticated-only,
--       now a thin wrapper that resolves auth.uid() and delegates.
--   Splitting the LOGIC instead of the AUTHORISATION would let the two drift,
--   and divergence between two copies of one rule has been the single most
--   expensive class of bug in this phase.
--
-- Additive, idempotent, reversible (undo at the foot). No RAISE EXCEPTION.

CREATE OR REPLACE FUNCTION public.claim_purchases_for_user(p_user_id uuid)
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
    -- The id is passed in, not read from a JWT: this entry point exists for the
    -- SERVICE ROLE, which has already proven the identity out of band (MSG91
    -- verified the phone before verify-msg91-otp minted a session). It is
    -- REVOKED from anon and authenticated below precisely because an arbitrary
    -- caller must never name someone else's user id.
    v_user_id := p_user_id;
    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0,
                                'eligible', false);
    END IF;

    -- Live account only. A soft-deleted caller keeps a usable auth phone, so
    -- without this a deleted account could stamp a live buyer's purchases.
    PERFORM 1
      FROM public.users u
     WHERE u.id = v_user_id
       AND u.deleted_at IS NULL;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0,
                                'eligible', false);
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
      RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0,
                                'eligible', false);
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

    -- BLOCKED: purchases that match this caller's phone and carry an offering,
    -- but which the guard below will refuse because an existing enrolment
    -- (refunded / revoked / expired) says they are not entitled. Without this
    -- counter such a caller returns {claimed: 0, stamped: 0} — byte-identical to
    -- "you had nothing to claim" — and with 73,865 rows draining there would be
    -- no way to tell a correct refusal from a silently broken claim. These rows
    -- are deliberately left unstamped and stay claimable, so a non-zero value
    -- here is the ONLY signal that a real purchase is withheld on purpose.
    --
    -- Counted BEFORE any write, deliberately. Sitting after the INSERT/UPDATE it
    -- shared their exception block, so a failure in this diagnostic — including
    -- the statement_timeout trapped below — would roll back a SUCCESSFUL grant
    -- and report it as a no-op. A read that runs first can only ever cost the
    -- read. The predicate is the exact negation of the INSERT guard, so it is
    -- unaffected by rows the INSERT is about to add. It is NARROWER than the plain
-- negation of that guard: a caller who already holds a LIVE enrolment is
-- reconciled rather than refused, so they are excluded here too.
    SELECT count(*) INTO v_blocked
      FROM public.legacy_enrolments le
     WHERE le.claimed_by_user_id IS NULL
       AND le.offering_id IS NOT NULL
       AND le.phone = v_phone_norm
       -- An existing enrolment only BLOCKS if it is not a live one. A caller who
       -- already holds a live enrolment (e.g. they re-bought through checkout)
       -- has the INSERT suppressed but IS entitled and IS stamped below: that is
       -- reconciliation, not refusal, and counting it here would raise a false
       -- alarm on a perfectly normal path. Blocked = "an enrolment exists AND
       -- none of them entitle you", i.e. refunded / revoked / lapsed only.
       AND EXISTS (
         SELECT 1 FROM public.enrolments e
          WHERE e.user_id = v_user_id
            AND e.offering_id = le.offering_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.enrolments e
          WHERE e.user_id = v_user_id
            AND e.offering_id = le.offering_id
            AND e.status = 'active'
            AND (e.expires_at IS NULL OR e.expires_at > now())
       );

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
            -- expires_at too, or a lapsed enrolment would stamp the purchase
            -- claimed forever while has_offering_access (20260728010000) still
            -- refuses to show it — permanently claimed, permanently invisible.
            AND (e.expires_at IS NULL OR e.expires_at > now())
       );

    -- Counted separately from the INSERT: the UPDATE's guard is EXISTS(ACTIVE)
    -- while the INSERT's is NOT EXISTS(ANY), so it also stamps rows whose active
    -- enrolment already existed. stamped >= claimed always, and stamped > 0 with
    -- claimed = 0 is the "already entitled, now reconciled" case, not a no-op.
    GET DIAGNOSTICS v_stamped = ROW_COUNT;


  EXCEPTION
    -- Plain WHEN OTHERS does NOT catch query_canceled (57014), so a
    -- statement_timeout is trapped explicitly.
    WHEN query_canceled THEN
      RAISE WARNING 'claim_purchases_for_user timed out for user %', v_user_id;
      RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0,
                                'eligible', false);
    WHEN OTHERS THEN
      RAISE WARNING 'claim_purchases_for_user failed for user %: % %',
        v_user_id, SQLSTATE, SQLERRM;
      RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0,
                                'eligible', false);
  END;

  -- eligible=true means the claim RAN to completion for a caller we could
  -- actually identify. The client persists its 6h watermark ONLY on this, so a
  -- refusal (no uid / soft-deleted / phone not confirmed) or an internal error
  -- does not burn the window. That mattered: an email or magic-link sign-in
  -- leaves auth.users.phone NULL, returned all zeros WITHOUT raising, and the
  -- client stamped anyway — so the MSG91 sign-in for the SAME user minutes
  -- later, the one that WOULD have claimed, was silently skipped for six hours.
  RETURN jsonb_build_object('claimed', v_claimed, 'stamped', v_stamped,
                            'blocked', v_blocked, 'eligible', true);
END;
$$;


COMMENT ON FUNCTION public.claim_purchases_for_user(uuid) IS
  'SERVICE-ROLE-ONLY entry point for the purchase claim. Identical body to claim_my_purchases(), but takes the user id explicitly because the caller (verify-msg91-otp) has already proven ownership via MSG91 before minting a session. Exists so already-shipped iOS/Android builds claim immediately instead of waiting for a store release. REVOKED from anon and authenticated: an arbitrary caller naming someone else''s user id would be a total entitlement bypass.';

-- The whole security boundary of this function is this grant. Without the
-- REVOKEs, an authenticated caller could pass ANY user id and claim a
-- stranger's purchases onto their own account, which the zero-arg wrapper
-- structurally prevents.
REVOKE ALL     ON FUNCTION public.claim_purchases_for_user(uuid) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.claim_purchases_for_user(uuid) FROM anon;
REVOKE ALL     ON FUNCTION public.claim_purchases_for_user(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_purchases_for_user(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- claim_my_purchases() is now a thin wrapper. Same signature, same grants, same
-- behaviour for every existing caller; it just no longer carries its own copy
-- of the logic.
--
-- Being SECURITY DEFINER, its body runs as the owner, so the delegated call
-- satisfies the service-role-only grant above without widening anything for the
-- authenticated caller: they still cannot name a user id, because this function
-- takes no arguments.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_my_purchases()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
BEGIN
  BEGIN
    -- Resolved inside the armed handler: auth.uid() casts a JWT claim to uuid
    -- and raises 22P02 on a malformed 'sub'.
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0,
                              'eligible', false);
  END IF;

  RETURN public.claim_purchases_for_user(v_uid);
END;
$$;

COMMENT ON FUNCTION public.claim_my_purchases() IS
  'Claims the CALLING student''''s already-in-the-system purchases. Zero-arg and keyed on auth.uid(), so a caller can only ever claim for themselves. Delegates to claim_purchases_for_user(uuid), which holds the single implementation; see that function for the gates (confirmed auth phone, live account, +91 canonicalisation) and for the {claimed, stamped, blocked, eligible} contract.';

REVOKE ALL     ON FUNCTION public.claim_my_purchases() FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.claim_my_purchases() FROM anon;
GRANT  EXECUTE ON FUNCTION public.claim_my_purchases() TO authenticated;

-- ── Reversal ────────────────────────────────────────────────────────────────
--   Restore claim_my_purchases' inlined body from
--   20260727220000_claim_at_signin.sql, then
--   DROP FUNCTION IF EXISTS public.claim_purchases_for_user(uuid);
--   Safe once verify-msg91-otp's call is reverted; that call is wrapped so a
--   missing function degrades to "no server-side claim", never to a broken
--   login.
