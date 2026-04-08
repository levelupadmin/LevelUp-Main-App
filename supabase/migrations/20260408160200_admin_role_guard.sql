-- Deep sweep fix: two related holes on users.role
--
-- 1. AdminUsers.tsx lets an admin edit their own row and change their own
--    role to 'student', locking themselves out.
-- 2. Nothing prevents demoting the last admin, which would leave the org
--    with no one who can reach the admin panel.
--
-- RLS (already in place) restricts users UPDATE to is_admin() OR self. We
-- add a BEFORE UPDATE trigger that enforces two invariants at the DB level,
-- so neither the admin UI nor a compromised service-role path can violate
-- them by accident:
--
--   (a) A user cannot change their own role via a normal RLS'd call.
--       (auth.uid() is NULL under service_role, so this only fires for
--       real admin users editing themselves.)
--   (b) The last remaining admin cannot be demoted.

CREATE OR REPLACE FUNCTION public.enforce_admin_role_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_remaining_admins int;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- (a) Block self role changes from any authenticated context.
    IF v_caller IS NOT NULL AND v_caller = NEW.id THEN
      RAISE EXCEPTION 'You cannot change your own role'
        USING ERRCODE = '42501';
    END IF;

    -- (b) Block demoting the last admin.
    IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
      SELECT count(*) INTO v_remaining_admins
      FROM public.users
      WHERE role = 'admin' AND id <> OLD.id;

      IF v_remaining_admins = 0 THEN
        RAISE EXCEPTION 'Cannot demote the last admin'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_admin_role_guard ON public.users;

CREATE TRIGGER users_admin_role_guard
  BEFORE UPDATE OF role ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_admin_role_invariants();
