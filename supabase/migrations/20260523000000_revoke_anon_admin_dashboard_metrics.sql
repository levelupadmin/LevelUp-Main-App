-- =====================================================================
-- Revoke anon EXECUTE on admin_dashboard_metrics
-- =====================================================================
--
-- The original migration 20260417100100_admin_dashboard_metrics_rpc.sql
-- ran `REVOKE ALL ON FUNCTION ... FROM PUBLIC` then granted EXECUTE to
-- `authenticated`. However, an existing grant on `anon` (inherited via
-- a prior REST default-grants action) survived the REVOKE FROM PUBLIC,
-- so `anon` could still invoke the RPC. The function then raised
--   admin_dashboard_metrics: not authorised
-- via the internal is_admin() check, which PostgREST translates into a
-- noisy 400 every time an unauthenticated request slipped through (e.g.
-- a brief auth-restoring window after page reload, or a misrouted
-- public call).
--
-- This migration revokes EXECUTE from `anon` explicitly so unauthenticated
-- callers get the proper PostgREST permission error rather than reaching
-- the admin check inside the function body.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_metrics(
  timestamptz, timestamptz, int, int, int
) FROM anon;
