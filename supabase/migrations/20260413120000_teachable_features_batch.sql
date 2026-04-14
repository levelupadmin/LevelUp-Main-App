-- ============================================================
-- Teachable Feature Batch
-- Adds: checkout social proof, quiz system, RBAC, coupon display
-- ============================================================

-- ── 1. Checkout Social Proof columns on offerings ──
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS checkout_testimonials jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checkout_bullets jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checkout_guarantee_text text;

-- ── 2. Quiz System ──
CREATE TABLE IF NOT EXISTS chapter_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Quiz',
  description text,
  pass_percentage integer NOT NULL DEFAULT 70,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES chapter_quizzes(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'true_false')),
  explanation text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES chapter_quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chapter_quizzes_chapter ON chapter_quizzes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_options_question ON quiz_options(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_user ON quiz_attempts(quiz_id, user_id);

CREATE OR REPLACE TRIGGER set_chapter_quizzes_updated_at
  BEFORE UPDATE ON chapter_quizzes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE chapter_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_quizzes" ON chapter_quizzes FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'author')));
CREATE POLICY "admin_manage_quiz_questions" ON quiz_questions FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'author')));
CREATE POLICY "admin_manage_quiz_options" ON quiz_options FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'author')));
CREATE POLICY "students_read_quizzes" ON chapter_quizzes FOR SELECT USING (true);
CREATE POLICY "students_read_questions" ON quiz_questions FOR SELECT USING (true);
CREATE POLICY "students_read_options" ON quiz_options FOR SELECT USING (true);
CREATE POLICY "students_insert_attempts" ON quiz_attempts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "students_read_own_attempts" ON quiz_attempts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "admin_read_all_attempts" ON quiz_attempts FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ── 3. RBAC ──
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'instructor', 'author', 'support', 'student'));

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role, permission)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_manage_permissions" ON role_permissions FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

INSERT INTO role_permissions (role, permission) VALUES
  ('admin', 'dashboard.view'), ('admin', 'courses.manage'), ('admin', 'offerings.manage'),
  ('admin', 'users.manage'), ('admin', 'enrolments.manage'), ('admin', 'revenue.view'),
  ('admin', 'analytics.view'), ('admin', 'audit_logs.view'), ('admin', 'settings.manage'),
  ('admin', 'applications.manage'), ('admin', 'community.manage'),
  ('author', 'dashboard.view'), ('author', 'courses.manage'), ('author', 'offerings.manage'),
  ('support', 'dashboard.view'), ('support', 'users.manage'), ('support', 'enrolments.manage'), ('support', 'applications.manage'),
  ('instructor', 'dashboard.view'), ('instructor', 'community.manage')
ON CONFLICT (role, permission) DO NOTHING;

-- ── 4. Coupon display on offerings ──
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS show_coupon_on_page boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS page_coupon_code text;
