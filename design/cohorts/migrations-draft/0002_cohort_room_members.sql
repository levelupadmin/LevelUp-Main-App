-- ============================================================================
-- DRAFT — DO NOT APPLY. design/cohorts/migrations-draft/0002_cohort_room_members.sql
-- 🔴 Tier 1 (triggers on enrolments = the payment path's table; RLS spine).
-- Council must specifically argue: (a) AFTER-triggers cannot block/slow
-- enrolment or batch writes (exception guard swallows with WARNING);
-- (b) resolver cost per user (<50ms with prod-shaped fixtures);
-- (c) reconcile duration at prod scale. Same bar as the community-draft C0-T2.
-- ============================================================================
-- The materialized membership table — the ONE table every room policy reads.
-- Pattern inherited (deliberately) from design/community/ARCHITECTURE.md §3:
-- the mapping/resolver backbone survives the rejected community design.

CREATE TABLE public.cohort_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.cohort_batches(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('member','pre_member','mentor','host','alumni')),
  source text NOT NULL DEFAULT 'derived'
    CHECK (source IN ('derived','manual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_member_unique UNIQUE (user_id, offering_id, batch_id)
);
CREATE INDEX room_members_user_idx ON public.cohort_room_members (user_id, status);
CREATE INDEX room_members_offering_idx ON public.cohort_room_members (offering_id, status, role);

CREATE TRIGGER cohort_room_members_updated_at
  BEFORE UPDATE ON public.cohort_room_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

----------------------------------------------------------------------
-- Helpers — the single access gate every content policy routes through.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cohort_room_is_member(p_offering uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cohort_room_members m
    WHERE m.user_id = auth.uid()
      AND m.offering_id = p_offering
      AND m.status = 'active'
  ) OR is_admin();
$$;

-- Batch-precise variant (content rows that are batch-scoped). A NULL batch on
-- the membership row means offering-wide (mentors/hosts).
CREATE OR REPLACE FUNCTION public.cohort_room_can_access(p_offering uuid, p_batch uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cohort_room_members m
    WHERE m.user_id = auth.uid()
      AND m.offering_id = p_offering
      AND m.status = 'active'
      AND (p_batch IS NULL OR m.batch_id = p_batch OR m.batch_id IS NULL)
  ) OR is_admin();
$$;

CREATE OR REPLACE FUNCTION public.cohort_room_can_post_announcement(p_offering uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cohort_room_members m
    WHERE m.user_id = auth.uid()
      AND m.offering_id = p_offering
      AND m.status = 'active'
      AND m.role IN ('mentor','host')
  ) OR is_admin();
$$;

----------------------------------------------------------------------
-- Resolver — re-derives one user's room memberships from truth tables.
-- Truth: cohort_batch_members (via enrolments) = member;
--        enrolments revoked/expired = gone;
--        cohort_applications accepted+ = pre_member (RAHUL DECISION R-D2,
--        default OFF — the INSERT below is guarded by a settings row/flag
--        the council will pin down; shipped disabled).
-- Manual rows (mentor/host) are never touched by the resolver.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cohort_room_resolve_user(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Upsert derived memberships from batch rosters
  INSERT INTO public.cohort_room_members (user_id, offering_id, batch_id, role, source, status)
  SELECT e.user_id, cb.offering_id, cbm.batch_id,
         CASE WHEN c.phase = 'alumni' THEN 'alumni' ELSE 'member' END,
         'derived', 'active'
  FROM public.cohort_batch_members cbm
  JOIN public.enrolments e ON e.id = cbm.enrolment_id AND e.status = 'active'
  JOIN public.cohort_batches cb ON cb.id = cbm.batch_id
  LEFT JOIN public.cohort_room_configs c
    ON c.offering_id = cb.offering_id AND c.batch_id IS NULL
  WHERE e.user_id = p_user
  ON CONFLICT (user_id, offering_id, batch_id)
  DO UPDATE SET status = 'active',
                role = EXCLUDED.role
  WHERE cohort_room_members.source = 'derived';

  -- Retract derived rows whose truth is gone
  UPDATE public.cohort_room_members m
  SET status = 'revoked'
  WHERE m.user_id = p_user
    AND m.source = 'derived'
    AND m.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.cohort_batch_members cbm
      JOIN public.enrolments e ON e.id = cbm.enrolment_id AND e.status = 'active'
      WHERE e.user_id = p_user AND cbm.batch_id = m.batch_id
    );
END $$;

----------------------------------------------------------------------
-- Triggers on truth tables (AFTER, exception-guarded: room resolution must
-- NEVER break an enrolment/batch write — the payment path rides these).
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._room_resolve_from_batch_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  SELECT e.user_id INTO v_user FROM public.enrolments e
  WHERE e.id = COALESCE(NEW.enrolment_id, OLD.enrolment_id);
  IF v_user IS NOT NULL THEN
    BEGIN
      PERFORM public.cohort_room_resolve_user(v_user);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cohort_room resolver failed for %: %', v_user, SQLERRM;
    END;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER room_resolve_on_batch_member
  AFTER INSERT OR DELETE ON public.cohort_batch_members
  FOR EACH ROW EXECUTE FUNCTION public._room_resolve_from_batch_member();

CREATE OR REPLACE FUNCTION public._room_resolve_from_enrolment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.cohort_room_resolve_user(NEW.user_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cohort_room resolver failed for %: %', NEW.user_id, SQLERRM;
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER room_resolve_on_enrolment_status
  AFTER UPDATE OF status ON public.enrolments
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public._room_resolve_from_enrolment();

-- Alumni flip: when a config's phase moves to 'alumni', member → alumni role.
CREATE OR REPLACE FUNCTION public._room_alumni_flip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.phase = 'alumni' AND OLD.phase IS DISTINCT FROM 'alumni' THEN
    UPDATE public.cohort_room_members
    SET role = 'alumni'
    WHERE offering_id = NEW.offering_id AND source = 'derived'
      AND role = 'member' AND status = 'active';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER room_alumni_flip
  AFTER UPDATE OF phase ON public.cohort_room_configs
  FOR EACH ROW EXECUTE FUNCTION public._room_alumni_flip();

----------------------------------------------------------------------
-- Reconcile (nightly pg_cron, mirrors 20260526220000_cohort_notify_cron.sql;
-- schedule statement lands in the applied migration, not this draft) + backfill.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cohort_room_reconcile()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT e.user_id
    FROM public.cohort_batch_members cbm
    JOIN public.enrolments e ON e.id = cbm.enrolment_id
    UNION
    SELECT DISTINCT user_id FROM public.cohort_room_members WHERE source = 'derived'
  LOOP
    PERFORM public.cohort_room_resolve_user(r.user_id);
  END LOOP;
END $$;

----------------------------------------------------------------------
-- RLS: SELECT own row only. NO client writes of any kind (writes happen in
-- SECURITY DEFINER functions owned by postgres; REVOKE the PostgREST defaults).
----------------------------------------------------------------------
ALTER TABLE public.cohort_room_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY room_members_admin_all ON public.cohort_room_members
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY room_members_own_read ON public.cohort_room_members FOR SELECT
  TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.cohort_room_members FROM authenticated;

-- Manual grant RPC (admin-guarded) for mentor/host appointments
CREATE OR REPLACE FUNCTION public.admin_grant_room_member(
  p_user uuid, p_offering uuid, p_role text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF p_role NOT IN ('mentor','host','member') THEN RAISE EXCEPTION 'bad role'; END IF;
  INSERT INTO public.cohort_room_members (user_id, offering_id, batch_id, role, source, status)
  VALUES (p_user, p_offering, NULL, p_role, 'manual', 'active')
  ON CONFLICT (user_id, offering_id, batch_id)
  DO UPDATE SET role = EXCLUDED.role, source = 'manual', status = 'active'
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
