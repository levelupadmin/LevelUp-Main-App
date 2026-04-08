-- #14: Database-level audit of admin enrolment actions.
--
-- Previous state: AdminEnrolments.tsx can grant, revoke, or cancel
-- enrolments with direct UPDATEs to public.enrolments. Only the
-- checkout/webhook paths were writing to enrolment_audit_log; the
-- admin UI wrote nothing. "Who revoked this student, and why" could
-- not be answered from the database.
--
-- New state: AFTER INSERT OR UPDATE trigger on enrolments that writes
-- to enrolment_audit_log whenever:
--   • a brand-new row is inserted with source = 'admin_grant'
--     (normal checkout inserts continue to log explicitly from the
--     edge function — we skip those here to avoid duplicate rows)
--   • an UPDATE changes `status` (active ↔ revoked/cancelled/expired)
--   • an UPDATE changes `expires_at`
-- The trigger captures auth.uid() as actor and carries useful context
-- in the metadata jsonb.

CREATE OR REPLACE FUNCTION public.log_enrolment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_actor  uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only log admin-driven inserts here; the checkout / razorpay-webhook
    -- paths already INSERT their own enrolment_audit_log row.
    IF NEW.source = 'admin_grant' THEN
      INSERT INTO public.enrolment_audit_log (
        enrolment_id, action, actor_user_id, metadata
      ) VALUES (
        NEW.id,
        'granted',
        v_actor,
        jsonb_build_object(
          'source', NEW.source,
          'user_id', NEW.user_id,
          'offering_id', NEW.offering_id,
          'via', 'db_trigger'
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE path
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'active'    THEN 'restored'
      WHEN 'revoked'   THEN 'revoked'
      WHEN 'cancelled' THEN 'revoked'
      WHEN 'expired'   THEN 'expired'
      ELSE NULL
    END;

    IF v_action IS NOT NULL THEN
      INSERT INTO public.enrolment_audit_log (
        enrolment_id, action, actor_user_id, reason, metadata
      ) VALUES (
        NEW.id,
        v_action,
        v_actor,
        NEW.revoked_reason,
        jsonb_build_object(
          'old_status', OLD.status,
          'new_status', NEW.status,
          'user_id', NEW.user_id,
          'offering_id', NEW.offering_id,
          'via', 'db_trigger'
        )
      );
    END IF;
  ELSIF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    INSERT INTO public.enrolment_audit_log (
      enrolment_id, action, actor_user_id, metadata
    ) VALUES (
      NEW.id,
      'extended',
      v_actor,
      jsonb_build_object(
        'old_expires_at', OLD.expires_at,
        'new_expires_at', NEW.expires_at,
        'via', 'db_trigger'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_enrolment_change ON public.enrolments;
CREATE TRIGGER trg_log_enrolment_change
  AFTER INSERT OR UPDATE ON public.enrolments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_enrolment_change();
