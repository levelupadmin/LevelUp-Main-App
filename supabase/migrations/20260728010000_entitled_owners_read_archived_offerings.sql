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
--   The matching client work (ST-2) is DONE and is recorded here because this
--   policy is what makes it necessary — for an OWNER these queries now return
--   their archived offering, and an unguarded one would put a closed product
--   back on sale. Audited every from("offerings") call in src/:
--     * CheckoutPage.tsx:338 — already safe: :364 redirects archived to /p/<slug>.
--     * CheckoutPage.tsx:426 (order bumps) — FIXED in c9d75c6. Filtering only the
--       offerings query was not enough: the render falls back to
--       `headline ?? "Add-on"` / `bump_price_override_inr ?? 0`, so a bump with
--       no detail still drew a purchasable "Add-on +₹0". The bump is dropped.
--     * QuickPick.tsx:102 — FIXED: it resolved an offering slug to build a
--       /p/<slug> link, which for an owner would now resolve to an archived
--       product's page instead of falling back to /courses/<id>.
--     * PublicOffering — already safe: isArchived (:476) drops railEligible
--       (:1450) and hides both CTAs (:1674, :1718).
--     * MyCoursesPage:112, CohortDashboard:72, ProfilePage:355 and
--       useCertificateAutoGenerate:96 are LIBRARY surfaces. Archived becoming
--       visible there is the POINT of this migration, not a leak.
--
-- Additive, idempotent, reversible (undo at the foot), no RAISE EXCEPTION.

-- ────────────────────────────────────────────────────────────────────────────
-- 1/3 — the entitlement predicate.
--
-- Its PREDICATE ON `enrolments` is deliberately identical to the existing
-- has_course_access (status='active' plus the same expires_at check), so that
-- "entitled" means exactly one thing everywhere. If those predicates diverge, a
-- student sees an offering whose chapters they cannot open, or the reverse.
--
-- It is NOT otherwise a copy, and that difference is intentional:
-- has_course_access joins offering_courses because it answers "may you open
-- this COURSE"; this one keys on offering_id directly because it answers "may
-- you see this OFFERING". An offering carrying no offering_courses row is
-- therefore visible here and openable nowhere, which is correct (you can see
-- the purchase you made) rather than a divergence in the entitlement rule.
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
-- pg_temp is pinned even though has_course_access omits it: without it the
-- unqualified `enrolments` below is shadowable by a temp relation of the same
-- name. The sibling migration pins it in every function; this matches.
SET search_path = public, pg_temp
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
  'True when the CALLER holds a live enrolment for this offering. Its predicate on enrolments is identical to has_course_access (status=''active'' plus the same expires_at check) so "entitled" means one thing across offerings, courses, sections, chapters and resources; it keys on offering_id directly rather than joining offering_courses, because it answers "may you SEE this offering" rather than "may you OPEN this course". Used by the offerings_read_entitled policy so an owner can still open something that has since been archived.';

-- Executable only by a signed-in caller: the policy below is TO authenticated,
-- and a SECURITY DEFINER function that reads enrolments should not stay
-- reachable by anon merely because EXECUTE defaults to PUBLIC.
REVOKE ALL     ON FUNCTION public.has_offering_access(uuid) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.has_offering_access(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_offering_access(uuid) TO authenticated;

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
  -- Scoped to ARCHIVED explicitly, not "any status". The ruling this implements
  -- is about archived offerings; prod also carries a DRAFT offering, and a
  -- status-blind policy would unlock that too for anyone holding an enrolment
  -- for it. Draft means unreleased, not "something you bought", and
  -- CheckoutPage's guard redirects only on 'archived' (:364), so an owned draft
  -- would have become purchasable. 'active' is already covered by the
  -- pre-existing offerings_read_active, so naming it here would be redundant.
  USING (status = 'archived' AND public.has_offering_access(id));

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
