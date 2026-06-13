-- ============================================================================
-- Studio — P0 multi-tenant foundation (Content Brain, tool #1 of the Studio hub)
--
-- Studio is a creator tools hub gated to ACTIVE LIVE-COHORT members. Tool #1 is
-- the Content Brain: a per-user private reel swipe-file + a per-user MCP the
-- creator connects their own ChatGPT/Claude to. This migration lays the
-- multi-tenant datastore + RLS + entitlement helpers. NO UI ships until the
-- cross-tenant isolation test (see P0 checklist) is green.
--
-- Isolation posture (council-mandated): every tenant table is RLS-ON with
-- USING (user_id = auth.uid()). App + MCP read AS the user (the MCP edge fn
-- mints a short-lived per-user JWT and calls PostgREST as that user). The
-- service role is used ONLY by the background worker for status writes, never on
-- a multi-user read path. RLS is the PRIMARY guarantee here, not a backstop.
-- ============================================================================

-- ── Entitlement helpers ─────────────────────────────────────────────────────

-- Studio is unlocked for anyone who is an ACTIVE member of a LIVE cohort, i.e.
-- holds an active (non-expired) enrolment in an offering that is a cohort
-- (an offering that has at least one cohort_batch). Server-side, never a client
-- constant; mirrors the is_offering_active / has_course_access pattern.
CREATE OR REPLACE FUNCTION public.is_studio_enabled(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM enrolments e
    WHERE e.user_id = p_user_id
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > now())
      AND EXISTS (SELECT 1 FROM cohort_batches cb WHERE cb.offering_id = e.offering_id)
  );
$$;
REVOKE ALL ON FUNCTION public.is_studio_enabled(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_studio_enabled(uuid) TO anon, authenticated;

-- Cohort-learnings access is LIFETIME: if you were ever part of an offering
-- (enrolment not revoked/cancelled), you keep its learnings forever — even after
-- the enrolment expires and Studio itself locks. Founder decision.
CREATE OR REPLACE FUNCTION public.has_offering_learnings_access(p_offering_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM enrolments e
    WHERE e.user_id = auth.uid()
      AND e.offering_id = p_offering_id
      AND e.status NOT IN ('revoked','cancelled')
  );
$$;
REVOKE ALL ON FUNCTION public.has_offering_learnings_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.has_offering_learnings_access(uuid) TO anon, authenticated;

-- ── cb_reels — the private library ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cb_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram','youtube')),
  shortcode text NOT NULL,                          -- IG shortcode or YT video id
  url text NOT NULL,                                -- canonical permalink (pointer only)
  bucket text NOT NULL DEFAULT 'saved' CHECK (bucket IN ('learn','adapt','saved')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  error text,
  -- oEmbed-permitted metadata only. We DO NOT persist the MP4 or re-host media.
  creator_username text,
  creator_name text,
  title text,
  caption text,
  hashtags text[],
  thumbnail_url text,                               -- pointer to provider CDN, not re-hosted
  transcript text,
  transcript_lang text,
  note text,                                        -- the creator's own study note
  tags text[] NOT NULL DEFAULT '{}',
  highlights text[] NOT NULL DEFAULT '{}',          -- hook, editing, visual-aesthetic, treatment...
  duration integer,
  view_count bigint,
  like_count bigint,
  posted_at timestamptz,
  source text NOT NULL DEFAULT 'paste' CHECK (source IN ('paste','clipboard','shortcut','android_share','mcp')),
  -- Resurfacing / retention engine. acted = note added OR moved to 'adapt' OR opened-in-tool.
  last_revisited_at timestamptz,
  revisit_count integer NOT NULL DEFAULT 0,
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  -- CRITICAL: per-user uniqueness. A GLOBAL UNIQUE(shortcode) (the reference's
  -- bug) lets the 2nd tenant to save a popular reel hijack the 1st's row.
  CONSTRAINT cb_reels_user_shortcode_uniq UNIQUE (user_id, platform, shortcode),
  -- Full-text search over the creator's own library.
  fts tsvector GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig,
      coalesce(transcript,'') || ' ' || coalesce(caption,'') || ' ' ||
      coalesce(title,'') || ' ' || coalesce(creator_username,'') || ' ' || coalesce(note,''))
  ) STORED
);
CREATE INDEX cb_reels_user_created_idx ON public.cb_reels (user_id, created_at DESC);
CREATE INDEX cb_reels_user_bucket_idx ON public.cb_reels (user_id, bucket);
CREATE INDEX cb_reels_fts_idx ON public.cb_reels USING gin (fts);
CREATE INDEX cb_reels_tags_idx ON public.cb_reels USING gin (tags);
CREATE INDEX cb_reels_highlights_idx ON public.cb_reels USING gin (highlights);
CREATE INDEX cb_reels_pending_idx ON public.cb_reels (created_at) WHERE status = 'pending';
CREATE TRIGGER cb_reels_updated_at BEFORE UPDATE ON public.cb_reels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── cb_folders / cb_folder_items — custom folders atop the locked spine ─────
CREATE TABLE IF NOT EXISTS public.cb_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cb_folders_user_name_uniq ON public.cb_folders (user_id, lower(name));

CREATE TABLE IF NOT EXISTS public.cb_folder_items (
  folder_id uuid NOT NULL REFERENCES public.cb_folders(id) ON DELETE CASCADE,
  reel_id uuid NOT NULL REFERENCES public.cb_reels(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, reel_id)
);

-- ── cb_keys — per-user MCP keys (mirrors team_api_keys, user-scoped) ─────────
-- Opaque token shown once; we store sha256(token) only. Looked up on every MCP
-- request, so sha256 (fast) rather than bcrypt.
CREATE TABLE IF NOT EXISTS public.cb_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  hashed_key text NOT NULL,                          -- sha256 hex of the plaintext token
  key_hint text NOT NULL,                            -- last 4 chars for the masked display
  scope text NOT NULL DEFAULT 'read' CHECK (scope IN ('read','write')),
  last_used_at timestamptz,
  last_used_ip inet,
  rotated_from uuid REFERENCES public.cb_keys(id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cb_keys_hashed_idx ON public.cb_keys (hashed_key) WHERE revoked_at IS NULL;
CREATE INDEX cb_keys_user_idx ON public.cb_keys (user_id);

-- ── cb_capture_tokens — per-user iOS Shortcut token (replaces shared secret) ─
CREATE TABLE IF NOT EXISTS public.cb_capture_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,                          -- sha256 hex
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cb_capture_tokens_hash_idx ON public.cb_capture_tokens (token_hash) WHERE revoked_at IS NULL;

-- ── cb_api_call_log — MCP call audit (anomaly detection) ────────────────────
CREATE TABLE IF NOT EXISTS public.cb_api_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key_id uuid REFERENCES public.cb_keys(id) ON DELETE SET NULL,
  tool text,
  args_digest text,
  ip inet,
  latency_ms integer,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cb_api_call_log_user_idx ON public.cb_api_call_log (user_id, created_at DESC);

-- ── cohort_learnings — markdown attached to a cohort OFFERING, lifetime access ─
-- Uploaded by the team into a cohort offering: a session transcript and/or a
-- summary-of-everything-learned markdown. Weekly-as-a-class-finishes or
-- pre-uploaded + scheduled via publish_at. Embeddings (pgvector) come in a
-- later migration; MVP retrieval is Postgres FTS.
CREATE TABLE IF NOT EXISTS public.cohort_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'summary' CHECK (kind IN ('summary','transcript','resource')),
  session_label text,                                -- e.g. "Week 3 — Writing hooks"
  title text NOT NULL,
  body_md text NOT NULL,
  author_id uuid REFERENCES public.users(id),
  published boolean NOT NULL DEFAULT false,
  publish_at timestamptz,                            -- scheduled publish; effective when <= now()
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  fts tsvector GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig, coalesce(title,'') || ' ' || coalesce(body_md,''))
  ) STORED
);
CREATE INDEX cohort_learnings_offering_idx ON public.cohort_learnings (offering_id, sort_order);
CREATE INDEX cohort_learnings_fts_idx ON public.cohort_learnings USING gin (fts);
CREATE TRIGGER cohort_learnings_updated_at BEFORE UPDATE ON public.cohort_learnings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row-Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.cb_reels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb_folders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb_folder_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb_keys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb_capture_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cb_api_call_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_learnings   ENABLE ROW LEVEL SECURITY;

-- cb_reels: own rows only; new captures require an unlocked (active-cohort) user.
CREATE POLICY cb_reels_select_own ON public.cb_reels FOR SELECT USING (user_id = auth.uid());
CREATE POLICY cb_reels_insert_own ON public.cb_reels FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_studio_enabled());
CREATE POLICY cb_reels_update_own ON public.cb_reels FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY cb_reels_delete_own ON public.cb_reels FOR DELETE USING (user_id = auth.uid());
CREATE POLICY cb_reels_admin ON public.cb_reels FOR ALL USING (public.is_admin());

-- cb_folders / items: own rows only.
CREATE POLICY cb_folders_all_own ON public.cb_folders FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY cb_folder_items_all_own ON public.cb_folder_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.cb_folders f WHERE f.id = folder_id AND f.user_id = auth.uid()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cb_folders f WHERE f.id = folder_id AND f.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.cb_reels r WHERE r.id = reel_id AND r.user_id = auth.uid())
  );

-- cb_keys / capture tokens: the user manages their own; the MCP edge fn looks
-- them up with the service role (which bypasses RLS) then mints a user JWT.
CREATE POLICY cb_keys_all_own ON public.cb_keys FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY cb_capture_tokens_all_own ON public.cb_capture_tokens FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- cb_api_call_log: user reads own; only the service role writes (no insert policy).
CREATE POLICY cb_api_call_log_select_own ON public.cb_api_call_log FOR SELECT USING (user_id = auth.uid());

-- cohort_learnings: lifetime read for anyone who was part of the offering, once
-- effectively published; admins (the authoring team) manage everything.
CREATE POLICY cohort_learnings_read ON public.cohort_learnings FOR SELECT USING (
  public.is_admin()
  OR (
    (published = true OR (publish_at IS NOT NULL AND publish_at <= now()))
    AND public.has_offering_learnings_access(offering_id)
  )
);
CREATE POLICY cohort_learnings_admin ON public.cohort_learnings FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
