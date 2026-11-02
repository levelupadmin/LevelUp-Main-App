-- Tally applications no longer create accounts (founder, 2026-11-02).
--
-- Intake provisioning (tally-application-webhook / -poll, `_shared/identity.ts`)
-- made 817 email-only accounts with no login phone; 20 were ever signed into,
-- and phone sign-in can never reach the rest. Applications keep saving exactly
-- as they do with provisioning dark: linked to an existing account by email,
-- otherwise unlinked. The applicant gets an account the normal way, by signing
-- in with their phone.
--
-- Both gates go off: the database probe both functions call, and the
-- per-offering switch (only "Creator Academy Edition 2" had it on).
create or replace function public.intake_provisioning_gate_ok()
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$ select false $$;

update public.offerings
   set identity_spine_enabled = false
 where identity_spine_enabled;
