
CREATE TABLE public.hero_slides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  rotating_words text[] NOT NULL DEFAULT '{}',
  subtitle text NOT NULL DEFAULT '',
  cta_label text NOT NULL DEFAULT 'See all Programs',
  cta_link text NOT NULL DEFAULT '/explore',
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage hero slides"
ON public.hero_slides FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Anyone can read active hero slides"
ON public.hero_slides FOR SELECT TO anon, authenticated
USING (is_active = true);
