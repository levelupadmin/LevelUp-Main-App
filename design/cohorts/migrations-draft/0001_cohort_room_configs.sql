-- ============================================================================
-- DRAFT — DO NOT APPLY. design/cohorts/migrations-draft/0001_cohort_room_configs.sql
-- 🔴 Tier 1 (Supabase migration + RLS). Before this can move to supabase/migrations/:
--   bugfix-council argues it · adversarial suite green on a shadow project ·
--   Rahul signs off in writing · prod backup · link ivkvluezuiojovpotlyb explicitly.
-- ============================================================================
-- Cohort room config: one row per offering (optional batch override) = the room's
-- skin (theme) + feature level (modules) + lifecycle (phase). New cohort room =
-- one INSERT here; zero code.

CREATE TABLE public.cohort_room_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.cohort_batches(id) ON DELETE CASCADE,  -- NULL = all batches of the offering
  slug text NOT NULL UNIQUE,          -- /room/:slug (default from offerings.slug)
  phase text NOT NULL DEFAULT 'pre_start'
    CHECK (phase IN ('pre_start','live','wrap','alumni')),

  -- THEME — the "album art" skin. Validated shape (admin editor is the writer):
  --   accent_h/accent_s/accent_l  (required ints; ONE accent per room)
  --   accent_text_l               (optional lightness override for small text)
  --   hero_url, wordmark_text, monogram, texture ('grain'|'none'), tagline
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT theme_has_accent CHECK (
    theme ? 'accent_h' AND theme ? 'accent_s' AND theme ? 'accent_l'
  ),
  CONSTRAINT theme_texture_allowed CHECK (
    COALESCE(theme->>'texture','none') IN ('grain','none')
  ),

  -- MODULES — the feature matrix. Absent key = module default (documented in
  -- ROOMS-ARCHITECTURE §5). RLS NEVER reads this column — UX only.
  modules jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- one config per (offering, batch-or-null); partial unique indexes below
  CONSTRAINT room_config_batch_matches_offering
    CHECK (batch_id IS NULL OR true)  -- integrity of batch→offering enforced by trigger below
);

-- One offering-level row; at most one override per batch.
CREATE UNIQUE INDEX cohort_room_configs_offering_default
  ON public.cohort_room_configs (offering_id) WHERE batch_id IS NULL;
CREATE UNIQUE INDEX cohort_room_configs_batch_override
  ON public.cohort_room_configs (offering_id, batch_id) WHERE batch_id IS NOT NULL;

-- Guard: a batch override must belong to the same offering (composite-FK
-- equivalent; cohort_batches has no (id, offering_id) unique pair yet, so a
-- trigger stands in — council may prefer adding the unique pair + real FK).
CREATE OR REPLACE FUNCTION public._room_config_batch_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cohort_batches b
    WHERE b.id = NEW.batch_id AND b.offering_id = NEW.offering_id
  ) THEN
    RAISE EXCEPTION 'batch % does not belong to offering %', NEW.batch_id, NEW.offering_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER room_config_batch_guard
  BEFORE INSERT OR UPDATE ON public.cohort_room_configs
  FOR EACH ROW EXECUTE FUNCTION public._room_config_batch_guard();

CREATE TRIGGER cohort_room_configs_updated_at
  BEFORE UPDATE ON public.cohort_room_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: members + admins read; only admins write. Theme/modules are not secret,
-- but they are not public marketing data either — the offering page carries its
-- own art. (Membership helper arrives in 0002; policy references it.)
ALTER TABLE public.cohort_room_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY room_configs_admin_all ON public.cohort_room_configs
  USING (is_admin()) WITH CHECK (is_admin());

-- NOTE: cohort_room_is_member() is defined in 0002; apply order matters.
CREATE POLICY room_configs_member_read ON public.cohort_room_configs FOR SELECT
  TO authenticated
  USING (public.cohort_room_is_member(offering_id));
