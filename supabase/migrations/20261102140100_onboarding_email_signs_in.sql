-- An email added after a phone sign-up now also becomes a way to sign in.
--
-- set_onboarding_profile wrote the email to public.users only. Email sign-in
-- (verify-email-otp) resolves the account by auth.users.email and requires the
-- profile email to equal it, so a phone-first student who added their email
-- still could not sign in with it. Now, while the sign-in email is still the
-- "<digits>@phone.leveluplearning.in" placeholder, the same call moves it to
-- the real address, unless another account already signs in with that email.
-- Real sign-in emails are never changed here (unchanged rule: email_locked).
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

  -- The sign-in email follows, only off the placeholder.
  update auth.users
  set email = v_email,
      updated_at = now()
  where id = v_uid
    and email like '%@phone.leveluplearning.in';
end;
$function$;
