
-- Create sales_pages table
CREATE TABLE public.sales_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  hero_image_url text,
  trailer_url text,
  presale_description text,
  course_type_hint text NOT NULL DEFAULT 'masterclass',
  is_published boolean NOT NULL DEFAULT false,
  show_application_form boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create sales_page_courses join table
CREATE TABLE public.sales_page_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_page_id uuid NOT NULL REFERENCES public.sales_pages(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(sales_page_id, course_id)
);

-- Add sales_page_id to course_pricing_variants
ALTER TABLE public.course_pricing_variants
  ADD COLUMN sales_page_id uuid REFERENCES public.sales_pages(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.sales_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_page_courses ENABLE ROW LEVEL SECURITY;

-- RLS for sales_pages
CREATE POLICY "Admins can manage sales pages"
  ON public.sales_pages FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor'));

CREATE POLICY "Anyone can read published sales pages"
  ON public.sales_pages FOR SELECT TO authenticated
  USING (is_published = true OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor'));

-- RLS for sales_page_courses
CREATE POLICY "Admins can manage sales page courses"
  ON public.sales_page_courses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'mentor'));

CREATE POLICY "Anyone can read sales page courses"
  ON public.sales_page_courses FOR SELECT TO authenticated
  USING (true);

-- Updated_at trigger for sales_pages
CREATE TRIGGER update_sales_pages_updated_at
  BEFORE UPDATE ON public.sales_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
