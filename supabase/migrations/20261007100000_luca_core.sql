-- ============================================================================
-- LUCA — the live-cohort learner experience (The LevelUp Creator Academy first)
--
-- PURELY ADDITIVE. Every object here is new and prefixed `luca_`. No existing
-- table, policy, trigger or function is altered. The existing staged-payment
-- pipeline (cohort_applications → create-razorpay-order → verify-razorpay-
-- payment) stays the single source of truth for who applied and who paid; LUCA
-- only READS it to decide access.
--
-- Write posture (same doctrine as the cohort rooms backbone):
--   * Learner and mentor writes go ONLY through SECURITY DEFINER RPCs that
--     assert access first (see 20261007100100_luca_rpcs.sql). Clients get no
--     INSERT/UPDATE/DELETE grant on any luca_ table.
--   * Learners read ONLY through those RPCs too (quiz answers, Zoom links and
--     other people's contact details never leave the server). Tables carry
--     admin-only RLS policies for the admin console.
--   * Coins are awarded only by the server (luca__award), idempotent per
--     (member, ref_key). Nothing a client sends can mint coins.
--
-- Surface switches (see LUCA-LAUNCH.md):
--   * luca_runtime_config.surface_enabled — global kill switch, server-owned.
--     While OFF, only staff (admins + linked mentors) can see LUCA at all.
--   * luca_programs.enabled              — per-offering switch.
--   * luca_programs.features             — per-cohort feature toggles.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Runtime switch (singleton, service-owned)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.luca_runtime_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  surface_enabled boolean NOT NULL DEFAULT false,
  reminders_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.luca_runtime_config IS
  'LUCA kill switches. surface_enabled=false keeps LUCA staff-only; reminders_enabled gates every outbound LUCA reminder. Service-owned: clients read it only through luca_surface_enabled().';

INSERT INTO public.luca_runtime_config (singleton, surface_enabled, reminders_enabled)
VALUES (true, false, false)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.luca_runtime_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.luca_runtime_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.luca_runtime_config TO service_role;


-- ---------------------------------------------------------------------------
-- 1. Programs — one per offering (a demo program may have no offering)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.luca_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  offering_id uuid REFERENCES public.offerings(id) ON DELETE CASCADE,
  is_demo boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  name text NOT NULL,
  short_name text NOT NULL DEFAULT '',
  cohort_label text NOT NULL DEFAULT '',
  starts_at timestamptz,
  demo_day_at timestamptz,
  ends_at timestamptz,
  seats integer CHECK (seats IS NULL OR seats > 0),
  hours_per_week integer,
  hero_url text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  whatsapp_url text,
  drive_url text,
  support_whatsapp text,
  features jsonb NOT NULL DEFAULT '{"application":true,"clans":true,"coins":true,"leaderboard":true,"sprint":true,"demo_day":true,"whatsapp":false}'::jsonb,
  coin_rules jsonb NOT NULL DEFAULT '{
    "joined":         {"label":"Join the cohort","value":200},
    "setup":          {"label":"Setup complete","value":100},
    "prewatch":       {"label":"Pre-watch, quiz and 60-second summary","value":50},
    "attend":         {"label":"Attend a live session","value":100},
    "submit_on_time": {"label":"Submit on time","value":150},
    "ship":           {"label":"Mentor says Ship","value":100},
    "publish_day":    {"label":"Publish on the day","value":200},
    "sprint_post":    {"label":"Sprint publish (per day)","value":250},
    "sprint_log":     {"label":"Sprint daily log (Track B)","value":50},
    "streak_bonus":   {"label":"Streak bonus, every 7 days","value":300},
    "feedback":       {"label":"Feedback on a clanmate''s post","value":25},
    "community_post": {"label":"Community post (Sprint)","value":150},
    "demo_day":       {"label":"Demo Day completed","value":500}
  }'::jsonb,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
  sprint jsonb NOT NULL DEFAULT '{"starts_on":null,"days":21,"track_b_posts_per_week":3}'::jsonb,
  clan_config jsonb NOT NULL DEFAULT '{"names":[],"size":6,"reveal_at":null}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT luca_programs_offering_or_demo CHECK (is_demo OR offering_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS luca_programs_offering_uniq
  ON public.luca_programs (offering_id) WHERE offering_id IS NOT NULL;
COMMENT ON TABLE public.luca_programs IS
  'One LUCA cohort experience per offering. enabled = per-offering switch; is_demo programs are visible to staff only and simulate payments.';
COMMENT ON COLUMN public.luca_programs.content IS
  'All learner-facing copy: program page, trailer beats, sample review, application questions, status/offer copy, FAQ, phases, breaks, setup items, drive folders. PUBLIC to anyone who can see the program page: never put quiz answers or secrets here (quizzes live on luca_weeks.quiz).';
COMMENT ON COLUMN public.luca_programs.pricing IS
  'Demo programs only: {price, deposit, app_fee}. Real programs read price_inr / confirmation_amount_inr / app_fee_inr from offerings.';


-- ---------------------------------------------------------------------------
-- 2. Mentors (a mentor may be linked to an app account for the mentor desk)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.luca_mentors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  angle text NOT NULL DEFAULT '',
  photo_url text,
  handle text,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS luca_mentors_program_idx ON public.luca_mentors (program_id, sort);
CREATE INDEX IF NOT EXISTS luca_mentors_user_idx ON public.luca_mentors (user_id) WHERE user_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 3. Weeks (Week 0 .. Demo Day week), with the pre-watch and its quiz
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.luca_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  n integer NOT NULL CHECK (n BETWEEN 0 AND 52),
  module text NOT NULL DEFAULT '',
  phase integer NOT NULL DEFAULT 1,
  starts_on date,
  image_url text,
  post_note text,
  is_sprint boolean NOT NULL DEFAULT false,
  is_demo_week boolean NOT NULL DEFAULT false,
  prewatch jsonb NOT NULL DEFAULT '{}'::jsonb,
  quiz jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, n)
);
COMMENT ON COLUMN public.luca_weeks.prewatch IS '{title, video_url, minutes, closes_at?} — empty object means no pre-watch this week.';
COMMENT ON COLUMN public.luca_weeks.quiz IS '[{q, options:[..], answer:int}] — answers never leave the server.';


-- ---------------------------------------------------------------------------
-- 4. Sessions (live classes, reviews, standups, Demo Day) + their recordings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.luca_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  week_n integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'class'
    CHECK (kind IN ('orientation','review','class','double','standup','demo','plan')),
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  mentor_ids uuid[] NOT NULL DEFAULT '{}',
  prep text[] NOT NULL DEFAULT '{}',
  image_url text,
  zoom_url text,
  recording_url text,
  recording_minutes integer,
  chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT luca_sessions_time_order CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS luca_sessions_program_start_idx ON public.luca_sessions (program_id, starts_at);
COMMENT ON COLUMN public.luca_sessions.zoom_url IS 'Never returned in a list. Released by luca_join_session from 15 minutes before start, to members only.';
COMMENT ON COLUMN public.luca_sessions.chapters IS '[{at_sec, title}]';
COMMENT ON COLUMN public.luca_sessions.files IS '[{badge, title, sub, url}]';


-- ---------------------------------------------------------------------------
-- 5. Assignments — every part is a link the learner pastes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.luca_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  week_n integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  brief text,
  due_at timestamptz NOT NULL,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  coins integer,
  is_group boolean NOT NULL DEFAULT false,
  review_session_id uuid REFERENCES public.luca_sessions(id) ON DELETE SET NULL,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT luca_assignments_parts_array CHECK (jsonb_typeof(parts) = 'array')
);
CREATE INDEX IF NOT EXISTS luca_assignments_program_idx ON public.luca_assignments (program_id, due_at);
COMMENT ON COLUMN public.luca_assignments.parts IS '[{k: doc|sheet|drive|voice|post|profile|loom|yt|sign|link, label, where, check?: yt}]';


-- ---------------------------------------------------------------------------
-- 6. Clans and members
--    A member is a person inside one program. Real learners have a user_id;
--    demo "ghost" members (is_ghost) have none and exist only in demo programs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.luca_clans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, name)
);

CREATE TABLE IF NOT EXISTS public.luca_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  is_ghost boolean NOT NULL DEFAULT false,
  display_name text NOT NULL,
  initials text NOT NULL DEFAULT '',
  photo_url text,
  niche text,
  handle text,
  track text NOT NULL DEFAULT 'A' CHECK (track IN ('A','B')),
  clan_id uuid REFERENCES public.luca_clans(id) ON DELETE SET NULL,
  coins integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  streak_day date,
  setup jsonb NOT NULL DEFAULT '{}'::jsonb,
  contract_name text,
  contract_signed_at timestamptz,
  cal_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  revealed_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT luca_members_ghost_shape CHECK ((is_ghost AND user_id IS NULL) OR (NOT is_ghost AND user_id IS NOT NULL)),
  UNIQUE (program_id, user_id)
);
CREATE INDEX IF NOT EXISTS luca_members_program_coins_idx ON public.luca_members (program_id, coins DESC);
CREATE INDEX IF NOT EXISTS luca_members_clan_idx ON public.luca_members (clan_id) WHERE clan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS luca_members_user_idx ON public.luca_members (user_id) WHERE user_id IS NOT NULL;
COMMENT ON COLUMN public.luca_members.cal_token IS 'Capability token for the private calendar feed (luca-calendar edge function). Rotatable.';

-- Ghost members may only live in demo programs.
CREATE OR REPLACE FUNCTION public._luca_member_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_ghost AND NOT EXISTS (
    SELECT 1 FROM public.luca_programs p WHERE p.id = NEW.program_id AND p.is_demo
  ) THEN
    RAISE EXCEPTION 'ghost members are only allowed in demo programs' USING ERRCODE = '23514';
  END IF;
  IF NEW.clan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.luca_clans c WHERE c.id = NEW.clan_id AND c.program_id = NEW.program_id
  ) THEN
    RAISE EXCEPTION 'clan must belong to the member''s program' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS luca_member_guard ON public.luca_members;
CREATE TRIGGER luca_member_guard BEFORE INSERT OR UPDATE ON public.luca_members
  FOR EACH ROW EXECUTE FUNCTION public._luca_member_guard();


-- ---------------------------------------------------------------------------
-- 7. The LUCA side of an application (answers + demo-only simulated state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.luca_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cohort_application_id uuid REFERENCES public.cohort_applications(id) ON DELETE SET NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  demo_status text CHECK (demo_status IS NULL OR demo_status IN (
    'submitted','app_fee_paid','interview_scheduled','interview_done','accepted',
    'rejected','waitlisted','confirmation_paid','balance_paid','enrolled')),
  demo_interview_at timestamptz,
  demo_accepted_at timestamptz,
  demo_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, user_id)
);
COMMENT ON TABLE public.luca_applications IS
  'In-app application answers. For real programs the money/status truth stays on cohort_applications (cohort_application_id); demo_* columns are used only by demo programs.';


-- ---------------------------------------------------------------------------
-- 8. The game: coin ledger (idempotent per member + ref_key)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.luca_coin_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  rule text NOT NULL,
  reason text NOT NULL,
  ref_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, ref_key)
);
CREATE INDEX IF NOT EXISTS luca_ledger_program_time_idx ON public.luca_coin_ledger (program_id, created_at);
CREATE INDEX IF NOT EXISTS luca_ledger_member_time_idx ON public.luca_coin_ledger (member_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- 9. Learner activity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.luca_attendance (
  session_id uuid NOT NULL REFERENCES public.luca_sessions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.luca_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.luca_assignments(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  on_time boolean NOT NULL DEFAULT true,
  verdict text NOT NULL DEFAULT 'pending' CHECK (verdict IN ('pending','ship','fix','hold')),
  notes text[] NOT NULL DEFAULT '{}',
  reviewed_by uuid REFERENCES public.luca_mentors(id) ON DELETE SET NULL,
  reviewed_by_user uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  fix_due_at timestamptz,
  fix_url text,
  fix_submitted_at timestamptz,
  was_fix boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, member_id)
);
CREATE INDEX IF NOT EXISTS luca_submissions_member_idx ON public.luca_submissions (member_id);
CREATE INDEX IF NOT EXISTS luca_submissions_pending_idx ON public.luca_submissions (assignment_id) WHERE verdict = 'pending';

CREATE TABLE IF NOT EXISTS public.luca_prewatch (
  member_id uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  week_n integer NOT NULL,
  quiz_answers integer[] NOT NULL DEFAULT '{}',
  quiz_score integer NOT NULL DEFAULT 0,
  summary_url text,
  completed_at timestamptz,
  PRIMARY KEY (member_id, week_n)
);

CREATE TABLE IF NOT EXISTS public.luca_sprint_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  day_n integer NOT NULL CHECK (day_n BETWEEN 1 AND 60),
  kind text NOT NULL DEFAULT 'post' CHECK (kind IN ('post','log')),
  url text,
  log text CHECK (log IS NULL OR length(log) <= 600),
  title text CHECK (title IS NULL OR length(title) <= 140),
  posted_at timestamptz NOT NULL DEFAULT now(),
  verdict text NOT NULL DEFAULT 'pending' CHECK (verdict IN ('pending','ship','fix')),
  verdict_note text,
  reviewed_by uuid REFERENCES public.luca_mentors(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  UNIQUE (member_id, day_n)
);
CREATE INDEX IF NOT EXISTS luca_sprint_program_idx ON public.luca_sprint_posts (program_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS public.luca_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  from_member uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  to_member uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  post_ref text NOT NULL,
  chips text[] NOT NULL DEFAULT '{}',
  body text CHECK (body IS NULL OR length(body) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_member, to_member, post_ref),
  CONSTRAINT luca_feedback_not_self CHECK (from_member <> to_member)
);
CREATE INDEX IF NOT EXISTS luca_feedback_to_idx ON public.luca_feedback (to_member, created_at DESC);

CREATE TABLE IF NOT EXISTS public.luca_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  from_member uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  to_member uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  ist_day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_member, to_member, ist_day),
  CONSTRAINT luca_nudges_not_self CHECK (from_member <> to_member)
);

CREATE TABLE IF NOT EXISTS public.luca_hotseat (
  session_id uuid NOT NULL REFERENCES public.luca_sessions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  rec_at_sec integer CHECK (rec_at_sec IS NULL OR rec_at_sec >= 0),
  PRIMARY KEY (session_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.luca_rec_progress (
  session_id uuid NOT NULL REFERENCES public.luca_sessions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  seconds integer NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.luca_rec_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.luca_sessions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  at_sec integer NOT NULL DEFAULT 0 CHECK (at_sec >= 0),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS luca_rec_notes_member_idx ON public.luca_rec_notes (member_id, session_id);

CREATE TABLE IF NOT EXISTS public.luca_demo_slots (
  session_id uuid NOT NULL REFERENCES public.luca_sessions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  slot_n integer NOT NULL CHECK (slot_n > 0),
  at timestamptz,
  showcase_url text,
  PRIMARY KEY (session_id, member_id)
);


-- ---------------------------------------------------------------------------
-- 10. Staff-authored room content
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.luca_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  body text CHECK (body IS NULL OR length(body) <= 2000),
  link_url text,
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS luca_announcements_program_idx ON public.luca_announcements (program_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.luca_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.luca_programs(id) ON DELETE CASCADE,
  week_n integer,
  title text NOT NULL,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'link',
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS luca_resources_program_idx ON public.luca_resources (program_id, sort);


-- ---------------------------------------------------------------------------
-- 11. updated_at triggers
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['luca_programs','luca_weeks','luca_sessions','luca_assignments','luca_applications','luca_submissions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t || '_updated_at', t);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 12. RLS — admin console reads/writes tables directly; nobody else does.
--     Learners and mentors go through the RPCs in the next migration.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'luca_programs','luca_mentors','luca_weeks','luca_sessions','luca_assignments',
    'luca_clans','luca_members','luca_applications','luca_coin_ledger','luca_attendance',
    'luca_submissions','luca_prewatch','luca_sprint_posts','luca_feedback','luca_nudges',
    'luca_hotseat','luca_rec_progress','luca_rec_notes','luca_demo_slots',
    'luca_announcements','luca_resources']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin())', t || '_admin_read', t);
  END LOOP;
END $$;

-- The admin console writes configuration tables directly (admins only).
-- Learner-activity tables stay RPC-only even for admins, so every coin and
-- verdict passes through the same audited server path.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'luca_programs','luca_mentors','luca_weeks','luca_sessions','luca_assignments',
    'luca_clans','luca_announcements','luca_resources','luca_hotseat','luca_demo_slots']
  LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t || '_admin_write', t);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 13. Core helpers
-- ---------------------------------------------------------------------------

-- The global surface switch. While off, LUCA exists only for staff.
CREATE OR REPLACE FUNCTION public.luca_surface_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT c.surface_enabled FROM public.luca_runtime_config c WHERE c.singleton), false)
      OR public.is_admin()
      OR EXISTS (SELECT 1 FROM public.luca_mentors m WHERE m.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.luca_surface_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.luca_surface_enabled() TO anon, authenticated, service_role;

-- The raw switch, with no staff override (used for per-program visibility).
CREATE OR REPLACE FUNCTION public.luca__switch_on()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT c.surface_enabled FROM public.luca_runtime_config c WHERE c.singleton), false);
$$;
REVOKE ALL ON FUNCTION public.luca__switch_on() FROM PUBLIC, anon, authenticated;

-- Staff of one program: admins, or a mentor linked to that program.
CREATE OR REPLACE FUNCTION public.luca_is_staff(p_program uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.luca_mentors m WHERE m.program_id = p_program AND m.user_id = auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.luca_is_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.luca_is_staff(uuid) TO authenticated, service_role;

-- The program's local calendar day for an instant.
CREATE OR REPLACE FUNCTION public.luca__local_day(p_program uuid, p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (p_at AT TIME ZONE COALESCE((SELECT p.timezone FROM public.luca_programs p WHERE p.id = p_program), 'Asia/Kolkata'))::date;
$$;
REVOKE ALL ON FUNCTION public.luca__local_day(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Status ordering for picking the most advanced of several applications.
CREATE OR REPLACE FUNCTION public.luca__status_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'enrolled' THEN 100 WHEN 'balance_paid' THEN 90 WHEN 'confirmation_paid' THEN 80
    WHEN 'accepted' THEN 70 WHEN 'interview_done' THEN 60 WHEN 'interview_scheduled' THEN 50
    WHEN 'app_fee_paid' THEN 40 WHEN 'submitted' THEN 30 WHEN 'waitlisted' THEN 20
    WHEN 'rejected' THEN 10 WHEN 'withdrawn' THEN 5 ELSE 0 END;
$$;
REVOKE ALL ON FUNCTION public.luca__status_rank(text) FROM PUBLIC, anon;

-- The caller's application state for a program, as one jsonb object:
--   {source, id, status, app_fee_paid, interview_at, accepted_at, confirmed_at,
--    balance_due_at, deposit_hold_until}
-- For real programs it reads cohort_applications (the money truth); for demo
-- programs it reads the simulated luca_applications.demo_* columns.
CREATE OR REPLACE FUNCTION public.luca__application_state(p_program uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog public.luca_programs;
  v_off public.offerings;
  v_app public.cohort_applications;
  v_la public.luca_applications;
  v_confirmed_at timestamptz;
  v_balance_due timestamptz;
  v_hold timestamptz;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_prog FROM public.luca_programs WHERE id = p_program;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_la FROM public.luca_applications WHERE program_id = p_program AND user_id = p_user;

  IF v_prog.is_demo THEN
    IF v_la.id IS NULL OR v_la.demo_status IS NULL THEN RETURN NULL; END IF;
    RETURN jsonb_build_object(
      'source', 'demo', 'id', v_la.id, 'status', v_la.demo_status,
      'app_fee_paid', public.luca__status_rank(v_la.demo_status) >= 40 OR v_la.demo_status IN ('rejected','waitlisted'),
      'interview_at', v_la.demo_interview_at,
      'accepted_at', v_la.demo_accepted_at,
      'confirmed_at', v_la.demo_confirmed_at,
      'deposit_hold_until', CASE WHEN v_la.demo_accepted_at IS NOT NULL THEN v_la.demo_accepted_at + interval '2 days' END,
      'balance_due_at', CASE WHEN v_la.demo_confirmed_at IS NOT NULL THEN v_la.demo_confirmed_at + interval '15 days' END,
      'answers', v_la.answers,
      'applied_at', v_la.created_at);
  END IF;

  SELECT * INTO v_off FROM public.offerings WHERE id = v_prog.offering_id;
  SELECT a.* INTO v_app
    FROM public.cohort_applications a
   WHERE a.offering_id = v_prog.offering_id AND a.user_id = p_user
   ORDER BY public.luca__status_rank(a.status) DESC, a.created_at DESC
   LIMIT 1;
  IF v_app.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_app.confirmation_payment_id IS NOT NULL THEN
    SELECT COALESCE(po.captured_at, po.created_at) INTO v_confirmed_at
      FROM public.payment_orders po WHERE po.id = v_app.confirmation_payment_id;
  END IF;
  IF v_confirmed_at IS NOT NULL AND v_off.balance_deadline_days IS NOT NULL THEN
    v_balance_due := v_confirmed_at + make_interval(days => v_off.balance_deadline_days);
  END IF;
  IF v_app.accepted_at IS NOT NULL THEN
    v_hold := v_app.accepted_at
      + make_interval(days => COALESCE(v_off.confirmation_deadline_days, 2))
      + make_interval(secs => COALESCE(v_off.confirmation_grace_hours, 0) * 3600);
  END IF;

  RETURN jsonb_build_object(
    'source', 'cohort_applications', 'id', v_app.id, 'status', v_app.status,
    'app_fee_paid', v_app.app_fee_payment_id IS NOT NULL,
    'interview_at', v_app.interview_date,
    'accepted_at', v_app.accepted_at,
    'confirmed_at', v_confirmed_at,
    'deposit_hold_until', v_hold,
    'balance_due_at', v_balance_due,
    'answers', COALESCE(v_la.answers, '{}'::jsonb),
    'applied_at', v_app.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.luca__application_state(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Access level for the caller: none | applicant | learner | locked
--   learner — fully paid, enrolled, an active enrolment, or deposit paid and
--             the balance not overdue (demo: simulated status).
--   locked  — deposit paid, balance overdue past the offering's deadline.
CREATE OR REPLACE FUNCTION public.luca__access(p_program uuid, p_user uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog public.luca_programs;
  v_state jsonb;
  v_status text;
BEGIN
  IF p_user IS NULL THEN RETURN 'none'; END IF;
  SELECT * INTO v_prog FROM public.luca_programs WHERE id = p_program;
  IF NOT FOUND THEN RETURN 'none'; END IF;

  IF NOT v_prog.is_demo AND EXISTS (
    SELECT 1 FROM public.enrolments e
     WHERE e.user_id = p_user AND e.offering_id = v_prog.offering_id AND e.status = 'active'
       AND (e.expires_at IS NULL OR e.expires_at > now())
  ) THEN
    RETURN 'learner';
  END IF;

  v_state := public.luca__application_state(p_program, p_user);
  IF v_state IS NULL THEN RETURN 'none'; END IF;
  v_status := v_state->>'status';
  IF v_status IN ('balance_paid','enrolled') THEN RETURN 'learner'; END IF;
  IF v_status = 'confirmation_paid' THEN
    IF (v_state->>'balance_due_at') IS NOT NULL
       AND (v_state->>'balance_due_at')::timestamptz < now() THEN
      RETURN 'locked';
    END IF;
    RETURN 'learner';
  END IF;
  RETURN 'applicant';
END;
$$;
REVOKE ALL ON FUNCTION public.luca__access(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Is this program visible to the caller at all?
CREATE OR REPLACE FUNCTION public.luca__visible(p_program public.luca_programs)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.luca_is_staff(p_program.id)
      OR (NOT p_program.is_demo AND p_program.enabled AND public.luca__switch_on());
$$;
REVOKE ALL ON FUNCTION public.luca__visible(public.luca_programs) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 14. The only way coins are minted.
--     Idempotent per (member, ref_key). Keeps members.coins and the streak in
--     the same transaction. Returns the amount actually awarded (0 = dup/off).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.luca__award(
  p_member uuid,
  p_rule text,
  p_ref text,
  p_activity boolean DEFAULT true,
  p_amount integer DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mem public.luca_members;
  v_prog public.luca_programs;
  v_amount integer;
  v_reason text;
  v_today date;
  v_new_streak integer;
  v_id bigint;
BEGIN
  SELECT * INTO v_mem FROM public.luca_members WHERE id = p_member FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO v_prog FROM public.luca_programs WHERE id = v_mem.program_id;

  IF COALESCE((v_prog.features->>'coins')::boolean, true) = false THEN
    v_amount := 0;
  ELSE
    v_amount := COALESCE(p_amount, (v_prog.coin_rules->p_rule->>'value')::integer, 0);
  END IF;
  v_reason := COALESCE(NULLIF(p_reason, ''), v_prog.coin_rules->p_rule->>'label', p_rule);

  -- Every counted action leaves exactly one ledger row (amount may be 0).
  -- A repeat of the same action hits the unique key and counts for nothing:
  -- no coins and no streak, so nothing can be farmed by calling twice.
  INSERT INTO public.luca_coin_ledger (program_id, member_id, amount, rule, reason, ref_key)
  VALUES (v_prog.id, p_member, v_amount, p_rule, left(v_reason, 200), left(p_ref, 200))
  ON CONFLICT (member_id, ref_key) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN 0; END IF;

  IF v_amount <> 0 THEN
    UPDATE public.luca_members SET coins = coins + v_amount WHERE id = p_member;
  END IF;

  -- The streak: one new action on a new local day extends it. Every 7 days in
  -- a row adds the streak bonus, once per milestone.
  IF p_activity THEN
    v_today := public.luca__local_day(v_prog.id);
    IF v_mem.streak_day IS DISTINCT FROM v_today THEN
      IF v_mem.streak_day IS NOT NULL AND v_mem.streak_day = v_today - 1 THEN
        v_new_streak := v_mem.streak + 1;
      ELSE
        v_new_streak := 1;
      END IF;
      UPDATE public.luca_members SET streak = v_new_streak, streak_day = v_today WHERE id = p_member;
      IF v_new_streak % 7 = 0 THEN
        PERFORM public.luca__award(
          p_member, 'streak_bonus',
          'streak:' || (v_today - (v_new_streak - 1))::text || ':' || v_new_streak::text,
          false, NULL,
          COALESCE(v_prog.coin_rules->'streak_bonus'->>'label', 'Streak bonus') || ', ' || v_new_streak || ' days');
      END IF;
    END IF;
  END IF;
  RETURN v_amount;
END;
$$;
REVOKE ALL ON FUNCTION public.luca__award(uuid, text, text, boolean, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.luca__award(uuid, text, text, boolean, integer, text) TO service_role;

-- Make sure the caller has a member row in a program they are a learner of
-- (or staff previewing a demo program). Awards "Join the cohort" once.
CREATE OR REPLACE FUNCTION public.luca__ensure_member(p_program uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_user public.users;
  v_la public.luca_applications;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  -- Access is re-derived on EVERY call: a refund, a revoked enrolment or an
  -- overdue balance takes effect immediately, even for an existing member.
  IF public.luca__access(p_program, v_uid) <> 'learner' THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.luca_members WHERE program_id = p_program AND user_id = v_uid;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_uid;
  SELECT * INTO v_la FROM public.luca_applications WHERE program_id = p_program AND user_id = v_uid;
  v_name := COALESCE(NULLIF(trim(v_user.full_name), ''), NULLIF(split_part(COALESCE(v_user.email, ''), '@', 1), ''), 'Learner');

  INSERT INTO public.luca_members (program_id, user_id, display_name, initials, photo_url, niche, handle, track, setup)
  VALUES (
    p_program, v_uid, v_name,
    COALESCE(NULLIF(upper(left(regexp_replace(
      COALESCE((SELECT string_agg(left(w, 1), '') FROM unnest(string_to_array(v_name, ' ')) AS w WHERE w <> ''), ''),
      '[^[:alnum:]]', '', 'g'), 2)), ''), 'LU'),
    v_user.avatar_url,
    NULLIF(v_la.answers->>'niche', ''),
    NULLIF(v_la.answers->>'handle', ''),
    CASE WHEN v_la.answers->>'track' = 'B' THEN 'B' ELSE 'A' END,
    '{"seat":true}'::jsonb)
  ON CONFLICT (program_id, user_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.luca_members WHERE program_id = p_program AND user_id = v_uid;
    RETURN v_id;
  END IF;
  PERFORM public.luca__award(v_id, 'joined', 'joined', false);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.luca__ensure_member(uuid) FROM PUBLIC, anon, authenticated;
