-- Run after 20260803200000_release_runtime_controls.sql on a shadow/local DB.
-- Read-only except for a room-flag flip inside a transaction that rolls back.
BEGIN;

DO $assert$
DECLARE
  default_expr text;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid)
    INTO default_expr
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE n.nspname = 'public'
     AND c.relname = 'offerings'
     AND a.attname = 'identity_spine_enabled'
     AND a.attnotnull;

  IF default_expr IS NULL OR default_expr NOT IN ('false', 'false::boolean') THEN
    RAISE EXCEPTION 'identity_spine_enabled must be NOT NULL DEFAULT false (got %)', default_expr;
  END IF;

  IF has_table_privilege('anon', 'public.app_runtime_config', 'SELECT')
     OR has_table_privilege('anon', 'public.app_runtime_config', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.app_runtime_config', 'SELECT')
     OR has_table_privilege('authenticated', 'public.app_runtime_config', 'UPDATE') THEN
    RAISE EXCEPTION 'runtime config table is exposed to a client role';
  END IF;

  IF NOT has_function_privilege('anon', 'public.cohort_rooms_surface_enabled()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cohort_rooms_surface_enabled()', 'EXECUTE') THEN
    RAISE EXCEPTION 'narrow runtime getter is not callable by both client roles';
  END IF;

  IF public.cohort_rooms_surface_enabled() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'room surface must seed fail-closed';
  END IF;

  UPDATE public.app_runtime_config
     SET cohort_rooms_enabled = true
   WHERE singleton IS TRUE;

  IF public.cohort_rooms_surface_enabled() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'service-side room flag flip was not observable';
  END IF;
END
$assert$;

ROLLBACK;
