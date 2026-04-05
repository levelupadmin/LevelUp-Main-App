
CREATE TABLE public.hero_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_prefix text NOT NULL DEFAULT '',
  title_accent text NOT NULL DEFAULT '',
  subtitle text,
  category_label text NOT NULL DEFAULT 'LIVE COHORT',
  cta_text text NOT NULL DEFAULT 'Explore program',
  cta_link text NOT NULL DEFAULT '/browse',
  image_url text,
  gradient_class text NOT NULL DEFAULT 'from-black/60 to-transparent',
  duration_label text,
  student_count_label text,
  next_batch_label text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hero_slides_read" ON public.hero_slides FOR SELECT USING (is_active = true OR is_admin());
CREATE POLICY "hero_slides_admin" ON public.hero_slides FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE TRIGGER trg_hero_slides_updated_at BEFORE UPDATE ON public.hero_slides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
