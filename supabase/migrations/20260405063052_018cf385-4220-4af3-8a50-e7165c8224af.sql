
-- CLUSTER 6: WORKSHOPS
CREATE TABLE workshops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  zoom_link text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  recurrence_rule text,
  is_recurring boolean NOT NULL DEFAULT false,
  thumbnail_url text,
  offering_id uuid REFERENCES offerings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','completed','cancelled')),
  send_reminders boolean NOT NULL DEFAULT true,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER workshops_updated_at BEFORE UPDATE ON workshops FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE workshop_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz,
  left_at timestamptz,
  duration_minutes integer,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (workshop_id, user_id)
);

-- CLUSTER 7: COMMUNITY FEED
CREATE TABLE community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_text text NOT NULL,
  media_urls text[] DEFAULT '{}',
  course_tag_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  is_admin_post boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER community_posts_updated_at BEFORE UPDATE ON community_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE community_post_likes (
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE community_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_text text NOT NULL,
  parent_comment_id uuid REFERENCES community_post_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER community_post_comments_updated_at BEFORE UPDATE ON community_post_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- CLUSTER 8: OPPORTUNITIES + PORTFOLIO
CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('job','gig','collaboration','internship','project_call')),
  title text NOT NULL,
  description text,
  location_type text CHECK (location_type IN ('remote','onsite','hybrid')),
  location_city text,
  compensation_min_inr numeric(10,2),
  compensation_max_inr numeric(10,2),
  skills_required text[] DEFAULT '{}',
  closes_at timestamptz,
  poster_is_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','filled')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER opportunities_updated_at BEFORE UPDATE ON opportunities FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE opportunity_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  applicant_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_note text,
  portfolio_link text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed','shortlisted','rejected')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, applicant_user_id)
);
CREATE TRIGGER opportunity_applications_updated_at BEFORE UPDATE ON opportunity_applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE portfolio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  thumbnail_url text,
  external_url text,
  media_urls text[] DEFAULT '{}',
  tags text[] DEFAULT '{}',
  view_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER portfolio_projects_updated_at BEFORE UPDATE ON portfolio_projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
