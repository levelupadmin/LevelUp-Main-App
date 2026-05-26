-- Helper RPC: create_team_api_key(name, scope, expires_at, created_by)
-- Generates a high-entropy plaintext key, bcrypt-hashes it server-side,
-- inserts the team_api_keys row, and returns { key_id, plaintext, hint }.
-- The plaintext is shown only here — the row stores only the bcrypt hash.

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
BEGIN
  IF p_scope NOT IN ('read','write','admin') THEN
    RAISE EXCEPTION 'scope must be read|write|admin';
  END IF;
  IF p_created_by IS NULL THEN
    RAISE EXCEPTION 'created_by required';
  END IF;

  -- 36 bytes of entropy → 48 chars of base64
  v_plain := 'lvlup_' || replace(replace(replace(
               encode(extensions.gen_random_bytes(36), 'base64'),
               '+', '-'), '/', '_'), '=', '');
  v_hint := right(v_plain, 4);
  v_hash := extensions.crypt(v_plain, extensions.gen_salt('bf', 8));

  INSERT INTO public.team_api_keys (name, scope, hashed_key, key_hint, created_by, expires_at)
  VALUES (p_name, p_scope, v_hash, v_hint, p_created_by, p_expires_at)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_plain, v_hint;
END $$;

GRANT EXECUTE ON FUNCTION public.create_team_api_key(text, text, timestamptz, uuid) TO authenticated, service_role;
