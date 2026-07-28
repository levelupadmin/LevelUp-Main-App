-- ============================================================================
-- PHASE ST-0 — An archived offering is invisible to everyone EXCEPT the people
--              who bought it.
-- ============================================================================
--
-- RAHUL'S RULING (design/briefs/students-entitlement.md):
--   "Archived should mean that people who bought it can only see it, and the
--    others who are new and have not bought it cannot see it on the home or
--    browse."
--
-- WHY THIS IS THE WHOLE UNLOCK
--   Measured on prod 2026-07-28: of 73,147 legacy_enrolments rows that resolve
--   to an offering, 67,107 (55,904 distinct students) point at an ARCHIVED one;
--   only 6,040 rows / 5,544 students point at an active one. So ~91% of the
--   students this programme exists for own something archived. The claim added
--   in 20260727220000 gives them an `enrolments` row — but
--
--       offerings_read_active: USING (status = 'active' OR is_admin())
--
--   means Postgres never emits the offering row itself, and no client-side
--   change can work around a row that never leaves the database. Claiming
--   without this migration shows those 55,904 students an empty library.
--
-- WHY THIS IS ONLY *ONE* POLICY (verified, not assumed)
--   Every other table in the content path is already gated on ENROLMENT, not on
--   offering status, so nothing else needs relaxing:
--     offering_courses.offering_courses_read — has an explicit enrolment branch
--     courses.courses_read_enrolled          — enrolment, no status filter
--     sections.sections_read_enrolled        — enrolment, no status filter
--     chapters.chapters_read_enrolled        — enrolment, no status filter
--     chapter_resources.resources_read       — has_course_access(), enrolment
--   The `offerings` row was the single blocker. Resources and chapters open by
--   themselves the moment the enrolment exists.
--
-- WHAT THIS DELIBERATELY DOES **NOT** DO
--   It does not make an archived offering DISCOVERABLE. This policy grants read
--   only to a caller who already holds a live enrolment for that exact
--   offering, so home / browse / catalog / search still see precisely what they
--   see today. Discovery is gated by `status`; content is gated by entitlement.
--   ⚠️ The corresponding client work (ST-2) must ADD an explicit
--   status = 'active' guard to the three purchase/discovery sites that have NO
--   status filter today — QuickPick.tsx:102, CheckoutPage.tsx:338 and :426 —
--   because for an OWNER those queries would now return their archived offering
--   and put a closed product back on sale. That is the sharpest way this phase
--   could violate the ruling above, and it is a client change, not an RLS one.
--
-- Additive, idempotent, reversible (undo at the foot), no RAISE EXCEPTION.

-- ────────────────────────────────────────────────────────────────────────────
-- 1/3 — the entitlement predicate.
--
-- Deliberately a byte-for-byte mirror of the EXISTING `has_course_access`
-- (SQL, STABLE, SECURITY DEFINER, search_path=public, status='active' plus the
-- expires_at check) so that "entitled" means exactly ONE thing everywhere. If
-- these two ever diverge, a student sees an offering whose chapters they cannot
-- open, or the reverse — both of which read as a broken product.
--
-- No revoked_at test: revocation sets status='revoked', which status='active'
-- already excludes, and adding a second condition here that has_course_access
-- lacks is precisely the divergence described above.
--
-- SECURITY DEFINER is safe: it takes the caller's own auth.uid() and returns a
-- boolean about the CALLER's entitlement only, so it discloses nothing about
-- anyone else — the same contract as is_admin() and has_course_access().
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_offering_access(p_offering_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM enrolments e
     WHERE e.user_id = auth.uid()
       AND e.offering_id = p_offering_id
       AND e.status = 'active'
       AND (e.expires_at IS NULL OR e.expires_at > now())
  );
$$;

COMMENT ON FUNCTION public.has_offering_access(uuid) IS
  'True when the CALLER holds a live enrolment for this offering. Mirrors has_course_access exactly (status=''active'' plus the expires_at check) so "entitled" means one thing across offerings, courses, sections, chapters and resources. Used by the offerings_read_entitled policy so an owner can still open something that has since been archived.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2/3 — owners can read their own offering whatever its status.
--
-- PERMISSIVE, so it is OR'd with offerings_read_active rather than narrowing
-- it: nobody loses access, and a non-entitled caller sees exactly what they saw
-- before. TO authenticated because an anon caller has no auth.uid() and would
-- only pay for a function call that can never return true.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS offerings_read_entitled ON public.offerings;
CREATE POLICY offerings_read_entitled ON public.offerings
  FOR SELECT
  TO authenticated
  USING (public.has_offering_access(id));

-- ────────────────────────────────────────────────────────────────────────────
-- 3/3 — a student may read their OWN claimed purchase rows, and nothing else.
--
-- legacy_enrolments is admin-only SELECT today, so a student cannot see even
-- the record of their own purchase. This is the narrowest possible widening:
-- rows already stamped with the caller's own id by claim_my_purchases(). It
-- carries a real name/email/phone per row, so it must never be broader than
-- claimed_by_user_id = auth.uid().
--
-- legacy_program_mapping stays ADMIN-ONLY and must not be joined client-side;
-- offering_id is already denormalised onto legacy_enrolments.
--
-- Why this is worth having even though entitlement flows through `enrolments`:
-- a purchase whose offering_id is still NULL (unmapped product) grants no
-- enrolment, so without this the student has no way to be told "we can see your
-- purchase and we're still matching it" rather than nothing at all.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS legacy_enrolments_read_own ON public.legacy_enrolments;
CREATE POLICY legacy_enrolments_read_own ON public.legacy_enrolments
  FOR SELECT
  TO authenticated
  USING (claimed_by_user_id = auth.uid());

-- ── Reversal ────────────────────────────────────────────────────────────────
--   DROP POLICY IF EXISTS offerings_read_entitled ON public.offerings;
--   DROP POLICY IF EXISTS legacy_enrolments_read_own ON public.legacy_enrolments;
--   DROP FUNCTION IF EXISTS public.has_offering_access(uuid);
-- Dropping these restores the previous behaviour exactly: archived offerings
-- become unreadable to everyone but admins again. No table, column, constraint
-- or index is touched, and no existing policy is modified or dropped.
