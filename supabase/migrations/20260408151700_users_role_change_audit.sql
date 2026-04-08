-- #9: Database-level audit of public.users.role changes.
--
-- Previous state: AdminUsers.tsx can freely promote a student → admin via
-- a plain UPDATE (RLS lets admins write to users). Nothing is recorded.
-- Reconstructing "who made so-and-so an admin, and when" is impossible,
-- and a single compromised admin account could silently escalate others
-- with no forensic trail.
--
-- New state: AFTER UPDATE trigger on public.users writes an
-- admin_audit_logs row whenever NEW.role IS DISTINCT FROM OLD.role.
-- Trigger fires regardless of the write path (admin UI, SQL console,
-- another edge function), so it can't be bypassed from the frontend.

CREATE OR REPLACE FUNCTION public.log_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.admin_audit_logs (
      actor_user_id,
      action,
      target_table,
      target_id,
      metadata
    ) VALUES (
      auth.uid(),
      'user.role_change',
      'users',
      NEW.id,
      jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'target_email', NEW.email
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_user_role_change ON public.users;
CREATE TRIGGER trg_log_user_role_change
  AFTER UPDATE OF role ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.log_user_role_change();
