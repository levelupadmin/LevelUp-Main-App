-- Notification preferences (opt-out model: no row = enabled)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, notification_type)
);
CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_prefs" ON public.notification_preferences FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins_all_prefs" ON public.notification_preferences FOR ALL USING (public.is_admin());

-- Admin announcements log
CREATE TABLE IF NOT EXISTS public.admin_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  link text,
  audience_type text NOT NULL CHECK (audience_type IN ('all','cohort','course')),
  audience_id uuid,
  sent_by uuid NOT NULL REFERENCES public.users(id),
  recipient_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE public.admin_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_all_announcements" ON public.admin_announcements FOR ALL USING (public.is_admin());
