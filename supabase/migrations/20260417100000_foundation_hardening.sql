-- =====================================================================
-- FOUNDATION HARDENING — security + performance in one migration
-- =====================================================================
--
-- This migration addresses four foundation-level issues found during the
-- security and performance audit.
--
--   1. users_read_public was dropped in 20260407205110 but never
--      replaced. As a result, authenticated users cannot see any user
--      row other than their own (or admins). This breaks Q&A author
--      names, comment author names, cohort member lists, leaderboards,
--      and anywhere else the app does SELECT id, full_name FROM users
--      for peer display.
--
--      We do NOT restore a permissive users_read_public policy,
--      because that would reopen the PII enumeration leak (any
--      authenticated attacker could SELECT email, phone, bio, city
--      from every user). Postgres RLS is row-level only — there is no
--      way to column-restrict at the policy layer.
--
--      The fix is a dedicated view with security_invoker = false so
--      the view's underlying SELECT runs with the VIEW OWNER's
--      privileges (bypassing RLS on users). The view projects ONLY the
--      safe columns: id, full_name, avatar_url, member_number,
--      occupation. Client code that needs to display other users' info
--      must SELECT FROM public_user_profiles, not users.
--
--      The users table itself remains locked to users_read_own +
--      users_admin_all. Email, phone, bio, city cannot be read by any
--      non-admin user via the REST API under any query.
--
--   2. admin_audit_logs currently has a single FOR ALL policy bound to
--      is_admin(). That grants admins DELETE and UPDATE on their own
--      audit trail — a clear abuse vector. Audit logs should be
--      append-only. We split the policy into SELECT + INSERT only.
--      No UPDATE or DELETE policy exists, so RLS default-deny denies
--      those actions for every role, including admins. Any legitimate
--      mutation must be performed by service_role inside an edge
--      function with explicit justification in code review.
--
--   3. The users table (and a few related tables) lack indexes on
--      created_at / role / status columns that the admin dashboard
--      filters on. Without these, the dashboard's daily-signups loop
--      triggers ~30-90 sequential full-table scans per load. We add
--      the hot-path indexes so the accompanying RPC can run in <500ms.
--
--   4. A single admin_dashboard_metrics RPC replaces the client-side
--      N+1 loops in AdminDashboard.tsx. See the accompanying migration
--      20260417100100_admin_dashboard_metrics_rpc.sql.
-- =====================================================================

-- ─── 1. public_user_profiles view for safe peer display ───
--
-- security_invoker = false means the view's SELECT runs as the view
-- OWNER (postgres / supabase_admin), bypassing the RLS policies on
-- the underlying users table. Row-level access is gated purely by
-- the GRANT on the view itself. Columns are pre-filtered in the
-- SELECT list, so email/phone/bio/city are never exposed through
-- this path.
--
-- security_barrier = true prevents Postgres from pushing client-side
-- filters into the view's subquery before the view's projection takes
-- effect — this stops attackers from using custom WHERE clauses that
-- reference private columns via function side effects.

DROP VIEW IF EXISTS public.public_user_profiles;

CREATE VIEW public.public_user_profiles
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  id,
  full_name,
  avatar_url,
  member_number,
  occupation
FROM public.users;

-- Lock down who can read the view. Anon (logged-out) cannot read — no
-- use case for that today. Authenticated users can read the safe
-- columns of any other user. Admins keep their full table access via
-- users_admin_all on the users table.
REVOKE ALL ON public.public_user_profiles FROM PUBLIC;
REVOKE ALL ON public.public_user_profiles FROM anon;
GRANT SELECT ON public.public_user_profiles TO authenticated;

COMMENT ON VIEW public.public_user_profiles IS
  'Column-safe projection of users for peer display (Q&A authors, '
  'comment authors, cohort members, leaderboards). Exposes ONLY id, '
  'full_name, avatar_url, member_number, occupation. Email, phone, '
  'bio, city are NEVER returned. Code that needs to show another '
  'user''s name MUST use this view, never SELECT FROM users. The '
  'users table itself remains locked to users_read_own + '
  'users_admin_all.';


-- ─── 2. Split admin_audit_logs policy — admins append-only ───

DROP POLICY IF EXISTS audit_logs_admin ON public.admin_audit_logs;
DROP POLICY IF EXISTS admin_audit_logs_admin_select ON public.admin_audit_logs;
DROP POLICY IF EXISTS admin_audit_logs_admin_insert ON public.admin_audit_logs;

CREATE POLICY admin_audit_logs_admin_select ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY admin_audit_logs_admin_insert ON public.admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Do NOT create UPDATE or DELETE policies. RLS default-deny kicks in,
-- so even admins cannot rewrite history via the REST API.

COMMENT ON TABLE public.admin_audit_logs IS
  'Append-only audit log. RLS forbids UPDATE and DELETE at every role '
  'except service_role. Admins can SELECT and INSERT only.';


-- ─── 3. Add hot-path indexes used by admin dashboard + revenue ───

-- users.created_at — used for total_students range count and daily
-- signups buckets.
CREATE INDEX IF NOT EXISTS users_created_at_idx
  ON public.users (created_at DESC);

-- users.role, created_at — used alongside created_at for "students
-- created in range" count.
CREATE INDEX IF NOT EXISTS users_role_created_at_idx
  ON public.users (role, created_at DESC);

-- enrolments.offering_id, created_at — used for per-offering
-- enrolment counts and date-range filtering.
CREATE INDEX IF NOT EXISTS enrolments_offering_created_at_idx
  ON public.enrolments (offering_id, created_at DESC);

-- enrolments.status, created_at — used for "active enrolments in
-- range" count.
CREATE INDEX IF NOT EXISTS enrolments_status_created_at_idx
  ON public.enrolments (status, created_at DESC);

-- payment_orders.status, created_at — used for revenue sums and
-- date-range filtering.
CREATE INDEX IF NOT EXISTS payment_orders_status_created_at_idx
  ON public.payment_orders (status, created_at DESC);

-- payment_orders.offering_id, status — used for per-offering revenue.
CREATE INDEX IF NOT EXISTS payment_orders_offering_status_idx
  ON public.payment_orders (offering_id, status);

-- chapter_progress.course_id, completed_at — used by per-course
-- completion stats (partial index for size efficiency).
CREATE INDEX IF NOT EXISTS chapter_progress_course_completed_idx
  ON public.chapter_progress (course_id, completed_at)
  WHERE completed_at IS NOT NULL;
