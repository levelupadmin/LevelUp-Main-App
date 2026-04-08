-- Live Sessions table for scheduling cohort/workshop Zoom classes
CREATE TABLE IF NOT EXISTS live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer DEFAULT 60,
  zoom_link text,
  recording_url text,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast lookups by course and date
CREATE INDEX IF NOT EXISTS idx_live_sessions_course_date
  ON live_sessions (course_id, scheduled_at DESC);

-- Index for student dashboard: upcoming sessions across all courses
CREATE INDEX IF NOT EXISTS idx_live_sessions_upcoming
  ON live_sessions (scheduled_at ASC)
  WHERE status = 'scheduled';

-- RLS policies
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY live_sessions_admin_all ON live_sessions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Students can read sessions for courses they are enrolled in
CREATE POLICY live_sessions_student_read ON live_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrolments
      WHERE enrolments.user_id = auth.uid()
        AND enrolments.offering_id IN (
          SELECT offering_id FROM offering_courses WHERE course_id = live_sessions.course_id
        )
        AND enrolments.status = 'active'
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_live_sessions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER live_sessions_updated_at
  BEFORE UPDATE ON live_sessions
  FOR EACH ROW EXECUTE FUNCTION update_live_sessions_updated_at();

COMMENT ON TABLE live_sessions IS 'Scheduled live Zoom sessions for cohort courses and workshops';
