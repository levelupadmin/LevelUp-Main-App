
-- Migration 4: Post-purchase upsells table
CREATE TABLE IF NOT EXISTS offering_upsells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_offering_id uuid NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  upsell_offering_id uuid NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  headline text NOT NULL DEFAULT 'Add this to your order',
  description text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(parent_offering_id, upsell_offering_id)
);

ALTER TABLE offering_upsells ENABLE ROW LEVEL SECURITY;

CREATE POLICY offering_upsells_admin ON offering_upsells
  FOR ALL USING (is_admin());

CREATE POLICY offering_upsells_read ON offering_upsells
  FOR SELECT USING (is_active = true);

CREATE TRIGGER set_offering_upsells_updated
  BEFORE UPDATE ON offering_upsells
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
