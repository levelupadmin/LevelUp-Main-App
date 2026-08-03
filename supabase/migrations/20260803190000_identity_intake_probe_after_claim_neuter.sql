-- PHASE SP FOLLOW-UP — install the intake probe only after signup claims are inert
--
-- `tally-application-poll` refuses to provision unless this zero-argument RPC
-- exists and returns true. The original SP migration installed it beside a
-- temporary metadata gate inside `claim_legacy_enrolments_for_user()`. That
-- entire claim body is obsolete: 20260727220000 replaced it with an exact no-op
-- and moved purchase claiming to `claim_my_purchases()` after verified sign-in.
--
-- This must be a NEW forward migration, not an edit to 20260727220000. The claim
-- migration is already recorded as applied on existing databases, so editing it
-- would work on a fresh reset but would never install this probe during an
-- upgrade. Placing the probe here makes both paths honest:
--   * fresh database: pending-claim schema -> claim no-op -> probe;
--   * existing database: already-neutered claim -> SP schema -> probe.
-- If the sequence stops early, the probe is absent and the poller fails closed.

DO $$
DECLARE
  v_body text;
BEGIN
  SELECT regexp_replace(p.prosrc, E'--[^\\n]*(\\n|$)', E'\\1', 'g')
    INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'claim_legacy_enrolments_for_user'
    AND p.pronargs = 0;

  IF v_body IS NULL
     OR v_body !~ '^[[:space:]]*BEGIN[[:space:]]+RETURN[[:space:]]+NEW;[[:space:]]+END;[[:space:]]*$' THEN
    RAISE EXCEPTION
      'refusing to enable identity intake: claim_legacy_enrolments_for_user() is not the expected no-op';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.intake_provisioning_gate_ok()
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT true $$;

-- Supabase projects can carry explicit default EXECUTE grants for the API roles,
-- so revoking PUBLIC alone is insufficient on an upgrade.
REVOKE ALL ON FUNCTION public.intake_provisioning_gate_ok() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_provisioning_gate_ok() TO service_role;

COMMENT ON FUNCTION public.intake_provisioning_gate_ok() IS
  'Service-role-only deployment probe for identity intake. Installed only after '
  'the signup-time legacy claim is verified as the 20260727220000 no-op. Its '
  'absence makes tally-application-poll skip provisioning.';

NOTIFY pgrst, 'reload schema';

-- Reversal (reference only; do not run in the forward migration):
-- DROP FUNCTION IF EXISTS public.intake_provisioning_gate_ok();
