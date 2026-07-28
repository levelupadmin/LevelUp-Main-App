-- SHADOW GRANT PARITY — generated from PRODUCTION (ivkvluezuiojovpotlyb) on 2026-07-28.
--
-- WHY THIS FILE EXISTS. A database built purely from supabase/migrations/ does NOT
-- reproduce production's grants. Measured on a clean local stack: only 3 of 103
-- public tables grant SELECT to anon, and even `offerings` — which the public
-- landing pages must read — grants nothing but TRUNCATE/REFERENCES/TRIGGER.
-- Production grants anon, authenticated and service_role full DML and relies on
-- RLS as the gate. That is the standard Supabase model, applied by the hosted
-- platform's bootstrap rather than by any migration in this repo.
--
-- THE CONSEQUENCE IS FALSE ASSURANCE, which is worse than no test at all. On a
-- local stack every RLS assertion passes — because permission is denied BEFORE
-- RLS is ever consulted. A suite proving "anon cannot read this table" would in
-- fact be proving only that anon was never granted the table. Both adversarial
-- suites in this repo (identity-spine, cohort-room-access) are RLS suites, so
-- running either against an ungranted shadow produces a green result that means
-- nothing.
--
-- ═══ ORDERING — RUN THIS FILE TWICE, AND THE FIRST PASS IS THE ONE PEOPLE MISS ═══
--
--   0. If `db push` has EVER run against this shadow: REBUILD IT FIRST.
--        supabase db reset --db-url "$SHADOW_DB_URL"   # or re-create the project
--   1. psql "$SHADOW_DB_URL" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql  # BEFORE db push
--   2. supabase db push --db-url "$SHADOW_DB_URL"                                 # build the schema
--   3. psql "$SHADOW_DB_URL" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql  # AFTER db push
--   4. …then, and only then, the adversarial suites.
--
-- ⚠️ STEP 0 IS NOT OPTIONAL, AND OMITTING IT IS WHY THE THREE-STEP RECIPE SILENTLY
-- FAILED. SECTION A arms `ALTER DEFAULT PRIVILEGES`, which PostgreSQL consults at
-- CREATE TABLE time and never again. On a shadow whose migrations are ALREADY
-- applied — the normal case for every gate run after the first — `db push` is a
-- no-op, the nine tables R0 creates already exist, and pass 1 has nothing left to
-- affect. All three steps then succeed, print their NOTICEs, change nothing that
-- matters, and leave exactly the state cohort-room-access.spec.mjs's PRECONDITION
-- aborts on. There is no in-place remedy: the tables have to be created again.
--
-- ⚠️ $SHADOW_DB_URL IS THE SHADOW DATABASE, NEVER PRODUCTION (ivkvluezuiojovpotlyb).
-- SECTION A permanently alters a database's grant model — it is the one statement
-- in this file that does not merely re-state a grant production already has — and
-- `db push` in step 2 writes schema. Both are irreversible against the wrong
-- target. The `-v ROOM_QA_SHADOW=1` marker is therefore MANDATORY: the guard block
-- below refuses to run without it, so this file cannot be executed by reflex or by
-- a copy-pasted line that lost its target. The guard also refuses outright on any
-- connection that identifies as the production project.
--
-- WHY BOTH PASSES ARE REQUIRED, AND WHY NEITHER ONE SUBSUMES THE OTHER.
-- This file does two different things with opposite timing requirements:
--   · SECTION A (hand-maintained) arms `ALTER DEFAULT PRIVILEGES`. Default
--     privileges apply ONLY to tables created AFTER the statement runs, so it is
--     useless once `db push` has already created them. It must go FIRST.
--   · SECTION B (generated) GRANTs on named tables. Every table it names is
--     created BY the migrations, so on pass 1 it finds nothing and skips all of
--     them by design (`to_regclass … IS NULL → SKIP`). It must go LAST.
-- Both passes are idempotent, and a re-run costs a second. Running only pass 3
-- leaves every table R0 creates outside this file's reach (see below); running
-- only pass 1 leaves the 103 pre-existing tables ungranted.
--
-- THE GAP SECTION A EXISTS TO CLOSE. Section B was generated from prod on
-- 2026-07-28 and therefore contains ONLY the tables that existed then. The nine
-- tables PHASE R0 creates — cohort_room_configs, cohort_room_members and
-- 20260729100100's seven content tables — are not in it and cannot be. Without
-- Section A those nine get whatever the R0 migrations grant explicitly and
-- nothing else, which sounds harmless and is not: the migrations' `REVOKE`
-- statements exist specifically to take back what the platform bootstrap hands
-- out, so on a shadow where the bootstrap never ran, a REVOKE that was never
-- needed is indistinguishable from a REVOKE that worked. Any assertion of the
-- form "the client role does NOT hold verb X on a room table" is then vacuous.
-- cohort-room-access.spec.mjs's GRANT section asserts exactly that shape and
-- carries its own arming control (GRANT.0) for exactly this reason.
--
-- This file is GENERATED, with one exception. Regenerate SECTION B from
-- production rather than hand-editing it, so it cannot drift into asserting a
-- grant model production does not have — and PRESERVE SECTION A verbatim when
-- you do. Section A is not derivable from a `information_schema.role_table_grants`
-- dump: default privileges live in pg_default_acl, describe tables that do not
-- exist yet, and are the one part of prod's grant model a per-table snapshot
-- structurally cannot capture.
--
-- NOTE: deliberately NO explicit BEGIN. psql autocommits each statement, and an
-- earlier revision of this file opened a transaction the DO block never closed —
-- so psql rolled everything back on exit while still printing "305 applied".
-- A success message is not evidence; the grant query afterwards is.

-- ════════════════════════════════════════════════════════════════════════════
-- GUARD — HAND-MAINTAINED. NOT GENERATED. A REGENERATION MUST PRESERVE IT.
--
-- This file is handed to an agent by .claude/workflows/design-qa-gate.js, with a
-- connection string the agent did not choose. Everything below writes: SECTION A
-- creates a pg_default_acl entry that every future migration inherits, SECTION B
-- issues ~300 GRANTs. Neither is undone by re-running anything, and the step this
-- file sits between (`supabase db push`) writes schema. So the target is checked
-- twice before a single statement runs:
--
--   1. AN EXPLICIT MARKER. `-v ROOM_QA_SHADOW=1` has to be passed on the psql
--      command line. It is an affirmation, not a value — its presence is what is
--      tested. A pasted command that lost its `-f` target, a stale $SHADOW_DB_URL
--      or a half-remembered one-liner will not carry it.
--   2. A PRODUCTION DENY-LIST. Supabase's pooled connections carry the project ref
--      in the role name (`postgres.<ref>`), so a prod pooler string identifies
--      itself. Any connection whose role, database or application_name mentions the
--      production ref is refused outright, marker or no marker.
--
-- ON_ERROR_STOP makes both of these terminal rather than advisory: psql exits
-- non-zero at the first failure and never reaches SECTION A.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

\if :{?ROOM_QA_SHADOW}
\else
DO $marker$
BEGIN
  RAISE EXCEPTION USING MESSAGE =
    'shadow-grants: REFUSING TO RUN — the shadow marker is missing.

This file permanently alters a database''s grant model (SECTION A writes a
pg_default_acl entry that every future migration inherits) and is meant to be run
only against a disposable SHADOW project, never against production
(ivkvluezuiojovpotlyb). Re-run it naming the target deliberately:

  psql "$SHADOW_DB_URL" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql

If you were about to run this against production: do not. Nothing here is needed
there — production already has these grants, which is where they were copied from.';
END
$marker$;
\endif

DO $prodguard$
DECLARE prod_ref CONSTANT text := 'ivkvluezuiojovpotlyb';
        ident text;
BEGIN
  ident := concat_ws(' ',
    current_user, session_user, current_database(),
    current_setting('application_name', true));
  IF ident ILIKE '%' || prod_ref || '%' THEN
    RAISE EXCEPTION USING MESSAGE =
      'shadow-grants: REFUSING TO RUN — this connection identifies as PRODUCTION ('
      || prod_ref || ').

Connection identity: ' || ident || '

SECTION A would write a pg_default_acl entry under a second granting role that
every future migration on this database would inherit, and the `supabase db push`
this file is meant to bracket would write schema. Point $SHADOW_DB_URL at the
shadow project and re-run.';
  END IF;
END
$prodguard$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION A — HAND-MAINTAINED. NOT GENERATED. A REGENERATION MUST PRESERVE IT.
--
-- Production's create-time bootstrap, reproduced. The hosted platform runs this
-- once per project so that every table any migration later creates arrives with
-- the client roles already holding the full verb list, and each migration then
-- REVOKEs its way down to what that table actually needs. A shadow without it
-- silently inverts the model: tables arrive with nothing, the REVOKEs are
-- no-ops, and the end state coincidentally resembles the intended one while
-- proving nothing about the statements that were supposed to produce it.
--
-- MUST RUN BEFORE `db push` — see the ORDERING block in the header. Running it
-- after is harmless and useless.
--
-- Default privileges are recorded PER GRANTING ROLE, so this is applied for the
-- roles that actually create objects here (`postgres` locally and on a hosted
-- shadow, `supabase_admin` on the platform). Roles that do not exist, or that
-- this connection is not a member of, are skipped with a NOTICE rather than
-- aborting the file.
-- ════════════════════════════════════════════════════════════════════════════
DO $bootstrap$
DECLARE owner_role text; armed int := 0;
BEGIN
  FOREACH owner_role IN ARRAY ARRAY['postgres', 'supabase_admin'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = owner_role) THEN
      BEGIN
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
          || 'GRANT ALL ON TABLES TO anon, authenticated, service_role', owner_role);
        armed := armed + 1;
        RAISE NOTICE 'shadow-grants: default privileges armed for creator role %', owner_role;
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'shadow-grants: not a member of % — default privileges NOT armed for it', owner_role;
      END;
    END IF;
  END LOOP;
  IF armed = 0 THEN
    RAISE WARNING 'shadow-grants: NO default privileges were armed — tables created after this point will not receive production''s create-time grants, and every "the client role does not hold verb X" assertion against them will be vacuous. Connect as the same role that runs db push.';
  END IF;
END
$bootstrap$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION B — GENERATED from production (ivkvluezuiojovpotlyb) on 2026-07-28.
-- Regenerate this section; do not hand-edit it. MUST RUN AFTER `db push`.
-- ════════════════════════════════════════════════════════════════════════════
DO $shadow$
DECLARE r record; skipped int := 0; applied int := 0;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('account_deletion_requests', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('account_deletion_requests', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('account_deletion_requests', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('admin_announcements', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('admin_announcements', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('admin_announcements', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('admin_audit_logs', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('admin_audit_logs', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('admin_audit_logs', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('analytics_settings', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('analytics_settings', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('analytics_settings', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('api_call_log', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('api_call_log', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('api_call_log', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('assignment_submissions', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('assignment_submissions', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('assignment_submissions', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('bulk_import_jobs', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('bulk_import_jobs', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('bulk_import_jobs', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_api_call_log', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_api_call_log', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_api_call_log', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_capture_tokens', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_capture_tokens', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_capture_tokens', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_folder_items', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_folder_items', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_folder_items', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_folders', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_folders', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_folders', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_keys', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_keys', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_keys', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_reels', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_reels', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cb_reels', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('certificate_templates', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('certificate_templates', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('certificate_templates', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('certificates', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('certificates', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('certificates', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_moments', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_moments', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_moments', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_notes', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_notes', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_notes', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_progress', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_progress', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_progress', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_qna', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_qna', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_qna', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_qna_replies', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_qna_replies', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_qna_replies', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_quizzes', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_quizzes', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_quizzes', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_resources', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_resources', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapter_resources', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapters', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapters', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('chapters', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_applications', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_applications', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_applications', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_batch_members', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_batch_members', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_batch_members', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_batches', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_batches', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_batches', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_learnings', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_learnings', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_learnings', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_notifications_log', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_notifications_log', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_notifications_log', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_week_attendance', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_week_attendance', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_week_attendance', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_week_submissions', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_week_submissions', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_week_submissions', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_weeks', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_weeks', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('cohort_weeks', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('community_post_comments', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('community_post_comments', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('community_post_comments', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('community_post_likes', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('community_post_likes', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('community_post_likes', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('community_posts', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('community_posts', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('community_posts', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('coupons', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('coupons', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('coupons', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_categories', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_categories', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_categories', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_drip_config', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_drip_config', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_drip_config', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_notify_requests', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_notify_requests', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_notify_requests', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_rating_stats', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_rating_stats', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_rating_stats', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_reviews', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_reviews', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_reviews', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_testimonials', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_testimonials', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('course_testimonials', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('courses', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('courses', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('courses', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('crm_contacts', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('crm_contacts', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('crm_contacts', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('custom_field_definitions', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('custom_field_definitions', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('custom_field_definitions', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('doc_changelog', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('doc_changelog', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('doc_changelog', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_campaigns', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_campaigns', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_campaigns', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_send_log', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_send_log', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_send_log', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_send_state', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_send_state', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_send_state', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_templates', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_templates', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_templates', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_unsubscribe_tokens', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_unsubscribe_tokens', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('email_unsubscribe_tokens', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('enrolment_audit_log', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('enrolment_audit_log', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('enrolment_audit_log', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('enrolments', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('enrolments', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('enrolments', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('enrolments_unified', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('enrolments_unified', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('enrolments_unified', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('event_free_courses', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('event_free_courses', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('event_free_courses', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('event_registrations', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('event_registrations', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('event_registrations', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('event_speakers', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('event_speakers', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('event_speakers', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('events', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('events', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('events', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('events_safe', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('events_safe', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('events_safe', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('hero_slides', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('hero_slides', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('hero_slides', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('instructor_course_assignments', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('instructor_course_assignments', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('instructor_course_assignments', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('legacy_enrolments', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('legacy_enrolments', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('legacy_enrolments', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('legacy_program_mapping', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('legacy_program_mapping', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('legacy_program_mapping', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('legacy_program_mapping_overview', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('legacy_program_mapping_overview', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('legacy_program_mapping_overview', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('live_sessions', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('live_sessions', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('live_sessions', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('live_sessions_safe', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('live_sessions_safe', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('live_sessions_safe', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('notification_preferences', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('notification_preferences', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('notification_preferences', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('notifications', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('notifications', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('notifications', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offering_bumps', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offering_bumps', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offering_bumps', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offering_courses', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offering_courses', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offering_courses', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offering_upsells', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offering_upsells', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offering_upsells', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offerings', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offerings', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('offerings', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('opportunities', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('opportunities', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('opportunities', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('opportunity_applications', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('opportunity_applications', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('opportunity_applications', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('payment_orders', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('payment_orders', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('payment_orders', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('peer_review_assignments', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('peer_review_assignments', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('peer_review_assignments', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('portfolio_projects', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('portfolio_projects', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('portfolio_projects', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('public_rate_limits', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('public_rate_limits', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('public_rate_limits', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('public_user_profiles', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('public_user_profiles', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('qna_posts', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('qna_posts', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('qna_posts', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_attempts', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_attempts', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_attempts', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_options', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_options', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_options', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_options_public', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_options_public', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_options_public', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_questions', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_questions', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('quiz_questions', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('refunds', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('refunds', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('refunds', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('review_helpful_votes', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('review_helpful_votes', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('review_helpful_votes', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('role_permissions', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('role_permissions', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('role_permissions', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('sections', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('sections', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('sections', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('session_attendance', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('session_attendance', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('session_attendance', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('suppressed_emails', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('suppressed_emails', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('suppressed_emails', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('team_api_keys', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('team_api_keys', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('team_api_keys', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('user_marketing_prefs', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('user_marketing_prefs', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('user_marketing_prefs', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('user_notes', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('user_notes', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('user_notes', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('user_tags', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('user_tags', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('user_tags', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('users', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('users', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('users', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('users_segmented', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('users_segmented', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('users_segmented', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('users_unified', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('users_unified', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('users_unified', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('vdocipher_video_views', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('vdocipher_video_views', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('vdocipher_video_views', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('webhook_deliveries', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('webhook_deliveries', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('webhook_deliveries', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('webhook_subscriptions', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('webhook_subscriptions', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('webhook_subscriptions', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('wishlisted_offerings', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('wishlisted_offerings', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('wishlisted_offerings', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('workshop_attendance', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('workshop_attendance', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('workshop_attendance', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('workshops', 'anon', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('workshops', 'authenticated', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'),
    ('workshops', 'service_role', 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE')
  ) AS t(tbl, grantee, privs) LOOP
    IF to_regclass('public.' || quote_ident(r.tbl)) IS NULL THEN
      skipped := skipped + 1;
      RAISE NOTICE 'shadow-grants: SKIP %, not present on this shadow', r.tbl;
    ELSE
      EXECUTE format('GRANT %s ON public.%I TO %I', r.privs, r.tbl, r.grantee);
      applied := applied + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'shadow-grants: % applied, % skipped', applied, skipped;
END
$shadow$;
