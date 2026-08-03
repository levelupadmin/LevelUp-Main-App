-- PHASE IV durable Calendly identity harness.
-- Run after migrations, for example:
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < qa-harness/calendly-application-binding.sql

BEGIN;

DO $harness$
DECLARE
  v_offering_id uuid := gen_random_uuid();
  v_application_id uuid := gen_random_uuid();
  v_token uuid;
  v_policy_count integer;
  v_rls boolean;
BEGIN
  SELECT c.relrowsecurity
    INTO v_rls
    FROM pg_class c
   WHERE c.oid = 'public.cohort_calendly_bindings'::regclass;
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'cohort_calendly_bindings must have RLS enabled';
  END IF;

  SELECT count(*)
    INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'cohort_calendly_bindings';
  IF v_policy_count <> 0 THEN
    RAISE EXCEPTION 'binding table must have no client RLS policies, found %', v_policy_count;
  END IF;

  IF has_table_privilege('anon', 'public.cohort_calendly_bindings', 'SELECT')
     OR has_table_privilege('authenticated', 'public.cohort_calendly_bindings', 'SELECT') THEN
    RAISE EXCEPTION 'anon/authenticated can read Calendly application bindings';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.cohort_calendly_bindings', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.cohort_calendly_bindings', 'INSERT') THEN
    RAISE EXCEPTION 'service_role lacks binding table SELECT/INSERT';
  END IF;

  INSERT INTO public.offerings (id, title, slug, type, price_inr)
  VALUES (v_offering_id, 'IV binding harness', 'iv-binding-' || replace(v_offering_id::text, '-', ''), 'onetime', 0);

  INSERT INTO public.cohort_applications (id, offering_id, full_name, email)
  VALUES (v_application_id, v_offering_id, 'IV Harness', 'iv-binding-harness@example.com');

  INSERT INTO public.cohort_calendly_bindings (application_id)
  VALUES (v_application_id)
  RETURNING token INTO v_token;

  IF v_token IS NULL OR v_token = v_application_id THEN
    RAISE EXCEPTION 'binding token must be random and distinct from the application id';
  END IF;

  DELETE FROM public.cohort_applications WHERE id = v_application_id;
  IF EXISTS (
    SELECT 1 FROM public.cohort_calendly_bindings WHERE application_id = v_application_id
  ) THEN
    RAISE EXCEPTION 'binding did not cascade-delete with its application';
  END IF;

  RAISE NOTICE 'PASS: Calendly binding is opaque, service-role-only, and cascade-owned';
END
$harness$;

ROLLBACK;
