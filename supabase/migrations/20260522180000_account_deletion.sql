-- =====================================================================
-- Account deletion (Google Play compliance)
-- =====================================================================
--
-- Google Play's mandatory account-deletion policy requires that users
-- be able to delete their account both from inside the app and from a
-- public URL without needing to log in.
--
-- Design:
--
--   * Soft delete first. The `delete-account` edge function marks
--     public.users.deleted_at = now() and clears PII (email, phone,
--     full_name, avatar_url, bio) so cached references stop exposing
--     personal data. The auth.users row is preserved so that the user
--     cannot accidentally re-register the same auth account during the
--     grace period (which would also resurrect any FK-cascade child
--     rows).
--
--   * 7-day grace period. `cleanup_deleted_users()` hard-deletes any
--     row whose deleted_at is older than 7 days. The cascade FKs that
--     already exist (chapter_progress, enrolments, notifications,
--     wishlisted_offerings, certificates, etc., plus auth.users ON
--     DELETE CASCADE) take care of child rows. payment_orders is
--     RESTRICT-keyed, so it stays for compliance/refund recovery; we
--     null out the user_id during hard delete via a separate update so
--     the RESTRICT FK does not block.
--
--   * Public self-serve form. `account_deletion_requests` captures
--     unauthenticated requests submitted from /delete-account. The
--     admin operator reviews and approves each (no auto-delete from
--     this path — email proof of ownership is the gate).
--
--   * RLS: users cannot SELECT their own row once deleted_at is set,
--     so the AuthContext.fetchProfile call returns null and the app
--     treats them as logged out. We DO NOT block SELECT for admins —
--     admins must still see deleted rows to recover within the grace
--     window.
--
--   * `cleanup_deleted_users()` is SECURITY DEFINER + service_role
--     grant only, schedulable via Supabase Cron:
--
--         SELECT cron.schedule(
--           'cleanup-deleted-users-nightly',
--           '30 20 * * *', -- 02:00 IST = 20:30 UTC the previous day
--           $$ SELECT public.cleanup_deleted_users(); $$
--         );
--
-- =====================================================================

BEGIN;

-- ─── 1. Add deleted_at to public.users ───
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS users_deleted_at_idx
  ON public.users(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ─── 2. RLS: block reads of soft-deleted rows ───
--
-- We replace `users_read_own` with a deleted_at-aware version. Admins
-- keep full access via the existing `users_admin_all` policy (FOR ALL
-- USING (is_admin())), so they can still see and recover soft-deleted
-- rows within the grace window.
--
-- Note: `is_admin()` is the SECURITY DEFINER helper from migration
-- 20260308203409. It bypasses RLS to check the caller's role.

DROP POLICY IF EXISTS users_read_own ON public.users;
CREATE POLICY users_read_own ON public.users
  FOR SELECT
  USING (
    (auth.uid() = id AND deleted_at IS NULL)
    OR is_admin()
  );

-- Tighten users_update_own so a soft-deleted user cannot un-delete
-- themselves by writing deleted_at = NULL. Only admins can recover.
-- Mirrors the role-immutability semantics from migration
-- 20260407215331_ac8c059c-dbef-4dce-9c42-3e60a93903d3.sql.
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id AND deleted_at IS NULL)
  WITH CHECK (
    auth.uid() = id
    AND deleted_at IS NULL
    AND role = (SELECT role FROM public.users WHERE id = auth.uid())
  );

-- ─── 3. Public deletion request table ───
--
-- Captures requests from the /delete-account public form. The page
-- itself is unauthenticated so anyone can submit, but inserts are
-- rate-limited via the existing check_and_increment_rate_limit RPC at
-- the edge function layer (no edge function for this — the page inserts
-- directly through a tightly-scoped policy).

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  phone text,
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'completed', 'rejected')),
  -- Resolution metadata (set by admin when processed)
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  processed_by uuid REFERENCES public.users(id),
  processed_at timestamptz,
  admin_notes text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_status_idx
  ON public.account_deletion_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS account_deletion_requests_email_idx
  ON public.account_deletion_requests(email);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Anonymous insert allowed (this is the whole point of the public
-- form). The columns clients can populate are limited via WITH CHECK
-- so a malicious caller cannot pre-set status / processed_by /
-- processed_at / user_id.
DROP POLICY IF EXISTS "anon_insert_deletion_request"
  ON public.account_deletion_requests;
CREATE POLICY "anon_insert_deletion_request"
  ON public.account_deletion_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND user_id IS NULL
    AND processed_by IS NULL
    AND processed_at IS NULL
    AND admin_notes IS NULL
  );

-- Admins read and manage. No one else can read — these are sensitive
-- support tickets and we don't want to leak who has requested deletion.
DROP POLICY IF EXISTS "admin_all_deletion_requests"
  ON public.account_deletion_requests;
CREATE POLICY "admin_all_deletion_requests"
  ON public.account_deletion_requests
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─── 4. cleanup_deleted_users() ───
--
-- Hard-deletes any soft-deleted user whose grace period has expired.
-- Runs as service_role; relies on the auth.users → public.users
-- ON DELETE CASCADE FK (declared in migration 20260405062908) to remove
-- the public.users row as a side effect.
--
-- payment_orders has ON DELETE RESTRICT on user_id, so we null out
-- the FK first to preserve the financial record (Indian tax / Razorpay
-- compliance requires we hang on to payment history for ~8 years
-- regardless of account state).

CREATE OR REPLACE FUNCTION public.cleanup_deleted_users()
RETURNS TABLE(deleted_user_id uuid, deleted_email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT id, email
      FROM public.users
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - interval '7 days'
  LOOP
    -- Detach financial records so the FK RESTRICT does not block.
    UPDATE public.payment_orders
       SET user_id = NULL
     WHERE user_id = v_user.id;

    -- Detach refunds & email campaigns (initiated_by / sent_by are
    -- ON DELETE no-action; null them out so we don't lose the rows).
    UPDATE public.refunds
       SET initiated_by = NULL
     WHERE initiated_by = v_user.id;

    -- Delete the auth.users row; ON DELETE CASCADE removes public.users
    -- and every child table that cascades through it.
    DELETE FROM auth.users WHERE id = v_user.id;

    deleted_user_id := v_user.id;
    deleted_email   := v_user.email;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_deleted_users() FROM public;
GRANT EXECUTE ON FUNCTION public.cleanup_deleted_users() TO service_role;

-- ─── 5. Convenience: request_account_deletion() RPC ───
--
-- Lets the in-app "Delete account" path soft-delete via a single
-- transactional RPC (alternative to the edge function for tests /
-- callers that already have a logged-in supabase-js client). The
-- edge function is the production path because it returns the
-- recoverable_until timestamp and handles the auth header more
-- explicitly, but this RPC is convenient for migrations / scripts.

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_recover_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.users
     SET deleted_at = now(),
         full_name = NULL,
         email = NULL,
         phone = NULL,
         avatar_url = NULL,
         bio = NULL
   WHERE id = v_uid
     AND deleted_at IS NULL;

  v_recover_at := now() + interval '7 days';

  RETURN jsonb_build_object(
    'status', 'deleted',
    'recoverable_until', v_recover_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion() FROM public;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;

COMMIT;
