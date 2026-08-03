-- =====================================================================
-- Take EXECUTE away from `anon` on the four join-link RPCs.
-- =====================================================================
--
-- FOUND BY VERIFYING THE PREVIOUS MIGRATION AGAINST PRODUCTION, and it is the
-- same privilege-model trap that migration exists to fix — this time sprung on
-- the function that migration itself created.
--
-- 20260801100000 ends with:
--     REVOKE ALL ON FUNCTION public.admin_live_sessions_with_zoom_link() FROM public;
--     GRANT EXECUTE ON FUNCTION public.admin_live_sessions_with_zoom_link() TO authenticated;
--
-- On the local shadow that left `anon` with no EXECUTE, exactly as intended. On
-- PRODUCTION it did not, and the measurement said so:
--     has_function_privilege('anon', 'admin_live_sessions_with_zoom_link()', 'EXECUTE') -> TRUE
--
-- WHY. `REVOKE ... FROM public` removes the PUBLIC pseudo-role entry (`=X/`) and
-- NOTHING ELSE. It cannot touch a grant held explicitly by a named role. And
-- this project's `pg_default_acl` for functions is:
--     {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- so EVERY function created here is born with an EXPLICIT `anon=X` grant. The
-- REVOKE ran, reported success, and left that grant untouched — a table-level
-- grant outliving a narrower revoke, which is precisely the shape of the
-- venue_link / zoom_link defect.
--
-- IMPACT WAS NOT A LEAK, AND THIS IS STILL WORTH FIXING. Every one of these
-- functions gates internally: `admin_live_sessions_with_zoom_link` requires
-- `is_admin()`, `get_cohort_progress` raises 42501 unless the caller asks about
-- themselves, and both link RPCs return NULL without an entitlement. An anon
-- caller therefore receives nothing today. But "the body happens to refuse" is
-- not the same as "the caller cannot reach it", and this project has now been
-- bitten twice by the difference.
--
-- ALSO REVOKES THE `PUBLIC` GRANT ON get_cohort_progress. Its ACL still carried
-- `=X/postgres` — CREATE OR REPLACE preserves the existing ACL, so the April
-- definition's PUBLIC grant survived yesterday's hardening.
--
-- SAFE: no legitimate caller is anonymous. Verified against the client -
-- `AdminSchedule` (admin), `CohortDashboard`, `MySessionsPage`, `Countdown` and
-- `AdminEvents` all call these while signed in. `EventDetail` and `EventsPage`
-- read `events_safe` and never touch the venue-link RPC at all.
--
-- LOCK PROFILE: REVOKE on a function takes no table lock. Safe during traffic.
-- UNDO: GRANT EXECUTE ON FUNCTION <fn> TO anon;
-- =====================================================================

DO $$
DECLARE
  f          text;
  n_revoked  int := 0;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_live_sessions_with_zoom_link()',
    'public.get_cohort_progress(uuid, uuid)',
    'public.get_live_session_zoom_link(uuid)',
    'public.get_event_venue_link(uuid)'
  ]
  LOOP
    IF to_regprocedure(f) IS NULL THEN
      RAISE NOTICE 'link-rpc-revoke: SKIP %, not present', f;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    n_revoked := n_revoked + 1;
  END LOOP;
  RAISE NOTICE 'link-rpc-revoke: % function(s) closed to anon and PUBLIC', n_revoked;
END
$$;

-- Re-assert the grants that SHOULD exist, so this file is self-contained and
-- idempotent rather than depending on what a previous migration left behind.
GRANT EXECUTE ON FUNCTION public.admin_live_sessions_with_zoom_link() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cohort_progress(uuid, uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_session_zoom_link(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_venue_link(uuid)           TO authenticated;


-- =====================================================================
-- Self-check: anon must hold nothing, authenticated must keep everything.
-- =====================================================================
DO $$
DECLARE
  f      text;
  broken text := '';
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_live_sessions_with_zoom_link()',
    'public.get_cohort_progress(uuid, uuid)',
    'public.get_live_session_zoom_link(uuid)',
    'public.get_event_venue_link(uuid)'
  ]
  LOOP
    CONTINUE WHEN to_regprocedure(f) IS NULL;
    IF has_function_privilege('anon', f, 'EXECUTE') THEN
      broken := broken || format(' anon can still EXECUTE %s;', f);
    END IF;
    IF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
      broken := broken || format(' authenticated LOST EXECUTE on %s;', f);
    END IF;
  END LOOP;

  IF broken <> '' THEN
    RAISE EXCEPTION 'link-rpc-revoke self-check FAILED:%', broken;
  END IF;
  RAISE NOTICE 'link-rpc-revoke: self-check passed — anon closed out, authenticated intact';
END
$$;
