-- Stage 2 of the backend plan: live_sessions had two BEFORE UPDATE triggers
-- that both set updated_at = now(). Keep trg_live_sessions_updated_at, which
-- uses the shared set_updated_at() like 53 other tables, and drop the copy.
-- update_live_sessions_updated_at() has no other trigger.

drop trigger if exists live_sessions_updated_at on public.live_sessions;
drop function if exists public.update_live_sessions_updated_at();
