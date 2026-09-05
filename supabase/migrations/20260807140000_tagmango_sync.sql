-- Placeholder: this version was applied to production out-of-band (recorded in
-- supabase_migrations.schema_migrations as "tagmango_sync" with no statements)
-- and created public.tagmango_mangoes, public.tagmango_sync_runs and the
-- tagmango_* functions. The repo had no file for it, so `supabase db push`
-- refused to run with "remote migration versions not found locally".
--
-- This file exists ONLY so the local migration list matches the remote one. It
-- is intentionally a no-op: the objects already exist in production and their
-- definition lives on the server, not here. Do not add statements to it.
SELECT 1;
