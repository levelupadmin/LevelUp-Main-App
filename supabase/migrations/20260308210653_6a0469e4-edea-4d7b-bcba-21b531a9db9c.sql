
-- Referral codes table
CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  coupon_id uuid REFERENCES public.coupon_codes(id) ON DELETE SET NULL,
  total_referrals integer NOT NULL DEFAULT 0,
  successful_referrals integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Referral redemptions tracking
CREATE TABLE public.referral_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id uuid NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

-- Waitlist table
CREATE TABLE public.waitlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.course_schedules(id) ON DELETE SET NULL,
  user_id uuid,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add max_students to courses for capacity tracking
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS max_students integer;

-- RLS for referral_codes
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral codes"
  ON public.referral_codes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own referral codes"
  ON public.referral_codes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all referral codes"
  ON public.referral_codes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS for referral_redemptions
ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redemptions"
  ON public.referral_redemptions FOR SELECT
  TO authenticated
  USING (referred_user_id = auth.uid());

CREATE POLICY "Admins can manage all redemptions"
  ON public.referral_redemptions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated users can insert redemptions"
  ON public.referral_redemptions FOR INSERT
  TO authenticated
  WITH CHECK (referred_user_id = auth.uid());

-- RLS for waitlists
ALTER TABLE public.waitlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join waitlist"
  ON public.waitlists FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view own waitlist entries"
  ON public.waitlists FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage waitlists"
  ON public.waitlists FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Engagement score function
CREATE OR REPLACE FUNCTION public.get_student_engagement_score(_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_lessons', COUNT(lp.id),
    'completed_lessons', COUNT(lp.id) FILTER (WHERE lp.status = 'completed'),
    'in_progress_lessons', COUNT(lp.id) FILTER (WHERE lp.status = 'in_progress'),
    'avg_progress', COALESCE(AVG(lp.progress_pct), 0),
    'courses_enrolled', (SELECT COUNT(*) FROM enrollments WHERE user_id = _user_id AND status = 'active'),
    'courses_completed', (SELECT COUNT(*) FROM enrollments WHERE user_id = _user_id AND status = 'completed'),
    'score', CASE
      WHEN COUNT(lp.id) = 0 THEN 0
      ELSE ROUND(
        (COUNT(lp.id) FILTER (WHERE lp.status = 'completed')::numeric / GREATEST(COUNT(lp.id), 1)) * 60 +
        (COALESCE(AVG(lp.progress_pct), 0) / 100) * 40
      )
    END
  )
  FROM lesson_progress lp
  WHERE lp.user_id = _user_id
$$;
