
-- 1. community_channels table
CREATE TABLE public.community_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES public.community_spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '#',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(space_id, slug)
);

ALTER TABLE public.community_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read channels" ON public.community_channels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage channels" ON public.community_channels
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- 2. channel_messages table
CREATE TABLE public.channel_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  parent_id UUID REFERENCES public.channel_messages(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read messages" ON public.channel_messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can send messages" ON public.channel_messages
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own messages" ON public.channel_messages
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can update own messages" ON public.channel_messages
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all messages" ON public.channel_messages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

-- 3. message_reactions table
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.channel_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reactions" ON public.message_reactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can add reactions" ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove own reactions" ON public.message_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 4. Enable realtime on channel_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_messages;

-- 5. Seed default channels for each existing space
INSERT INTO public.community_channels (space_id, name, slug, icon, sort_order, is_default)
SELECT id, 'General', 'general', '💬', 0, true FROM public.community_spaces;

INSERT INTO public.community_channels (space_id, name, slug, icon, sort_order, is_default)
SELECT id, 'Introductions', 'introductions', '👋', 1, false FROM public.community_spaces;

INSERT INTO public.community_channels (space_id, name, slug, icon, sort_order, is_default)
SELECT id, 'Showcase', 'showcase', '🎬', 2, false FROM public.community_spaces;

INSERT INTO public.community_channels (space_id, name, slug, icon, sort_order, is_default)
SELECT id, 'Help', 'help', '❓', 3, false FROM public.community_spaces;
