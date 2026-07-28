// Adversarial suite for ST-0 — "archived means owners can see it, nobody else
// can". Runs against the REAL production schema and the REAL policies, as the
// REAL `authenticated` role (SET LOCAL ROLE + a forged request.jwt.claims), all
// inside one transaction that always ROLLBACKs. Nothing persists.
//
//   node scripts/adversarial-archived-visibility.mjs
//
// Requires SUPABASE_PAT (LevelUp Core vault .env.supabase). Read-only in
// effect: every write is rolled back.
import { readFileSync } from 'node:fs';

const PAT = process.env.SUPABASE_PAT;
if (!PAT) {
  console.error('SUPABASE_PAT is required (source it from the LevelUp Core vault .env.supabase).');
  process.exit(2);
}
const REF = 'ivkvluezuiojovpotlyb';
const MIGRATION = new URL(
  '../supabase/migrations/20260728010000_entitled_owners_read_archived_offerings.sql',
  import.meta.url,
).pathname;

async function run(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 700)}`);
  return JSON.parse(t);
}

const migration = readFileSync(MIGRATION, 'utf8');
const U = (n) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;

const suite = `
BEGIN;
SET LOCAL check_function_bodies = on;

${migration}

CREATE TEMP TABLE results (name text, got text, want text);

-- An archived offering that actually HAS content, so the content-stack test is
-- meaningful rather than vacuously passing on an empty course.
CREATE TEMP TABLE t_pick AS
  SELECT o.id AS archived_id,
         (SELECT count(*) FROM public.chapters c
            JOIN public.sections s ON s.id = c.section_id
            JOIN public.offering_courses oc ON oc.course_id = s.course_id
           WHERE oc.offering_id = o.id) AS n_chapters
    FROM public.offerings o
   WHERE o.status = 'archived'
   ORDER BY 2 DESC
   LIMIT 1;

CREATE OR REPLACE FUNCTION pg_temp.mk_user(p_id uuid)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, phone,
                          phone_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', p_id::text || '@adv.test', NULL, NULL, now(), now(),
          '{}'::jsonb, jsonb_build_object('full_name','Adversarial Test'));
END;
$fn$;

DO $do$
DECLARE
  arch uuid; n_ch int; n int; m int; owner_can int; other_can int;
BEGIN
  SELECT archived_id, n_chapters INTO arch, n_ch FROM t_pick;

  -- owner, non-entitled bystander, revoked buyer, expired buyer
  PERFORM pg_temp.mk_user('${U(1)}');
  PERFORM pg_temp.mk_user('${U(2)}');
  PERFORM pg_temp.mk_user('${U(3)}');
  PERFORM pg_temp.mk_user('${U(4)}');

  INSERT INTO public.enrolments (user_id, offering_id, status, source)
  VALUES ('${U(1)}', arch, 'active', 'migration');
  INSERT INTO public.enrolments (user_id, offering_id, status, source, revoked_at, revoked_reason)
  VALUES ('${U(3)}', arch, 'revoked', 'migration', now(), 'refund');
  INSERT INTO public.enrolments (user_id, offering_id, status, source, expires_at)
  VALUES ('${U(4)}', arch, 'active', 'migration', now() - interval '1 day');

  -- Their own claimed purchase row, plus somebody else's, to prove isolation.
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name, claimed_by_user_id, claimed_at)
  VALUES ('+919999911101', 'owner@adv.test', arch, 'ADV owner row', '${U(1)}', now());
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name, claimed_by_user_id, claimed_at)
  VALUES ('+919999911102', 'someone@adv.test', arch, 'ADV other row', '${U(2)}', now());

  -- ══ A1: the OWNER can read their archived offering ═════════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"${U(1)}","role":"authenticated"}', true);
  SELECT count(*) INTO owner_can FROM public.offerings WHERE id = arch;
  RESET ROLE;
  INSERT INTO results VALUES ('A1 owner reads their archived offering', owner_can::text, '1');

  -- ══ A2: a NON-ENTITLED signed-in user gets zero rows ═══════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"${U(2)}","role":"authenticated"}', true);
  SELECT count(*) INTO other_can FROM public.offerings WHERE id = arch;
  -- ...and their catalog is unchanged: only the active offerings, no archived.
  SELECT count(*) INTO n FROM public.offerings WHERE status = 'archived';
  SELECT count(*) INTO m FROM public.offerings WHERE status = 'active';
  RESET ROLE;
  INSERT INTO results VALUES ('A2 bystander cannot read it', other_can::text, '0');
  INSERT INTO results VALUES ('A2b bystander sees NO archived offerings at all', n::text, '0');
  INSERT INTO results VALUES ('A2c bystander still sees every active offering', m::text,
    (SELECT count(*)::text FROM public.offerings WHERE status = 'active'));

  -- ══ A3: a REVOKED buyer loses it ═══════════════════════════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"${U(3)}","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.offerings WHERE id = arch;
  RESET ROLE;
  INSERT INTO results VALUES ('A3 revoked buyer cannot read it', n::text, '0');

  -- ══ A4: an EXPIRED enrolment loses it ══════════════════════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"${U(4)}","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.offerings WHERE id = arch;
  RESET ROLE;
  INSERT INTO results VALUES ('A4 expired enrolment cannot read it', n::text, '0');

  -- ══ A5: ANON sees no archived offering ═════════════════════════════════
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO n FROM public.offerings WHERE status = 'archived';
  RESET ROLE;
  INSERT INTO results VALUES ('A5 anon sees no archived offering', n::text, '0');

  -- ══ A6: the CONTENT opens for the owner (the actual point) ═════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"${U(1)}","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.chapters c
    JOIN public.sections s ON s.id = c.section_id
    JOIN public.offering_courses oc ON oc.course_id = s.course_id
   WHERE oc.offering_id = arch;
  RESET ROLE;
  INSERT INTO results VALUES ('A6 owner can read the chapters',
    (n > 0 AND n_ch > 0)::text, 'true');

  -- ══ A7: the bystander cannot read those same chapters ══════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"${U(2)}","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.chapters c
    JOIN public.sections s ON s.id = c.section_id
    JOIN public.offering_courses oc ON oc.course_id = s.course_id
   WHERE oc.offering_id = arch AND c.make_free = false;
  RESET ROLE;
  INSERT INTO results VALUES ('A7 bystander cannot read paid chapters', n::text, '0');

  -- ══ A8: a student reads ONLY their own purchase rows ═══════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"${U(1)}","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.legacy_enrolments;
  RESET ROLE;
  INSERT INTO results VALUES ('A8 student sees exactly their own purchase rows', n::text, '1');

  -- ══ A9: legacy_program_mapping stays admin-only ════════════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"${U(1)}","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.legacy_program_mapping;
  RESET ROLE;
  INSERT INTO results VALUES ('A9 mapping table stays invisible', n::text, '0');

  -- ══ A10: the owner CANNOT see other archived offerings they did not buy ═
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"${U(1)}","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.offerings WHERE status = 'archived' AND id <> arch;
  RESET ROLE;
  INSERT INTO results VALUES ('A10 owning one archived offering leaks no others', n::text, '0');
END;
$do$;

SELECT name,
       CASE WHEN got = want THEN 'PASS' ELSE 'FAIL' END AS verdict,
       got, want
  FROM results ORDER BY name;

ROLLBACK;
`;

const rows = await run(suite);
let failed = 0;
for (const r of rows) {
  if (r.verdict !== 'PASS') failed++;
  console.log(`${r.verdict === 'PASS' ? '✅' : '❌'} ${r.name}`);
  if (r.verdict !== 'PASS') console.log(`      got:  ${r.got}\n      want: ${r.want}`);
}
console.log(`\n${rows.length - failed}/${rows.length} passed`);
process.exit(failed ? 1 : 0);
