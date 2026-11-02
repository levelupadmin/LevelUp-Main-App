-- An email added after a phone sign-up is saved, but is not a sign-in yet.
--
-- 20261102140100 moved the sign-in email (auth.users.email) to whatever address
-- a phone-first student typed in onboarding or on the thank-you page. Nothing
-- checks that the address belongs to them, so a typo, or someone else's
-- address, would let that inbox's owner sign in with an email code. Until the
-- app confirms a new address with a code, set_onboarding_profile goes back to
-- writing public.users only (as on live before this release), and keeps the
-- newer check that refuses an email another account already signs in with.
--
-- Undo: re-run 20261102140100_onboarding_email_signs_in.sql.
create or replace function public.set_onboarding_profile(p_full_name text, p_email text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_current_email text;
  v_name text := btrim(p_full_name);
  v_email text := lower(btrim(p_email));
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if length(v_name) < 2 then
    raise exception 'invalid_name';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;

  select email into v_current_email
  from public.users
  where id = v_uid and deleted_at is null
  for update;

  if not found then
    raise exception 'no_profile';
  end if;

  -- Email may only be (re)set while the row still carries the synthetic
  -- phone-signup placeholder, or when it isn't changing. Real emails
  -- stay frozen on the self-service path.
  if v_current_email is not null
     and v_current_email <> v_email
     and v_current_email not like '%@phone.leveluplearning.in' then
    raise exception 'email_locked';
  end if;

  if exists (select 1 from auth.users where lower(email) = v_email and id <> v_uid) then
    raise exception 'email_taken';
  end if;

  -- This email is unverified: do not let the write claim legacy
  -- entitlements (transaction-local, resets on commit/rollback).
  perform set_config('app.suppress_legacy_claim', 'on', true);

  begin
    update public.users
    set full_name = v_name,
        email = v_email
    where id = v_uid;
  exception when unique_violation then
    raise exception 'email_taken';
  end;
end;
$function$;

revoke all on function public.set_onboarding_profile(text, text) from public;
grant execute on function public.set_onboarding_profile(text, text) to authenticated;
