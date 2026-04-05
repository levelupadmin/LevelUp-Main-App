
-- Drop trigger on auth.users that references old tables
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop all existing functions that reference old tables
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_student_engagement_score(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Drop existing enum types after tables are dropped
-- First drop all existing tables with CASCADE
DROP TABLE IF EXISTS admin_audit_logs CASCADE;
DROP TABLE IF EXISTS bulk_import_jobs CASCADE;
DROP TABLE IF EXISTS scheduled_notifications CASCADE;
DROP TABLE IF EXISTS notification_templates CASCADE;
DROP TABLE IF EXISTS referral_redemptions CASCADE;
DROP TABLE IF EXISTS referral_codes CASCADE;
DROP TABLE IF EXISTS utm_tracking CASCADE;
DROP TABLE IF EXISTS waitlists CASCADE;
DROP TABLE IF EXISTS post_likes CASCADE;
DROP TABLE IF EXISTS post_comments CASCADE;
DROP TABLE IF EXISTS community_posts CASCADE;
DROP TABLE IF EXISTS community_channels CASCADE;
DROP TABLE IF EXISTS channel_messages CASCADE;
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS community_spaces CASCADE;
DROP TABLE IF EXISTS portfolio_projects CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS lesson_comments CASCADE;
DROP TABLE IF EXISTS lesson_resources CASCADE;
DROP TABLE IF EXISTS lesson_progress CASCADE;
DROP TABLE IF EXISTS qna_answers CASCADE;
DROP TABLE IF EXISTS qna_questions CASCADE;
DROP TABLE IF EXISTS assignment_submissions CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS lessons CASCADE;
DROP TABLE IF EXISTS course_modules CASCADE;
DROP TABLE IF EXISTS course_resources CASCADE;
DROP TABLE IF EXISTS course_drip_config CASCADE;
DROP TABLE IF EXISTS course_schedules CASCADE;
DROP TABLE IF EXISTS course_pricing_variants CASCADE;
DROP TABLE IF EXISTS course_access_grants CASCADE;
DROP TABLE IF EXISTS sales_page_courses CASCADE;
DROP TABLE IF EXISTS sales_pages CASCADE;
DROP TABLE IF EXISTS offering_courses CASCADE;
DROP TABLE IF EXISTS offering_bumps CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS enrolments CASCADE;
DROP TABLE IF EXISTS coupon_codes CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS course_categories CASCADE;
DROP TABLE IF EXISTS hero_slides CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS offerings CASCADE;
DROP TABLE IF EXISTS payment_orders CASCADE;
DROP TABLE IF EXISTS custom_field_definitions CASCADE;
DROP TABLE IF EXISTS enrolment_audit_log CASCADE;
DROP TABLE IF EXISTS sections CASCADE;
DROP TABLE IF EXISTS chapters CASCADE;
DROP TABLE IF EXISTS chapter_progress CASCADE;
DROP TABLE IF EXISTS course_reviews CASCADE;
DROP TABLE IF EXISTS chapter_resources CASCADE;
DROP TABLE IF EXISTS chapter_qna CASCADE;
DROP TABLE IF EXISTS chapter_qna_replies CASCADE;
DROP TABLE IF EXISTS chapter_comments CASCADE;
DROP TABLE IF EXISTS workshops CASCADE;
DROP TABLE IF EXISTS workshop_attendance CASCADE;
DROP TABLE IF EXISTS community_post_likes CASCADE;
DROP TABLE IF EXISTS community_post_comments CASCADE;
DROP TABLE IF EXISTS opportunities CASCADE;
DROP TABLE IF EXISTS opportunity_applications CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS instructor_course_assignments CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop old enum types
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.content_status CASCADE;
DROP TYPE IF EXISTS public.course_type CASCADE;
DROP TYPE IF EXISTS public.difficulty_level CASCADE;
DROP TYPE IF EXISTS public.discount_type CASCADE;
DROP TYPE IF EXISTS public.enrollment_status CASCADE;
DROP TYPE IF EXISTS public.lesson_type CASCADE;
DROP TYPE IF EXISTS public.notification_channel CASCADE;
DROP TYPE IF EXISTS public.notification_trigger CASCADE;
DROP TYPE IF EXISTS public.payment_status CASCADE;
DROP TYPE IF EXISTS public.progress_status CASCADE;
DROP TYPE IF EXISTS public.resource_type CASCADE;
DROP TYPE IF EXISTS public.submission_status CASCADE;
