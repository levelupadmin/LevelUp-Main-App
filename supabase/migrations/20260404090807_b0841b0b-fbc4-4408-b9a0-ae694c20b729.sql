
CREATE TABLE public.utm_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID REFERENCES public.enrollments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  referrer TEXT,
  landing_page TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.utm_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own UTM data"
  ON public.utm_tracking FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all UTM data"
  ON public.utm_tracking FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
