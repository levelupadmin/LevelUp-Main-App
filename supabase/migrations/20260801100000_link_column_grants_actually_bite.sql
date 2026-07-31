-- =====================================================================
-- Make the venue_link / zoom_link column REVOKEs actually take effect.
-- =====================================================================
--
-- WHAT IS WRONG TODAY. Two migrations already tried to withhold a join link:
--
--   20260408150800_event_venue_link_gating.sql        REVOKE SELECT (venue_link)
--   20260408151600_live_sessions_zoom_link_gating.sql REVOKE SELECT (zoom_link)
--
-- BOTH ARE NO-OPS, AND HAVE BEEN SINCE THE DAY THEY APPLIED. Measured read-only
-- against production (ivkvluezuiojovpotlyb) on 2026-07-31:
--
--     role            zoom_link  venue_link  live_sessions(table-level SELECT)
--     anon            true       true        true
--     authenticated   true       true        true
--   (has_column_privilege / has_table_privilege)
--
-- In PostgreSQL a table-level grant and a column-level grant are SEPARATE
-- privileges. `GRANT SELECT ON t` authorises every column of t, including ones
-- added later. A subsequent `REVOKE SELECT (c) ON t` removes only a
-- COLUMN-level grant — which, where the platform handed out a table-level one,
-- never existed. Postgres raises no error and emits no warning for revoking a
-- privilege that is not held, so both migrations reported success and changed
-- nothing. The only way to withhold one column is to hold NO table-level SELECT
-- and to grant the other columns individually. That is what this does.
--
-- HOW IT WAS FOUND. `qa-harness/cohort-room-access.spec.mjs` was executed for
-- the first time on 2026-07-31 and cases C2.3b and C2.4 failed: the suite read
-- `zoom_link` by naming it in the projection and recovered a planted canary
-- (LEAK_CANARY_ZOOM_A1) through an explicit `select=zoom_link`. Those two cases
-- are the regression test for this migration.
--
-- WHAT IT MEANS IN PRACTICE. Any caller holding the anon or authenticated role
-- — which is every visitor and every signed-in student — can read the Zoom join
-- link of every live session and the venue link of every paid event by asking
-- for the column by name. 20260408150800's own header describes the exact
-- consequence: "a non-paying student can read the join link for every paid live
-- session, walk in, and Zoom-bomb the cohort."
--
-- WHY THIS IS SAFE TO APPLY. Both original migrations already built the
-- replacement read paths, and the client already uses them:
--
--   READ PATH          live_sessions_safe / events_safe (views, no gated column)
--   LINK PATH          get_live_session_zoom_link() / get_event_venue_link()
--                      (SECURITY DEFINER, admin-or-entitled)
--   WRITE PATH         the base tables, unaffected — this touches SELECT only
--   EDGE FUNCTIONS     all four readers (notify-cohort, register-for-event,
--                      verify-event-payment, admin-api) use the service_role
--                      client, and service_role is deliberately NOT touched here
--
-- The one straggler was `AdminSchedule.tsx`, which still did
-- `from("live_sessions").select("*")`; it moves to the safe view plus the RPC in
-- the same change as this migration, matching what `AdminEvents.tsx` has done
-- since April. After this, a direct `select("*")` on either base table fails for
-- anon/authenticated — which is precisely what 20260408150800's header said the
-- end state would be.
--
-- ⚠️ ADDING A COLUMN TO EITHER TABLE. The grant below is an explicit column
-- list, so a column added later is NOT readable by anon/authenticated until it
-- is granted. The `_safe` views are `security_invoker = true`, so they read with
-- the CALLER's privileges — an ungranted column in a view's SELECT list breaks
-- the view for everyone, not just the base table. Re-run this migration's DO
-- block (it is idempotent) after any `ALTER TABLE ... ADD COLUMN` on these two
-- tables. The same applies if the platform ever re-grants table-level SELECT.
--
-- LOCK PROFILE. GRANT and REVOKE take ACCESS EXCLUSIVE on the target table and
-- hold it until COMMIT, not until the statement ends. Both tables are small and
-- read by the shipped dashboard, so this is a brief read-block on every
-- platform: apply it in a quiet hour, not mid-class. Nothing here rewrites a
-- row, so the undo is the inverse GRANT (spelled out at the bottom).
-- =====================================================================

DO $$
DECLARE
  t         record;
  cols      text;
  n_applied int := 0;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('live_sessions', 'zoom_link'),
      ('events',        'venue_link')
    ) AS v(tbl, gated)
  LOOP
    IF to_regclass('public.' || quote_ident(t.tbl)) IS NULL THEN
      RAISE NOTICE 'link-grants: SKIP %, not present', t.tbl;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t.tbl AND column_name = t.gated
    ) THEN
      RAISE NOTICE 'link-grants: SKIP %.%, column not present', t.tbl, t.gated;
      CONTINUE;
    END IF;

    -- 1. Drop the table-wide SELECT. This is the statement that makes the
    --    April column REVOKEs mean something; without it they are inert.
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', t.tbl);

    -- 2. Hand back every column EXCEPT the gated one. Column-by-column, because
    --    that is the only granularity Postgres offers.
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = t.tbl
       AND column_name <> t.gated;

    EXECUTE format('GRANT SELECT (%s) ON public.%I TO anon, authenticated', cols, t.tbl);

    n_applied := n_applied + 1;
    RAISE NOTICE 'link-grants: % — table SELECT revoked, all columns but % re-granted',
      t.tbl, t.gated;
  END LOOP;

  RAISE NOTICE 'link-grants: % table(s) gated', n_applied;
END
$$;


-- =====================================================================
-- Self-check. A migration that silently changes nothing is exactly the failure
-- being fixed here, so this one refuses to commit unless the wall is up.
-- =====================================================================
DO $$
DECLARE
  r      record;
  broken text := '';
BEGIN
  FOR r IN
    SELECT v.tbl, v.gated, v.role
      FROM (VALUES
        ('live_sessions', 'zoom_link',  'anon'),
        ('live_sessions', 'zoom_link',  'authenticated'),
        ('events',        'venue_link', 'anon'),
        ('events',        'venue_link', 'authenticated')
      ) AS v(tbl, gated, role)
     WHERE to_regclass('public.' || quote_ident(v.tbl)) IS NOT NULL
  LOOP
    -- The gated column must NOT be readable...
    IF has_column_privilege(r.role, 'public.' || r.tbl, r.gated, 'SELECT') THEN
      broken := broken || format(' %s can still read %s.%s;', r.role, r.tbl, r.gated);
    END IF;
    -- ...and an ordinary column MUST still be, or the safe views are dead and
    -- every listing surface in the app goes with them.
    IF NOT has_column_privilege(r.role, 'public.' || r.tbl, 'id', 'SELECT') THEN
      broken := broken || format(' %s LOST read on %s.id;', r.role, r.tbl);
    END IF;
  END LOOP;

  IF broken <> '' THEN
    RAISE EXCEPTION 'link-grants self-check FAILED:%', broken;
  END IF;
  RAISE NOTICE 'link-grants: self-check passed — gated columns withheld, ordinary columns intact';
END
$$;


-- =====================================================================
-- The admin list's "does this session have a link at all?" signal.
-- =====================================================================
--
-- `AdminSchedule` renders a Zoom shortcut per row, and it decided whether to
-- render it by testing `s.zoom_link` off the list payload. Once the list reads
-- `live_sessions_safe`, that column is gone and the shortcut would silently
-- disappear from every row — a working admin affordance deleted as a side effect
-- of a security fix.
--
-- THE OBVIOUS FIXES BOTH FAIL, so this exists instead:
--
--   * Adding `(zoom_link IS NOT NULL) AS has_zoom_link` to `live_sessions_safe`
--     CANNOT WORK. That view is `security_invoker = true`, so the expression is
--     evaluated with the CALLER's privileges — and computing it reads zoom_link,
--     which is exactly the column the caller must not have. The view would fail
--     for everyone, breaking every listing surface in the app.
--   * A generated column on the base table works but forces a full table
--     rewrite under ACCESS EXCLUSIVE on a table the shipped dashboard reads.
--     Too much lock for a boolean.
--
-- So: one SECURITY DEFINER function returning ONLY the ids that have a link, and
-- only to an admin. It leaks nothing — no URL crosses the boundary, and a
-- non-admin gets an empty set rather than an error, so it cannot be used to
-- probe. One round trip for the whole list, not one per row.
CREATE OR REPLACE FUNCTION public.admin_live_sessions_with_zoom_link()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
    FROM public.live_sessions
   WHERE zoom_link IS NOT NULL
     AND public.is_admin()
$$;

-- Default-deny, then hand it to signed-in callers only. `is_admin()` inside the
-- body is what actually decides; this just keeps it off the anon surface.
REVOKE ALL ON FUNCTION public.admin_live_sessions_with_zoom_link() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_live_sessions_with_zoom_link() TO authenticated;


-- =====================================================================
-- UNDO (do not run as part of this migration — this is the rollback recipe).
-- Restores the pre-migration state exactly, re-opening the leak:
--
--   GRANT SELECT ON public.live_sessions TO anon, authenticated;
--   GRANT SELECT ON public.events        TO anon, authenticated;
--
-- A table-level grant supersedes the column grants above, so those two
-- statements are sufficient and no column-level cleanup is required.
-- =====================================================================
