-- ============================================================================
-- DRAFT — NOT A LIVE MIGRATION. DO NOT APPLY.
-- 🔴 Tier 1 (schema + downstream RLS). Ships only after: bugfix-council review,
-- Rahul sign-off, fresh prod backup, then copy into supabase/migrations/ with a
-- real timestamp and `npx supabase migration list` verification (CLAUDE.md).
--
-- 0001 — Community backbone: containers, content, moderation, counters, indexes.
-- Design rationale: design/community/ARCHITECTURE.md §2–§4.
-- Net-new tables only — nothing here touches community_posts/* (the live feed).
-- ============================================================================

-- ── Containers ──────────────────────────────────────────────────────────────

-- Houses: one per craft. Adding community #6 = one row (via admin_create_community).
CREATE TABLE community_houses_do_not_apply_placeholder (placeholder int); -- guard row: this file must fail loudly if ever run as-is
DROP TABLE community_houses_do_not_apply_placeholder;

CREATE TABLE communities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name          text NOT NULL,
  tagline       text,
  description   text,
  artwork_url   text,
  sort_order    integer NOT NULL DEFAULT 0,
  -- opening_soon = teased door (STRATEGY §5 launch gate); active = open house
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','opening_soon','active','archived')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER communities_updated_at BEFORE UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Editions: gated sub-communities (Forge edition, cohort batch, circle, alumni).
CREATE TABLE community_editions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  slug          text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('cohort','forge','circle','alumni','custom')),
  -- honest-FOMO surface: everything a non-member may see lives in THIS row
  tease_copy    text,                     -- "Members of Forge Goa '26. Applications open in March."
  path_in_url   text,                     -- the legitimate way in (offering/apply link)
  cover_url     text,
  phase         text NOT NULL DEFAULT 'upcoming' CHECK (phase IN ('upcoming','live','alumni')),
  starts_at     timestamptz,
  ends_at       timestamptz,
  -- denormalized, trigger/cron-maintained; counts ACTIVE members only (STRATEGY §4)
  member_count  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, slug),
  UNIQUE (id, community_id)   -- composite target so rooms can't cross-wire (see community_rooms FK)
);
CREATE TRIGGER community_editions_updated_at BEFORE UPDATE ON community_editions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Rooms: the ONLY posting surfaces. edition_id NULL = open craft room;
-- edition_id set = gated. Composite FK guarantees the edition belongs to the
-- same community — a room can never smuggle scope across houses.
CREATE TABLE community_rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  edition_id    uuid,
  slug          text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name          text NOT NULL,
  kind          text NOT NULL DEFAULT 'custom'
                CHECK (kind IN ('lobby','noticeboard','dailies','wins','intros','custom')),
  -- 'all' = any member of scope may post; 'hosts' = host/mentor/admin only (noticeboard)
  post_policy   text NOT NULL DEFAULT 'all' CHECK (post_policy IN ('all','hosts')),
  description   text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, edition_id, slug),
  FOREIGN KEY (edition_id, community_id)
    REFERENCES community_editions (id, community_id) ON DELETE CASCADE
);
CREATE INDEX idx_community_rooms_scope ON community_rooms (community_id, edition_id, sort_order);

-- ── Content ────────────────────────────────────────────────────────────────

-- Threads carry NO scope columns — scope derives thread → room → (community, edition).
CREATE TABLE community_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL REFERENCES community_rooms(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'post'
                  CHECK (kind IN ('post','dailies','win','question','drop')),
  title           text,
  body            text NOT NULL,
  media           jsonb NOT NULL DEFAULT '[]',        -- [{kind:'image'|'link', url, meta}]
  -- the crit format (kind = 'dailies'): the work + what feedback the author wants
  work_url        text,
  crit_asks       text[] NOT NULL DEFAULT '{}' CHECK (cardinality(crit_asks) <= 3),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  is_pinned       boolean NOT NULL DEFAULT false,
  -- trigger-maintained counters: the feed does zero aggregate queries
  reply_count     integer NOT NULL DEFAULT 0,
  respect_count   integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  legacy_post_id  uuid UNIQUE,                        -- idempotent migration marker (0004)
  created_at      timestamptz NOT NULL DEFAULT now(),
  edited_at       timestamptz,
  deleted_at      timestamptz                         -- soft delete: reversible, auditable
);
-- Matches the feed sort exactly; partial = hot set only.
CREATE INDEX idx_community_threads_feed
  ON community_threads (room_id, is_pinned DESC, last_activity_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_community_threads_author ON community_threads (author_id);

CREATE TABLE community_replies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         uuid NOT NULL REFERENCES community_threads(id) ON DELETE CASCADE,
  author_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_reply_id   uuid REFERENCES community_replies(id) ON DELETE CASCADE,
  body              text NOT NULL,
  timecode          text CHECK (timecode ~ '^[0-9]{1,3}:[0-5][0-9]$'), -- "02:14" crit marker
  -- set ONLY by the thread author (RLS policy + trigger guard in 0003):
  -- the calm-luxury status currency (STRATEGY §3.2)
  helped            boolean NOT NULL DEFAULT false,
  legacy_comment_id uuid UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX idx_community_replies_thread
  ON community_replies (thread_id, created_at) WHERE deleted_at IS NULL;

-- Constrained reaction vocabulary — the anti-dopamine stance, enforced in schema.
-- v1 palette: 'respect' only; widen the CHECK to expand (never free emoji).
CREATE TABLE community_reactions (
  subject_kind  text NOT NULL CHECK (subject_kind IN ('thread','reply')),
  subject_id    uuid NOT NULL,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emote         text NOT NULL DEFAULT 'respect' CHECK (emote IN ('respect')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_kind, subject_id, user_id, emote)
);

-- ── Programme (projection over existing calendars — never a second scheduler) ─
CREATE TABLE community_programming (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  edition_id    uuid REFERENCES community_editions(id) ON DELETE CASCADE,
  title         text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('crit_night','screening','challenge','ama','session','drop')),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz,
  location_kind text NOT NULL DEFAULT 'thread'
                CHECK (location_kind IN ('thread','live_session','workshop','external')),
  ref_id        uuid,          -- thread / live_sessions / workshops id per location_kind
  external_url  text,
  -- true → title/time/kind visible to non-members via the teaser view (0003); never content
  tease_visible boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_programming_guide
  ON community_programming (community_id, starts_at);

-- ── Moderation ──────────────────────────────────────────────────────────────
CREATE TABLE community_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind  text NOT NULL CHECK (subject_kind IN ('thread','reply')),
  subject_id    uuid NOT NULL,
  reporter_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        text NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_reports_open ON community_reports (status, created_at)
  WHERE status = 'open';

CREATE TABLE community_mutes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_until   timestamptz NOT NULL,
  reason        text,
  actor_id      uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

-- Mod audit trail (mirrors the enrolment_audit_log pattern).
CREATE TABLE community_mod_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid REFERENCES users(id),
  action        text NOT NULL CHECK (action IN ('remove_thread','restore_thread','remove_reply','restore_reply','mute','unmute','pin','unpin')),
  subject_kind  text NOT NULL,
  subject_id    uuid NOT NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Counter triggers (feed renders with zero aggregate queries) ─────────────
CREATE OR REPLACE FUNCTION community_bump_reply_counters()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_threads
      SET reply_count = reply_count + 1, last_activity_at = now()
      WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_threads
      SET reply_count = GREATEST(reply_count - 1, 0)
      WHERE id = OLD.thread_id;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER community_replies_counter
  AFTER INSERT OR DELETE ON community_replies
  FOR EACH ROW EXECUTE FUNCTION community_bump_reply_counters();

CREATE OR REPLACE FUNCTION community_bump_respect_counters()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.subject_kind = 'thread' THEN
    UPDATE community_threads SET respect_count = respect_count + 1 WHERE id = NEW.subject_id;
  ELSIF TG_OP = 'DELETE' AND OLD.subject_kind = 'thread' THEN
    UPDATE community_threads SET respect_count = GREATEST(respect_count - 1, 0) WHERE id = OLD.subject_id;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER community_reactions_counter
  AFTER INSERT OR DELETE ON community_reactions
  FOR EACH ROW EXECUTE FUNCTION community_bump_respect_counters();

-- Soft-deleted replies must not count: keep counters honest on moderation.
CREATE OR REPLACE FUNCTION community_reply_softdelete_counter()
RETURNS trigger AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE community_threads SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = NEW.thread_id;
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE community_threads SET reply_count = reply_count + 1 WHERE id = NEW.thread_id;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER community_replies_softdelete_counter
  AFTER UPDATE OF deleted_at ON community_replies
  FOR EACH ROW EXECUTE FUNCTION community_reply_softdelete_counter();
