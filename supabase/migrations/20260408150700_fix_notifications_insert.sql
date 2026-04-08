-- =====================================================================
-- SECURITY FIX: notifications_admin_insert allows anyone to spam anyone
-- =====================================================================
--
-- The notifications_admin_insert policy was written as:
--   WITH CHECK (is_admin() OR auth.uid() IS NOT NULL)
--
-- The OR clause completely defeats the admin gate: every authenticated
-- user satisfies "auth.uid() IS NOT NULL", so any logged-in user can
-- insert a notification row targeting any other user_id of their choice.
-- This is a phishing / harassment / spam vector inside the app.
--
-- Also: notifications_own is FOR ALL, which means USING gates SELECT/
-- UPDATE/DELETE but the implicit INSERT WITH CHECK is auth.uid() =
-- user_id, allowing a user to insert notifications addressed to
-- themselves only — that's fine and we keep that behaviour for the
-- self-insert case via a dedicated INSERT policy.
--
-- This migration:
--   1. Drops the broken notifications_admin_insert
--   2. Adds notifications_admin_only_insert restricted to is_admin()
--   3. Splits notifications_own into per-verb policies so users keep
--      SELECT/UPDATE/DELETE on their own notifications but cannot
--      INSERT arbitrary rows. (Self-insert is not a real use case;
--      notifications are produced server-side.)
-- =====================================================================

DROP POLICY IF EXISTS notifications_admin_insert ON public.notifications;
DROP POLICY IF EXISTS notifications_own ON public.notifications;

-- Read your own notifications
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_admin());

-- Mark your own notifications read / dismissed (cannot rewrite user_id)
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

-- Delete your own notifications
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR is_admin());

-- Only admins (or service_role bypassing RLS) can insert. Edge functions
-- that need to push notifications must run with service_role, never
-- with the user's anon JWT.
CREATE POLICY notifications_admin_insert ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());
