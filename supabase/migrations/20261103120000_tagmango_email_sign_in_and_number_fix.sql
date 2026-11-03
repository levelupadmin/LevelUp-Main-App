-- TagMango buyers can sign in by email, and an admin can fix a buyer's number.
--
-- Founder, 3 Nov 2026: students say the email sign-in code never arrives.
-- verify-email-otp mails a code only to an address that already has an
-- account, and 58,146 TagMango buyers (purchases mapped, no account yet) have
-- none, so they never got one. Their purchases also attached ONLY by phone, at
-- a phone sign-in with the exact number TagMango holds, which is no help to a
-- buyer whose number there is wrong (the Gideon Thevar case).
--
-- 1. claim_purchases_by_verified_email: verify-email-otp calls it right after
--    a correct code, so the address is proven, not asserted. It only attaches
--    into an account that signs in with that address and has NO phone: an
--    account with a phone can be entered by whoever holds that phone, so the
--    inbox owner's purchases must not land there (an admin moves those with
--    #2 instead).
-- 2. admin_move_legacy_purchases: the admin "Change number" for a TagMango
--    buyer. Moves their unclaimed purchases to the right number and, given an
--    account, attaches them to it now.
--
-- Both are service-role only. Same grant guard and status rules as
-- claim_purchases_for_user (20260728030000): any existing enrolment blocks a
-- grant, and only a row the account now ACTIVELY holds is stamped claimed, so
-- a refunded purchase stays claimable instead of being burnt.
--
-- Undo: drop both functions. Rows they stamped keep claimed_by_user_id; the
-- admin audit log ("legacy.move_number") lists every move with its old number.

create or replace function public.claim_purchases_by_verified_email(p_user_id uuid, p_email text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_ok      boolean;
  v_claimed integer := 0;
  v_stamped integer := 0;
begin
  begin
    if p_user_id is null or v_email = '' then
      return jsonb_build_object('claimed', 0, 'stamped', 0, 'eligible', false);
    end if;

    -- A live account that signs in with exactly this address and with nothing
    -- else. legacy_enrolments.email is stored lower-case (0 exceptions on live,
    -- 3 Nov 2026), so the match below rides legacy_enrolments_email_unclaimed_idx.
    select true into v_ok
      from auth.users au
      join public.users u on u.id = au.id
     where au.id = p_user_id
       and u.deleted_at is null
       and lower(au.email) = v_email
       and nullif(au.phone, '') is null;
    if not coalesce(v_ok, false) then
      return jsonb_build_object('claimed', 0, 'stamped', 0, 'eligible', false);
    end if;

    insert into public.enrolments (user_id, offering_id, payment_order_id, status, source)
    select distinct p_user_id, le.offering_id, null::uuid, 'active', 'migration'
      from public.legacy_enrolments le
     where le.claimed_by_user_id is null
       and le.offering_id is not null
       and le.email = v_email
       and not exists (
         select 1 from public.enrolments e
          where e.user_id = p_user_id and e.offering_id = le.offering_id
       )
    on conflict do nothing;
    get diagnostics v_claimed = row_count;

    update public.legacy_enrolments le
       set claimed_by_user_id = p_user_id,
           claimed_at         = now()
     where le.claimed_by_user_id is null
       and le.offering_id is not null
       and le.email = v_email
       and exists (
         select 1 from public.enrolments e
          where e.user_id = p_user_id
            and e.offering_id = le.offering_id
            and e.status = 'active'
            and (e.expires_at is null or e.expires_at > now())
       );
    get diagnostics v_stamped = row_count;
  exception
    -- A failed claim must never break a sign-in. Plain WHEN OTHERS does not
    -- catch query_canceled, so a statement_timeout is trapped explicitly.
    when query_canceled then
      raise warning 'claim_purchases_by_verified_email timed out for user %', p_user_id;
      return jsonb_build_object('claimed', 0, 'stamped', 0, 'eligible', false);
    when others then
      raise warning 'claim_purchases_by_verified_email failed for user %: % %', p_user_id, sqlstate, sqlerrm;
      return jsonb_build_object('claimed', 0, 'stamped', 0, 'eligible', false);
  end;

  return jsonb_build_object('claimed', v_claimed, 'stamped', v_stamped, 'eligible', true);
end;
$function$;

comment on function public.claim_purchases_by_verified_email(uuid, text) is
  'SERVICE-ROLE-ONLY. Attaches unclaimed TagMango purchases bought with p_email to p_user_id. Call ONLY right after a correct email code for p_email (verify-email-otp): the code is the proof of ownership. Refuses unless the account signs in with exactly that address and has no phone.';

revoke all     on function public.claim_purchases_by_verified_email(uuid, text) from public;
revoke all     on function public.claim_purchases_by_verified_email(uuid, text) from anon;
revoke all     on function public.claim_purchases_by_verified_email(uuid, text) from authenticated;
grant  execute on function public.claim_purchases_by_verified_email(uuid, text) to service_role;


create or replace function public.admin_move_legacy_purchases(p_from_phone text, p_to_phone text, p_user_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids     uuid[];
  v_moved   integer := 0;
  v_claimed integer := 0;
  v_stamped integer := 0;
  v_blocked integer := 0;
begin
  -- legacy_enrolments.phone is '+<digits>' ('+91XXXXXXXXXX' for India).
  if coalesce(p_from_phone, '') = '' or coalesce(p_to_phone, '') !~ '^\+[0-9]{8,15}$' then
    raise exception 'admin_move_legacy_purchases: bad phone';
  end if;

  select coalesce(array_agg(id), '{}') into v_ids
    from public.legacy_enrolments
   where phone = p_from_phone and claimed_by_user_id is null;
  if cardinality(v_ids) = 0 then
    return jsonb_build_object('rows', 0, 'moved', 0, 'claimed', 0, 'stamped', 0, 'blocked', 0);
  end if;

  -- (source, phone, legacy_program_name) is unique. A purchase the new number
  -- already holds keeps the old number, and is still attached below.
  update public.legacy_enrolments le
     set phone = p_to_phone
   where le.id = any(v_ids)
     and p_from_phone <> p_to_phone
     and not exists (
       select 1 from public.legacy_enrolments x
        where x.source = le.source and x.phone = p_to_phone
          and x.legacy_program_name = le.legacy_program_name
     );
  get diagnostics v_moved = row_count;

  if p_user_id is not null then
    insert into public.enrolments (user_id, offering_id, payment_order_id, status, source)
    select distinct p_user_id, le.offering_id, null::uuid, 'active', 'migration'
      from public.legacy_enrolments le
     where le.id = any(v_ids)
       and le.offering_id is not null
       and not exists (
         select 1 from public.enrolments e
          where e.user_id = p_user_id and e.offering_id = le.offering_id
       )
    on conflict do nothing;
    get diagnostics v_claimed = row_count;

    update public.legacy_enrolments le
       set claimed_by_user_id = p_user_id,
           claimed_at         = now()
     where le.id = any(v_ids)
       and le.claimed_by_user_id is null
       and le.offering_id is not null
       and exists (
         select 1 from public.enrolments e
          where e.user_id = p_user_id
            and e.offering_id = le.offering_id
            and e.status = 'active'
            and (e.expires_at is null or e.expires_at > now())
       );
    get diagnostics v_stamped = row_count;

    -- Mapped purchases the account was refused because it already holds a
    -- refunded, revoked or lapsed enrolment for that product.
    select count(*) into v_blocked
      from public.legacy_enrolments le
     where le.id = any(v_ids) and le.offering_id is not null and le.claimed_by_user_id is null;
  end if;

  return jsonb_build_object('rows', cardinality(v_ids), 'moved', v_moved,
                            'claimed', v_claimed, 'stamped', v_stamped, 'blocked', v_blocked);
end;
$function$;

comment on function public.admin_move_legacy_purchases(text, text, uuid) is
  'SERVICE-ROLE-ONLY (admin-update-user, action move_legacy). Moves the unclaimed TagMango purchases held under p_from_phone to p_to_phone and, given p_user_id, attaches them to that account now.';

revoke all     on function public.admin_move_legacy_purchases(text, text, uuid) from public;
revoke all     on function public.admin_move_legacy_purchases(text, text, uuid) from anon;
revoke all     on function public.admin_move_legacy_purchases(text, text, uuid) from authenticated;
grant  execute on function public.admin_move_legacy_purchases(text, text, uuid) to service_role;
