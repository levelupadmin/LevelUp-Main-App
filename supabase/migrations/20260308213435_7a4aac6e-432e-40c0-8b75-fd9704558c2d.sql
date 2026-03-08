
-- Portfolio projects table
CREATE TABLE public.portfolio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'film',
  thumbnail_url text,
  video_url text,
  duration text,
  is_pinned boolean NOT NULL DEFAULT false,
  appreciations integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  tools_used text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.portfolio_projects ENABLE ROW LEVEL SECURITY;

-- Anyone can view portfolio projects
CREATE POLICY "Anyone can view portfolio projects"
  ON public.portfolio_projects FOR SELECT
  USING (true);

-- Users can manage own projects
CREATE POLICY "Users can manage own portfolio projects"
  ON public.portfolio_projects FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Storage bucket for portfolio media
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio', 'portfolio', true);

-- Storage policies
CREATE POLICY "Anyone can view portfolio files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portfolio');

CREATE POLICY "Authenticated users can upload portfolio files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'portfolio');

CREATE POLICY "Users can update own portfolio files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'portfolio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own portfolio files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'portfolio' AND (storage.foldername(name))[1] = auth.uid()::text);
