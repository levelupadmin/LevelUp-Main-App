
-- CLUSTER 9: PLATFORM INFRASTRUCTURE
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link_url text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE bulk_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_by uuid REFERENCES users(id),
  file_url text NOT NULL,
  import_type text NOT NULL CHECK (import_type IN ('users','enrolments','courses','chapters')),
  total_rows integer,
  success_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  error_log jsonb DEFAULT '[]',
  started_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_table text,
  target_id uuid,
  metadata jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_enrolments_user_active ON enrolments(user_id, status) WHERE status = 'active';
CREATE INDEX idx_enrolments_offering ON enrolments(offering_id);
CREATE INDEX idx_enrolments_expires_at ON enrolments(expires_at) WHERE status = 'active';
CREATE INDEX idx_chapter_progress_user_course ON chapter_progress(user_id, course_id);
CREATE INDEX idx_sections_course_sort ON sections(course_id, sort_order);
CREATE INDEX idx_chapters_section_sort ON chapters(section_id, sort_order);
CREATE INDEX idx_offering_courses_course ON offering_courses(course_id);
CREATE INDEX idx_payment_orders_user ON payment_orders(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_community_posts_tag_created ON community_posts(course_tag_id, created_at DESC);
CREATE INDEX idx_opportunities_status_closes ON opportunities(status, closes_at);
CREATE INDEX idx_workshops_scheduled ON workshops(scheduled_at) WHERE status IN ('scheduled','live');
