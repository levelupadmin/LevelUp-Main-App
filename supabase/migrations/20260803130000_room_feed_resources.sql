-- ============================================================================
-- R3 ROUND 2 — room feed + resource binder read contracts
--
-- R0 already owns the tables, RLS and RPC-only write path. This migration adds
-- the bounded client read envelopes R3 needs and closes one relationship the
-- original resource policy could not express: a resource filed under batch A1
-- must never borrow batch A2's week metadata.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. A resource's optional week belongs to the same offering and batch.
--
-- `res_host_write` validates batch -> offering, but a plain RLS policy cannot
-- safely repeat the week relationship for admin and future write paths. Keep
-- the invariant at the table boundary. Existing malformed rows lose only their
-- week grouping and become pinned; the resource itself is preserved.
-- ---------------------------------------------------------------------------
UPDATE public.cohort_resources r
SET cohort_week_id = NULL
WHERE r.cohort_week_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.cohort_weeks w
    JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
    WHERE w.id = r.cohort_week_id
      AND b.id = r.batch_id
      AND b.offering_id = r.offering_id
  );

CREATE OR REPLACE FUNCTION public._cohort_resource_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.cohort_batches b
    WHERE b.id = NEW.batch_id
      AND b.offering_id = NEW.offering_id
  ) THEN
    RAISE EXCEPTION 'resource batch must belong to its offering'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.cohort_week_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.cohort_weeks w
    JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
    WHERE w.id = NEW.cohort_week_id
      AND b.id = NEW.batch_id
      AND b.offering_id = NEW.offering_id
  ) THEN
    RAISE EXCEPTION 'resource week must belong to its offering and batch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cohort_resource_validate_scope ON public.cohort_resources;
CREATE TRIGGER cohort_resource_validate_scope
  BEFORE INSERT OR UPDATE OF offering_id, batch_id, cohort_week_id
  ON public.cohort_resources
  FOR EACH ROW EXECUTE FUNCTION public._cohort_resource_validate_scope();

REVOKE ALL ON FUNCTION public._cohort_resource_validate_scope() FROM PUBLIC, anon, authenticated;


-- An offering-wide mentor's all-batches view cannot use the older batch-first
-- feed indexes. Keep that bounded keyset scan on the same ordering contract.
CREATE INDEX IF NOT EXISTS room_posts_offering_recent_idx
  ON public.cohort_room_posts (offering_id, last_activity_at DESC, id DESC)
  WHERE deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- 2. Feed envelope: one RPC per page.
--
-- The response carries:
--   · a keyset-paged post list (last_activity_at, id), never OFFSET;
--   · at most 50 live replies per post, with a truncation flag;
--   · the caller's selectable batches, allowed channel keys and week ids, so an
--     offering-wide mentor can choose a destination without another request.
--
-- The RPC is SECURITY DEFINER only so it can project safe author names/avatars
-- without granting the users table broadly. It asserts full membership first,
-- repeats `cohort_room_can_access` per returned post, and never projects email,
-- phone, bio, application text or tally data.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_room_feed(
  p_offering uuid,
  p_channel text DEFAULT NULL,
  p_batch uuid DEFAULT NULL,
  p_before_activity timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_batch uuid;
  v_role text;
  v_wide boolean;
  v_target_batch uuid;
  v_channel text := NULLIF(btrim(COALESCE(p_channel, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 40);
  v_posts jsonb := '[]'::jsonb;
  v_batches jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_activity timestamptz;
  v_next_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF (p_before_activity IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'feed cursor requires both activity and id'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.batch_id, s.member_role, s.offering_wide
    INTO v_member_batch, v_role, v_wide
  FROM public.cohort_room_caller_scope(p_offering) s;

  IF v_role IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'pre_member' THEN
    RAISE EXCEPTION 'community unlocks when your enrolment completes'
      USING ERRCODE = '42501';
  END IF;

  v_wide := COALESCE(v_wide, public.cohort_room_is_offering_wide(p_offering));

  IF v_wide THEN
    IF p_batch IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cohort_batches b
      WHERE b.id = p_batch AND b.offering_id = p_offering
    ) THEN
      RAISE EXCEPTION 'batch does not belong to this offering'
        USING ERRCODE = '22023';
    END IF;
    v_target_batch := p_batch; -- NULL means the staff all-batches view.
  ELSE
    IF v_member_batch IS NULL THEN
      RAISE EXCEPTION 'no batch assigned in this room yet'
        USING ERRCODE = '42501';
    END IF;
    IF p_batch IS NOT NULL AND p_batch IS DISTINCT FROM v_member_batch THEN
      RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
    END IF;
    v_target_batch := v_member_batch;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'channels', to_jsonb(public.cohort_room_allowed_channels(p_offering, b.id)),
      'channel_labels', COALESCE((
        SELECT jsonb_object_agg(n.key, n.label)
        FROM (
          SELECT
            NULLIF(btrim(CASE
              WHEN jsonb_typeof(e) = 'object' THEN e ->> 'key'
              ELSE e #>> '{}'
            END), '') AS key,
            COALESCE(
              NULLIF(btrim(CASE
                WHEN jsonb_typeof(e) = 'object' THEN e ->> 'label'
                ELSE e #>> '{}'
              END), ''),
              NULLIF(btrim(CASE
                WHEN jsonb_typeof(e) = 'object' THEN e ->> 'key'
                ELSE e #>> '{}'
              END), '')
            ) AS label
          FROM jsonb_array_elements(CASE
            WHEN jsonb_typeof(cfg.niche_channels) = 'array'
              THEN cfg.niche_channels
            ELSE '[]'::jsonb
          END) e
        ) n
        WHERE n.key IS NOT NULL
      ), '{}'::jsonb),
      'weeks', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', w.id,
          'week_number', w.week_number,
          'theme', w.theme,
          'status', w.status
        ) ORDER BY w.week_number, w.sort_order, w.id)
        FROM public.cohort_weeks w
        WHERE w.cohort_batch_id = b.id
      ), '[]'::jsonb)
    ) ORDER BY b.created_at, b.id
  ), '[]'::jsonb)
  INTO v_batches
  FROM public.cohort_batches b
  LEFT JOIN LATERAL (
    SELECT c.vocab -> 'niche_channels' AS niche_channels
    FROM public.cohort_room_configs c
    WHERE c.offering_id = p_offering
      AND (c.batch_id IS NULL OR c.batch_id = b.id)
    ORDER BY (c.batch_id IS NOT NULL) DESC
    LIMIT 1
  ) cfg ON true
  WHERE b.offering_id = p_offering
    AND (v_wide OR b.id = v_member_batch);

  WITH page AS MATERIALIZED (
    SELECT p.*
    FROM public.cohort_room_posts p
    WHERE p.offering_id = p_offering
      AND p.deleted_at IS NULL
      AND public.cohort_room_can_access(p.offering_id, p.batch_id)
      AND (
        (v_wide AND v_target_batch IS NULL)
        OR p.batch_id = v_target_batch
      )
      AND (
        v_channel IS NULL OR v_channel = 'all'
        OR (v_channel = 'wins' AND p.kind = 'win')
        OR (v_channel NOT IN ('wins','announcements') AND p.channel_key = v_channel)
      )
      AND (
        p_before_activity IS NULL
        OR (p.last_activity_at, p.id) < (p_before_activity, p_before_id)
      )
    ORDER BY p.last_activity_at DESC, p.id DESC
    LIMIT v_limit + 1
  ), kept AS MATERIALIZED (
    SELECT * FROM page
    ORDER BY last_activity_at DESC, id DESC
    LIMIT v_limit
  ), hydrated AS (
    SELECT
      p.last_activity_at,
      p.id,
      jsonb_build_object(
        'id', p.id,
        'offering_id', p.offering_id,
        'batch_id', p.batch_id,
        'batch_name', b.name,
        'author_id', p.author_id,
        'author_name', COALESCE(NULLIF(btrim(u.full_name), ''), 'Member'),
        'author_avatar_url', u.avatar_url,
        'author_role', ar.role,
        'kind', p.kind,
        'body', p.body,
        'media', p.media,
        'channel_key', p.channel_key,
        'cohort_week_id', p.cohort_week_id,
        'week_number', w.week_number,
        'reply_count', p.reply_count,
        'last_activity_at', p.last_activity_at,
        'created_at', p.created_at,
        'replies', COALESCE(rr.rows, '[]'::jsonb),
        'replies_truncated', p.reply_count > 50
      ) AS payload
    FROM kept p
    JOIN public.cohort_batches b ON b.id = p.batch_id
    JOIN public.users u ON u.id = p.author_id
    LEFT JOIN public.cohort_weeks w
      ON w.id = p.cohort_week_id AND w.cohort_batch_id = p.batch_id
    LEFT JOIN LATERAL (
      SELECT m.role
      FROM public.cohort_room_members m
      WHERE m.user_id = p.author_id
        AND m.offering_id = p.offering_id
        AND m.status = 'active'
        AND (m.batch_id IS NULL OR m.batch_id = p.batch_id)
      ORDER BY (m.role = 'host') DESC, (m.role = 'mentor') DESC, m.created_at
      LIMIT 1
    ) ar ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id,
        'author_id', q.author_id,
        'author_name', q.author_name,
        'author_avatar_url', q.author_avatar_url,
        'body', q.body,
        'is_mentor_answer', q.is_mentor_answer,
        'created_at', q.created_at
      ) ORDER BY q.created_at, q.id) AS rows
      FROM (
        SELECT
          r.id,
          r.author_id,
          COALESCE(NULLIF(btrim(ru.full_name), ''), 'Member') AS author_name,
          ru.avatar_url AS author_avatar_url,
          r.body,
          r.is_mentor_answer,
          r.created_at
        FROM public.cohort_room_post_replies r
        JOIN public.users ru ON ru.id = r.author_id
        WHERE r.post_id = p.id
          AND r.deleted_at IS NULL
        ORDER BY r.created_at, r.id
        LIMIT 50
      ) q
    ) rr ON true
  )
  SELECT
    COALESCE(jsonb_agg(payload ORDER BY last_activity_at DESC, id DESC), '[]'::jsonb),
    (SELECT count(*) > v_limit FROM page)
  INTO v_posts, v_has_more
  FROM hydrated;

  IF v_has_more AND jsonb_array_length(v_posts) > 0 THEN
    v_next_activity := (v_posts -> -1 ->> 'last_activity_at')::timestamptz;
    v_next_id := (v_posts -> -1 ->> 'id')::uuid;
  END IF;

  RETURN jsonb_build_object(
    'posts', v_posts,
    'batches', v_batches,
    'selected_batch_id', v_target_batch,
    'has_more', v_has_more,
    'next_cursor', CASE WHEN v_has_more THEN jsonb_build_object(
      'activity', v_next_activity,
      'id', v_next_id
    ) ELSE NULL END
  );
END $$;

REVOKE ALL ON FUNCTION public.get_room_feed(uuid, text, uuid, timestamptz, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_feed(uuid, text, uuid, timestamptz, uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_room_feed(uuid, text, uuid, timestamptz, uuid, integer) IS
  'Full-member room feed envelope. One keyset-paged fetch returns safe author '
  'projection, bounded flat replies, selectable batches/channels/weeks and an '
  'explicit end cursor. pre_member and non-member callers receive 42501.';


-- ---------------------------------------------------------------------------
-- 3. Resource binder envelope.
--
-- Weekless rows are the pinned section. The result is bounded at 500 rows and
-- reports truncation instead of silently pretending a partial binder is whole.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_room_resources(
  p_offering uuid,
  p_batch uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_batch uuid;
  v_role text;
  v_wide boolean;
  v_target_batch uuid;
  v_resources jsonb := '[]'::jsonb;
  v_batches jsonb := '[]'::jsonb;
  v_truncated boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT s.batch_id, s.member_role, s.offering_wide
    INTO v_member_batch, v_role, v_wide
  FROM public.cohort_room_caller_scope(p_offering) s;

  IF v_role IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'pre_member' THEN
    RAISE EXCEPTION 'resources unlock when your enrolment completes'
      USING ERRCODE = '42501';
  END IF;

  v_wide := COALESCE(v_wide, public.cohort_room_is_offering_wide(p_offering));

  IF v_wide THEN
    IF p_batch IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cohort_batches b
      WHERE b.id = p_batch AND b.offering_id = p_offering
    ) THEN
      RAISE EXCEPTION 'batch does not belong to this offering'
        USING ERRCODE = '22023';
    END IF;
    v_target_batch := p_batch;
  ELSE
    IF v_member_batch IS NULL THEN
      RAISE EXCEPTION 'no batch assigned in this room yet'
        USING ERRCODE = '42501';
    END IF;
    IF p_batch IS NOT NULL AND p_batch IS DISTINCT FROM v_member_batch THEN
      RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
    END IF;
    v_target_batch := v_member_batch;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', b.id, 'name', b.name)
    ORDER BY b.created_at, b.id
  ), '[]'::jsonb)
  INTO v_batches
  FROM public.cohort_batches b
  WHERE b.offering_id = p_offering
    AND (v_wide OR b.id = v_member_batch);

  WITH visible AS MATERIALIZED (
    SELECT
      r.id,
      r.offering_id,
      r.batch_id,
      b.name AS batch_name,
      r.cohort_week_id,
      w.week_number,
      w.theme AS week_theme,
      r.title,
      r.kind,
      r.url,
      r.sort_order,
      r.created_at,
      r.added_by,
      COALESCE(NULLIF(btrim(u.full_name), ''), 'The team') AS added_by_name
    FROM public.cohort_resources r
    LEFT JOIN public.cohort_batches b ON b.id = r.batch_id
    LEFT JOIN public.cohort_weeks w
      ON w.id = r.cohort_week_id
     AND w.cohort_batch_id = r.batch_id
    LEFT JOIN public.users u ON u.id = r.added_by
    WHERE r.offering_id = p_offering
      AND public.cohort_room_can_access(r.offering_id, r.batch_id)
      AND (
        r.batch_id IS NULL
        OR (v_wide AND v_target_batch IS NULL)
        OR r.batch_id = v_target_batch
      )
    ORDER BY
      (r.cohort_week_id IS NULL) DESC,
      w.week_number NULLS FIRST,
      r.sort_order,
      r.created_at,
      r.id
    LIMIT 501
  ), kept AS (
    SELECT * FROM visible
    ORDER BY
      (cohort_week_id IS NULL) DESC,
      week_number NULLS FIRST,
      sort_order,
      created_at,
      id
    LIMIT 500
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'offering_id', offering_id,
      'batch_id', batch_id,
      'batch_name', batch_name,
      'cohort_week_id', cohort_week_id,
      'week_number', week_number,
      'week_theme', week_theme,
      'title', title,
      'kind', kind,
      'url', url,
      'sort_order', sort_order,
      'created_at', created_at,
      'added_by', added_by,
      'added_by_name', added_by_name
    ) ORDER BY
      (cohort_week_id IS NULL) DESC,
      week_number NULLS FIRST,
      sort_order,
      created_at,
      id
    ), '[]'::jsonb),
    (SELECT count(*) > 500 FROM visible)
  INTO v_resources, v_truncated
  FROM kept;

  RETURN jsonb_build_object(
    'resources', v_resources,
    'batches', v_batches,
    'selected_batch_id', v_target_batch,
    'truncated', v_truncated
  );
END $$;

REVOKE ALL ON FUNCTION public.get_room_resources(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_resources(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_room_resources(uuid, uuid) IS
  'Full-member resource binder: offering-wide pinned rows plus the caller''s '
  'batch, safe week/author projection, deterministic grouping, hard 500-row cap. '
  'pre_member and non-member callers receive 42501.';


-- ---------------------------------------------------------------------------
-- 4. ACL assertions. Supabase default ACLs grant functions directly to anon
-- and authenticated, so PUBLIC-only revokes are not proof.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.get_room_feed(uuid,text,uuid,timestamptz,uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.get_room_feed(uuid,text,uuid,timestamptz,uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_room_feed ACL must be authenticated-only';
  END IF;

  IF has_function_privilege('anon',
       'public.get_room_resources(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.get_room_resources(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_room_resources ACL must be authenticated-only';
  END IF;

  IF has_function_privilege('anon',
       'public._cohort_resource_validate_scope()', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public._cohort_resource_validate_scope()', 'EXECUTE') THEN
    RAISE EXCEPTION '_cohort_resource_validate_scope must not be client-callable';
  END IF;
END $$;


-- Manual reversal (not executed):
--   DROP FUNCTION public.get_room_resources(uuid, uuid);
--   DROP FUNCTION public.get_room_feed(uuid, text, uuid, timestamptz, uuid, integer);
--   DROP TRIGGER cohort_resource_validate_scope ON public.cohort_resources;
--   DROP FUNCTION public._cohort_resource_validate_scope();
