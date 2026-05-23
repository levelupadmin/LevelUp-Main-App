-- ============================================================================
-- analytics_settings — single-row platform config for client-side tracking.
-- ============================================================================
--
-- Holds the project IDs / pixel IDs for the four analytics platforms we
-- support: Microsoft Clarity, Meta Pixel, Google Analytics 4, and the
-- Twitter (X) Pixel. The frontend reads this row anonymously on app boot
-- and injects the relevant scripts. Admins manage it via /admin/analytics.
--
-- Design:
--   * One row only. Enforced by a `singleton` boolean PRIMARY KEY = true
--     check. Keeps reads simple (always SELECT * LIMIT 1).
--   * IDs only - no secrets. Conversions-API tokens belong in Supabase
--     edge function secrets, never in DB.
--   * Anon SELECT is allowed (scripts have to load for unauthed visitors)
--     but write is admin-only via has_role().

CREATE TABLE IF NOT EXISTS public.analytics_settings (
  singleton              boolean     PRIMARY KEY DEFAULT true CHECK (singleton),
  clarity_project_id     text,
  meta_pixel_id          text,
  ga4_measurement_id     text,
  twitter_pixel_id       text,
  -- Tracking enabled flags so admins can pause a platform without
  -- losing the ID.
  clarity_enabled        boolean     NOT NULL DEFAULT true,
  meta_pixel_enabled     boolean     NOT NULL DEFAULT true,
  ga4_enabled            boolean     NOT NULL DEFAULT true,
  twitter_pixel_enabled  boolean     NOT NULL DEFAULT true,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid        REFERENCES auth.users(id)
);

-- Seed the singleton row so SELECT always returns something.
INSERT INTO public.analytics_settings (singleton)
  VALUES (true)
  ON CONFLICT DO NOTHING;

-- Keep updated_at fresh on any change.
CREATE OR REPLACE FUNCTION public.touch_analytics_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analytics_settings_touch_updated_at ON public.analytics_settings;
CREATE TRIGGER analytics_settings_touch_updated_at
  BEFORE UPDATE ON public.analytics_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_analytics_settings_updated_at();

ALTER TABLE public.analytics_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone reads analytics settings"    ON public.analytics_settings;
DROP POLICY IF EXISTS "admins update analytics settings"   ON public.analytics_settings;
DROP POLICY IF EXISTS "admins insert analytics settings"   ON public.analytics_settings;

-- Anon + authenticated can SELECT. The script-loader on app boot has
-- to run for unauthed visitors so they can be tracked through the
-- funnel.
CREATE POLICY "anyone reads analytics settings"
  ON public.analytics_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins / owners can update.
CREATE POLICY "admins update analytics settings"
  ON public.analytics_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- INSERT shouldn't happen post-seed but lock it down anyway.
CREATE POLICY "admins insert analytics settings"
  ON public.analytics_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.analytics_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.analytics_settings TO authenticated;

COMMENT ON TABLE public.analytics_settings IS
  'Single-row platform config for client-side tracking (Clarity, Meta Pixel, GA4, Twitter Pixel). Admin-managed via /admin/analytics.';
