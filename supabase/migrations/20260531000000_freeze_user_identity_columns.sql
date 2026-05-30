-- Fix: a student can self-grant any legacy (TagMango) entitlement — or
-- hijack an unclaimed one — by editing their own phone/email.
--
-- The legacy-claim trigger `claim_legacy_enrolments_for_user`
-- (20260524130000_legacy_enrolments.sql) fires AFTER UPDATE OF phone,
-- email ON public.users and converts every matching unclaimed
-- legacy_enrolments row into a real active enrolment. It keys on
--   le.phone = normalise(NEW.phone)  OR  le.email = NEW.email
-- with NO verification that the user actually owns that phone/email.
--
-- The only guard on self-updates was `users_update_own`
-- (20260522180000_account_deletion.sql), whose WITH CHECK pinned just
-- `role` and `deleted_at`. phone and email were freely writable by the
-- row owner. So a logged-in student could run, against the normal anon
-- PostgREST endpoint:
--     supabase.from('users').update({ phone: '+91<paying-customer>' })
--                           .eq('id', myId)
-- the trigger would fire and hand them every offering that phone owns —
-- the entire paid TagMango catalogue, for free — and consume a real
-- customer's unclaimed entitlement in the process. (Content RLS +
-- get-vdocipher-otp both trust the resulting enrolments row, so this is a
-- full paywall bypass, not just a cosmetic grant.)
--
-- Fix: freeze phone + email on the self-update path, exactly the way
-- `role` is already frozen — compare the NEW value against the row's
-- current value via a subquery (MVCC makes the subquery read the OLD
-- value during the UPDATE, so an unchanged column passes and any change
-- fails the WITH CHECK). Legitimate phone/email writes never go through
-- this policy: they happen inside SECURITY DEFINER triggers
-- (handle_new_user) and the service-role verify-msg91-otp edge function,
-- both of which bypass RLS. Profile editing (ProfilePage.handleSave)
-- only writes full_name/bio/city/occupation, so nothing legitimate
-- breaks. Phone/email may now ONLY change through the OTP-verified edge
-- flow — which, after the companion token↔phone binding fix, is the only
-- place phone ownership is actually proven.

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
    AND email IS NOT DISTINCT FROM (SELECT email FROM public.users WHERE id = auth.uid())
  );

COMMENT ON POLICY "users_update_own" ON public.users IS
  'Self-service profile updates. role, phone, and email are frozen here — '
  'identity changes must go through the OTP-verified service-role flow so '
  'they cannot be used to self-claim legacy entitlements.';
