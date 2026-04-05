
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_course_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_bumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrolment_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_drip_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_qna ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_qna_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION has_course_access(p_course_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM enrolments e
    JOIN offering_courses oc ON oc.offering_id = e.offering_id
    WHERE e.user_id = auth.uid()
      AND oc.course_id = p_course_id
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > NOW())
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- USERS policies
CREATE POLICY users_read_own ON users FOR SELECT USING (auth.uid() = id OR is_admin());
CREATE POLICY users_read_public ON users FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY users_update_own ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY users_admin_all ON users FOR ALL USING (is_admin());

-- CATEGORIES
CREATE POLICY categories_read ON course_categories FOR SELECT USING (true);
CREATE POLICY categories_admin ON course_categories FOR ALL USING (is_admin());

-- COURSES
CREATE POLICY courses_read_published ON courses FOR SELECT USING (status = 'published' OR is_admin());
CREATE POLICY courses_admin_all ON courses FOR ALL USING (is_admin());
CREATE POLICY courses_instructor_edit ON courses FOR UPDATE USING (
  EXISTS (SELECT 1 FROM instructor_course_assignments WHERE course_id = courses.id AND instructor_id = auth.uid())
);

-- SECTIONS
CREATE POLICY sections_read ON sections FOR SELECT USING (
  EXISTS (SELECT 1 FROM courses WHERE id = sections.course_id AND (status = 'published' OR is_admin()))
);
CREATE POLICY sections_admin ON sections FOR ALL USING (is_admin());
CREATE POLICY sections_instructor ON sections FOR ALL USING (
  EXISTS (SELECT 1 FROM instructor_course_assignments WHERE course_id = sections.course_id AND instructor_id = auth.uid())
);

-- CHAPTERS
CREATE POLICY chapters_read ON chapters FOR SELECT USING (
  chapters.make_free = true
  OR is_admin()
  OR EXISTS (
    SELECT 1 FROM sections s WHERE s.id = chapters.section_id
    AND has_course_access(s.course_id)
  )
);
CREATE POLICY chapters_admin ON chapters FOR ALL USING (is_admin());
CREATE POLICY chapters_instructor ON chapters FOR ALL USING (
  EXISTS (
    SELECT 1 FROM sections s
    JOIN instructor_course_assignments ica ON ica.course_id = s.course_id
    WHERE s.id = chapters.section_id AND ica.instructor_id = auth.uid()
  )
);

-- OFFERINGS
CREATE POLICY offerings_read_active ON offerings FOR SELECT USING (status = 'active' OR is_admin());
CREATE POLICY offerings_admin ON offerings FOR ALL USING (is_admin());
CREATE POLICY offering_courses_read ON offering_courses FOR SELECT USING (true);
CREATE POLICY offering_courses_admin ON offering_courses FOR ALL USING (is_admin());

-- COUPONS
CREATE POLICY coupons_admin ON coupons FOR ALL USING (is_admin());
CREATE POLICY coupons_read_active ON coupons FOR SELECT USING (is_active = true AND (valid_until IS NULL OR valid_until > NOW()));

-- CUSTOM FIELDS
CREATE POLICY custom_fields_read ON custom_field_definitions FOR SELECT USING (true);
CREATE POLICY custom_fields_admin ON custom_field_definitions FOR ALL USING (is_admin());

-- BUMPS
CREATE POLICY bumps_read ON offering_bumps FOR SELECT USING (true);
CREATE POLICY bumps_admin ON offering_bumps FOR ALL USING (is_admin());

-- PAYMENT ORDERS
CREATE POLICY payment_orders_own ON payment_orders FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY payment_orders_insert_own ON payment_orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY payment_orders_admin ON payment_orders FOR ALL USING (is_admin());

-- ENROLMENTS
CREATE POLICY enrolments_own ON enrolments FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY enrolments_admin ON enrolments FOR ALL USING (is_admin());
CREATE POLICY enrolment_audit_admin ON enrolment_audit_log FOR ALL USING (is_admin());

-- DRIP CONFIG
CREATE POLICY drip_config_read ON course_drip_config FOR SELECT USING (true);
CREATE POLICY drip_config_admin ON course_drip_config FOR ALL USING (is_admin());

-- PROGRESS
CREATE POLICY progress_own ON chapter_progress FOR ALL USING (auth.uid() = user_id);
CREATE POLICY progress_admin_read ON chapter_progress FOR SELECT USING (is_admin());

-- REVIEWS
CREATE POLICY reviews_read ON course_reviews FOR SELECT USING (true);
CREATE POLICY reviews_own ON course_reviews FOR ALL USING (auth.uid() = user_id);

-- ASSIGNMENT SUBMISSIONS
CREATE POLICY submissions_own ON assignment_submissions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY submissions_admin ON assignment_submissions FOR ALL USING (is_admin());

-- CHAPTER RESOURCES
CREATE POLICY resources_read ON chapter_resources FOR SELECT USING (
  EXISTS (SELECT 1 FROM chapters c JOIN sections s ON s.id = c.section_id
          WHERE c.id = chapter_resources.chapter_id
          AND (c.make_free OR is_admin() OR has_course_access(s.course_id)))
);
CREATE POLICY resources_admin ON chapter_resources FOR ALL USING (is_admin());

-- QNA
CREATE POLICY qna_read ON chapter_qna FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY qna_insert_own ON chapter_qna FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY qna_update_own ON chapter_qna FOR UPDATE USING (auth.uid() = user_id OR is_admin());
CREATE POLICY qna_admin ON chapter_qna FOR ALL USING (is_admin());

CREATE POLICY qna_replies_read ON chapter_qna_replies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY qna_replies_insert_own ON chapter_qna_replies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY qna_replies_update_own ON chapter_qna_replies FOR UPDATE USING (auth.uid() = user_id OR is_admin());

-- COMMENTS
CREATE POLICY comments_read ON chapter_comments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY comments_insert_own ON chapter_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY comments_update_own ON chapter_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY comments_delete_own ON chapter_comments FOR DELETE USING (auth.uid() = user_id OR is_admin());
