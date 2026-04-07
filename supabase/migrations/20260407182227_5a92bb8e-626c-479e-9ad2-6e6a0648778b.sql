
-- Migration 1: Pixel tracking columns on offerings
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS meta_pixel_id text,
  ADD COLUMN IF NOT EXISTS google_ads_conversion text,
  ADD COLUMN IF NOT EXISTS custom_tracking_script text;

-- Migration 5: Offering description fields for public page
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS instructor_name text,
  ADD COLUMN IF NOT EXISTS instructor_title text,
  ADD COLUMN IF NOT EXISTS instructor_avatar_url text,
  ADD COLUMN IF NOT EXISTS highlights jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;
