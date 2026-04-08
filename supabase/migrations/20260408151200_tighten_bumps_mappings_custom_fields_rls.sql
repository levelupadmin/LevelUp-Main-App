-- #33: Tighten RLS on offering_bumps, offering_courses, and custom_field_definitions.
--
-- Previous state:
--   • offering_bumps.SELECT      — USING (true)   (world-readable, incl. drafts)
--   • offering_courses.SELECT    — USING (true)   (world-readable)
--   • custom_field_definitions.SELECT — USING (true)
--   • All three had FOR ALL admin policies with NO WITH CHECK clauses,
--     meaning an admin-session (or a compromised admin) UPDATE could
--     rewrite rows to reference foreign offering_ids without re-checking
--     is_admin() on the new row.
--
-- New state:
--   • SELECT is scoped to rows whose parent offering is active (non-admins).
--     Admins still see everything.
--   • FOR ALL is split into per-verb policies (INSERT / UPDATE / DELETE)
--     each with an explicit WITH CHECK that re-verifies is_admin() on the
--     post-image row. SELECT uses the scoped policy above.

-- ── offering_bumps ──────────────────────────────────────────────
DROP POLICY IF EXISTS bumps_read  ON public.offering_bumps;
DROP POLICY IF EXISTS bumps_admin ON public.offering_bumps;

CREATE POLICY bumps_read ON public.offering_bumps
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.offerings o
      WHERE o.id = offering_bumps.parent_offering_id
        AND o.status = 'active'
    )
  );

CREATE POLICY bumps_admin_insert ON public.offering_bumps
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY bumps_admin_update ON public.offering_bumps
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY bumps_admin_delete ON public.offering_bumps
  FOR DELETE
  USING (public.is_admin());

-- ── offering_courses ────────────────────────────────────────────
DROP POLICY IF EXISTS offering_courses_read  ON public.offering_courses;
DROP POLICY IF EXISTS offering_courses_admin ON public.offering_courses;

-- offering_courses is consulted by has_course_access() (SECURITY DEFINER)
-- so anonymous clients don't actually need to read it for playback. Restrict
-- direct SELECT to admins + users who have an active enrolment granting the
-- mapping, plus active offerings so the public catalogue still works.
CREATE POLICY offering_courses_read ON public.offering_courses
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.offerings o
      WHERE o.id = offering_courses.offering_id
        AND o.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.enrolments e
      WHERE e.user_id = auth.uid()
        AND e.offering_id = offering_courses.offering_id
        AND e.status = 'active'
    )
  );

CREATE POLICY offering_courses_admin_insert ON public.offering_courses
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY offering_courses_admin_update ON public.offering_courses
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY offering_courses_admin_delete ON public.offering_courses
  FOR DELETE
  USING (public.is_admin());

-- ── custom_field_definitions ────────────────────────────────────
DROP POLICY IF EXISTS custom_fields_read  ON public.custom_field_definitions;
DROP POLICY IF EXISTS custom_fields_admin ON public.custom_field_definitions;

CREATE POLICY custom_fields_read ON public.custom_field_definitions
  FOR SELECT
  USING (
    public.is_admin()
    OR offering_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.offerings o
      WHERE o.id = custom_field_definitions.offering_id
        AND o.status = 'active'
    )
  );

CREATE POLICY custom_fields_admin_insert ON public.custom_field_definitions
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY custom_fields_admin_update ON public.custom_field_definitions
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY custom_fields_admin_delete ON public.custom_field_definitions
  FOR DELETE
  USING (public.is_admin());
