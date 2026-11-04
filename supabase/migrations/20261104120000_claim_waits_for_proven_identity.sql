-- The purchase claim waits until a checkout-made account's identity is proven.
--
-- Since 2026-11-04 a guest whose account THIS purchase created is signed in
-- straight after paying (verify-razorpay-payment, _shared/guestSession.ts).
-- That account carries app_metadata.identity_unproven = true: nobody has
-- proved the phone (or email) it was created on yet. claim_my_purchases()
-- attaches old TagMango purchases keyed on that confirmed auth phone, so it
-- must not run for such a session. The first verified sign-in
-- (verify-msg91-otp / verify-email-otp) clears the flag, signs out every other
-- session, and claims server-side through claim_purchases_for_user(), which is
-- service-role only and unchanged here.
--
-- Same body as 20260728030000 plus the one guard. Undo: re-run that file's
-- CREATE OR REPLACE for claim_my_purchases().

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
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0,
                              'eligible', false);
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users au
     WHERE au.id = v_uid
       AND COALESCE(au.raw_app_meta_data ->> 'identity_unproven', 'false') = 'true'
  ) THEN
    RETURN jsonb_build_object('claimed', 0, 'stamped', 0, 'blocked', 0,
                              'eligible', false);
  END IF;

  RETURN public.claim_purchases_for_user(v_uid);
END;
$$;

COMMENT ON FUNCTION public.claim_my_purchases() IS
  'Claims the CALLING student''s already-in-the-system purchases. Zero-arg and keyed on auth.uid(), so a caller can only ever claim for themselves. Waits (eligible=false) while auth app_metadata.identity_unproven is true: an account a checkout created before anyone proved its phone or email (20261104120000). Delegates to claim_purchases_for_user(uuid), which holds the single implementation; see that function for the gates (confirmed auth phone, live account, +91 canonicalisation) and for the {claimed, stamped, blocked, eligible} contract.';

REVOKE ALL     ON FUNCTION public.claim_my_purchases() FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.claim_my_purchases() FROM anon;
GRANT  EXECUTE ON FUNCTION public.claim_my_purchases() TO authenticated;
