
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper: auto-update updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CLUSTER 1: AUTH & USERS
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  phone text UNIQUE,
  full_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('admin','instructor','student')),
  bio text,
  city text,
  occupation text,
  open_to_collaborate boolean DEFAULT false,
  skills text[] DEFAULT '{}',
  onboarded_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE instructor_course_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL,
  assigned_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (instructor_id, course_id)
);

-- CLUSTER 2: COURSE CATALOG
CREATE TABLE course_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  emoji text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  subtitle text,
  description text,
  category_id uuid REFERENCES course_categories(id),
  instructor_display_name text,
  instructor_bio text,
  instructor_avatar_url text,
  thumbnail_url text,
  hero_image_url text,
  trailer_video_url text,
  level text CHECK (level IN ('beginner','intermediate','advanced')),
  language text DEFAULT 'en',
  what_youll_learn text[] DEFAULT '{}',
  tags text[] DEFAULT '{}',
  duration_minutes integer DEFAULT 0,
  total_lessons integer DEFAULT 0,
  rating_avg numeric(2,1) DEFAULT 0,
  rating_count integer DEFAULT 0,
  student_count integer DEFAULT 0,
  drm_enabled boolean NOT NULL DEFAULT false,
  show_as_locked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE instructor_course_assignments
  ADD CONSTRAINT instructor_course_assignments_course_fk
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

CREATE TABLE sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  drip_days_after_enrolment integer,
  drip_specific_date date,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER sections_updated_at BEFORE UPDATE ON sections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  content_type text NOT NULL CHECK (content_type IN ('video','audio','image','pdf','assignment','embedded','article')),
  media_url text,
  embed_url text,
  article_body text,
  thumbnail_url text,
  subtitle_url text,
  description text,
  duration_seconds integer,
  make_free boolean NOT NULL DEFAULT false,
  assignment_prompt text,
  original_filename text,
  file_size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER chapters_updated_at BEFORE UPDATE ON chapters FOR EACH ROW EXECUTE FUNCTION set_updated_at();
