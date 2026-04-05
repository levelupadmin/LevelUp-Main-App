
-- WORKSHOPS
CREATE POLICY workshops_read ON workshops FOR SELECT USING (
  offering_id IS NULL
  OR is_admin()
  OR EXISTS (SELECT 1 FROM enrolments WHERE user_id = auth.uid() AND offering_id = workshops.offering_id AND status = 'active')
);
CREATE POLICY workshops_admin ON workshops FOR ALL USING (is_admin());

CREATE POLICY attendance_own ON workshop_attendance FOR ALL USING (auth.uid() = user_id);
CREATE POLICY attendance_admin ON workshop_attendance FOR SELECT USING (is_admin());

-- COMMUNITY
CREATE POLICY posts_read ON community_posts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY posts_insert_own ON community_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY posts_update_own ON community_posts FOR UPDATE USING (auth.uid() = user_id OR is_admin());
CREATE POLICY posts_delete_own ON community_posts FOR DELETE USING (auth.uid() = user_id OR is_admin());

CREATE POLICY likes_read ON community_post_likes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY likes_own ON community_post_likes FOR ALL USING (auth.uid() = user_id);

CREATE POLICY post_comments_read ON community_post_comments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY post_comments_insert_own ON community_post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY post_comments_update_own ON community_post_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY post_comments_delete_own ON community_post_comments FOR DELETE USING (auth.uid() = user_id OR is_admin());

-- OPPORTUNITIES
CREATE POLICY opportunities_read ON opportunities FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY opportunities_insert_own ON opportunities FOR INSERT WITH CHECK (auth.uid() = posted_by_user_id);
CREATE POLICY opportunities_update_own ON opportunities FOR UPDATE USING (auth.uid() = posted_by_user_id OR is_admin());
CREATE POLICY opportunities_delete_own ON opportunities FOR DELETE USING (auth.uid() = posted_by_user_id OR is_admin());

CREATE POLICY applications_own ON opportunity_applications FOR ALL USING (auth.uid() = applicant_user_id);
CREATE POLICY applications_poster_read ON opportunity_applications FOR SELECT USING (
  EXISTS (SELECT 1 FROM opportunities WHERE id = opportunity_applications.opportunity_id AND posted_by_user_id = auth.uid())
  OR is_admin()
);

-- PORTFOLIO
CREATE POLICY portfolio_read ON portfolio_projects FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY portfolio_own ON portfolio_projects FOR ALL USING (auth.uid() = user_id);

-- NOTIFICATIONS
CREATE POLICY notifications_own ON notifications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY notifications_admin_insert ON notifications FOR INSERT WITH CHECK (is_admin() OR auth.uid() IS NOT NULL);

-- BULK IMPORTS + AUDIT LOGS
CREATE POLICY bulk_import_admin ON bulk_import_jobs FOR ALL USING (is_admin());
CREATE POLICY audit_logs_admin ON admin_audit_logs FOR ALL USING (is_admin());

-- INSTRUCTOR ASSIGNMENTS
CREATE POLICY instructor_assignments_admin ON instructor_course_assignments FOR ALL USING (is_admin());
CREATE POLICY instructor_assignments_read_own ON instructor_course_assignments FOR SELECT USING (auth.uid() = instructor_id);
