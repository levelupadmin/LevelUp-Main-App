-- LUCA step 4 of the SQL editor runs. Safe to re-run. Adds one table
-- (luca_reminders_sent), three functions and a pg_cron job that does nothing
-- until luca_runtime_config.reminders_enabled is set to true.

-- ============================================================================
-- LUCA — reminders (in-app + email), run by pg_cron every 10 minutes
--
-- OFF BY DEFAULT. luca_run_reminders() returns before reading a single member
-- unless BOTH luca_runtime_config.reminders_enabled AND the LUCA surface
-- switch are on. Demo cohorts never get reminders.
--
-- What it sends, to learners of enabled real cohorts, each at most once
-- (luca_reminders_sent is the claim ledger), and only if the learner has not
-- turned that kind off in You → Reminders:
--   · remind_day_before  a session starts in 23–25 hours
--   · remind_10_min      a session starts in 5–20 minutes
--   · remind_deadline    an assignment is due in 1–6 hours and isn't in
--   · remind_sprint      Sprint day, after 8 PM cohort time, nothing posted
-- In-app: a row in public.notifications (the app's bell). Email: the same
-- `transactional_emails` pgmq queue process-email-queue already drains, with
-- the suppression list honoured. WhatsApp is not built (features.whatsapp).
--
-- Additive and idempotent. Rollback: ops/luca/rollback.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.luca_reminders_sent (
  member_id uuid NOT NULL REFERENCES public.luca_members(id) ON DELETE CASCADE,
  key text NOT NULL,
  emailed boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, key)
);
ALTER TABLE public.luca_reminders_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.luca_reminders_sent FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.luca_reminders_sent TO authenticated;
GRANT ALL ON TABLE public.luca_reminders_sent TO service_role;
DROP POLICY IF EXISTS luca_reminders_sent_admin_read ON public.luca_reminders_sent;
CREATE POLICY luca_reminders_sent_admin_read ON public.luca_reminders_sent
  FOR SELECT TO authenticated USING (public.is_admin());

-- Minimal HTML escaping for interpolated text.
CREATE OR REPLACE FUNCTION public.luca__html(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT replace(replace(replace(replace(COALESCE(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;
REVOKE ALL ON FUNCTION public.luca__html(text) FROM PUBLIC, anon, authenticated;

-- Claim one reminder for one member, then send it in-app and by email.
-- Returns true only when this call sent it.
CREATE OR REPLACE FUNCTION public.luca__remind(
  p_member uuid, p_key text, p_pref text, p_title text, p_body text, p_path text, p_cta text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mem public.luca_members;
  v_email text;
  v_name text;
  v_new boolean := false;
  v_site text := 'https://app.leveluplearning.in';
  v_url text;
  v_html text;
BEGIN
  SELECT * INTO v_mem FROM public.luca_members WHERE id = p_member;
  IF NOT FOUND OR v_mem.is_ghost OR v_mem.user_id IS NULL THEN RETURN false; END IF;
  -- The learner's own switch (every kind defaults on).
  IF NOT COALESCE((v_mem.prefs->>p_pref)::boolean, true) THEN RETURN false; END IF;

  INSERT INTO public.luca_reminders_sent (member_id, key) VALUES (p_member, p_key)
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_new;
  IF NOT COALESCE(v_new, false) THEN RETURN false; END IF;

  PERFORM public.luca__notify(p_member, 'luca_reminder', p_title, p_body, p_path);

  SELECT u.email, COALESCE(NULLIF(split_part(trim(u.full_name), ' ', 1), ''), 'there')
    INTO v_email, v_name
    FROM public.users u WHERE u.id = v_mem.user_id;
  IF v_email IS NULL OR position('@' IN v_email) = 0 THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.suppressed_emails s WHERE lower(s.email) = lower(v_email)) THEN RETURN true; END IF;

  v_url := v_site || p_path;
  v_html := '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">'
    || '<p style="margin:0 0 12px">Hi ' || public.luca__html(v_name) || ',</p>'
    || '<p style="margin:0 0 6px;font-size:18px;font-weight:700">' || public.luca__html(p_title) || '</p>'
    || '<p style="margin:0 0 20px;color:#444">' || public.luca__html(p_body) || '</p>'
    || '<p style="margin:0 0 24px"><a href="' || public.luca__html(v_url) || '" style="display:inline-block;background:#f0561a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">'
    || public.luca__html(p_cta) || '</a></p>'
    || '<p style="margin:0;color:#888;font-size:12px">You get this because you''re in a LevelUp live cohort. Turn reminders off any time in the app: You, then Reminders.</p>'
    || '</div>';

  PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
    'run_id', gen_random_uuid(),
    'to', v_email,
    'from', 'LevelUp Learning <noreply@leveluplearning.in>',
    'sender_domain', 'leveluplearning.in',
    'subject', p_title,
    'html', v_html,
    'text', 'Hi ' || v_name || E',\n\n' || p_title || E'\n' || p_body || E'\n\n' || p_cta || ': ' || v_url
            || E'\n\nTurn reminders off in the app: You, then Reminders.',
    'purpose', 'transactional',
    'label', 'luca_reminder',
    'idempotency_key', 'luca:' || p_member || ':' || p_key,
    'message_id', gen_random_uuid(),
    'queued_at', now()));
  UPDATE public.luca_reminders_sent SET emailed = true WHERE member_id = p_member AND key = p_key;
  RETURN true;
EXCEPTION WHEN undefined_table OR undefined_function THEN
  -- No email infrastructure on this database: the in-app reminder still stands.
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.luca__remind(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.luca_run_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_on boolean;
  p public.luca_programs;
  s public.luca_sessions;
  a public.luca_assignments;
  m public.luca_members;
  v_sent integer := 0;
  v_local timestamp;
  v_day integer;
  v_start date;
  v_mins integer;
  v_learners uuid[];
BEGIN
  SELECT reminders_enabled INTO v_on FROM public.luca_runtime_config WHERE singleton;
  IF NOT COALESCE(v_on, false) THEN RETURN jsonb_build_object('skipped', 'reminders off'); END IF;
  IF NOT public.luca__switch_on() THEN RETURN jsonb_build_object('skipped', 'surface off'); END IF;

  FOR p IN SELECT * FROM public.luca_programs WHERE enabled AND NOT is_demo LOOP
    -- Learners who still hold a seat.
    v_learners := ARRAY(
      SELECT lm.id FROM public.luca_members lm
       WHERE lm.program_id = p.id AND NOT lm.is_ghost AND lm.user_id IS NOT NULL
         AND public.luca__access(p.id, lm.user_id) = 'learner');
    CONTINUE WHEN cardinality(v_learners) = 0;

    -- Sessions: a day before, and just before.
    FOR s IN SELECT * FROM public.luca_sessions
              WHERE program_id = p.id AND starts_at BETWEEN now() + interval '5 minutes' AND now() + interval '25 hours' LOOP
      v_local := s.starts_at AT TIME ZONE p.timezone;
      IF s.starts_at >= now() + interval '23 hours' THEN
        FOR m IN SELECT lm.* FROM public.luca_members lm WHERE lm.id = ANY(v_learners) LOOP
          IF public.luca__remind(m.id, 'day:' || s.id, 'remind_day_before',
               'Tomorrow: ' || s.title,
               trim(to_char(v_local, 'Dy DD Mon, FMHH12:MI AM')) || '. Join from the app so you''re marked present.',
               '/luca/' || p.slug || '/session/' || s.id, 'See the session') THEN v_sent := v_sent + 1; END IF;
        END LOOP;
      ELSIF s.starts_at <= now() + interval '20 minutes' THEN
        v_mins := GREATEST(1, round(extract(epoch FROM (s.starts_at - now())) / 60)::integer);
        FOR m IN SELECT lm.* FROM public.luca_members lm WHERE lm.id = ANY(v_learners) LOOP
          IF public.luca__remind(m.id, 'soon:' || s.id, 'remind_10_min',
               s.title || ' starts in ' || v_mins || ' min',
               'Join from the app: it opens Zoom and marks you present.',
               '/luca/' || p.slug || '/session/' || s.id, 'Join from the app') THEN v_sent := v_sent + 1; END IF;
        END LOOP;
      END IF;
    END LOOP;

    -- Deadlines: 1 to 6 hours out, for whoever hasn't handed in.
    FOR a IN SELECT * FROM public.luca_assignments
              WHERE program_id = p.id AND due_at BETWEEN now() + interval '1 hour' AND now() + interval '6 hours' LOOP
      FOR m IN SELECT lm.* FROM public.luca_members lm
                WHERE lm.id = ANY(v_learners) AND NOT EXISTS (SELECT 1 FROM public.luca_submissions x WHERE x.assignment_id = a.id AND x.member_id = lm.id) LOOP
        IF public.luca__remind(m.id, 'due:' || a.id, 'remind_deadline',
             'Due at ' || trim(to_char(a.due_at AT TIME ZONE p.timezone, 'FMHH12:MI AM')) || ': ' || a.title,
             'Paste your links before then to keep the on-time coins.',
             '/luca/' || p.slug || '/assign/' || a.id, 'Paste your links') THEN v_sent := v_sent + 1; END IF;
      END LOOP;
    END LOOP;

    -- The Sprint: after 8 PM cohort time with nothing in today.
    v_start := NULLIF(p.sprint->>'starts_on', '')::date;
    IF COALESCE((p.features->>'sprint')::boolean, true) AND v_start IS NOT NULL THEN
      v_local := now() AT TIME ZONE p.timezone;
      v_day := (v_local::date - v_start) + 1;
      IF v_day BETWEEN 1 AND COALESCE((p.sprint->>'days')::integer, 21) AND extract(hour FROM v_local) >= 20 THEN
        FOR m IN SELECT lm.* FROM public.luca_members lm
                  WHERE lm.id = ANY(v_learners) AND NOT EXISTS (SELECT 1 FROM public.luca_sprint_posts sp WHERE sp.member_id = lm.id AND sp.day_n = v_day) LOOP
          IF public.luca__remind(m.id, 'sprint:' || v_day, 'remind_sprint',
               'Sprint day ' || v_day || ': today''s entry isn''t in',
               'Paste today''s post (or your log) before 11:59 PM to keep your streak.',
               '/luca/' || p.slug || '/sprint', 'Log today') THEN v_sent := v_sent + 1; END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('sent', v_sent);
END;
$$;
REVOKE ALL ON FUNCTION public.luca_run_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.luca_run_reminders() TO service_role;

-- Every 10 minutes. Harmless while reminders_enabled is false (returns at once).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'luca_reminders_every_10min';
    PERFORM cron.schedule('luca_reminders_every_10min', '*/10 * * * *', 'SELECT public.luca_run_reminders()');
  END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261007100400', 'luca_reminders', '{}')
ON CONFLICT (version) DO NOTHING;
