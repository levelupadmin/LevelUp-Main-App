-- ============================================================================
-- LUCA end-to-end suite. Every server function, called the way the app calls
-- it (as anon / a signed-in user via request.jwt.claim.sub, with RLS on),
-- through a cohort's whole life. Results land in t.results; run.sh prints them.
-- People:  A admin · M mentor (linked) · L1 Lena (paid in full) · L2 Lou and
--          L3 Leo (enrolled; Leo is Track B) · K Kim (balance overdue)
--          P Pia (no application yet) · O Oz (outsider)
-- ============================================================================
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO anon, authenticated;
CREATE TABLE t.results (n serial PRIMARY KEY, ok boolean NOT NULL, name text NOT NULL, detail text);
GRANT SELECT, INSERT ON t.results TO anon, authenticated;
GRANT USAGE ON SEQUENCE t.results_n_seq TO anon, authenticated;
CREATE TABLE t.v (k text PRIMARY KEY, v jsonb);
GRANT ALL ON t.v TO anon, authenticated;

CREATE FUNCTION t.ok(c boolean, name text, detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS
$$ INSERT INTO t.results (ok, name, detail) VALUES (COALESCE(c, false), name, detail) $$;
CREATE FUNCTION t.as(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', COALESCE(u::text, ''), false);
  IF u IS NULL THEN SET ROLE anon; ELSE SET ROLE authenticated; END IF;
END $$;
CREATE FUNCTION t.me() RETURNS void LANGUAGE plpgsql AS
$$ BEGIN RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false); END $$;
CREATE FUNCTION t.err(q text, pat text, name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE q;
  PERFORM t.ok(false, name, 'expected an error, got none');
EXCEPTION WHEN OTHERS THEN
  PERFORM t.ok(SQLERRM ~* pat, name, SQLERRM);
END $$;
CREATE FUNCTION t.put(k text, v jsonb) RETURNS void LANGUAGE sql AS
$$ INSERT INTO t.v VALUES (k, v) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v $$;
CREATE FUNCTION t.get(k text) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT v FROM t.v WHERE t.v.k = $1 $$;
-- Member id / coins of a user in the real cohort, read as the owner (test-only; bypasses RLS).
CREATE FUNCTION t.mid(u uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT id FROM public.luca_members WHERE program_id = '22222222-2222-2222-2222-222222222222' AND user_id = u $$;
CREATE FUNCTION t.coins(u uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT coins FROM public.luca_members WHERE program_id = '22222222-2222-2222-2222-222222222222' AND user_id = u $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Who can see what (anon, outsider, staff, kill switch, demo)
-- ---------------------------------------------------------------------------
DO $$ DECLARE r jsonb; BEGIN
  PERFORM t.as(NULL);
  r := luca_room('luca-c3');
  PERFORM t.ok(r IS NOT NULL AND r->>'access' = 'none', '1.1 anon sees the public program page');
  PERFORM t.ok(NOT (r ? 'assignments') AND NOT (r ? 'me'), '1.2 anon gets no room data');
  PERFORM t.ok((r->'program'->>'whatsapp_url') IS NULL AND (r->'program'->>'drive_url') IS NULL, '1.3 anon gets no WhatsApp/Drive links');
  PERFORM t.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'sessions') s WHERE s ? 'zoom_url' OR (s->>'recording_url') IS NOT NULL), '1.4 no Zoom or recording links in the public page');
  PERFORM t.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'weeks') w, jsonb_array_elements(w->'quiz') q WHERE q ? 'answer'), '1.5 quiz answers never leave the server');
  PERFORM t.ok(luca_room('luca-demo') IS NULL, '1.6 the demo cohort is invisible to anon');
  PERFORM t.ok(luca_room('no-such-cohort') IS NULL, '1.7 unknown cohort is a plain nothing');
  PERFORM t.ok((r->'program'->'pricing'->>'price')::numeric = 45000 AND (r->'program'->'pricing'->>'deposit')::numeric = 8000 AND (r->'program'->'pricing'->>'app_fee')::numeric = 400, '1.8 price comes from the offering');
  PERFORM t.ok(r->'program'->'pricing'->>'payment_mode' = 'staged', '1.8b the app is told the offering takes staged payments');
  PERFORM t.as('00000000-0000-0000-0000-0000000000f1');
  PERFORM t.ok(luca_room('luca-demo') IS NULL, '1.9 the demo cohort is invisible to an outsider');
  PERFORM t.as('00000000-0000-0000-0000-0000000000a1');
  PERFORM t.ok(luca_room('luca-demo') IS NOT NULL AND (luca_room('luca-demo')->>'is_staff')::boolean, '1.10 admin sees the demo cohort as staff');
  PERFORM t.me();
  UPDATE luca_runtime_config SET surface_enabled = false;
  PERFORM t.as(NULL);
  PERFORM t.ok(luca_room('luca-c3') IS NULL, '1.11 switch off: anon sees nothing');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b2');
  PERFORM t.ok(luca_room('luca-c3') IS NULL, '1.12 switch off: even a paid learner sees nothing');
  PERFORM t.as('00000000-0000-0000-0000-0000000000c1');
  PERFORM t.ok(luca_room('luca-c3') IS NOT NULL, '1.13 switch off: the linked mentor still sees it');
  PERFORM t.as(NULL);
  PERFORM t.ok(luca_surface_enabled() = false, '1.14 surface flag reads off for anon');
  PERFORM t.me();
  UPDATE luca_runtime_config SET surface_enabled = true;
  UPDATE luca_programs SET enabled = false WHERE slug = 'luca-c3';
  PERFORM t.as('00000000-0000-0000-0000-0000000000b2');
  PERFORM t.ok(luca_room('luca-c3') IS NULL, '1.15 cohort disabled: learner sees nothing');
  PERFORM t.me();
  UPDATE luca_programs SET enabled = true WHERE slug = 'luca-c3';
END $$;

-- ---------------------------------------------------------------------------
-- 2. Applying in the app (real cohort)
-- ---------------------------------------------------------------------------
DO $$ DECLARE r jsonb; good jsonb := '{"niche":"Money for your first salary","handle":"@pia","track":"A","why":"I post, but with no plan","hours":true}'; BEGIN
  PERFORM t.as(NULL);
  PERFORM t.err($q$SELECT luca_apply('luca-c3', '{}')$q$, 'sign in|permission denied', '2.1 applying needs a sign-in');
  PERFORM t.as('00000000-0000-0000-0000-0000000000e1');
  PERFORM t.err($q$SELECT luca_apply('luca-c3', '{"niche":"ab","track":"A","why":"because","hours":true}')$q$, '^niche$', '2.2 too-short niche is refused');
  PERFORM t.err($q$SELECT luca_apply('luca-c3', '{"niche":"Cooking","track":"C","why":"because","hours":true}')$q$, '^track$', '2.3 unknown track is refused');
  PERFORM t.err($q$SELECT luca_apply('luca-c3', '{"niche":"Cooking","track":"A","why":"because","hours":false}')$q$, '^hours$', '2.4 must commit to the hours');
  PERFORM t.ok(luca_room('luca-c3')->>'access' = 'none', '2.5 before applying: access none');
  r := luca_apply('luca-c3', good);
  PERFORM t.ok(r->>'status' = 'submitted' AND (r->>'demo')::boolean = false, '2.6 application created', r::text);
  PERFORM t.put('pia_app', r);
  r := luca_room('luca-c3');
  PERFORM t.ok(r->>'access' = 'applicant' AND r->'application'->>'status' = 'submitted', '2.7 room shows the application');
  r := luca_apply('luca-c3', good || '{"niche":"Money for your first job"}');
  PERFORM t.ok(r->>'application_id' = t.get('pia_app')->>'application_id', '2.8 re-applying updates, never duplicates');
  PERFORM t.me();
  PERFORM t.ok((SELECT count(*) FROM cohort_applications WHERE user_id = '00000000-0000-0000-0000-0000000000e1') = 1, '2.9 exactly one cohort_applications row');
  PERFORM t.ok((SELECT bio FROM cohort_applications WHERE user_id = '00000000-0000-0000-0000-0000000000e1') LIKE '%Money for your first salary%', '2.10 answers reach the application the team reviews');
  -- The fee is paid (verify-razorpay-payment's job): answers freeze.
  UPDATE cohort_applications SET status = 'app_fee_paid', app_fee_payment_id = gen_random_uuid() WHERE user_id = '00000000-0000-0000-0000-0000000000e1';
  PERFORM t.as('00000000-0000-0000-0000-0000000000e1');
  PERFORM t.err(format($q$SELECT luca_apply('luca-c3', %L)$q$, good), 'already in', '2.11 answers are frozen once the fee is paid');
  PERFORM t.ok((luca_room('luca-c3')->'application'->>'app_fee_paid')::boolean, '2.12 room shows the fee as paid');
  -- Offering closed / not open yet / Tally duplicate guard (for Oz)
  PERFORM t.me(); UPDATE offerings SET status = 'draft' WHERE id = '11111111-1111-1111-1111-111111111111';
  PERFORM t.as('00000000-0000-0000-0000-0000000000f1');
  PERFORM t.err(format($q$SELECT luca_apply('luca-c3', %L)$q$, good), 'closed', '2.13 a closed offering refuses applications');
  PERFORM t.me(); UPDATE offerings SET status = 'active', intake_opens_at = now() + interval '3 days' WHERE id = '11111111-1111-1111-1111-111111111111';
  PERFORM t.as('00000000-0000-0000-0000-0000000000f1');
  PERFORM t.err(format($q$SELECT luca_apply('luca-c3', %L)$q$, good), 'not open yet', '2.14 applications wait for the intake date');
  PERFORM t.me(); UPDATE offerings SET intake_opens_at = NULL WHERE id = '11111111-1111-1111-1111-111111111111';
  INSERT INTO cohort_applications (offering_id, user_id, full_name, email) VALUES ('11111111-1111-1111-1111-111111111111', NULL, 'Oz on Tally', 'OZ.OUTSIDE@e2e.test');
  PERFORM t.as('00000000-0000-0000-0000-0000000000f1');
  PERFORM t.err(format($q$SELECT luca_apply('luca-c3', %L)$q$, good), 'already applied with this email', '2.15 a form application with the same email is not duplicated');
  PERFORM t.me(); DELETE FROM cohort_applications WHERE user_id IS NULL;
  UPDATE luca_programs SET features = features || '{"application":false}' WHERE slug = 'luca-c3';
  PERFORM t.as('00000000-0000-0000-0000-0000000000f1');
  PERFORM t.err(format($q$SELECT luca_apply('luca-c3', %L)$q$, good), 'not taken in the app', '2.16 the application switch turns in-app applying off');
  PERFORM t.me(); UPDATE luca_programs SET features = features || '{"application":true}' WHERE slug = 'luca-c3';
END $$;

-- ---------------------------------------------------------------------------
-- 3. Decision, deposit, balance and the lock
-- ---------------------------------------------------------------------------
DO $$ DECLARE r jsonb; BEGIN
  UPDATE cohort_applications SET status = 'accepted', accepted_at = now() WHERE user_id = '00000000-0000-0000-0000-0000000000e1';
  PERFORM t.as('00000000-0000-0000-0000-0000000000e1');
  r := luca_room('luca-c3');
  PERFORM t.ok(r->>'access' = 'applicant' AND r->'application'->>'status' = 'accepted', '3.1 accepted shows the offer');
  PERFORM t.ok(abs(extract(epoch FROM ((r->'application'->>'deposit_hold_until')::timestamptz - now())) - 2 * 86400) < 120, '3.2 seat held for the offering''s 2 days');
  PERFORM t.me();
  INSERT INTO payment_orders (id, user_id, offering_id, status, captured_at) VALUES ('77777777-7777-7777-7777-777777777779', '00000000-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', 'captured', now());
  UPDATE cohort_applications SET status = 'confirmation_paid', confirmation_payment_id = '77777777-7777-7777-7777-777777777779' WHERE user_id = '00000000-0000-0000-0000-0000000000e1';
  PERFORM t.as('00000000-0000-0000-0000-0000000000e1');
  r := luca_room('luca-c3');
  PERFORM t.ok(r->>'access' = 'learner' AND r ? 'me', '3.3 deposit paid: the cohort opens');
  PERFORM t.ok(abs(extract(epoch FROM ((r->'application'->>'balance_due_at')::timestamptz - now())) - 15 * 86400) < 120, '3.4 balance due after the offering''s 15 days');
  PERFORM t.ok((r->'me'->>'coins')::int = 200 AND (r->'me'->'setup'->>'seat')::boolean, '3.5 joining gives 200 coins and ticks "seat"');
  PERFORM t.ok(luca_room('luca-c3')->'me'->>'coins' = '200', '3.6 opening again does not pay twice');
  PERFORM t.ok((SELECT count(*) FROM jsonb_array_elements(luca_my_programs()) p WHERE p->>'slug' = 'luca-c3' AND p->>'access' = 'learner') = 1, '3.7 My cohorts lists it');
  PERFORM t.as('00000000-0000-0000-0000-0000000000d1');
  PERFORM t.ok(luca_room('luca-c3')->>'access' = 'locked', '3.8 balance overdue: locked');
  PERFORM t.ok(NOT (luca_room('luca-c3') ? 'assignments'), '3.9 locked learners get no room data');
  PERFORM t.err($q$SELECT luca_join_session('44444444-4444-4444-4444-444444444441')$q$, '.', '3.10 locked learners cannot join sessions');
  PERFORM t.me();
  UPDATE cohort_applications SET status = 'balance_paid' WHERE user_id = '00000000-0000-0000-0000-0000000000d1';
  PERFORM t.as('00000000-0000-0000-0000-0000000000d1');
  PERFORM t.ok(luca_room('luca-c3')->>'access' = 'learner', '3.11 balance paid: unlocked again');
  PERFORM t.me();
END $$;

-- ---------------------------------------------------------------------------
-- 4. The room, setup and joining sessions
-- ---------------------------------------------------------------------------
DO $$ DECLARE r jsonb; j jsonb; BEGIN
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1'); r := luca_room('luca-c3');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b2'); PERFORM luca_room('luca-c3');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b3'); PERFORM luca_room('luca-c3');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  PERFORM t.ok(r->>'access' = 'learner' AND jsonb_array_length(r->'assignments') = 4, '4.1 learner gets the whole room');
  PERFORM t.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'sessions') s WHERE s ? 'zoom_url'), '4.2 Zoom links never sit in the room');
  PERFORM t.ok(EXISTS (SELECT 1 FROM jsonb_array_elements(r->'sessions') s WHERE s->>'recording_url' IS NOT NULL), '4.3 learners get past recordings');
  PERFORM t.ok(r->'program'->>'whatsapp_url' IS NOT NULL, '4.4 learners get the WhatsApp and Drive links');
  PERFORM t.ok(EXISTS (SELECT 1 FROM jsonb_array_elements(r->'weeks') w WHERE w->>'n' = '4' AND jsonb_array_length(w->'quiz') = 2 AND NOT (w->'quiz'->0 ? 'answer')), '4.5 quiz questions without answers');
  PERFORM t.ok(jsonb_array_length(r->'announcements') = 1 AND jsonb_array_length(r->'resources') = 1, '4.6 announcements and resources arrive');
  PERFORM t.err($q$SELECT luca_setup('luca-c3', 'seat')$q$, 'unknown setup step', '4.7 only real setup steps can be ticked');
  PERFORM luca_setup('luca-c3', 'whatsapp'); PERFORM luca_setup('luca-c3', 'calendar');
  j := luca_setup('luca-c3', 'drive');
  PERFORM t.ok((j->>'whatsapp')::boolean AND (j->>'calendar')::boolean AND (j->>'drive')::boolean, '4.8 setup steps tick');
  PERFORM t.ok(t.coins('00000000-0000-0000-0000-0000000000b1') = 200, '4.9 no setup bonus until the pre-watch is done too');
  -- Join: live, about to start, tomorrow, ended
  j := luca_join_session('44444444-4444-4444-4444-444444444441');
  PERFORM t.ok(j->>'zoom_url' = 'https://zoom.us/j/141' AND (j->>'awarded')::int = 100 AND (j->>'present')::boolean, '4.10 joining live: Zoom link, present, +100', j::text);
  j := luca_join_session('44444444-4444-4444-4444-444444444441');
  PERFORM t.ok((j->>'awarded')::int = 0 AND j->>'zoom_url' IS NOT NULL, '4.11 rejoining: link again, no second award');
  j := luca_join_session('44444444-4444-4444-4444-444444444442');
  PERFORM t.ok(j->>'zoom_url' = 'https://zoom.us/j/142', '4.12 join opens 15 minutes before the start');
  PERFORM t.err($q$SELECT luca_join_session('44444444-4444-4444-4444-444444444443')$q$, 'join opens 15 minutes', '4.13 too early to join tomorrow''s session');
  PERFORM t.err($q$SELECT luca_join_session('44444444-4444-4444-4444-444444444403')$q$, 'ended', '4.14 cannot join a finished session');
  PERFORM t.ok((SELECT jsonb_array_length(luca_room('luca-c3')->'attended')) = 2, '4.15 attendance shows in the room');
  PERFORM t.as('00000000-0000-0000-0000-0000000000f1');
  PERFORM t.err($q$SELECT luca_join_session('44444444-4444-4444-4444-444444444441')$q$, 'not found|not a member|access', '4.16 an outsider cannot join');
  PERFORM t.as('00000000-0000-0000-0000-0000000000c1');
  j := luca_join_session('44444444-4444-4444-4444-444444444441');
  PERFORM t.ok(j->>'zoom_url' IS NOT NULL AND NOT (j->>'present')::boolean, '4.17 the mentor gets the link without being marked present');
  PERFORM t.me();
END $$;

-- ---------------------------------------------------------------------------
-- 5. Pre-watch: first answer counts, scoring, setup bonus
-- ---------------------------------------------------------------------------
DO $$ DECLARE j jsonb; c0 int; BEGIN
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  c0 := (luca_room('luca-c3')->'me'->>'coins')::int;
  j := luca_prewatch_check('luca-c3', 4, 0, 2);
  PERFORM t.ok(NOT (j->>'correct')::boolean AND (j->>'answer')::int = 0 AND (j->>'chosen')::int = 2, '5.1 a wrong answer is recorded and the right one revealed', j::text);
  j := luca_prewatch_check('luca-c3', 4, 0, 0);
  PERFORM t.ok((j->>'chosen')::int = 2 AND NOT (j->>'correct')::boolean, '5.2 changing the answer after the reveal does not count');
  PERFORM t.err($q$SELECT luca_prewatch_complete('luca-c3', 4, NULL, 'https://www.loom.com/share/x')$q$, 'answer every question', '5.3 every question must be answered first');
  j := luca_prewatch_check('luca-c3', 4, 1, 1);
  PERFORM t.ok((j->>'correct')::boolean, '5.4 a right answer');
  PERFORM t.err($q$SELECT luca_prewatch_check('luca-c3', 4, 5, 0)$q$, 'question not found', '5.5 an unknown question is refused');
  PERFORM t.err($q$SELECT luca_prewatch_check('luca-c3', 4, 0, 9)$q$, 'choice', '5.6 an unknown option is refused');
  PERFORM t.err($q$SELECT luca_prewatch_complete('luca-c3', 4, NULL, 'not a link')$q$, 'summary link', '5.7 the summary must be a link');
  j := luca_prewatch_complete('luca-c3', 4, ARRAY[0,1], 'https://www.loom.com/share/abc');
  PERFORM t.ok((j->>'score')::int = 1 AND (j->>'of')::int = 2 AND (j->>'awarded')::int = 50, '5.8 scored from the recorded answers (client answers ignored), +50', j::text);
  j := luca_prewatch_complete('luca-c3', 4, ARRAY[0,1], 'https://www.loom.com/share/abc');
  PERFORM t.ok((j->>'awarded')::int = 0, '5.9 completing twice pays once');
  PERFORM t.err($q$SELECT luca_prewatch_check('luca-c3', 9, 0, 1)$q$, 'not open yet', '5.10 a future week''s pre-watch is closed');
  -- Week 0 completes setup (seat + whatsapp + calendar + drive + pw0) -> +100 once
  PERFORM luca_prewatch_check('luca-c3', 0, 0, 1);
  j := luca_prewatch_complete('luca-c3', 0, ARRAY[1], 'https://www.loom.com/share/zero');
  PERFORM t.ok((luca_room('luca-c3')->'me'->'setup'->>'pw0')::boolean, '5.11 week 0 pre-watch ticks setup');
  PERFORM t.me();
  PERFORM t.ok(EXISTS (SELECT 1 FROM luca_coin_ledger WHERE member_id = t.mid('00000000-0000-0000-0000-0000000000b1') AND rule = 'setup' AND amount = 100), '5.12 setup bonus +100 once all five are done');
  PERFORM t.ok((SELECT count(*) FROM luca_coin_ledger WHERE member_id = t.mid('00000000-0000-0000-0000-0000000000b1') AND rule = 'setup') = 1, '5.13 setup bonus paid exactly once');
END $$;

-- ---------------------------------------------------------------------------
-- 6. Handing in work, the contract, mentor calls, fixes
-- ---------------------------------------------------------------------------
DO $$ DECLARE j jsonb; d jsonb; sid uuid; BEGIN
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  PERFORM t.err($q$SELECT luca_submit('55555555-5555-5555-5555-555555555504', '[{"url":"https://docs.google.com/document/d/x"}]')$q$, 'every part needs a link', '6.1 every part needs a link');
  PERFORM t.err($q$SELECT luca_submit('55555555-5555-5555-5555-555555555504', '[{"url":"https://docs.google.com/document/d/x"},{"url":"javascript:alert(1)"}]')$q$, 'link 2', '6.2 a bad link is named by its position');
  j := luca_submit('55555555-5555-5555-5555-555555555504', '[{"url":"https://docs.google.com/document/d/x"},{"url":"https://www.instagram.com/reel/abc/","title":"My first reel"}]');
  PERFORM t.ok((j->>'on_time')::boolean AND (j->>'awarded')::int = 150, '6.3 on time: +150', j::text);
  PERFORM t.err($q$SELECT luca_submit('55555555-5555-5555-5555-555555555504', '[{"url":"https://a.b/c"},{"url":"https://a.b/d"}]')$q$, 'already submitted', '6.4 one submission per assignment');
  j := luca_submit('55555555-5555-5555-5555-555555555505', '[{"url":"https://docs.google.com/document/d/y"}]');
  PERFORM t.ok((j->>'awarded')::int = 50, '6.5 an assignment''s own coin value wins (+50)');
  j := luca_submit('55555555-5555-5555-5555-555555555503', '[{"url":"https://docs.google.com/document/d/late"}]');
  PERFORM t.ok(NOT (j->>'on_time')::boolean AND (j->>'awarded')::int = 0, '6.6 late work is taken, without coins');
  PERFORM t.err($q$SELECT luca_submit('55555555-5555-5555-5555-555555555509', '[{"url":null},{"url":"https://www.instagram.com/lena"}]')$q$, 'sign the contract first', '6.7 the contract must be signed before handing it in');
  PERFORM t.err($q$SELECT luca_sign_contract('luca-c3', 'L')$q$, '^name$', '6.8 a signature needs a real name');
  PERFORM luca_sign_contract('luca-c3', 'Lena One');
  PERFORM t.ok((luca_room('luca-c3')->'me'->>'contract_name') = 'Lena One', '6.9 the signature is stored');
  j := luca_submit('55555555-5555-5555-5555-555555555509', '[{"url":null},{"url":"https://www.instagram.com/lena"}]');
  PERFORM t.ok(j ? 'id', '6.10 signed contract handed in');
  PERFORM t.err($q$SELECT luca_desk('luca-c3')$q$, 'staff|mentor|admin|42501|permission', '6.11 learners cannot open the mentor desk');
  -- The mentor's call
  PERFORM t.as('00000000-0000-0000-0000-0000000000c1');
  d := luca_desk('luca-c3');
  PERFORM t.ok(jsonb_array_length(d->'submissions') = 4 AND jsonb_array_length(d->'assignments') = 4, '6.12 the desk lists submissions and assignment titles');
  PERFORM t.ok(NOT (d->>'is_admin')::boolean AND (d->'members'->0->>'email') IS NULL, '6.13 a mentor sees no emails or phones');
  sid := (SELECT (s->>'id')::uuid FROM jsonb_array_elements(d->'submissions') s WHERE s->>'assignment_id' = '55555555-5555-5555-5555-555555555504');
  PERFORM t.err(format($q$SELECT luca_review(%L, 'maybe', '{}', NULL)$q$, sid), '^verdict$', '6.14 only Ship, Fix or Hold');
  PERFORM luca_review(sid, 'fix', ARRAY['Move the hook to the first line.', '  '], now() + interval '1 day');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  j := (SELECT s FROM jsonb_array_elements(luca_room('luca-c3')->'submissions') s WHERE s->>'id' = sid::text);
  PERFORM t.ok(j->>'verdict' = 'fix' AND jsonb_array_length(j->'notes') = 1 AND j->>'fix_due_at' IS NOT NULL, '6.15 the learner sees Fix, the note and the due time (blank notes dropped)');
  PERFORM t.err($q$SELECT luca_submit_fix('55555555-5555-5555-5555-555555555505', 'https://docs.google.com/x')$q$, 'no fix was asked', '6.16 a fix only where one was asked');
  PERFORM luca_submit_fix('55555555-5555-5555-5555-555555555504', 'https://docs.google.com/document/d/x-fixed');
  j := (SELECT s FROM jsonb_array_elements(luca_room('luca-c3')->'submissions') s WHERE s->>'id' = sid::text);
  PERFORM t.ok(j->>'verdict' = 'pending' AND (j->>'was_fix')::boolean AND j->>'fix_url' LIKE '%x-fixed', '6.17 the fix goes back for review');
  PERFORM t.as('00000000-0000-0000-0000-0000000000c1');
  PERFORM luca_review(sid, 'ship', ARRAY['Hook lands now.'], NULL);
  PERFORM t.me();
  PERFORM t.ok(EXISTS (SELECT 1 FROM luca_coin_ledger WHERE member_id = t.mid('00000000-0000-0000-0000-0000000000b1') AND rule = 'ship' AND amount = 100), '6.18 Ship pays +100');
  PERFORM t.ok((SELECT count(*) FROM notifications WHERE user_id = '00000000-0000-0000-0000-0000000000b1' AND type = 'luca_verdict') = 2, '6.19 each call reaches the learner as a notification');
  PERFORM t.as('00000000-0000-0000-0000-0000000000c1');
  PERFORM luca_review(sid, 'ship', ARRAY['Again'], NULL);
  PERFORM t.me();
  PERFORM t.ok((SELECT count(*) FROM luca_coin_ledger WHERE member_id = t.mid('00000000-0000-0000-0000-0000000000b1') AND rule = 'ship') = 1, '6.20 a repeated Ship pays once');
  PERFORM t.as('00000000-0000-0000-0000-0000000000f1');
  PERFORM t.err(format($q$SELECT luca_review(%L, 'hold', '{}', NULL)$q$, sid), 'staff|mentor|admin|42501|not found', '6.21 an outsider cannot make a call');
  PERFORM t.me();
END $$;

-- ---------------------------------------------------------------------------
-- 7. The Sprint (Track A posts, Track B logs) and Sprint calls
-- ---------------------------------------------------------------------------
DO $$ DECLARE j jsonb; pid uuid; BEGIN
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  PERFORM t.err($q$SELECT luca_sprint_log('luca-c3', 'post', 'nope', NULL, NULL)$q$, '^link$', '7.1 a post needs a link');
  PERFORM t.err($q$SELECT luca_sprint_log('luca-c3', 'log', NULL, 'Shot three hooks', NULL)$q$, 'Track A posts every day', '7.2 Track A cannot log instead of posting');
  j := luca_sprint_log('luca-c3', 'post', 'https://www.instagram.com/reel/day9/', NULL, 'Day 9');
  PERFORM t.ok((j->>'day')::int = 9 AND (j->>'awarded')::int = 250, '7.3 day 9 post: +250', j::text);
  PERFORM t.err($q$SELECT luca_sprint_log('luca-c3', 'post', 'https://www.instagram.com/reel/again/', NULL, NULL)$q$, 'already in', '7.4 one entry a day');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b3');
  PERFORM luca_update_me('luca-c3', '{"niche":"Cooking for one"}');
  PERFORM t.me(); UPDATE luca_members SET track = 'B' WHERE id = t.mid('00000000-0000-0000-0000-0000000000b3');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b3');
  PERFORM t.err($q$SELECT luca_sprint_log('luca-c3', 'log', NULL, 'no', NULL)$q$, '^log$', '7.5 a log needs a real line');
  j := luca_sprint_log('luca-c3', 'log', NULL, 'Scripted Thursday''s post', NULL);
  PERFORM t.ok((j->>'awarded')::int = 50, '7.6 Track B daily log: +50', j::text);
  PERFORM t.as('00000000-0000-0000-0000-0000000000c1');
  pid := (SELECT (p->>'id')::uuid FROM jsonb_array_elements(luca_desk('luca-c3')->'sprint_posts') p WHERE p->>'kind' = 'post' LIMIT 1);
  PERFORM luca_sprint_verdict(pid, 'ship', 'Strong open.');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  PERFORM t.ok((luca_room('luca-c3')->'sprint_posts'->0->>'verdict') = 'ship', '7.7 the mentor''s Sprint call reaches the learner');
  PERFORM t.me();
  UPDATE luca_programs SET sprint = sprint || jsonb_build_object('starts_on', (now() AT TIME ZONE 'Asia/Kolkata')::date + 5) WHERE slug = 'luca-c3';
  PERFORM t.as('00000000-0000-0000-0000-0000000000b2');
  PERFORM t.err($q$SELECT luca_sprint_log('luca-c3', 'post', 'https://www.instagram.com/reel/x/', NULL, NULL)$q$, 'not running', '7.8 no Sprint entries outside the Sprint');
  PERFORM t.me();
  UPDATE luca_programs SET sprint = sprint || jsonb_build_object('starts_on', (now() AT TIME ZONE 'Asia/Kolkata')::date - 8) WHERE slug = 'luca-c3';
END $$;

-- ---------------------------------------------------------------------------
-- 8. Clans: forming, feedback, nudges
-- ---------------------------------------------------------------------------
DO $$ DECLARE j jsonb; ref text; BEGIN
  PERFORM t.as('00000000-0000-0000-0000-0000000000c1');
  PERFORM t.err($q$SELECT luca_form_clans('luca-c3', '{}', 4, false)$q$, 'admins only', '8.1 only admins form Clans');
  PERFORM t.as('00000000-0000-0000-0000-0000000000a1');
  PERFORM t.err($q$SELECT luca_form_clans('luca-c3', '{}', 1, false)$q$, '^size$', '8.2 a Clan needs at least two');
  j := luca_form_clans('luca-c3', ARRAY['Hookline','Cutaway'], 4, false);
  PERFORM t.ok((j->>'assigned')::int >= 4, '8.3 everyone without a Clan is placed', j::text);
  PERFORM t.me();
  PERFORM t.ok(NOT EXISTS (SELECT 1 FROM luca_members WHERE program_id = '22222222-2222-2222-2222-222222222222' AND clan_id IS NULL), '8.4 no one is left out');
  -- Put Lena and Lou together for the social checks, Leo elsewhere.
  UPDATE luca_members SET clan_id = '66666666-6666-6666-6666-666666666661' WHERE id IN (t.mid('00000000-0000-0000-0000-0000000000b1'), t.mid('00000000-0000-0000-0000-0000000000b2'));
  UPDATE luca_members SET clan_id = '66666666-6666-6666-6666-666666666662' WHERE id = t.mid('00000000-0000-0000-0000-0000000000b3');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b2');
  j := luca_room('luca-c3');
  PERFORM t.ok((j->>'clans_open')::boolean AND jsonb_array_length(j->'clan_feed') >= 1, '8.5 Lou sees Lena''s posts in the Clan feed');
  ref := (SELECT f->>'ref' FROM jsonb_array_elements(j->'clan_feed') f WHERE f->>'ref' LIKE 'sprint:%' LIMIT 1);
  j := luca_feedback('luca-c3', t.mid('00000000-0000-0000-0000-0000000000b1'), ref, ARRAY['Hook landed'], 'Cut the first second.');
  PERFORM t.ok((j->>'awarded')::int = 25, '8.6 feedback on a clanmate''s post: +25', j::text);
  PERFORM t.err(format($q$SELECT luca_feedback('luca-c3', %L, %L, ARRAY['Again'], NULL)$q$, t.mid('00000000-0000-0000-0000-0000000000b1'), ref), 'already sent', '8.7 one feedback per post');
  PERFORM t.err(format($q$SELECT luca_feedback('luca-c3', %L, 'sprint:00000000-0000-0000-0000-000000000000', ARRAY['x'], NULL)$q$, t.mid('00000000-0000-0000-0000-0000000000b1')), 'post not found', '8.8 feedback on a made-up post is refused');
  PERFORM t.err(format($q$SELECT luca_feedback('luca-c3', %L, %L, '{}', '  ')$q$, t.mid('00000000-0000-0000-0000-0000000000b1'), ref), 'say something', '8.9 empty feedback is refused');
  PERFORM t.err(format($q$SELECT luca_feedback('luca-c3', %L, %L, ARRAY['x'], NULL)$q$, t.mid('00000000-0000-0000-0000-0000000000b2'), ref), 'member not found', '8.10 no feedback to yourself');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b3');
  PERFORM t.err(format($q$SELECT luca_feedback('luca-c3', %L, %L, ARRAY['x'], NULL)$q$, t.mid('00000000-0000-0000-0000-0000000000b1'), ref), 'your Clan', '8.11 feedback is only within your Clan');
  PERFORM t.err(format($q$SELECT luca_nudge('luca-c3', %L)$q$, t.mid('00000000-0000-0000-0000-0000000000b1')), 'your Clan', '8.12 nudges are only within your Clan');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  j := luca_nudge('luca-c3', t.mid('00000000-0000-0000-0000-0000000000b2'));
  PERFORM t.ok((j->>'sent')::boolean, '8.13 a nudge is sent');
  j := luca_nudge('luca-c3', t.mid('00000000-0000-0000-0000-0000000000b2'));
  PERFORM t.ok(NOT (j->>'sent')::boolean, '8.14 once a day per person');
  PERFORM t.me();
  PERFORM t.ok(EXISTS (SELECT 1 FROM notifications WHERE user_id = '00000000-0000-0000-0000-0000000000b2' AND type = 'luca_nudge')
           AND EXISTS (SELECT 1 FROM notifications WHERE user_id = '00000000-0000-0000-0000-0000000000b1' AND type = 'luca_feedback'), '8.15 nudge and feedback notify');
END $$;

-- ---------------------------------------------------------------------------
-- 9. Hot seat, recording notes and progress
-- ---------------------------------------------------------------------------
DO $$ DECLARE j jsonb; nid uuid; BEGIN
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  PERFORM t.err(format($q$SELECT luca_hotseat_set('44444444-4444-4444-4444-444444444441', ARRAY[%L]::uuid[])$q$, t.mid('00000000-0000-0000-0000-0000000000b1')), 'staff|mentor|admin|42501|not found', '9.1 learners cannot set the hot seat');
  PERFORM t.as('00000000-0000-0000-0000-0000000000c1');
  PERFORM luca_hotseat_set('44444444-4444-4444-4444-444444444441', ARRAY[t.mid('00000000-0000-0000-0000-0000000000b2'), t.mid('00000000-0000-0000-0000-0000000000b1')]);
  PERFORM t.err($q$SELECT luca_hotseat_set('44444444-4444-4444-4444-444444444441', ARRAY['00000000-0000-0000-0000-000000000000']::uuid[])$q$, 'not in this cohort', '9.2 only this cohort''s people');
  PERFORM luca_hotseat_mark('44444444-4444-4444-4444-444444444441', t.mid('00000000-0000-0000-0000-0000000000b1'), 1830);
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  j := (SELECT h FROM jsonb_array_elements(luca_room('luca-c3')->'hotseat') h WHERE h->>'member_id' = t.mid('00000000-0000-0000-0000-0000000000b1')::text);
  PERFORM t.ok((j->>'position')::int = 2 AND (j->>'rec_at_sec')::int = 1830, '9.3 Lena is #2 and her moment is marked at 30:30');
  PERFORM t.err($q$SELECT luca_note_add('44444444-4444-4444-4444-444444444403', 10, '   ')$q$, '^note$', '9.4 an empty note is refused');
  j := luca_note_add('44444444-4444-4444-4444-444444444403', 95, 'Hook rule: say the result first.');
  nid := (j->>'id')::uuid;
  PERFORM t.ok(jsonb_array_length(luca_notes('44444444-4444-4444-4444-444444444403')) = 1, '9.5 a timestamped note is saved');
  PERFORM luca_rec_progress('44444444-4444-4444-4444-444444444403', 600);
  PERFORM luca_rec_progress('44444444-4444-4444-4444-444444444403', 120);
  PERFORM t.ok((SELECT (p->>'seconds')::int FROM jsonb_array_elements(luca_room('luca-c3')->'rec_progress') p WHERE p->>'session_id' = '44444444-4444-4444-4444-444444444403') = 600, '9.6 progress keeps the furthest point');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b2');
  PERFORM t.ok(jsonb_array_length(luca_notes('44444444-4444-4444-4444-444444444403')) = 0, '9.7 notes are private');
  PERFORM luca_note_delete(nid);
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  PERFORM t.ok(jsonb_array_length(luca_notes('44444444-4444-4444-4444-444444444403')) = 1, '9.8 nobody else can delete your note');
  PERFORM luca_note_delete(nid);
  PERFORM t.ok(jsonb_array_length(luca_notes('44444444-4444-4444-4444-444444444403')) = 0, '9.9 you can delete your own');
  PERFORM t.me();
END $$;

-- ---------------------------------------------------------------------------
-- 10. You: profile, reminders prefs, calendar feed
-- ---------------------------------------------------------------------------
DO $$ DECLARE j jsonb; tok uuid; tok2 uuid; BEGIN
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  PERFORM t.err($q$SELECT luca_update_me('luca-c3', '{"niche":"x"}')$q$, '^niche$', '10.1 niche must be a real line');
  PERFORM luca_update_me('luca-c3', '{"niche":"Money for your first salary","handle":"@lena","prefs":{"remind_10_min":false,"remind_day_before":"yes","hacked":true}}');
  j := luca_room('luca-c3')->'me';
  PERFORM t.ok(j->>'niche' = 'Money for your first salary' AND j->>'handle' = '@lena', '10.2 niche and handle saved');
  PERFORM t.ok(j->'prefs' = '{"remind_10_min":false}'::jsonb, '10.3 only known reminder switches with true/false are kept', (j->'prefs')::text);
  tok := (j->>'cal_token')::uuid;
  PERFORM t.me();
  PERFORM t.ok(jsonb_array_length(luca_calendar_feed(tok)->'sessions') = 6 AND jsonb_array_length(luca_calendar_feed(tok)->'assignments') = 4, '10.4 the calendar feed has every session and deadline');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  tok2 := luca_rotate_cal_token('luca-c3');
  PERFORM t.me();
  PERFORM t.ok(luca_calendar_feed(tok) IS NULL AND luca_calendar_feed(tok2) IS NOT NULL, '10.5 a new link kills the old one');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  PERFORM t.err(format($q$SELECT luca_calendar_feed(%L)$q$, tok2), 'permission denied', '10.6 the feed lookup is server-only');
  PERFORM t.me();
  UPDATE enrolments SET status = 'revoked' WHERE user_id = '00000000-0000-0000-0000-0000000000b2';
  PERFORM t.ok(luca_calendar_feed((SELECT cal_token FROM luca_members WHERE id = t.mid('00000000-0000-0000-0000-0000000000b2'))) IS NULL, '10.7 a revoked seat stops the calendar feed');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b2');
  PERFORM t.ok(luca_room('luca-c3')->>'access' = 'none', '10.8 a revoked seat closes the room');
  PERFORM t.err($q$SELECT luca_join_session('44444444-4444-4444-4444-444444444441')$q$, '.', '10.9 and its actions');
  PERFORM t.me();
  UPDATE enrolments SET status = 'active' WHERE user_id = '00000000-0000-0000-0000-0000000000b2';
END $$;

-- ---------------------------------------------------------------------------
-- 11. Coins and streaks add up; the board
-- ---------------------------------------------------------------------------
DO $$ DECLARE j jsonb; BEGIN
  PERFORM t.ok(NOT EXISTS (
    SELECT 1 FROM luca_members m WHERE m.program_id = '22222222-2222-2222-2222-222222222222' AND NOT m.is_ghost
       AND m.coins <> COALESCE((SELECT sum(amount) FROM luca_coin_ledger l WHERE l.member_id = m.id), 0)), '11.1 every balance equals its ledger');
  PERFORM t.ok((SELECT count(*) = count(DISTINCT (member_id, ref_key)) FROM luca_coin_ledger), '11.2 no action was paid twice');
  PERFORM t.ok((SELECT streak FROM luca_members WHERE id = t.mid('00000000-0000-0000-0000-0000000000b1')) = 1, '11.3 many actions in one day are a 1-day streak');
  UPDATE luca_members SET streak = 6, streak_day = (now() AT TIME ZONE 'Asia/Kolkata')::date - 1 WHERE id = t.mid('00000000-0000-0000-0000-0000000000b2');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b2');
  PERFORM luca_join_session('44444444-4444-4444-4444-444444444441');
  PERFORM t.me();
  PERFORM t.ok((SELECT streak FROM luca_members WHERE id = t.mid('00000000-0000-0000-0000-0000000000b2')) = 7
           AND EXISTS (SELECT 1 FROM luca_coin_ledger WHERE member_id = t.mid('00000000-0000-0000-0000-0000000000b2') AND rule = 'streak_bonus' AND amount = 300), '11.4 the 7th day in a row pays the +300 bonus');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  j := luca_room('luca-c3');
  PERFORM t.ok(jsonb_array_length(j->'members') >= 5 AND jsonb_array_length(j->'clans') = 2, '11.5 the board and Clan scores reach every learner');
  PERFORM t.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'members') m WHERE m ? 'email' OR m ? 'phone' OR m ? 'user_id'), '11.6 the board carries no contact details');
  PERFORM t.ok(jsonb_array_length(j->'ledger') > 0, '11.7 coin history is there');
  PERFORM t.as('00000000-0000-0000-0000-0000000000c1');
  PERFORM t.err(format($q$SELECT luca_award_manual(%L, 'bonus', 100, 'Helped')$q$, t.mid('00000000-0000-0000-0000-0000000000b1')), 'admins only', '11.8 mentors cannot hand out coins');
  PERFORM t.as('00000000-0000-0000-0000-0000000000a1');
  j := luca_award_manual(t.mid('00000000-0000-0000-0000-0000000000b1'), 'bonus', 100, 'Helped the Clan');
  PERFORM t.ok((j->>'awarded')::int = 100, '11.9 an admin can award coins by hand');
  PERFORM t.me();
END $$;

-- ---------------------------------------------------------------------------
-- 12. The tables themselves are closed to the API
-- ---------------------------------------------------------------------------
DO $$ DECLARE n int; BEGIN
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  PERFORM t.ok((SELECT count(*) FROM luca_members) = 0, '12.1 learners read no member rows directly (RLS)');
  PERFORM t.err($q$UPDATE luca_members SET coins = 99999$q$, 'permission denied', '12.2 learners cannot write their coins');
  PERFORM t.err($q$INSERT INTO luca_coin_ledger (program_id, member_id, amount, rule, reason, ref_key) VALUES ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 1, 'x', 'x', 'x')$q$, 'permission denied', '12.3 nor the ledger');
  UPDATE luca_sessions SET zoom_url = 'https://evil.example' WHERE id = '44444444-4444-4444-4444-444444444441';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM t.ok(n = 0, '12.4 nor sessions (RLS: zero rows change)', n::text);
  PERFORM t.err($q$SELECT luca__award('22222222-2222-2222-2222-222222222222', 'x', 'x')$q$, 'permission denied', '12.5 the coin mint is not callable');
  PERFORM t.as(NULL);
  PERFORM t.err($q$SELECT luca_submit('55555555-5555-5555-5555-555555555504', '[]')$q$, 'permission denied', '12.6 anon cannot call learner functions');
  PERFORM t.as('00000000-0000-0000-0000-0000000000a1');
  PERFORM t.ok((SELECT count(*) FROM luca_programs) = 2, '12.7 admins can read the config tables');
  UPDATE luca_sessions SET zoom_url = 'https://zoom.us/j/141' WHERE id = '44444444-4444-4444-4444-444444444441';
  PERFORM t.ok(FOUND, '12.8 admins can edit sessions (the console)');
  PERFORM t.err($q$UPDATE luca_members SET coins = 1$q$, 'permission denied', '12.9 even admins change coins only through the server');
  PERFORM t.me();
END $$;

-- ---------------------------------------------------------------------------
-- 13. Reminders (in-app + email), off by default
-- ---------------------------------------------------------------------------
DO $$ DECLARE j jsonb; BEGIN
  j := luca_run_reminders();
  PERFORM t.ok(j->>'skipped' = 'reminders off', '13.1 reminders do nothing until switched on');
  UPDATE luca_runtime_config SET reminders_enabled = true;
  j := luca_run_reminders();
  PERFORM t.ok((j->>'sent')::int > 0, '13.2 reminders go out once on', j::text);
  PERFORM t.ok(EXISTS (SELECT 1 FROM luca_reminders_sent r WHERE r.member_id = t.mid('00000000-0000-0000-0000-0000000000b2') AND r.key = 'soon:44444444-4444-4444-4444-444444444442'), '13.3 "starting in 12 minutes" reached Lou');
  PERFORM t.ok(NOT EXISTS (SELECT 1 FROM luca_reminders_sent r WHERE r.member_id = t.mid('00000000-0000-0000-0000-0000000000b1') AND r.key LIKE 'soon:%'), '13.4 Lena turned that kind off, so she got none');
  PERFORM t.ok(EXISTS (SELECT 1 FROM luca_reminders_sent r WHERE r.member_id = t.mid('00000000-0000-0000-0000-0000000000b2') AND r.key = 'due:55555555-5555-5555-5555-555555555505')
           AND NOT EXISTS (SELECT 1 FROM luca_reminders_sent r WHERE r.member_id = t.mid('00000000-0000-0000-0000-0000000000b1') AND r.key LIKE 'due:%'), '13.5 deadline reminders skip people who handed in');
  PERFORM t.ok(EXISTS (SELECT 1 FROM luca_reminders_sent r WHERE r.key LIKE 'day:44444444-4444-4444-4444-444444444443'), '13.6 the day-before reminder for tomorrow''s session');
  PERFORM t.ok((SELECT count(*) FROM e2e_mail WHERE payload->>'label' = 'luca_reminder' AND payload->>'to' LIKE '%@e2e.test') > 0, '13.7 emails are queued on the real email queue');
  PERFORM t.ok(NOT EXISTS (SELECT 1 FROM luca_reminders_sent r JOIN luca_members m ON m.id = r.member_id WHERE m.is_ghost OR m.program_id <> '22222222-2222-2222-2222-222222222222'), '13.8 never the demo cohort or sample people');
  j := luca_run_reminders();
  PERFORM t.ok((j->>'sent')::int = 0, '13.9 running again sends nothing twice');
  UPDATE luca_runtime_config SET reminders_enabled = false;
END $$;

-- ---------------------------------------------------------------------------
-- 14. The demo cohort: day switcher, simulated money, display clock
-- ---------------------------------------------------------------------------
DO $$ DECLARE j jsonb; st text; ok boolean := true; bad text := ''; BEGIN
  PERFORM t.as('00000000-0000-0000-0000-0000000000f1');
  PERFORM t.err($q$SELECT luca_demo_scenario('luca-demo', 'week5')$q$, 'not found|demo only|42501', '14.1 outsiders cannot drive the demo');
  PERFORM t.as('00000000-0000-0000-0000-0000000000a1');
  PERFORM t.err($q$SELECT luca_demo_scenario('luca-c3', 'week5')$q$, 'demo only', '14.2 the day switcher never touches a real cohort');
  FOREACH st IN ARRAY ARRAY['browse','applied','decision','prestart','orientation','week1','week5','sprint','demo','alumni'] LOOP
    BEGIN
      PERFORM luca_demo_scenario('luca-demo', st);
      j := luca_room('luca-demo');
      IF j IS NULL OR (st IN ('prestart','orientation','week1','week5','sprint','demo','alumni') AND j->>'access' <> 'learner')
         OR (st = 'browse' AND j->>'access' <> 'none') OR (st IN ('applied','decision') AND j->>'access' <> 'applicant') THEN
        ok := false; bad := bad || st || '=' || COALESCE(j->>'access', 'null') || ' ';
      END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; bad := bad || st || ': ' || SQLERRM || ' ';
    END;
  END LOOP;
  PERFORM t.ok(ok, '14.3 all ten demo days build and open at the right stage', bad);
  PERFORM luca_demo_scenario('luca-demo', 'orientation');
  PERFORM t.ok(EXISTS (SELECT 1 FROM jsonb_array_elements(luca_room('luca-demo')->'sessions') s WHERE (s->>'starts_at')::timestamptz <= now() AND (s->>'ends_at')::timestamptz > now()), '14.4 on "Orientation, live" a session is really live');
  j := luca_demo_clock('luca-demo');
  PERFORM t.ok(j ? 'display_shift_secs', '14.5 the demo display clock is there');
  PERFORM luca_demo_scenario('luca-demo', 'browse');
  PERFORM luca_demo_advance('luca-demo', 'reset');
  PERFORM t.err($q$SELECT luca_demo_advance('luca-demo', 'pay_app_fee')$q$, 'apply first', '14.6 demo: pay needs an application');
  PERFORM luca_apply('luca-demo', '{"niche":"Money for your first salary","track":"A","why":"No plan yet","hours":true}');
  PERFORM luca_demo_advance('luca-demo', 'pay_app_fee');
  PERFORM t.err($q$SELECT luca_demo_advance('luca-demo', 'book', now() - interval '1 hour')$q$, 'future', '14.7 demo: interviews are booked in the future');
  PERFORM luca_demo_advance('luca-demo', 'book', now() + interval '2 days');
  PERFORM luca_demo_advance('luca-demo', 'decide');
  PERFORM t.ok(luca_room('luca-demo')->'application'->>'status' = 'accepted', '14.8 demo: application → fee → interview → accepted');
  PERFORM luca_demo_advance('luca-demo', 'pay_deposit');
  PERFORM t.ok(luca_room('luca-demo')->>'access' = 'learner', '14.9 demo: the simulated deposit opens the cohort');
  PERFORM luca_demo_advance('luca-demo', 'pay_balance');
  PERFORM t.ok(luca_room('luca-demo')->'application'->>'status' = 'balance_paid', '14.10 demo: balance paid');
  PERFORM t.as('00000000-0000-0000-0000-0000000000b1');
  PERFORM t.err($q$SELECT luca_demo_advance('luca-demo', 'reset')$q$, 'not found|demo only|42501', '14.11 learners cannot touch demo money');
  PERFORM t.me();
  PERFORM t.ok(NOT EXISTS (SELECT 1 FROM e2e_mail WHERE payload->>'to' = 'ada.admin@e2e.test'), '14.12 the demo never emails anyone');
END $$;

-- ---------------------------------------------------------------------------
-- 15. Admin and mentor extras
-- ---------------------------------------------------------------------------
DO $$ DECLARE j jsonb; BEGIN
  PERFORM t.as('00000000-0000-0000-0000-0000000000a1');
  j := luca_desk('luca-c3');
  PERFORM t.ok((j->>'is_admin')::boolean AND (j->'members'->0->>'email') IS NOT NULL, '15.1 admins see contact details on the desk');
  PERFORM t.ok((SELECT count(*) FROM jsonb_array_elements(luca_my_programs()) p WHERE (p->>'is_staff')::boolean) = 2, '15.2 admins see every cohort as staff in My cohorts');
  PERFORM t.as('00000000-0000-0000-0000-0000000000c1');
  PERFORM t.ok((SELECT count(*) FROM jsonb_array_elements(luca_my_programs())) = 1, '15.3 a mentor sees only their own cohort');
  PERFORM t.err($q$SELECT luca_desk('luca-demo')$q$, 'staff|mentor|admin|42501|not found', '15.4 a mentor of one cohort cannot open another''s desk');
  PERFORM t.me();
END $$;
