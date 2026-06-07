-- Harden create_team_api_key (privilege escalation).
--
-- 20260526240100_create_team_api_key_rpc.sql defined this SECURITY DEFINER
-- function and granted EXECUTE to `authenticated` with NO caller check. It only
-- validated the scope string and that p_created_by was non-null. So any
-- logged-in student could call it directly over PostgREST:
--     supabase.rpc('create_team_api_key',
--                  { p_name:'x', p_scope:'admin', p_created_by:<any uuid> })
-- and receive a plaintext ADMIN-scoped team API key — full admin-api access.
-- (CREATE FUNCTION also grants EXECUTE to PUBLIC by default, so even anon could
-- reach it depending on PostgREST role exposure.)
--
-- Fix:
--   1. Reject non-admin authenticated callers via public.is_admin().
--   2. Ignore the client-supplied p_created_by; attribute the key to the real
--      caller (auth.uid()). Fall back to p_created_by only for trusted
--      service_role calls, which carry no JWT (auth.uid() IS NULL).
--   3. Strip the implicit PUBLIC/anon EXECUTE grant.
-- The legitimate caller (admin UI in AdminApi.tsx, an authenticated admin)
-- keeps working unchanged.

CREATE OR REPLACE FUNCTION public.create_team_api_key(
  p_name text,
  p_scope text,
  p_expires_at timestamptz DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS TABLE (key_id uuid, plaintext text, hint text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_plain text;
  v_hash text;
  v_hint text;
  v_id uuid;
  v_creator uuid;
BEGIN
  -- Only an app admin (authenticated, users.role in admin/owner) or a trusted
  -- service_role caller (no JWT → auth.uid() IS NULL) may mint keys.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may create team API keys';
  END IF;

  -- Never trust the client-supplied creator id.
  v_creator := COALESCE(auth.uid(), p_created_by);
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'created_by required';
  END IF;

  IF p_scope NOT IN ('read','write','admin') THEN
    RAISE EXCEPTION 'scope must be read|write|admin';
  END IF;

  -- 36 bytes of entropy → 48 chars of base64
  v_plain := 'lvlup_' || replace(replace(replace(
               encode(extensions.gen_random_bytes(36), 'base64'),
               '+', '-'), '/', '_'), '=', '');
  v_hint := right(v_plain, 4);
  v_hash := extensions.crypt(v_plain, extensions.gen_salt('bf', 8));

  INSERT INTO public.team_api_keys (name, scope, hashed_key, key_hint, created_by, expires_at)
  VALUES (p_name, p_scope, v_hash, v_hint, v_creator, p_expires_at)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_plain, v_hint;
END $$;

-- Lock down EXECUTE: drop the implicit PUBLIC grant + anon; keep authenticated
-- (now gated by is_admin() inside) and service_role.
REVOKE EXECUTE ON FUNCTION public.create_team_api_key(text, text, timestamptz, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_team_api_key(text, text, timestamptz, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_team_api_key(text, text, timestamptz, uuid) TO authenticated, service_role;
