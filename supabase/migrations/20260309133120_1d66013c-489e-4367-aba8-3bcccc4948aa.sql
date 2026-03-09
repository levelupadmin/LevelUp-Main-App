
-- Community spaces (city-based, skill-based, general)
CREATE TABLE public.community_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'general' CHECK (type IN ('city', 'skill', 'general', 'course')),
  description text,
  icon text,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read spaces" ON public.community_spaces FOR SELECT TO public USING (true);
CREATE POLICY "Admins can manage spaces" ON public.community_spaces FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Community posts
CREATE TABLE public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.community_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read posts" ON public.community_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create posts" ON public.community_posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own posts" ON public.community_posts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own posts" ON public.community_posts FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all posts" ON public.community_posts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

-- Post comments (threaded)
CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  parent_id uuid REFERENCES public.post_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comments" ON public.post_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create comments" ON public.post_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own comments" ON public.post_comments FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all comments" ON public.post_comments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

-- Post likes (unique per user per post)
CREATE TABLE public.post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read likes" ON public.post_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can like" ON public.post_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can unlike" ON public.post_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Enable realtime for posts
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
