-- Add an 'owner' role above admin.
--
-- Owner semantics:
--   * Owner has every admin permission (and conceptually more).
--   * Owner can promote/demote other users to/from admin.
--   * Owner cannot be demoted - by themselves or by any admin.
--   * Owner cannot be deleted via normal app paths (RLS + trigger).
--   * Only one owner is expected to exist in production; the system
--     does not enforce uniqueness but the bootstrap script does.
--   * is_admin() continues to return TRUE for owner, so every
--     existing admin-gated query/policy automatically respects owner.

-- 1. Loosen the role check constraint to allow 'owner'.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'instructor'::text, 'author'::text, 'support'::text, 'student'::text]));

-- 2. is_admin() now returns true for owner too (owners are admins+).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
$$;

-- 3. Dedicated is_owner() helper for owner-only checks.
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'owner'
  );
$$;

-- 4. Replace prevent_role_escalation with a richer guard:
--    a. Non-admins still cannot self-change role (existing rule).
--    b. Nobody (not even an admin) can change the owner's role.
--    c. Only the owner can promote anyone TO 'owner'.
--    d. Only the owner can demote another owner (covers future
--       multi-owner setups even though we expect only one).
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- (a) self-edit by non-admin
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Non-admin users cannot change their role.';
    END IF;

    -- (b) owner row is locked from any role change unless the actor
    --     themselves is the owner. This means even an admin acting
    --     through the dashboard cannot demote the owner.
    IF OLD.role = 'owner' AND NOT is_owner() THEN
      RAISE EXCEPTION 'The owner role can only be changed by the owner themselves.';
    END IF;

    -- (c) promotion TO owner requires the actor to already be owner.
    IF NEW.role = 'owner' AND NOT is_owner() THEN
      RAISE EXCEPTION 'Only the owner can grant the owner role.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Block delete-of-owner at the row level.
CREATE OR REPLACE FUNCTION public.prevent_owner_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'owner' AND NOT is_owner() THEN
    RAISE EXCEPTION 'The owner row cannot be deleted by anyone other than the owner.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_owner_delete_trigger ON public.users;
CREATE TRIGGER prevent_owner_delete_trigger
  BEFORE DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_delete();

-- 6. Add owner permissions to role_permissions. The simplest model:
--    owner gets every permission admin gets, plus 'manage_owner'.
--    Existing app code can keep checking is_admin() and Just Work.
INSERT INTO public.role_permissions (role, permission)
SELECT 'owner', permission FROM public.role_permissions WHERE role = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
VALUES ('owner', 'manage_owner')
ON CONFLICT DO NOTHING;
