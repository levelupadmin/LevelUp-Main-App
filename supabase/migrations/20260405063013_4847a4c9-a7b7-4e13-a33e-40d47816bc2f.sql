
-- CLUSTER 4: LEARNING PROGRESS & DRIP
CREATE TABLE course_drip_config (
  course_id uuid PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  drip_mode text NOT NULL DEFAULT 'no_drip' CHECK (drip_mode IN ('no_drip','by_enrolment','specific_date','by_completion')),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER course_drip_config_updated_at BEFORE UPDATE ON course_drip_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE chapter_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  started_at timestamptz,
  completed_at timestamptz,
  last_position_seconds integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, chapter_id)
);
CREATE TRIGGER chapter_progress_updated_at BEFORE UPDATE ON chapter_progress FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE course_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);
CREATE TRIGGER course_reviews_updated_at BEFORE UPDATE ON course_reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  submission_text text,
  submission_file_url text,
  submitted_at timestamptz NOT NULL DEFAULT NOW(),
  admin_feedback text,
  admin_rating integer CHECK (admin_rating BETWEEN 1 AND 5),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER assignment_submissions_updated_at BEFORE UPDATE ON assignment_submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- CLUSTER 5: CHAPTER INTERACTIONS
CREATE TABLE chapter_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE chapter_qna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  is_resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER chapter_qna_updated_at BEFORE UPDATE ON chapter_qna FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE chapter_qna_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qna_id uuid NOT NULL REFERENCES chapter_qna(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reply_text text NOT NULL,
  is_instructor_reply boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE chapter_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_text text NOT NULL,
  parent_comment_id uuid REFERENCES chapter_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER chapter_comments_updated_at BEFORE UPDATE ON chapter_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
