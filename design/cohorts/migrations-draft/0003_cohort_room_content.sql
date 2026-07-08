-- ============================================================================
-- DRAFT — DO NOT APPLY. design/cohorts/migrations-draft/0003_cohort_room_content.sql
-- 🔴 Tier 1 (new RLS surfaces). Every SELECT policy routes through
-- cohort_room_can_access() — one function to audit, one to test (the community
-- draft's invariant #2, inherited). Adversarial suite must cover every table.
-- ============================================================================
-- Room content: announcements (append-only noticeboard), resources, the async
-- feed, recording resume positions, demo-day entries. All rows carry
-- (offering_id, batch_id) container scope — no client-writable scope games.

----------------------------------------------------------------------
-- 1. cohort_announcements — mentor/host/admin append-only noticeboard
----------------------------------------------------------------------
CREATE TABLE public.cohort_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.cohort_batches(id) ON DELETE CASCADE, -- NULL = all batches
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz            -- soft delete; no edits (append-only board)
);
CREATE INDEX cohort_announcements_room_idx
  ON public.cohort_announcements (offering_id, is_pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.cohort_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY ann_admin_all ON public.cohort_announcements
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY ann_member_read ON public.cohort_announcements FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL AND public.cohort_room_can_access(offering_id, batch_id));
CREATE POLICY ann_host_insert ON public.cohort_announcements FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid()
              AND public.cohort_room_can_post_announcement(offering_id));
-- no member UPDATE/DELETE: append-only by policy, soft-delete via admin only

----------------------------------------------------------------------
-- 2. cohort_resources — files/links library (optionally pinned to a week)
----------------------------------------------------------------------
CREATE TABLE public.cohort_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.cohort_batches(id) ON DELETE CASCADE,
  cohort_week_id uuid REFERENCES public.cohort_weeks(id) ON DELETE SET NULL,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'link' CHECK (kind IN ('link','file','video')),
  url text NOT NULL,
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cohort_resources_room_idx
  ON public.cohort_resources (offering_id, cohort_week_id, sort_order);

ALTER TABLE public.cohort_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY res_admin_all ON public.cohort_resources
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY res_member_read ON public.cohort_resources FOR SELECT
  TO authenticated USING (public.cohort_room_can_access(offering_id, batch_id));
CREATE POLICY res_host_write ON public.cohort_resources FOR INSERT
  TO authenticated
  WITH CHECK (public.cohort_room_can_post_announcement(offering_id));

----------------------------------------------------------------------
-- 3. cohort_room_posts — the async feed (member posts/questions/wins).
--    Supersedes community_posts.cohort_batch_id scoping (that data can be
--    copied in with a legacy_post_id marker at cutover, community-draft style).
----------------------------------------------------------------------
CREATE TABLE public.cohort_room_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.cohort_batches(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'post' CHECK (kind IN ('post','question','win')),
  body text NOT NULL,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_count integer NOT NULL DEFAULT 0,       -- trigger-maintained
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  legacy_post_id uuid UNIQUE,                   -- idempotent copy marker
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX room_posts_feed_idx
  ON public.cohort_room_posts (batch_id, last_activity_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE public.cohort_room_post_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.cohort_room_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX room_post_replies_idx
  ON public.cohort_room_post_replies (post_id, created_at)
  WHERE deleted_at IS NULL;

-- reply_count counter (community-draft counter doctrine: feeds do zero COUNT(*))
CREATE OR REPLACE FUNCTION public._room_post_reply_counter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.cohort_room_posts
    SET reply_count = reply_count + 1, last_activity_at = now()
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.cohort_room_posts
    SET reply_count = greatest(reply_count - 1, 0)
    WHERE id = NEW.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER room_post_reply_counter
  AFTER INSERT OR UPDATE ON public.cohort_room_post_replies
  FOR EACH ROW EXECUTE FUNCTION public._room_post_reply_counter();

ALTER TABLE public.cohort_room_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_room_post_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY posts_admin_all ON public.cohort_room_posts
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY posts_member_read ON public.cohort_room_posts FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL AND public.cohort_room_can_access(offering_id, batch_id));
CREATE POLICY posts_member_insert ON public.cohort_room_posts FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid()
              AND public.cohort_room_can_access(offering_id, batch_id));
CREATE POLICY posts_author_update ON public.cohort_room_posts FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
CREATE POLICY replies_admin_all ON public.cohort_room_post_replies
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY replies_member_read ON public.cohort_room_post_replies FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.cohort_room_posts p
    WHERE p.id = post_id
      AND public.cohort_room_can_access(p.offering_id, p.batch_id)
  ));
CREATE POLICY replies_member_insert ON public.cohort_room_post_replies FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.cohort_room_posts p
    WHERE p.id = post_id
      AND public.cohort_room_can_access(p.offering_id, p.batch_id)
  ));

----------------------------------------------------------------------
-- 4. cohort_recording_progress — "recordings that resume"
----------------------------------------------------------------------
CREATE TABLE public.cohort_recording_progress (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  live_session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, live_session_id)
);
ALTER TABLE public.cohort_recording_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY recprog_own_all ON public.cohort_recording_progress
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY recprog_admin_read ON public.cohort_recording_progress FOR SELECT
  USING (is_admin());

----------------------------------------------------------------------
-- 5. cohort_demo_entries — demo-day showcase (wrap/alumni phases)
----------------------------------------------------------------------
CREATE TABLE public.cohort_demo_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.cohort_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  work_url text,                 -- link to the work (video/site/doc)
  file_urls text[] NOT NULL DEFAULT '{}',   -- rides the cohort-submissions bucket pattern
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_one_per_user UNIQUE (batch_id, user_id)
);
CREATE TRIGGER cohort_demo_entries_updated_at
  BEFORE UPDATE ON public.cohort_demo_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cohort_demo_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_admin_all ON public.cohort_demo_entries
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY demo_member_read ON public.cohort_demo_entries FOR SELECT
  TO authenticated USING (public.cohort_room_can_access(offering_id, batch_id));
CREATE POLICY demo_own_write ON public.cohort_demo_entries FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()
              AND public.cohort_room_can_access(offering_id, batch_id));
CREATE POLICY demo_own_update ON public.cohort_demo_entries FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
