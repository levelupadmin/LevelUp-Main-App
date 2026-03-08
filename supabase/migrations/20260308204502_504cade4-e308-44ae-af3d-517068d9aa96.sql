
-- 1. Create new enums
CREATE TYPE public.course_type AS ENUM ('masterclass', 'workshop', 'cohort');
CREATE TYPE public.discount_type AS ENUM ('percentage', 'fixed');
CREATE TYPE public.notification_trigger AS ENUM ('reminder', 'completion', 'enrollment', 'drip_release');
CREATE TYPE public.notification_channel AS ENUM ('email', 'whatsapp');
CREATE TYPE public.enrollment_status AS ENUM ('active', 'completed', 'cancelled', 'expired');
CREATE TYPE public.progress_status AS ENUM ('not_started', 'in_progress', 'completed');

-- 2. Add new columns to courses table
ALTER TABLE public.courses
  ADD COLUMN course_type course_type NOT NULL DEFAULT 'masterclass',
  ADD COLUMN payment_page_url text,
  ADD COLUMN zoom_link text,
  ADD COLUMN is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN recurrence_rule jsonb,
  ADD COLUMN drip_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN drip_interval_days integer DEFAULT 7,
  ADD COLUMN certificate_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN certificate_threshold integer DEFAULT 70,
  ADD COLUMN access_tags text[] DEFAULT '{}'::text[];

-- 3. course_schedules
CREATE TABLE public.course_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL,
  end_time time,
  zoom_link text,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.course_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read schedules" ON public.course_schedules FOR SELECT USING (true);
CREATE POLICY "Admins can manage schedules" ON public.course_schedules FOR ALL USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor')) WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor'));

-- 4. enrollments
CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.course_schedules(id) ON DELETE SET NULL,
  status enrollment_status NOT NULL DEFAULT 'active',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  source_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own enrollments" ON public.enrollments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can view all enrollments" ON public.enrollments FOR SELECT USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor'));
CREATE POLICY "Admins can manage enrollments" ON public.enrollments FOR ALL USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor')) WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor'));
CREATE POLICY "Users can insert own enrollment" ON public.enrollments FOR INSERT WITH CHECK (user_id = auth.uid());

-- 5. lesson_progress
CREATE TABLE public.lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  status progress_status NOT NULL DEFAULT 'not_started',
  progress_pct integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own progress" ON public.lesson_progress FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage own progress" ON public.lesson_progress FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all progress" ON public.lesson_progress FOR SELECT USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor'));

-- 6. coupon_codes
CREATE TABLE public.coupon_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type discount_type NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  max_uses integer,
  current_uses integer NOT NULL DEFAULT 0,
  valid_from timestamptz,
  valid_until timestamptz,
  applicable_course_ids uuid[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupon_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage coupons" ON public.coupon_codes FOR ALL USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Anyone can read active coupons for validation" ON public.coupon_codes FOR SELECT USING (is_active = true);

-- 7. certificates
CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  completion_pct integer NOT NULL DEFAULT 0,
  certificate_url text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own certificates" ON public.certificates FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage certificates" ON public.certificates FOR ALL USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor')) WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor'));

-- 8. course_access_grants
CREATE TABLE public.course_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  granted_course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_course_id, granted_course_id)
);
ALTER TABLE public.course_access_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage access grants" ON public.course_access_grants FOR ALL USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Anyone can read access grants" ON public.course_access_grants FOR SELECT USING (true);

-- 9. notification_templates
CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  trigger_type notification_trigger NOT NULL,
  channel notification_channel NOT NULL DEFAULT 'email',
  subject text,
  template_body text NOT NULL,
  hours_before integer DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage templates" ON public.notification_templates FOR ALL USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- 10. scheduled_notifications
CREATE TABLE public.scheduled_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.notification_templates(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL DEFAULT 'email',
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage scheduled notifications" ON public.scheduled_notifications FOR ALL USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users can view own notifications" ON public.scheduled_notifications FOR SELECT USING (user_id = auth.uid());
