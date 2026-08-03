-- Production runtime controls for the cohort release train.
--
-- Both controls are fail-closed. New offerings do not provision auth users at
-- intake until an operator opts that offering in, and a shipped native bundle
-- cannot expose cohort-room routes unless the server singleton is also true.

ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS identity_spine_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.offerings.identity_spine_enabled IS
  'Server-side intake provisioning switch. False preserves legacy email linking; true is still gated by the intake integrity probe (and the poller env switch). Enable per offering only after a dark ingest succeeds.';

CREATE TABLE IF NOT EXISTS public.app_runtime_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  cohort_rooms_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_runtime_config IS
  'Service-owned, fail-closed runtime controls for already-shipped clients. Clients never read this table directly; they use narrow SECURITY DEFINER getters.';

COMMENT ON COLUMN public.app_runtime_config.cohort_rooms_enabled IS
  'Global room-surface kill switch. Local or bundled client flags cannot override false.';

INSERT INTO public.app_runtime_config (singleton, cohort_rooms_enabled)
VALUES (true, false)
ON CONFLICT (singleton) DO NOTHING;

DROP TRIGGER IF EXISTS app_runtime_config_updated_at ON public.app_runtime_config;
CREATE TRIGGER app_runtime_config_updated_at
  BEFORE UPDATE ON public.app_runtime_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.app_runtime_config ENABLE ROW LEVEL SECURITY;

-- No client-facing table policies by design. The service role is the only
-- writer; anon/authenticated get one boolean through the function below.
REVOKE ALL ON TABLE public.app_runtime_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.app_runtime_config TO service_role;

CREATE OR REPLACE FUNCTION public.cohort_rooms_surface_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT COALESCE(
    (
      SELECT config.cohort_rooms_enabled
      FROM public.app_runtime_config AS config
      WHERE config.singleton IS TRUE
    ),
    false
  );
$fn$;

COMMENT ON FUNCTION public.cohort_rooms_surface_enabled() IS
  'Public, read-only room-surface control for web/native clients. Missing configuration fails closed to false; RLS remains the data authorization boundary.';

REVOKE ALL ON FUNCTION public.cohort_rooms_surface_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cohort_rooms_surface_enabled() TO anon, authenticated, service_role;

-- Incident rollback is deliberately data-only and instant:
--   UPDATE public.app_runtime_config
--      SET cohort_rooms_enabled = false
--    WHERE singleton IS TRUE;
--   UPDATE public.offerings SET identity_spine_enabled = false;
-- Do not drop these controls during an incident; old native bundles depend on
-- the getter continuing to exist and fail closed.
