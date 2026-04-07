
-- 1. Drop the existing users_update_own policy
DROP POLICY IF EXISTS users_update_own ON public.users;

-- 2. Recreate with WITH CHECK that prevents role changes
CREATE POLICY "users_update_own" ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.users WHERE id = auth.uid()));

-- 3. Defense-in-depth trigger to prevent role escalation
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT is_admin() THEN
    RAISE EXCEPTION 'Non-admin users cannot change their role.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_role_immutability
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION prevent_role_escalation();

-- 4. Admin-only update policy
CREATE POLICY "users_admin_update" ON public.users
FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
