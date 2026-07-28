// Adversarial suite for SC-1, run against the REAL production schema inside a
// single transaction that always ROLLBACKs. Nothing persists. This is the only
// way to test against the actual constraints (enrolments_unique_active,
// enrolments_source_check, the FK graph, handle_new_user, and the live
// users_claim_legacy_enrolments trigger) without a shadow project.
import { readFileSync } from 'node:fs';

const PAT = process.env.SUPABASE_PAT;
if (!PAT) { console.error('SUPABASE_PAT is required (source it from the LevelUp Core vault .env.supabase).'); process.exit(2); }
const REF = 'ivkvluezuiojovpotlyb';
const MIGRATION = '/Users/rahulsrinivas/Claude/LevelUp-Main-App/supabase/migrations/20260727220000_claim_at_signin.sql';

async function run(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 600)}`);
  return JSON.parse(t);
}

const migration = readFileSync(MIGRATION, 'utf8');

// Fixed UUIDs/phones so nothing depends on random(). Phones are in a range that
// cannot collide with a real subscriber (all start 99999).
const U = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const P = (n) => `+9199999000${String(n).padStart(2, '0')}`;

const suite = `
BEGIN;
SET LOCAL check_function_bodies = on;

${migration.replace(/ROLLBACK;\s*$/i, '')}

-- ── fixtures ──────────────────────────────────────────────────────────────
-- Two real, ACTIVE offerings borrowed from prod so the FK to offerings holds.
CREATE TEMP TABLE t_off ON COMMIT DROP AS
  SELECT id, row_number() OVER (ORDER BY created_at) rn
    FROM public.offerings ORDER BY created_at LIMIT 2;

CREATE TEMP TABLE results (name text, got text, want text);

-- Helper: insert an auth user with a chosen phone/confirmation state.
CREATE OR REPLACE FUNCTION pg_temp.mk_user(p_id uuid, p_phone text, p_confirmed boolean)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, phone,
                          phone_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', p_id::text || '@adv.test', p_phone,
          CASE WHEN p_confirmed THEN now() ELSE NULL END, now(), now(),
          '{}'::jsonb, jsonb_build_object('full_name','Adversarial Test'));
END;
$fn$;

-- Helper: run claim_my_purchases() AS a given user.
CREATE OR REPLACE FUNCTION pg_temp.claim_as(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_id)::text, true);
  r := public.claim_my_purchases();
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END;
$fn$;

DO $do$
DECLARE
  off1 uuid; off2 uuid; res jsonb; n int; m int; v text;
BEGIN
  SELECT id INTO off1 FROM t_off WHERE rn = 1;
  SELECT id INTO off2 FROM t_off WHERE rn = 2;

  -- ══ T1: a signup whose phone has purchases must NOT abort ══════════════
  -- This is the outage itself. auth.users INSERT -> handle_new_user ->
  -- public.users INSERT -> users_claim_legacy_enrolments fires.
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(1)}', 't1@adv.test', off1, 'ADV T1');
  BEGIN
    PERFORM pg_temp.mk_user('${U(1)}', '9199999000' || '01', true);
    INSERT INTO results VALUES ('T1 signup with purchases does not abort', 'ok', 'ok');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO results VALUES ('T1 signup with purchases does not abort',
                                'ABORTED: ' || SQLSTATE || ' ' || SQLERRM, 'ok');
  END;

  -- ══ T2: confirmed sign-in claims, across the '+'-less auth dialect ═════
  res := pg_temp.claim_as('${U(1)}');
  INSERT INTO results VALUES ('T2 confirmed caller claims across dialects',
    res::text, '{"claimed": 1, "stamped": 1}');

  -- ══ T3: idempotent — a second sign-in claims nothing ═══════════════════
  res := pg_temp.claim_as('${U(1)}');
  INSERT INTO results VALUES ('T3 second call is a no-op',
    res::text, '{"claimed": 0, "stamped": 0}');

  -- ══ T4: exactly ONE enrolment exists for that user+offering ════════════
  SELECT count(*) INTO n FROM public.enrolments
   WHERE user_id = '${U(1)}' AND offering_id = off1;
  INSERT INTO results VALUES ('T4 exactly one enrolment', n::text, '1');

  -- ══ T5: UNCONFIRMED phone claims nothing ═══════════════════════════════
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(2)}', 't5@adv.test', off1, 'ADV T5');
  PERFORM pg_temp.mk_user('${U(2)}', '9199999000' || '02', false);
  res := pg_temp.claim_as('${U(2)}');
  INSERT INTO results VALUES ('T5 unconfirmed phone claims nothing',
    res::text, '{"claimed": 0, "stamped": 0}');

  -- ══ T6: SOFT-DELETED caller claims nothing (auth phone survives) ═══════
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(3)}', 't6@adv.test', off1, 'ADV T6');
  PERFORM pg_temp.mk_user('${U(3)}', '9199999000' || '03', true);
  UPDATE public.users SET deleted_at = now() WHERE id = '${U(3)}';
  res := pg_temp.claim_as('${U(3)}');
  INSERT INTO results VALUES ('T6 soft-deleted caller claims nothing',
    res::text, '{"claimed": 0, "stamped": 0}');

  -- ══ T7: NULL offering_id stays UNCLAIMED for the granter ═══════════════
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(4)}', 't7@adv.test', NULL, 'ADV T7 unmapped');
  PERFORM pg_temp.mk_user('${U(4)}', '9199999000' || '04', true);
  res := pg_temp.claim_as('${U(4)}');
  SELECT count(*) INTO n FROM public.legacy_enrolments
   WHERE phone = '${P(4)}' AND claimed_by_user_id IS NULL;
  INSERT INTO results VALUES ('T7 unmapped purchase left claimable',
    res::text || ' unclaimed=' || n::text, '{"claimed": 0, "stamped": 0} unclaimed=1');

  -- ══ T8: a REVOKED enrolment is never re-granted, and the purchase row
  --        stays UNSTAMPED so reversing the revocation restores the path ═════
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(5)}', 't8@adv.test', off1, 'ADV T8');
  PERFORM pg_temp.mk_user('${U(5)}', '9199999000' || '05', true);
  INSERT INTO public.enrolments (user_id, offering_id, status, source, revoked_at, revoked_reason)
  VALUES ('${U(5)}', off1, 'revoked', 'checkout', now(), 'refund');
  res := pg_temp.claim_as('${U(5)}');
  SELECT count(*) INTO n FROM public.enrolments
   WHERE user_id = '${U(5)}' AND offering_id = off1 AND status = 'active';
  SELECT count(*) INTO m FROM public.legacy_enrolments
   WHERE legacy_program_name = 'ADV T8' AND claimed_by_user_id IS NULL;
  INSERT INTO results VALUES ('T8 revoked student stays revoked, row stays claimable',
    res::text || ' active=' || n::text || ' claimable=' || m::text,
    '{"claimed": 0, "stamped": 0} active=0 claimable=1');

  -- ══ T8b: a CANCELLED (refunded) enrolment — process-refund writes this ═══
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(12)}', 't8b@adv.test', off1, 'ADV T8b');
  PERFORM pg_temp.mk_user('${U(12)}', '9199999000' || '12', true);
  INSERT INTO public.enrolments (user_id, offering_id, status, source)
  VALUES ('${U(12)}', off1, 'cancelled', 'checkout');
  res := pg_temp.claim_as('${U(12)}');
  SELECT count(*) INTO n FROM public.enrolments
   WHERE user_id = '${U(12)}' AND offering_id = off1 AND status = 'active';
  SELECT count(*) INTO m FROM public.legacy_enrolments
   WHERE legacy_program_name = 'ADV T8b' AND claimed_by_user_id IS NULL;
  INSERT INTO results VALUES ('T8b refunded student does not regain access',
    res::text || ' active=' || n::text || ' claimable=' || m::text,
    '{"claimed": 0, "stamped": 0} active=0 claimable=1');

  -- ══ T8c: already ACTIVE via checkout — no double grant, but DO stamp ═════
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(13)}', 't8c@adv.test', off1, 'ADV T8c');
  PERFORM pg_temp.mk_user('${U(13)}', '9199999000' || '13', true);
  INSERT INTO public.enrolments (user_id, offering_id, status, source)
  VALUES ('${U(13)}', off1, 'active', 'checkout');
  res := pg_temp.claim_as('${U(13)}');
  SELECT count(*) INTO n FROM public.enrolments WHERE user_id = '${U(13)}';
  INSERT INTO results VALUES ('T8c already entitled is reconciled, not re-granted',
    res::text || ' enrolments=' || n::text, '{"claimed": 0, "stamped": 1} enrolments=1');

  -- ══ T9: DUPLICATE legacy rows -> one enrolment, no 21000/23505 ═════════
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(6)}', 't9@adv.test', off1, 'ADV T9 a'),
         ('${P(6)}', 't9@adv.test', off1, 'ADV T9 b'),
         ('${P(6)}', 't9@adv.test', off2, 'ADV T9 c');
  PERFORM pg_temp.mk_user('${U(6)}', '9199999000' || '06', true);
  BEGIN
    res := pg_temp.claim_as('${U(6)}');
    SELECT count(*) INTO n FROM public.enrolments WHERE user_id = '${U(6)}';
    INSERT INTO results VALUES ('T9 duplicate purchases collapse',
      res::text || ' enrolments=' || n::text, '{"claimed": 2, "stamped": 3} enrolments=2');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO results VALUES ('T9 duplicate purchases collapse',
      'RAISED ' || SQLSTATE || ' ' || SQLERRM, 'no raise');
  END;

  -- ══ T10: anonymous caller (no JWT) returns zero and does not raise ═════
  BEGIN
    PERFORM set_config('request.jwt.claims', '', true);
    res := public.claim_my_purchases();
    INSERT INTO results VALUES ('T10 anon claims nothing, no raise',
      res::text, '{"claimed": 0, "stamped": 0}');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO results VALUES ('T10 anon claims nothing, no raise',
      'RAISED ' || SQLSTATE, '{"claimed": 0, "stamped": 0}');
  END;

  -- ══ T11: malformed JWT sub must degrade, not raise 22P02 ═══════════════
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"not-a-uuid"}', true);
    res := public.claim_my_purchases();
    INSERT INTO results VALUES ('T11 malformed sub degrades', res::text,
      '{"claimed": 0, "stamped": 0}');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO results VALUES ('T11 malformed sub degrades',
      'RAISED ' || SQLSTATE, '{"claimed": 0, "stamped": 0}');
  END;
  PERFORM set_config('request.jwt.claims', '', true);

  -- ══ T12: GRANTER — foreign: placeholder mints no key, stamps nobody ════
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('foreign:9199999000' || '07:somehandle', 't12@adv.test', NULL, 'ADV T12');
  PERFORM pg_temp.mk_user('${U(7)}', '9199999000' || '07', true);
  UPDATE public.legacy_enrolments SET offering_id = off2
   WHERE legacy_program_name = 'ADV T12';
  SELECT coalesce(claimed_by_user_id::text, 'NULL') INTO v
    FROM public.legacy_enrolments WHERE legacy_program_name = 'ADV T12';
  INSERT INTO results VALUES ('T12 granter ignores foreign: placeholders', v, 'NULL');

  -- ══ T13: GRANTER — unconfirmed phone is not ownership proof ════════════
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(8)}', 't13@adv.test', NULL, 'ADV T13');
  PERFORM pg_temp.mk_user('${U(8)}', '9199999000' || '08', false);
  UPDATE public.legacy_enrolments SET offering_id = off2 WHERE legacy_program_name = 'ADV T13';
  SELECT coalesce(claimed_by_user_id::text, 'NULL') INTO v
    FROM public.legacy_enrolments WHERE legacy_program_name = 'ADV T13';
  INSERT INTO results VALUES ('T13 granter needs a CONFIRMED phone', v, 'NULL');

  -- ══ T14: GRANTER — confirmed phone DOES get granted (dialect proof) ════
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(9)}', 't14@adv.test', NULL, 'ADV T14');
  PERFORM pg_temp.mk_user('${U(9)}', '9199999000' || '09', true);
  UPDATE public.legacy_enrolments SET offering_id = off2 WHERE legacy_program_name = 'ADV T14';
  SELECT count(*) INTO n FROM public.enrolments
   WHERE user_id = '${U(9)}' AND offering_id = off2 AND status = 'active';
  SELECT coalesce(claimed_by_user_id::text, 'NULL') INTO v
    FROM public.legacy_enrolments WHERE legacy_program_name = 'ADV T14';
  INSERT INTO results VALUES ('T14 granter grants a confirmed owner',
    'stamped=' || (v = '${U(9)}')::text || ' enrolments=' || n::text,
    'stamped=true enrolments=1');

  -- ══ T15: GRANTER — soft-deleted account never gets stamped ═════════════
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(10)}', 't15@adv.test', NULL, 'ADV T15');
  PERFORM pg_temp.mk_user('${U(10)}', '9199999000' || '10', true);
  UPDATE public.users SET deleted_at = now() WHERE id = '${U(10)}';
  UPDATE public.legacy_enrolments SET offering_id = off2 WHERE legacy_program_name = 'ADV T15';
  SELECT coalesce(claimed_by_user_id::text, 'NULL') INTO v
    FROM public.legacy_enrolments WHERE legacy_program_name = 'ADV T15';
  INSERT INTO results VALUES ('T15 granter skips soft-deleted accounts', v, 'NULL');

  -- ══ T16: someone ELSE's purchase is never claimable ════════════════════
  INSERT INTO public.legacy_enrolments (phone, email, offering_id, legacy_program_name)
  VALUES ('${P(11)}', 'victim@adv.test', off1, 'ADV T16 victim');
  PERFORM pg_temp.mk_user('${U(11)}', '9199999000' || '99', true);  -- different phone
  res := pg_temp.claim_as('${U(11)}');
  INSERT INTO results VALUES ('T16 cannot claim another persons purchase',
    res::text, '{"claimed": 0, "stamped": 0}');
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
