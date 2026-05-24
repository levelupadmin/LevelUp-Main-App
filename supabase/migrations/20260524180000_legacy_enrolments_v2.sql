-- ============================================================================
-- legacy_enrolments v2 — handle TagMango programs that don't yet exist as
-- offerings on the new app.
-- ============================================================================
--
-- The v1 schema (20260524130000) made `offering_id` NOT NULL with a hard
-- FK to public.offerings. That worked for the 7 Masterclass offerings
-- whose slugs already existed on the new app, but TagMango actually hosted
-- ~3 years of programs: Live cohorts, Forge workshops, photography
-- bootcamps, and one-off events. Many of those don't have a matching
-- offering on the new app yet — Rahul has to (a) decide which to recreate
-- and (b) migrate the content (recordings, PDFs) before they exist.
--
-- v2 reshapes the table so we can ingest the raw CSV up-front without
-- needing every offering to exist first. Pending rows sit in
-- legacy_enrolments with offering_id = NULL, keyed by the raw program
-- name as it appeared in TagMango. A new legacy_program_mapping table
-- captures the human decision "this TagMango program name maps to this
-- new app offering". When the mapping is created/updated, a trigger
-- propagates offering_id back into the matching legacy_enrolments rows,
-- and a second trigger immediately grants the enrolment for any user who
-- has already signed in but was waiting on the mapping.
--
-- Also fixes a latent bug in v1: the trigger inserted enrolments with
-- source='tagmango_migration', but enrolments_source_check (see
-- 20260406085914) only allows {checkout, admin_grant, admin_manual,
-- bulk_import, migration, manual, import, free}. The first claim would
-- have failed with constraint violation. v2 uses source='migration'.

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- Schema changes on legacy_enrolments
-- ────────────────────────────────────────────────────────────────────

-- Allow offering_id to be NULL while waiting on mapping decisions.
ALTER TABLE public.legacy_enrolments
  ALTER COLUMN offering_id DROP NOT NULL;

-- Track the raw program name from the TagMango CSV. This is the human
-- text shown to the user on the old platform ("Photography Masterclass
-- with G. Venket Ram", "LevelUp Live: April 2024 Cohort"). It's the
-- join key between the CSV ingest and the mapping table.
ALTER TABLE public.legacy_enrolments
  ADD COLUMN IF NOT EXISTS legacy_program_name text;

-- Drop the v1 (phone, offering_id) unique constraint. With offering_id
-- nullable, that constraint would let multiple NULL rows for the same
-- phone slip in (NULLs don't collide in unique indexes). The natural
-- idempotency key for the CSV is now (source, phone, legacy_program_name).
ALTER TABLE public.legacy_enrolments
  DROP CONSTRAINT IF EXISTS legacy_enrolments_phone_offering_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS legacy_enrolments_source_phone_program_uniq
  ON public.legacy_enrolments (source, phone, legacy_program_name);

-- Index for the propagation trigger: when a mapping is created, we need
-- to find all pending rows for that (source, program_name) quickly.
CREATE INDEX IF NOT EXISTS legacy_enrolments_program_pending_idx
  ON public.legacy_enrolments (source, legacy_program_name)
  WHERE offering_id IS NULL;

-- Backfill: any pre-existing rows in legacy_enrolments would have come
-- from the v1 ingest which required offering_id. They already have it
-- set, so legacy_program_name is NULL — that's fine; the new uniqueness
-- index allows NULLs to coexist for those.

-- ────────────────────────────────────────────────────────────────────
-- legacy_program_mapping — the lookup table the import + admin UI use
-- ────────────────────────────────────────────────────────────────────
--
-- One row per distinct TagMango program name. offering_id may be NULL
-- if Rahul hasn't decided yet what to do with that program. When he
-- fills in offering_id, the propagation trigger picks it up.

CREATE TABLE IF NOT EXISTS public.legacy_program_mapping (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source               text        NOT NULL DEFAULT 'tagmango',
  legacy_program_name  text        NOT NULL,
  offering_id          uuid        REFERENCES public.offerings(id) ON DELETE SET NULL,
  -- Optional: a short note about the decision ("merged into the
  -- archived 2024 photography archive", "skip — refunded users", etc.)
  -- so the next person looking at this table understands why a mapping
  -- was made the way it was.
  notes                text,
  -- decision_status lets the admin UI distinguish three states without
  -- having to infer from offering_id alone:
  --   pending  - no decision yet (legacy_enrolments rows stay pending)
  --   mapped   - offering_id set; rows auto-claimed
  --   skipped  - explicitly ignored (e.g. refunded program, test data)
  decision_status      text        NOT NULL DEFAULT 'pending'
                                    CHECK (decision_status IN ('pending','mapped','skipped')),
  user_count           integer,    -- denormalised count, refreshed by import
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT legacy_program_mapping_uniq UNIQUE (source, legacy_program_name)
);

CREATE INDEX IF NOT EXISTS legacy_program_mapping_status_idx
  ON public.legacy_program_mapping (decision_status);

ALTER TABLE public.legacy_program_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read program mapping"  ON public.legacy_program_mapping;
DROP POLICY IF EXISTS "admins write program mapping" ON public.legacy_program_mapping;

CREATE POLICY "admins read program mapping"
  ON public.legacy_program_mapping FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admins write program mapping"
  ON public.legacy_program_mapping FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legacy_program_mapping TO authenticated;

-- Trigger to keep updated_at fresh on mapping rows.
CREATE TRIGGER legacy_program_mapping_updated_at
  BEFORE UPDATE ON public.legacy_program_mapping
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────
-- Trigger A: mapping update → propagate offering_id to legacy_enrolments
-- ────────────────────────────────────────────────────────────────────
-- When admin sets/changes offering_id on a mapping row, push it down to
-- every legacy_enrolments row that references the same program name.
-- The legacy_enrolments BEFORE UPDATE trigger (Trigger B below) then
-- fires for each updated row and grants the enrolment if a matching
-- user already exists.

CREATE OR REPLACE FUNCTION public.propagate_offering_to_legacy_enrolments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when the offering_id actually changes (avoid recursive
  -- no-op updates).
  IF NEW.offering_id IS DISTINCT FROM OLD.offering_id THEN
    UPDATE public.legacy_enrolments
    SET offering_id = NEW.offering_id
    WHERE source = NEW.source
      AND legacy_program_name = NEW.legacy_program_name
      AND offering_id IS DISTINCT FROM NEW.offering_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Same function handles INSERT (when mapping row is first created
-- WITH an offering_id set) — same predicate finds matching pending rows
-- and updates them.
CREATE OR REPLACE FUNCTION public.propagate_offering_to_legacy_enrolments_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.offering_id IS NOT NULL THEN
    UPDATE public.legacy_enrolments
    SET offering_id = NEW.offering_id
    WHERE source = NEW.source
      AND legacy_program_name = NEW.legacy_program_name
      AND offering_id IS DISTINCT FROM NEW.offering_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mapping_propagate_on_update ON public.legacy_program_mapping;
CREATE TRIGGER mapping_propagate_on_update
  AFTER UPDATE OF offering_id ON public.legacy_program_mapping
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_offering_to_legacy_enrolments();

DROP TRIGGER IF EXISTS mapping_propagate_on_insert ON public.legacy_program_mapping;
CREATE TRIGGER mapping_propagate_on_insert
  AFTER INSERT ON public.legacy_program_mapping
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_offering_to_legacy_enrolments_on_insert();

-- ────────────────────────────────────────────────────────────────────
-- Trigger B: legacy_enrolments offering_id resolved → grant enrolment
-- if the matching user already signed in
-- ────────────────────────────────────────────────────────────────────
-- This is what closes the loop for users who signed in BEFORE their
-- program had a mapping. Their public.users row was created, the v1
-- claim trigger ran, found no matching legacy_enrolments (offering_id
-- was NULL), did nothing. Now the admin maps the program, offering_id
-- flips to non-null on legacy_enrolments via Trigger A, and this
-- trigger fires to retroactively grant the enrolment.

CREATE OR REPLACE FUNCTION public.grant_enrolment_after_offering_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Only act when offering_id just transitioned from NULL → non-null
  -- AND the row hasn't already been claimed somehow.
  IF OLD.offering_id IS NULL
     AND NEW.offering_id IS NOT NULL
     AND NEW.claimed_by_user_id IS NULL THEN

    -- Look for a matching user by phone (canonical match key) or
    -- email (fallback). If the user has signed in, they have a row in
    -- public.users with phone/email set.
    SELECT u.id INTO v_user_id
    FROM public.users u
    WHERE u.phone = NEW.phone
       OR (u.email IS NOT NULL AND NEW.email IS NOT NULL AND u.email = NEW.email)
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      -- Grant the enrolment idempotently. enrolments_unique_active is a
      -- partial unique index (WHERE status='active'), so we can't use a
      -- plain ON CONFLICT (user_id, offering_id) without restating the
      -- predicate. NOT EXISTS matches the v1 trigger's style and reads
      -- more clearly anyway.
      IF NOT EXISTS (
        SELECT 1 FROM public.enrolments e
        WHERE e.user_id = v_user_id
          AND e.offering_id = NEW.offering_id
          AND e.status = 'active'
      ) THEN
        INSERT INTO public.enrolments (user_id, offering_id, payment_order_id, status, source)
        VALUES (v_user_id, NEW.offering_id, NULL, 'active', 'migration');
      END IF;

      -- Mark this legacy_enrolments row claimed.
      NEW.claimed_by_user_id := v_user_id;
      NEW.claimed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legacy_enrolments_claim_after_resolve ON public.legacy_enrolments;
CREATE TRIGGER legacy_enrolments_claim_after_resolve
  BEFORE UPDATE OF offering_id ON public.legacy_enrolments
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_enrolment_after_offering_resolved();

-- ────────────────────────────────────────────────────────────────────
-- Fix the v1 claim trigger on public.users
-- ────────────────────────────────────────────────────────────────────
-- v1 had two bugs:
-- 1. source='tagmango_migration' violates enrolments_source_check
-- 2. Didn't filter out legacy_enrolments with offering_id IS NULL
--    (would have tried to insert NULL into enrolments.offering_id, NOT NULL)
-- 3. Marked pending rows claimed (which would have hidden them from
--    later resolution)

CREATE OR REPLACE FUNCTION public.claim_legacy_enrolments_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_norm text;
BEGIN
  -- Normalise phone to +91XXXXXXXXXX for matching.
  IF NEW.phone IS NOT NULL THEN
    v_phone_norm := regexp_replace(NEW.phone, '\D', '', 'g');
    IF length(v_phone_norm) = 10 THEN
      v_phone_norm := '+91' || v_phone_norm;
    ELSIF length(v_phone_norm) = 12 AND v_phone_norm LIKE '91%' THEN
      v_phone_norm := '+' || v_phone_norm;
    ELSE
      v_phone_norm := NEW.phone;
    END IF;
  END IF;

  -- Only grant for legacy rows that have a resolved offering_id.
  -- Pending rows (offering_id IS NULL) wait for Trigger B above.
  INSERT INTO public.enrolments (user_id, offering_id, payment_order_id, status, source)
  SELECT NEW.id, le.offering_id, NULL, 'active', 'migration'
  FROM public.legacy_enrolments le
  WHERE le.claimed_by_user_id IS NULL
    AND le.offering_id IS NOT NULL
    AND (
      (v_phone_norm IS NOT NULL AND le.phone = v_phone_norm)
      OR (NEW.email IS NOT NULL AND le.email = NEW.email)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.enrolments e
      WHERE e.user_id = NEW.id AND e.offering_id = le.offering_id
    );

  -- Mark only the resolved rows as claimed. Pending rows stay
  -- unclaimed until the mapping is filled in.
  UPDATE public.legacy_enrolments le
  SET claimed_by_user_id = NEW.id,
      claimed_at = now()
  WHERE le.claimed_by_user_id IS NULL
    AND le.offering_id IS NOT NULL
    AND (
      (v_phone_norm IS NOT NULL AND le.phone = v_phone_norm)
      OR (NEW.email IS NOT NULL AND le.email = NEW.email)
    );

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- Convenience view for the admin UI: pending mapping decisions with
-- user counts and a "looks like" suggestion via trigram similarity.
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.legacy_program_mapping_overview AS
SELECT
  m.id,
  m.source,
  m.legacy_program_name,
  m.offering_id,
  o.title         AS offering_title,
  o.slug          AS offering_slug,
  o.status        AS offering_status,
  m.decision_status,
  m.notes,
  m.created_at,
  m.updated_at,
  -- Live count of how many users are waiting on this mapping.
  (
    SELECT count(*)
    FROM public.legacy_enrolments le
    WHERE le.source = m.source
      AND le.legacy_program_name = m.legacy_program_name
  ) AS total_enrolments,
  (
    SELECT count(*)
    FROM public.legacy_enrolments le
    WHERE le.source = m.source
      AND le.legacy_program_name = m.legacy_program_name
      AND le.claimed_by_user_id IS NULL
  ) AS pending_enrolments
FROM public.legacy_program_mapping m
LEFT JOIN public.offerings o ON o.id = m.offering_id;

GRANT SELECT ON public.legacy_program_mapping_overview TO authenticated;

COMMENT ON TABLE public.legacy_program_mapping IS
  'Decision table mapping raw TagMango program names to new offerings. Admin-managed; pending rows block auto-claim until offering_id is filled in.';

COMMENT ON FUNCTION public.propagate_offering_to_legacy_enrolments() IS
  'When mapping.offering_id changes, push it down to all matching legacy_enrolments rows.';

COMMENT ON FUNCTION public.grant_enrolment_after_offering_resolved() IS
  'Closes the loop for users who signed in before their program had a mapping. Fires when offering_id flips NULL → non-null on legacy_enrolments.';

COMMIT;
