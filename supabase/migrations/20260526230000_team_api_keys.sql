-- Team API keys for the admin-api edge function (used by the CLI + MCP)
--
-- Each key is owned by a single user (must be admin/owner) and has a
-- scope: 'read' (no writes), 'write' (read + non-destructive writes),
-- 'admin' (full surface including destructive actions). The key value
-- is hashed at-rest via crypto.crypt — we only ever store a SHA-256
-- prefix-bucket plus the bcrypt-hash for verification.
--
-- Last 4 chars of the plaintext are kept in `key_hint` so admins can
-- identify which key is which in the management UI.

CREATE TABLE IF NOT EXISTS public.team_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hashed_key text NOT NULL,                    -- bcrypt hash of plaintext
  key_hint text NOT NULL,                       -- last 4 chars of plaintext
  scope text NOT NULL CHECK (scope IN ('read','write','admin')),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  last_used_at timestamptz,
  last_used_ip inet,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_api_keys_hint_len CHECK (char_length(key_hint) BETWEEN 4 AND 8)
);
CREATE INDEX team_api_keys_hashed_idx ON public.team_api_keys (hashed_key)
  WHERE revoked_at IS NULL;

CREATE TRIGGER team_api_keys_updated_at BEFORE UPDATE ON public.team_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: only admins can read/manage their team's keys
ALTER TABLE public.team_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_api_keys_admin_all ON public.team_api_keys
  USING (is_admin()) WITH CHECK (is_admin());

-- Helper to verify an API key. Returns the key row (with key_id +
-- scope + creator) if the plaintext matches an active key, or NULL.
-- SECURITY DEFINER so the edge function can call it without RLS pain.
CREATE OR REPLACE FUNCTION public.verify_team_api_key(p_plaintext text)
RETURNS TABLE (key_id uuid, scope text, created_by uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  row record;
BEGIN
  IF p_plaintext IS NULL OR char_length(p_plaintext) < 16 THEN
    RETURN;
  END IF;
  FOR row IN
    SELECT id, scope AS scp, created_by AS cb, hashed_key
    FROM public.team_api_keys
    WHERE revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  LOOP
    IF row.hashed_key = extensions.crypt(p_plaintext, row.hashed_key) THEN
      RETURN QUERY SELECT row.id, row.scp, row.cb;
      RETURN;
    END IF;
  END LOOP;
  RETURN;
END $$;

GRANT EXECUTE ON FUNCTION public.verify_team_api_key(text) TO authenticated, anon;

-- Track each API call for audit + rate limit support. Cheap insert,
-- pruning happens via a separate housekeeping cron.
CREATE TABLE IF NOT EXISTS public.api_call_log (
  id bigserial PRIMARY KEY,
  api_key_id uuid REFERENCES public.team_api_keys(id) ON DELETE SET NULL,
  action text NOT NULL,
  status_code smallint NOT NULL,
  duration_ms integer,
  ip inet,
  user_agent text,
  request_body jsonb,
  response_summary jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_call_log_action_idx ON public.api_call_log (action, created_at DESC);
CREATE INDEX api_call_log_key_idx ON public.api_call_log (api_key_id, created_at DESC);
CREATE INDEX api_call_log_created_idx ON public.api_call_log (created_at DESC);

ALTER TABLE public.api_call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_call_log_admin_read ON public.api_call_log FOR SELECT
  USING (is_admin());

-- Ensure pgcrypto for crypt() / gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
