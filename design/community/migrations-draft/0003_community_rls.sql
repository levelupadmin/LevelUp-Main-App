-- ============================================================================
-- DRAFT — NOT A LIVE MIGRATION. DO NOT APPLY.
-- 🔴 Tier 1 — THIS IS THE SECURITY BOUNDARY. RLS is Tier 1 per CLAUDE.md.
-- Council must argue every policy; the adversarial access-test suite
-- (EXECUTION-BACKLOG.md, QA section) must pass on a shadow project BEFORE
-- this reaches supabase/migrations/. Rahul signs off in writing.
--
-- 0003 — Helper functions, all policies, grants, tease view, read RPCs.
-- Invariants (ARCHITECTURE.md §5): every content SELECT routes through
-- community_can_access_room(); tease surfaces are metadata-only; clients
-- never write community_members.
-- ============================================================================

-- ── Helper functions (house pattern: STABLE SECURITY DEFINER, pinned path) ──

CREATE OR REPLACE FUNCTION community_is_member(p_community uuid)
RETURNS boolean AS $$
  SELECT is_admin() OR EXISTS (
    SELECT 1 FROM community_members m
    WHERE m.user_id = auth.uid() AND m.community_id = p_community
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- THE single gate for all content access. One function to audit, one to test.
-- Open room (edition_id NULL) → any membership row in the community
--   (edition members hold a community-scope row too? NO — edition rules may
--   target only the edition, so we accept EITHER a community-scope row OR any
--   edition-scope row in that community: being inside any room of the house
--   means you can stand in its open rooms).
-- Edition room → a membership row for exactly that edition.
CREATE OR REPLACE FUNCTION community_can_access_room(p_room uuid)
RETURNS boolean AS $$
  SELECT is_admin() OR EXISTS (
    SELECT 1
    FROM community_rooms r
    JOIN community_members m
      ON m.user_id = auth.uid()
     AND m.community_id = r.community_id
     AND (
       (r.edition_id IS NULL)                       -- open craft room: any standing in the house
       OR (m.edition_id = r.edition_id)             -- gated room: exact edition membership
     )
    WHERE r.id = p_room
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION community_room_role(p_room uuid)
RETURNS text AS $$
  SELECT COALESCE((
    SELECT m.role
    FROM community_rooms r
    JOIN community_members m
      ON m.user_id = auth.uid()
     AND m.community_id = r.community_id
     AND (r.edition_id IS NULL OR m.edition_id = r.edition_id)
    WHERE r.id = p_room
    ORDER BY community_role_rank(m.role) DESC
    LIMIT 1
  ), 'none');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION community_can_post(p_room uuid)
RETURNS boolean AS $$
  SELECT community_can_access_room(p_room)
     AND NOT EXISTS (                                   -- not muted in this house
       SELECT 1 FROM community_rooms r
       JOIN community_mutes mu ON mu.community_id = r.community_id
       WHERE r.id = p_room AND mu.user_id = auth.uid() AND mu.muted_until > now())
     AND (
       is_admin()
       OR (SELECT post_policy FROM community_rooms WHERE id = p_room) = 'all'
       OR community_room_role(p_room) IN ('host','mentor')
     );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── Enable RLS everywhere; revoke default surface ────────────────────────────
ALTER TABLE communities                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_editions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_rooms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_entitlement_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_threads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_replies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_programming       ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_mutes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_mod_log           ENABLE ROW LEVEL SECURITY;

-- No anon access to ANY community table (unlike courses, which allow public reads).
REVOKE ALL ON communities, community_editions, community_rooms,
           community_entitlement_rules, community_members, community_threads,
           community_replies, community_reactions, community_programming,
           community_reports, community_mutes, community_mod_log FROM anon;
-- Clients never write memberships or rules — SELECT only where policies allow.
REVOKE INSERT, UPDATE, DELETE ON community_members, community_entitlement_rules,
           community_mod_log FROM authenticated;

-- ── Containers ───────────────────────────────────────────────────────────────
-- Houses: metadata visible in-app to all signed-in users (doors are the product).
CREATE POLICY communities_read ON communities FOR SELECT
  USING (auth.uid() IS NOT NULL AND (status IN ('opening_soon','active') OR is_admin()));
CREATE POLICY communities_admin ON communities FOR ALL USING (is_admin());

-- Editions: the tease row (name/crest/count/copy/path-in) is visible BY DESIGN;
-- content never lives in this table (leak-proofing invariant #3).
CREATE POLICY editions_read ON community_editions FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY editions_admin ON community_editions FOR ALL USING (is_admin());

-- Rooms: members only — non-members learn room names from nothing but the tease surfaces.
CREATE POLICY rooms_read ON community_rooms FOR SELECT
  USING (community_can_access_room(id));
CREATE POLICY rooms_admin ON community_rooms FOR ALL USING (is_admin());

-- Rules: admin-only in both directions.
CREATE POLICY rules_admin ON community_entitlement_rules FOR ALL USING (is_admin());

-- Memberships: read your own standing (+admin); zero client writes (grants above).
CREATE POLICY members_read_own ON community_members FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

-- ── Content ─────────────────────────────────────────────────────────────────
CREATE POLICY threads_read ON community_threads FOR SELECT
  USING (
    community_can_access_room(room_id)
    AND (deleted_at IS NULL OR author_id = auth.uid() OR is_admin())
  );
CREATE POLICY threads_insert ON community_threads FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND community_can_post(room_id)
    -- noticeboard 'drop' threads are host/mentor-authored by policy (room post_policy)
    AND deleted_at IS NULL AND is_pinned = false     -- clients never mint pinned/deleted rows
  );
CREATE POLICY threads_update_own ON community_threads FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid() AND is_pinned = (SELECT t.is_pinned FROM community_threads t WHERE t.id = community_threads.id));
  -- authors edit body/title/status/media; pin state is host/admin-only (below)
CREATE POLICY threads_moderate ON community_threads FOR UPDATE
  USING (is_admin() OR community_room_role(room_id) IN ('host','mentor'));
-- No DELETE policy: removals are soft-deletes via UPDATE (auditable, reversible).

CREATE POLICY replies_read ON community_replies FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM community_threads t
            WHERE t.id = thread_id AND community_can_access_room(t.room_id))
    AND (deleted_at IS NULL OR author_id = auth.uid() OR is_admin())
  );
CREATE POLICY replies_insert ON community_replies FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND helped = false                                -- 'helped' is never self-minted
    AND EXISTS (SELECT 1 FROM community_threads t
                WHERE t.id = thread_id
                  AND t.deleted_at IS NULL
                  AND community_can_access_room(t.room_id))
  );
CREATE POLICY replies_update_own ON community_replies FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid() AND helped = (SELECT r.helped FROM community_replies r WHERE r.id = community_replies.id));
-- 'helped' flips ONLY through the RPC below (thread-author check inside);
-- hosts/admin moderate via a separate policy:
CREATE POLICY replies_moderate ON community_replies FOR UPDATE
  USING (is_admin() OR EXISTS (
    SELECT 1 FROM community_threads t
    WHERE t.id = thread_id AND community_room_role(t.room_id) IN ('host','mentor')));

CREATE POLICY reactions_read ON community_reactions FOR SELECT
  USING (
    (subject_kind = 'thread' AND EXISTS (
       SELECT 1 FROM community_threads t
       WHERE t.id = subject_id AND community_can_access_room(t.room_id)))
    OR
    (subject_kind = 'reply' AND EXISTS (
       SELECT 1 FROM community_replies rp JOIN community_threads t ON t.id = rp.thread_id
       WHERE rp.id = subject_id AND community_can_access_room(t.room_id)))
  );
CREATE POLICY reactions_write_own ON community_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (subject_kind = 'thread' AND EXISTS (
         SELECT 1 FROM community_threads t
         WHERE t.id = subject_id AND t.deleted_at IS NULL AND community_can_access_room(t.room_id)))
      OR
      (subject_kind = 'reply' AND EXISTS (
         SELECT 1 FROM community_replies rp JOIN community_threads t ON t.id = rp.thread_id
         WHERE rp.id = subject_id AND rp.deleted_at IS NULL AND community_can_access_room(t.room_id)))
    )
  );
CREATE POLICY reactions_delete_own ON community_reactions FOR DELETE
  USING (user_id = auth.uid());

-- ── Programme ────────────────────────────────────────────────────────────────
-- Members see full rows for their houses/editions:
CREATE POLICY programming_read_members ON community_programming FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM community_members m
      WHERE m.user_id = auth.uid()
        AND m.community_id = community_programming.community_id
        AND (community_programming.edition_id IS NULL
             OR m.edition_id = community_programming.edition_id)));
CREATE POLICY programming_admin ON community_programming FOR ALL USING (is_admin());

-- Non-members get ONLY the teaser view (title/time/kind — no ref ids, no urls).
-- SECURITY DEFINER view = deliberate, audited projection; contains zero content columns.
CREATE OR REPLACE VIEW community_programme_teasers AS
  SELECT p.id, p.community_id, p.edition_id, p.title, p.kind, p.starts_at, p.ends_at
  FROM community_programming p
  WHERE p.tease_visible;
REVOKE ALL ON community_programme_teasers FROM anon;
GRANT SELECT ON community_programme_teasers TO authenticated;

-- ── Moderation ───────────────────────────────────────────────────────────────
CREATE POLICY reports_insert ON community_reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY reports_read ON community_reports FOR SELECT
  USING (reporter_id = auth.uid() OR is_admin());
CREATE POLICY reports_admin ON community_reports FOR UPDATE USING (is_admin());

CREATE POLICY mutes_read ON community_mutes FOR SELECT
  USING (user_id = auth.uid() OR is_admin());
CREATE POLICY mutes_admin ON community_mutes FOR ALL USING (is_admin());

CREATE POLICY mod_log_admin ON community_mod_log FOR SELECT USING (is_admin());

-- ── Guarded write RPC: the 'helped' mark (thread author only) ────────────────
CREATE OR REPLACE FUNCTION community_mark_helped(p_reply uuid, p_helped boolean)
RETURNS void AS $$
DECLARE v_thread_author uuid;
BEGIN
  SELECT t.author_id INTO v_thread_author
  FROM community_replies r JOIN community_threads t ON t.id = r.thread_id
  WHERE r.id = p_reply AND r.deleted_at IS NULL AND t.deleted_at IS NULL
    AND community_can_access_room(t.room_id);
  IF v_thread_author IS NULL OR v_thread_author <> auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  UPDATE community_replies SET helped = p_helped WHERE id = p_reply;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Read RPCs (one round-trip per surface; access asserted FIRST — invariant #6)

-- Room feed: threads + author card + my_respect, keyset-paginated. Pages END.
CREATE OR REPLACE FUNCTION community_get_feed(
  p_room uuid, p_before timestamptz DEFAULT NULL, p_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid, kind text, title text, body text, media jsonb,
  work_url text, crit_asks text[], status text, is_pinned boolean,
  reply_count int, respect_count int, last_activity_at timestamptz,
  created_at timestamptz, author_id uuid, author_name text,
  author_avatar text, author_member_number int, author_role text,
  my_respect boolean
) AS $$
BEGIN
  IF NOT community_can_access_room(p_room) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  RETURN QUERY
  SELECT t.id, t.kind, t.title, t.body, t.media,
         t.work_url, t.crit_asks, t.status, t.is_pinned,
         t.reply_count, t.respect_count, t.last_activity_at,
         t.created_at, t.author_id,
         COALESCE(u.full_name, 'Member'), u.avatar_url, u.member_number,
         community_role_rank_name(t.room_id, t.author_id),
         EXISTS (SELECT 1 FROM community_reactions x
                 WHERE x.subject_kind = 'thread' AND x.subject_id = t.id
                   AND x.user_id = auth.uid())
  FROM community_threads t
  JOIN users u ON u.id = t.author_id          -- safe columns only (public_user_profiles set)
  WHERE t.room_id = p_room
    AND t.deleted_at IS NULL
    AND (p_before IS NULL OR t.last_activity_at < p_before)
  ORDER BY t.is_pinned DESC, t.last_activity_at DESC, t.id DESC
  LIMIT LEAST(p_limit, 50);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Author-role lookup for feed rendering (member/alumni/host/mentor wordmark).
CREATE OR REPLACE FUNCTION community_role_rank_name(p_room uuid, p_user uuid)
RETURNS text AS $$
  SELECT COALESCE((
    SELECT m.role FROM community_rooms r
    JOIN community_members m
      ON m.user_id = p_user AND m.community_id = r.community_id
     AND (r.edition_id IS NULL OR m.edition_id = r.edition_id)
    WHERE r.id = p_room
    ORDER BY community_role_rank(m.role) DESC LIMIT 1
  ), 'member');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- The home surface: my houses + my editions + happening-now + next-7-days
-- programme + teased doors, in ONE round trip (jsonb envelope; UI shapes it).
CREATE OR REPLACE FUNCTION community_get_programme()
RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'houses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'name', c.name, 'tagline', c.tagline,
        'artwork_url', c.artwork_url, 'status', c.status,
        'my_role', (SELECT m.role FROM community_members m
                    WHERE m.user_id = auth.uid() AND m.community_id = c.id
                    ORDER BY community_role_rank(m.role) DESC LIMIT 1))
        ORDER BY c.sort_order)
      FROM communities c
      WHERE c.status IN ('opening_soon','active')), '[]'::jsonb),
    'my_editions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'slug', e.slug, 'name', e.name, 'kind', e.kind,
        'community_id', e.community_id, 'phase', e.phase, 'cover_url', e.cover_url))
      FROM community_editions e
      WHERE EXISTS (SELECT 1 FROM community_members m
                    WHERE m.user_id = auth.uid() AND m.edition_id = e.id)), '[]'::jsonb),
    'teased_editions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'slug', e.slug, 'name', e.name, 'kind', e.kind,
        'community_id', e.community_id, 'phase', e.phase, 'cover_url', e.cover_url,
        'tease_copy', e.tease_copy, 'path_in_url', e.path_in_url,
        'member_count', e.member_count))
      FROM community_editions e
      WHERE NOT EXISTS (SELECT 1 FROM community_members m
                        WHERE m.user_id = auth.uid() AND m.edition_id = e.id)), '[]'::jsonb),
    'happening_now', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title, 'kind', p.kind, 'community_id', p.community_id,
        'edition_id', p.edition_id, 'starts_at', p.starts_at, 'ends_at', p.ends_at,
        'is_member', EXISTS (SELECT 1 FROM community_members m
                             WHERE m.user_id = auth.uid()
                               AND m.community_id = p.community_id
                               AND (p.edition_id IS NULL OR m.edition_id = p.edition_id))))
      FROM community_programming p
      WHERE p.starts_at <= now() AND COALESCE(p.ends_at, p.starts_at + interval '2 hours') > now()
        AND (p.tease_visible OR EXISTS (SELECT 1 FROM community_members m
                                        WHERE m.user_id = auth.uid()
                                          AND m.community_id = p.community_id))), '[]'::jsonb),
    'this_week', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title, 'kind', p.kind, 'community_id', p.community_id,
        'edition_id', p.edition_id, 'starts_at', p.starts_at,
        'is_member', EXISTS (SELECT 1 FROM community_members m
                             WHERE m.user_id = auth.uid()
                               AND m.community_id = p.community_id
                               AND (p.edition_id IS NULL OR m.edition_id = p.edition_id)))
        ORDER BY p.starts_at)
      FROM community_programming p
      WHERE p.starts_at > now() AND p.starts_at < now() + interval '7 days'
        AND (p.tease_visible OR EXISTS (SELECT 1 FROM community_members m
                                        WHERE m.user_id = auth.uid()
                                          AND m.community_id = p.community_id))), '[]'::jsonb)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
-- NOTE FOR COUNCIL: teased items expose title/time/kind/count only — the
-- adversarial suite asserts no content field can appear in any teased branch.
