-- Self-service recovery for a soft-deleted account on re-login.
--
-- Background: deleting an account (delete-account edge fn) soft-deletes —
-- stamps public.users.deleted_at, scrubs PII, but keeps auth.users so the
-- number can't be re-registered during a 7-day grace window. The designed
-- nightly cleanup_deleted_users() cron (which would hard-delete after grace
-- and free the number for a fresh signup) was never scheduled, so deleted
-- users were permanently trapped: RLS (users_read_own) hides their row →
-- AuthContext reads "no profile" → "scheduled for deletion. Contact support",
-- with no way back.
--
-- Fix (product decision): holding a valid session already proves ownership
-- (they just passed OTP / magic-link), so a returning user is RESTORED instead
-- of blocked. The client can't do this itself — users_update_own requires
-- deleted_at IS NULL — so this SECURITY DEFINER RPC clears the flag for the
-- CALLER'S OWN id only, and best-effort repopulates the contact fields that
-- deletion scrubbed (from auth.users). AuthContext calls it when it would
-- otherwise show the deletion message.
create or replace function public.recover_own_deleted_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    return false;
  end if;

  -- Restoring the account = clearing deleted_at. Repopulating the scrubbed
  -- contact fields is best-effort and MUST be collision-safe: while the row was
  -- deleted, another account may have re-registered with the same phone/email
  -- (users_email_key / phone uniqueness), so we only restore each field when no
  -- OTHER row already claims it — otherwise the unique_violation would abort the
  -- whole recovery and re-trap the user. Clearing deleted_at is unconditional.
  update public.users u
     set deleted_at = null,
         -- auth.users.phone has no '+' prefix; match the app's +<cc> convention.
         phone = coalesce(
           u.phone,
           (select p.candidate
              from (select nullif('+' || a.phone, '+') as candidate
                      from auth.users a where a.id = v_id) p
             where p.candidate is not null
               and not exists (select 1 from public.users o
                                where o.phone = p.candidate and o.id <> v_id))
         ),
         email = coalesce(
           u.email,
           (select e.candidate
              from (select a.email as candidate
                      from auth.users a
                     where a.id = v_id
                       and a.email is not null
                       and a.email not like '%@phone.leveluplearning.in') e
             where not exists (select 1 from public.users o
                                where o.email = e.candidate and o.id <> v_id))
         ),
         full_name = coalesce(
           nullif(u.full_name, ''),
           (select a.raw_user_meta_data->>'full_name' from auth.users a where a.id = v_id),
           ''
         )
   where u.id = v_id
     and u.deleted_at is not null;

  return found;
end;
$$;

revoke all on function public.recover_own_deleted_account() from public, anon;
grant execute on function public.recover_own_deleted_account() to authenticated;

comment on function public.recover_own_deleted_account() is
  'Clears deleted_at for the calling user (auth.uid()) if soft-deleted, restoring the account on re-login. Repopulates scrubbed contact fields from auth.users. Returns true if a row was recovered.';
