-- ============================================================================
-- DRAFT — NOT A LIVE MIGRATION. DO NOT APPLY.
-- 🔴 Tier 1 (touches triggers on enrolments/cohort tables — the entitlement
-- spine). Council + Rahul sign-off + backup + staged verification required.
--
-- 0002 — The entitlement engine: rules → materialized memberships.
-- Design rationale: design/community/ARCHITECTURE.md §3.
-- Membership is DERIVED from real sources (enrolments, cohort_batch_members,
-- cohort_applications, users.is_legacy) — never claimed by clients.
-- ============================================================================

-- ── The mapping table: one row = one product→community placement ────────────
CREATE TABLE community_entitlement_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind   text NOT NULL CHECK (source_kind IN
                  ('offering','cohort_batch','application_accepted','legacy_alumni','all_members')),
  source_id     uuid,   -- offerings.id | cohort_batches.id; NULL for legacy_alumni/all_members
  community_id  uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  edition_id    uuid REFERENCES community_editions(id) ON DELETE CASCADE,
  member_role   text NOT NULL DEFAULT 'member'
                CHECK (member_role IN ('member','alumni','host','mentor')),
  active        boolean NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_kind IN ('legacy_alumni','all_members')) = (source_id IS NULL))
);
CREATE INDEX idx_entitlement_rules_source ON community_entitlement_rules (source_kind, source_id)
  WHERE active;

-- ── Materialized membership: the ONE table all content RLS reads ────────────
CREATE TABLE community_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id    uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  edition_id      uuid REFERENCES community_editions(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member'
                  CHECK (role IN ('member','alumni','host','mentor')),
  -- NULL source_rule_id = manual grant (resolver never touches manual rows)
  source_rule_id  uuid REFERENCES community_entitlement_rules(id) ON DELETE CASCADE,
  granted_at      timestamptz NOT NULL DEFAULT now()
);
-- One membership per (user, community, edition-or-open) — role upgrades update in place.
CREATE UNIQUE INDEX uq_community_members_scope
  ON community_members (user_id, community_id, COALESCE(edition_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_community_members_scope_lookup
  ON community_members (community_id, edition_id);

-- role precedence for upserts: mentor > host > alumni > member
CREATE OR REPLACE FUNCTION community_role_rank(p_role text)
RETURNS int AS $$
  SELECT CASE p_role WHEN 'mentor' THEN 4 WHEN 'host' THEN 3 WHEN 'alumni' THEN 2 ELSE 1 END;
$$ LANGUAGE sql IMMUTABLE;

-- ── The resolver: recompute ONE user's derived memberships ──────────────────
-- Idempotent. Manual rows (source_rule_id IS NULL) are never touched.
CREATE OR REPLACE FUNCTION community_resolve_user(p_user_id uuid)
RETURNS void AS $$
BEGIN
  -- 1. What the user is entitled to right now, per active rules
  -- (DROP first: the resolver is called in loops within one tx by apply_rule/reconcile)
  DROP TABLE IF EXISTS _entitled;
  CREATE TEMP TABLE _entitled ON COMMIT DROP AS
  SELECT DISTINCT ON (r.community_id, COALESCE(r.edition_id,'00000000-0000-0000-0000-000000000000'::uuid))
         r.id AS rule_id, r.community_id, r.edition_id, r.member_role
  FROM community_entitlement_rules r
  WHERE r.active AND (
    (r.source_kind = 'offering' AND EXISTS (
       SELECT 1 FROM enrolments e
       WHERE e.user_id = p_user_id AND e.offering_id = r.source_id
         AND e.status = 'active'
         AND (e.expires_at IS NULL OR e.expires_at > now())))
    OR
    (r.source_kind = 'cohort_batch' AND EXISTS (
       SELECT 1 FROM cohort_batch_members cbm
       JOIN enrolments e ON e.id = cbm.enrolment_id
       WHERE cbm.batch_id = r.source_id AND e.user_id = p_user_id
         AND e.status = 'active'))
    OR
    (r.source_kind = 'application_accepted' AND EXISTS (
       SELECT 1 FROM cohort_applications ca
       WHERE ca.user_id = p_user_id AND ca.offering_id = r.source_id
         AND ca.status IN ('accepted','confirmation_paid','balance_paid','enrolled')))
    OR
    (r.source_kind = 'legacy_alumni' AND EXISTS (
       SELECT 1 FROM users u WHERE u.id = p_user_id AND u.is_legacy AND u.deleted_at IS NULL))
    OR
    (r.source_kind = 'all_members' AND EXISTS (
       SELECT 1 FROM users u WHERE u.id = p_user_id AND u.deleted_at IS NULL))
  )
  ORDER BY r.community_id,
           COALESCE(r.edition_id,'00000000-0000-0000-0000-000000000000'::uuid),
           community_role_rank(r.member_role) DESC;

  -- 2. Retract derived rows no longer entitled (revoked/expired enrolments exit here)
  DELETE FROM community_members m
  WHERE m.user_id = p_user_id
    AND m.source_rule_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM _entitled t
      WHERE t.community_id = m.community_id
        AND COALESCE(t.edition_id,'00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(m.edition_id,'00000000-0000-0000-0000-000000000000'::uuid));

  -- 3. Grant/upgrade (manual rows win on conflict only if their role outranks)
  INSERT INTO community_members (user_id, community_id, edition_id, role, source_rule_id)
  SELECT p_user_id, t.community_id, t.edition_id, t.member_role, t.rule_id
  FROM _entitled t
  ON CONFLICT (user_id, community_id, COALESCE(edition_id,'00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET role = EXCLUDED.role, source_rule_id = EXCLUDED.source_rule_id
  WHERE community_role_rank(EXCLUDED.role) > community_role_rank(community_members.role)
    AND community_members.source_rule_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Rule backfill: apply a new/changed rule to ALL qualifying users ─────────
CREATE OR REPLACE FUNCTION community_apply_rule(p_rule_id uuid)
RETURNS integer AS $$
DECLARE
  r community_entitlement_rules%ROWTYPE;
  affected integer := 0;
BEGIN
  SELECT * INTO r FROM community_entitlement_rules WHERE id = p_rule_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Retracting an inactivated rule: drop its derived rows, then re-resolve those users
  -- (they may still qualify via another rule).
  IF NOT r.active THEN
    DROP TABLE IF EXISTS _affected_users;
    CREATE TEMP TABLE _affected_users ON COMMIT DROP AS
      SELECT DISTINCT user_id FROM community_members WHERE source_rule_id = p_rule_id;
    DELETE FROM community_members WHERE source_rule_id = p_rule_id;
    PERFORM community_resolve_user(user_id) FROM _affected_users;
    SELECT count(*) INTO affected FROM _affected_users;
    RETURN affected;
  END IF;

  -- Active rule: resolve every user the rule's source currently covers.
  DROP TABLE IF EXISTS _rule_users;
  CREATE TEMP TABLE _rule_users ON COMMIT DROP AS
  SELECT DISTINCT q.user_id FROM (
    SELECT e.user_id FROM enrolments e
      WHERE r.source_kind = 'offering' AND e.offering_id = r.source_id
        AND e.status = 'active' AND (e.expires_at IS NULL OR e.expires_at > now())
    UNION
    SELECT e.user_id FROM cohort_batch_members cbm
      JOIN enrolments e ON e.id = cbm.enrolment_id
      WHERE r.source_kind = 'cohort_batch' AND cbm.batch_id = r.source_id
        AND e.status = 'active'
    UNION
    SELECT ca.user_id FROM cohort_applications ca
      WHERE r.source_kind = 'application_accepted' AND ca.offering_id = r.source_id
        AND ca.user_id IS NOT NULL
        AND ca.status IN ('accepted','confirmation_paid','balance_paid','enrolled')
    UNION
    SELECT u.id FROM users u
      WHERE r.source_kind = 'legacy_alumni' AND u.is_legacy AND u.deleted_at IS NULL
    UNION
    SELECT u.id FROM users u
      WHERE r.source_kind = 'all_members' AND u.deleted_at IS NULL
  ) q;

  PERFORM community_resolve_user(user_id) FROM _rule_users;
  SELECT count(*) INTO affected FROM _rule_users;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Freshness triggers on the real sources ──────────────────────────────────
-- NOTE FOR COUNCIL: these add AFTER-row triggers to enrolments (the payment
-- capture path writes here). The trigger body is one function call that only
-- touches community_members; a failure here must never block enrolment creation
-- → body wrapped in an exception guard, errors logged not raised.
CREATE OR REPLACE FUNCTION community_on_source_change()
RETURNS trigger AS $$
DECLARE
  v_user uuid;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'enrolments' THEN
      v_user := COALESCE(NEW.user_id, OLD.user_id);
    ELSIF TG_TABLE_NAME = 'cohort_batch_members' THEN
      SELECT e.user_id INTO v_user FROM enrolments e
        WHERE e.id = COALESCE(NEW.enrolment_id, OLD.enrolment_id);
    ELSIF TG_TABLE_NAME = 'cohort_applications' THEN
      v_user := COALESCE(NEW.user_id, OLD.user_id);
    END IF;
    IF v_user IS NOT NULL THEN
      PERFORM community_resolve_user(v_user);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'community_on_source_change failed (non-blocking): %', SQLERRM;
  END;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER community_sync_enrolments
  AFTER INSERT OR UPDATE OF status, expires_at ON enrolments
  FOR EACH ROW EXECUTE FUNCTION community_on_source_change();

CREATE TRIGGER community_sync_batch_members
  AFTER INSERT OR DELETE ON cohort_batch_members
  FOR EACH ROW EXECUTE FUNCTION community_on_source_change();

CREATE TRIGGER community_sync_applications
  AFTER UPDATE OF status ON cohort_applications
  FOR EACH ROW EXECUTE FUNCTION community_on_source_change();

CREATE OR REPLACE FUNCTION community_on_rule_change()
RETURNS trigger AS $$
BEGIN
  PERFORM community_apply_rule(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER community_sync_rules
  AFTER INSERT OR UPDATE OF active, member_role ON community_entitlement_rules
  FOR EACH ROW EXECUTE FUNCTION community_on_rule_change();

-- ── Reconciliation (belt-and-braces): nightly full recompute + counts ───────
-- Schedule via pg_cron in the applied migration (mirror cohort_notify_cron's
-- pattern); also callable ad hoc after any incident.
CREATE OR REPLACE FUNCTION community_reconcile()
RETURNS void AS $$
BEGIN
  PERFORM community_resolve_user(u.id)
  FROM (SELECT DISTINCT user_id AS id FROM enrolments
        UNION SELECT id FROM users WHERE deleted_at IS NULL AND is_legacy) u;

  -- refresh honest member counts (active = contributed/attended in 90d is a
  -- Phase-C4 refinement; v1 counts entitled members)
  UPDATE community_editions ed SET member_count = sub.c
  FROM (SELECT edition_id, count(*) c FROM community_members
        WHERE edition_id IS NOT NULL GROUP BY edition_id) sub
  WHERE sub.edition_id = ed.id AND ed.member_count IS DISTINCT FROM sub.c;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
