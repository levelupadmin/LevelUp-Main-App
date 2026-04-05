
-- Live sessions table
CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  zoom_link text,
  recording_url text,
  hero_image_url text,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_live_sessions_starts_at ON live_sessions(starts_at);
CREATE INDEX idx_live_sessions_course_id ON live_sessions(course_id);

ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_sessions_read" ON live_sessions FOR SELECT
  USING (has_course_access(course_id) OR is_admin());

CREATE POLICY "live_sessions_admin_write" ON live_sessions FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE TRIGGER trg_live_sessions_updated_at BEFORE UPDATE ON live_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Add member_number to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_number serial;

-- QnA posts table
CREATE TABLE public.qna_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  upvote_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE qna_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qna_read_all" ON qna_posts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "qna_write_own" ON qna_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "qna_update_own" ON qna_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "qna_admin" ON qna_posts FOR ALL USING (is_admin());

CREATE TRIGGER trg_qna_posts_updated_at BEFORE UPDATE ON qna_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
