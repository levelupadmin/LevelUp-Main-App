
CREATE TABLE event_speakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  avatar_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_speakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_speakers_read" ON event_speakers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "event_speakers_admin" ON event_speakers FOR ALL USING (is_admin());

CREATE INDEX idx_event_speakers_event ON event_speakers(event_id);

-- Migrate existing host data
INSERT INTO event_speakers (event_id, name, title, avatar_url, sort_order)
SELECT id, host_name, host_title, host_avatar_url, 0
FROM events
WHERE host_name IS NOT NULL AND host_name != '';
