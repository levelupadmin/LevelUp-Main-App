-- ============================================================================
-- DRAFT — NOT A LIVE MIGRATION. DO NOT APPLY.
-- 🔴 Tier 1 (data migration touching live community content + admin RPCs).
-- Runs LAST (after 0001–0003). Copy-only: community_posts/* are never
-- modified or dropped — the old page keeps working until Phase C2 parity.
--
-- 0004 — Admin RPCs, the Commons seed, idempotent legacy-feed copy.
-- ============================================================================

-- ── Admin RPCs (the "one insert" expansion story — ARCHITECTURE §7) ──────────

-- Creates a house + its default rooms. Returns the community id.
CREATE OR REPLACE FUNCTION admin_create_community(p_slug text, p_name text, p_tagline text DEFAULT NULL)
RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  INSERT INTO communities (slug, name, tagline, status)
  VALUES (p_slug, p_name, p_tagline, 'draft')
  RETURNING id INTO v_id;
  INSERT INTO community_rooms (community_id, slug, name, kind, post_policy, sort_order) VALUES
    (v_id, 'noticeboard', 'The Noticeboard', 'noticeboard', 'hosts', 0),
    (v_id, 'dailies',     'Dailies',         'dailies',     'all',   1),
    (v_id, 'lobby',       'The Lobby',       'lobby',       'all',   2),
    (v_id, 'wins',        'Wins',            'wins',        'all',   3),
    (v_id, 'intros',      'First Positions', 'intros',      'all',   4);
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Creates an edition + its default rooms (+ optional entitlement rule in one call).
CREATE OR REPLACE FUNCTION admin_create_edition(
  p_community uuid, p_slug text, p_name text, p_kind text,
  p_tease_copy text DEFAULT NULL, p_path_in_url text DEFAULT NULL,
  p_source_kind text DEFAULT NULL, p_source_id uuid DEFAULT NULL)
RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  INSERT INTO community_editions (community_id, slug, name, kind, tease_copy, path_in_url)
  VALUES (p_community, p_slug, p_name, p_kind, p_tease_copy, p_path_in_url)
  RETURNING id INTO v_id;
  INSERT INTO community_rooms (community_id, edition_id, slug, name, kind, post_policy, sort_order) VALUES
    (p_community, v_id, 'room',        p_name,            'lobby',       'all',   0),
    (p_community, v_id, 'noticeboard', 'The Noticeboard', 'noticeboard', 'hosts', 1);
  IF p_source_kind IS NOT NULL THEN
    INSERT INTO community_entitlement_rules (source_kind, source_id, community_id, edition_id, member_role)
    VALUES (p_source_kind, p_source_id, p_community, v_id, 'member');
    -- the rules trigger backfills members immediately
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Manual grant / host appointment (source_rule_id NULL = resolver never touches it).
CREATE OR REPLACE FUNCTION admin_grant_membership(
  p_user uuid, p_community uuid, p_edition uuid DEFAULT NULL, p_role text DEFAULT 'member')
RETURNS void AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  INSERT INTO community_members (user_id, community_id, edition_id, role, source_rule_id)
  VALUES (p_user, p_community, p_edition, p_role, NULL)
  ON CONFLICT (user_id, community_id, COALESCE(edition_id,'00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET role = EXCLUDED.role, source_rule_id = NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Seed: the Commons (STRATEGY R3 — cold-start insurance, heir of the feed) ─
DO $$
DECLARE v_commons uuid;
BEGIN
  SELECT id INTO v_commons FROM communities WHERE slug = 'commons';
  IF v_commons IS NULL THEN
    INSERT INTO communities (slug, name, tagline, status, sort_order)
    VALUES ('commons', 'The Commons', 'Every member. One floor.', 'active', 100)
    RETURNING id INTO v_commons;
    INSERT INTO community_rooms (community_id, slug, name, kind, post_policy, sort_order) VALUES
      (v_commons, 'announcements', 'Announcements',   'noticeboard', 'hosts', 0),
      (v_commons, 'open-floor',    'The Open Floor',  'lobby',       'all',   1),
      (v_commons, 'wins',          'Wins',            'wins',        'all',   2),
      (v_commons, 'intros',        'First Positions', 'intros',      'all',   3);
    INSERT INTO community_entitlement_rules (source_kind, source_id, community_id, member_role, notes)
    VALUES ('all_members', NULL, v_commons, 'member', 'Everyone belongs to the Commons');
    -- rules trigger backfills all users (bounded by users count; run in release window)
  END IF;
END $$;

-- ── Legacy feed copy (idempotent — re-runnable; NEVER modifies source rows) ──
-- Placement: batch-tagged posts → that batch's edition lobby (if an edition
-- exists for the batch); everything else → Commons Open Floor.
-- Admin pinned posts become noticeboard 'drop's in Announcements.
DO $$
DECLARE
  v_open_floor uuid;
  v_announcements uuid;
BEGIN
  SELECT r.id INTO v_open_floor
    FROM community_rooms r JOIN communities c ON c.id = r.community_id
    WHERE c.slug = 'commons' AND r.slug = 'open-floor';
  SELECT r.id INTO v_announcements
    FROM community_rooms r JOIN communities c ON c.id = r.community_id
    WHERE c.slug = 'commons' AND r.slug = 'announcements';

  -- 1. Threads
  INSERT INTO community_threads
    (room_id, author_id, kind, body, media, is_pinned, legacy_post_id, created_at, last_activity_at)
  SELECT
    COALESCE(
      -- batch-tagged post → the edition room created for that batch (rule on cohort_batch)
      (SELECT r2.id
       FROM community_entitlement_rules er
       JOIN community_rooms r2 ON r2.edition_id = er.edition_id AND r2.kind = 'lobby'
       WHERE er.source_kind = 'cohort_batch' AND er.source_id = p.cohort_batch_id
       LIMIT 1),
      CASE WHEN p.is_admin_post AND p.is_pinned THEN v_announcements ELSE v_open_floor END
    ),
    p.user_id,
    CASE WHEN p.is_admin_post AND p.is_pinned THEN 'drop' ELSE 'post' END,
    p.content_text,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('kind','image','url',m))
              FROM unnest(p.media_urls) m), '[]'::jsonb),
    p.is_pinned,
    p.id,
    p.created_at,
    p.created_at
  FROM community_posts p
  WHERE NOT EXISTS (SELECT 1 FROM community_threads t WHERE t.legacy_post_id = p.id);

  -- 2. Replies (flatten one level of parent_comment_id into parent_reply_id)
  INSERT INTO community_replies
    (thread_id, author_id, body, legacy_comment_id, created_at)
  SELECT t.id, c.user_id, c.comment_text, c.id, c.created_at
  FROM community_post_comments c
  JOIN community_threads t ON t.legacy_post_id = c.post_id
  WHERE NOT EXISTS (SELECT 1 FROM community_replies r WHERE r.legacy_comment_id = c.id);

  UPDATE community_replies r SET parent_reply_id = pr.id
  FROM community_post_comments c
  JOIN community_replies pr ON pr.legacy_comment_id = c.parent_comment_id
  WHERE r.legacy_comment_id = c.id AND c.parent_comment_id IS NOT NULL
    AND r.parent_reply_id IS NULL;

  -- 3. Likes → respect (PK dedupes on re-run)
  INSERT INTO community_reactions (subject_kind, subject_id, user_id, emote, created_at)
  SELECT 'thread', t.id, l.user_id, 'respect', l.created_at
  FROM community_post_likes l
  JOIN community_threads t ON t.legacy_post_id = l.post_id
  ON CONFLICT DO NOTHING;

  -- 4. Recompute counters from truth (triggers only cover post-migration writes)
  UPDATE community_threads t SET
    reply_count = (SELECT count(*) FROM community_replies r
                   WHERE r.thread_id = t.id AND r.deleted_at IS NULL),
    respect_count = (SELECT count(*) FROM community_reactions x
                     WHERE x.subject_kind = 'thread' AND x.subject_id = t.id),
    last_activity_at = GREATEST(t.created_at, COALESCE(
      (SELECT max(r.created_at) FROM community_replies r WHERE r.thread_id = t.id), t.created_at))
  WHERE t.legacy_post_id IS NOT NULL;
END $$;

-- ── Post-apply verification queries (run manually; record outputs in the PR) ─
-- SELECT (SELECT count(*) FROM community_posts) AS legacy,
--        (SELECT count(*) FROM community_threads WHERE legacy_post_id IS NOT NULL) AS copied;
-- SELECT (SELECT count(*) FROM community_post_comments) AS legacy,
--        (SELECT count(*) FROM community_replies WHERE legacy_comment_id IS NOT NULL) AS copied;
-- SELECT count(*) FROM community_members;  -- expect ≈ non-deleted users (Commons rule)
