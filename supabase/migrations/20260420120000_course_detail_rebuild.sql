-- Phase 4.1 — Course detail rebuild schema
--
-- Adds content-block columns for Outcomes, Portfolio Pieces, Instructor bio,
-- FAQs, Cohort Schedule, and Seats counter. Plus a new course_testimonials
-- table. All additions are nullable / optional so existing courses keep
-- working; UI components on the student side must render-and-hide gracefully
-- when the data isn't present.
--
-- This migration is transactional. Safe to re-run in part thanks to IF NOT
-- EXISTS guards on each ALTER.

BEGIN;

-- ── courses table: content blocks ─────────────────────────────────────────
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS outcomes                jsonb,  -- string[]
  ADD COLUMN IF NOT EXISTS portfolio_pieces        jsonb,  -- [{title, description, image_url}]
  ADD COLUMN IF NOT EXISTS instructor_bio          text,
  ADD COLUMN IF NOT EXISTS instructor_credentials  jsonb,  -- string[]
  ADD COLUMN IF NOT EXISTS instructor_avatar_url   text,
  ADD COLUMN IF NOT EXISTS instructor_links        jsonb,  -- [{label, url}]
  ADD COLUMN IF NOT EXISTS faqs                    jsonb;  -- [{question, answer}]

-- ── offerings table: cohort-specific scheduling ──────────────────────────
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS seats_total             integer,
  ADD COLUMN IF NOT EXISTS cohort_sessions         jsonb;  -- [{title, starts_at, duration_min}]

-- ── course_testimonials: prior-cohort social proof ───────────────────────
CREATE TABLE IF NOT EXISTS course_testimonials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_name        text NOT NULL,
  student_avatar_url  text,
  quote               text NOT NULL,
  cohort_label        text,
  rating              integer CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  sort_order          integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_testimonials_course_sort_idx
  ON course_testimonials (course_id, sort_order)
  WHERE is_active;

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS set_course_testimonials_updated_at ON course_testimonials;
CREATE TRIGGER set_course_testimonials_updated_at
  BEFORE UPDATE ON course_testimonials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS: public read active, admin full ─────────────────────────────────
ALTER TABLE course_testimonials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_testimonials_public_select ON course_testimonials;
CREATE POLICY course_testimonials_public_select
  ON course_testimonials FOR SELECT
  USING (is_active);

DROP POLICY IF EXISTS course_testimonials_admin_all ON course_testimonials;
CREATE POLICY course_testimonials_admin_all
  ON course_testimonials FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

COMMIT;

-- ── Deploy notes ─────────────────────────────────────────────────────────
-- Run alongside the pending quiz+cert migration when production Supabase
-- credentials are available. No data backfill is required — new columns
-- default to NULL/false and the student UI hides empty sections.
