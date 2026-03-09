
-- 1. Create resource_type enum
CREATE TYPE public.resource_type AS ENUM ('slide', 'template', 'recording', 'link', 'pdf');

-- 2. Create course_pricing_variants table
CREATE TABLE public.course_pricing_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Standard',
  price INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_link TEXT,
  is_active_on_site BOOLEAN NOT NULL DEFAULT false,
  is_active_for_ads BOOLEAN NOT NULL DEFAULT true,
  valid_from TIMESTAMP WITH TIME ZONE,
  valid_until TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.course_pricing_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pricing variants"
  ON public.course_pricing_variants FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Anyone can read active pricing variants"
  ON public.course_pricing_variants FOR SELECT
  TO anon, authenticated
  USING (is_active_on_site = true OR is_active_for_ads = true);

-- 3. Create course_resources table
CREATE TABLE public.course_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id UUID REFERENCES public.course_modules(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  type resource_type NOT NULL DEFAULT 'link',
  file_url TEXT,
  is_unlocked BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.course_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage resources"
  ON public.course_resources FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Enrolled users can read unlocked resources"
  ON public.course_resources FOR SELECT
  TO authenticated
  USING (
    is_unlocked = true AND EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.course_id = course_resources.course_id
        AND enrollments.user_id = auth.uid()
        AND enrollments.status = 'active'
    )
  );

-- 4. Alter lessons table - add lock control
ALTER TABLE public.lessons ADD COLUMN is_locked_until_enabled BOOLEAN NOT NULL DEFAULT false;

-- 5. Alter courses table - add presale fields
ALTER TABLE public.courses ADD COLUMN presale_description TEXT;
ALTER TABLE public.courses ADD COLUMN trailer_url TEXT;
