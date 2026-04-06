
-- Add placement, starts_at, expires_at to hero_slides
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'both'
  CHECK (placement IN ('dashboard', 'login', 'both'));
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Update existing slides to have placement = 'both'
UPDATE hero_slides SET placement = 'both' WHERE placement IS NULL;

-- Create events table
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'online'
    CHECK (event_type IN ('online', 'offline', 'hybrid')),
  image_url text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  duration_minutes integer,
  venue_type text NOT NULL DEFAULT 'zoom'
    CHECK (venue_type IN ('zoom', 'google_meet', 'youtube_live', 'in_person', 'other')),
  venue_label text,
  venue_link text,
  city text,
  host_name text NOT NULL,
  host_title text,
  host_avatar_url text,
  pricing_type text NOT NULL DEFAULT 'free'
    CHECK (pricing_type IN ('free', 'paid', 'free_for_enrolled')),
  price_inr integer,
  max_capacity integer,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'live', 'completed', 'cancelled', 'sold_out')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_read_authenticated" ON events FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "events_admin_write" ON events FOR ALL USING (is_admin());

CREATE TRIGGER set_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Create event_free_courses junction table
CREATE TABLE event_free_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE(event_id, course_id)
);

ALTER TABLE event_free_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "efc_read_auth" ON event_free_courses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "efc_admin_write" ON event_free_courses FOR ALL USING (is_admin());

-- Create event_registrations table
CREATE TABLE event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'attended', 'cancelled', 'no_show')),
  payment_id text,
  amount_paid integer DEFAULT 0,
  registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "er_read_own" ON event_registrations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "er_insert_own" ON event_registrations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "er_admin_all" ON event_registrations FOR ALL USING (is_admin());

-- Fix ADP-Live tier
UPDATE courses SET product_tier = 'advanced_program', sort_order = 24 WHERE slug = 'adp-live';
