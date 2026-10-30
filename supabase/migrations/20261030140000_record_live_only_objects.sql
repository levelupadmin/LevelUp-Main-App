-- Record what exists: production objects that no migration in this repo defines.
--
-- Written on 2026-10-30 from the live definitions on production
-- (pg_get_functiondef, pg_attribute, pg_constraint, pg_indexes, pg_policies).
-- They were created out of band, most likely by the "tagmango_sync"
-- migration (20260807140000), which production recorded with no statements;
-- that file in this repo is an empty placeholder.
--
-- On production this is a no-op: tables and indexes use IF NOT EXISTS,
-- policies are created only when missing, and each function is replaced with
-- the body it already has. On a fresh database it creates them.
--
-- Left out on purpose:
--   * public.rls_auto_enable() and its event trigger ensure_rls. Supabase
--     creates these when "auto-enable RLS" is on in the dashboard.

-- ── public.tagmango_mangoes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tagmango_mangoes (
  mango_id text NOT NULL,
  title text,
  price_inr numeric(10,2),
  subscriber_count integer NOT NULL DEFAULT 0,
  offering_id uuid,
  decision_status text NOT NULL DEFAULT 'pending'::text,
  auto_mapped_from text,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tagmango_mangoes_pkey PRIMARY KEY (mango_id),
  CONSTRAINT tagmango_mangoes_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.offerings(id) ON DELETE SET NULL,
  CONSTRAINT tagmango_mangoes_decision_status_check CHECK ((decision_status = ANY (ARRAY['pending'::text, 'mapped'::text, 'ignored'::text]))),
  CONSTRAINT tagmango_mangoes_mapped_needs_offering CHECK (((decision_status <> 'mapped'::text) OR (offering_id IS NOT NULL)))
);

CREATE INDEX IF NOT EXISTS tagmango_mangoes_status_idx
  ON public.tagmango_mangoes USING btree (decision_status, subscriber_count DESC);

COMMENT ON TABLE public.tagmango_mangoes IS 'TagMango product (mango) → app offering. New batches land as pending and grant nothing until mapped. Read by the tagmango-sync edge function.';

ALTER TABLE public.tagmango_mangoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tagmango_mangoes' AND policyname = 'admins_all_tagmango_mangoes'
  ) THEN
    CREATE POLICY admins_all_tagmango_mangoes ON public.tagmango_mangoes
      FOR ALL USING (public.is_admin());
  END IF;
END $$;

-- ── public.tagmango_sync_runs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tagmango_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  status text NOT NULL DEFAULT 'running'::text,
  dry_run boolean NOT NULL DEFAULT false,
  subscribers_seen integer,
  mangoes_seen integer,
  new_mangoes integer,
  titles_resolved integer,
  auto_mapped integer,
  legacy_rows_added integer,
  enrolments_granted integer,
  error text,
  CONSTRAINT tagmango_sync_runs_pkey PRIMARY KEY (id),
  CONSTRAINT tagmango_sync_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'ok'::text, 'failed'::text, 'skipped'::text])))
);

CREATE INDEX IF NOT EXISTS tagmango_sync_runs_started_idx
  ON public.tagmango_sync_runs USING btree (started_at DESC);

ALTER TABLE public.tagmango_sync_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tagmango_sync_runs' AND policyname = 'admins_all_tagmango_sync_runs'
  ) THEN
    CREATE POLICY admins_all_tagmango_sync_runs ON public.tagmango_sync_runs
      FOR ALL USING (public.is_admin());
  END IF;
END $$;

-- ── Functions ───────────────────────────────────────────────────────────────
-- Bodies as pg_get_functiondef prints them on production. Each one runs as
-- SECURITY DEFINER and only service_role may execute it.

CREATE OR REPLACE FUNCTION public.admin_find_auth_user(p_email text, p_phone text)
 RETURNS TABLE(id uuid, email text, phone text, phone_confirmed boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$ select u.id, u.email::text, u.phone::text, (u.phone_confirmed_at is not null) from auth.users u where (p_phone is not null and p_phone <> '' and u.phone::text = p_phone) or (p_email is not null and p_email <> '' and lower(u.email::text) = lower(p_email)) order by (u.phone::text = p_phone) desc nulls last limit 5 $function$;

REVOKE ALL ON FUNCTION public.admin_find_auth_user(p_email text, p_phone text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_find_auth_user(p_email text, p_phone text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_legacy_enrolments_sweep(p_limit integer DEFAULT 5000)
 RETURNS TABLE(granted integer, claimed integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_granted integer := 0;
  v_claimed integer := 0;
BEGIN
  -- Drive from public.users (~1.5k rows), not legacy_enrolments (~84k).
  -- Normalising the phone on the LEGACY side made every row un-indexable and
  -- the statement timed out. Normalising the USER's phone into the +91XXXXXXXXXX
  -- shape legacy_enrolments already stores turns this into an equality lookup
  -- that rides legacy_enrolments_phone_unclaimed_idx. Email likewise matches
  -- exactly, as the claim trigger does, so it can use the email partial index.
  CREATE TEMP TABLE _sweep ON COMMIT DROP AS
  WITH u AS (
    SELECT
      id,
      email,
      CASE
        WHEN length(regexp_replace(COALESCE(phone,''), '\D', '', 'g')) = 10
          THEN '+91' || regexp_replace(phone, '\D', '', 'g')
        WHEN length(regexp_replace(COALESCE(phone,''), '\D', '', 'g')) = 12
         AND regexp_replace(phone, '\D', '', 'g') LIKE '91%'
          THEN '+' || regexp_replace(phone, '\D', '', 'g')
        ELSE phone
      END AS phone_norm
    FROM public.users
  ),
  hits AS (
    SELECT le.id AS legacy_id, le.offering_id, u.id AS user_id
    FROM u
    JOIN public.legacy_enrolments le ON le.phone = u.phone_norm
    WHERE u.phone_norm IS NOT NULL
      AND le.claimed_by_user_id IS NULL
      AND le.offering_id IS NOT NULL
    UNION
    SELECT le.id, le.offering_id, u.id
    FROM u
    JOIN public.legacy_enrolments le ON le.email = u.email
    WHERE u.email IS NOT NULL
      AND le.claimed_by_user_id IS NULL
      AND le.offering_id IS NOT NULL
  )
  SELECT * FROM hits LIMIT p_limit;

  WITH ins AS (
    INSERT INTO public.enrolments (user_id, offering_id, payment_order_id, status, source)
    SELECT DISTINCT s.user_id, s.offering_id, NULL, 'active', 'migration'
    FROM _sweep s
    ON CONFLICT (user_id, offering_id) WHERE status = 'active' DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_granted FROM ins;

  WITH upd AS (
    UPDATE public.legacy_enrolments le
    SET claimed_by_user_id = s.user_id,
        claimed_at         = now()
    FROM _sweep s
    WHERE le.id = s.legacy_id
      AND le.claimed_by_user_id IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_claimed FROM upd;

  RETURN QUERY SELECT v_granted, v_claimed;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_legacy_enrolments_sweep(p_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_legacy_enrolments_sweep(p_limit integer) TO service_role;

CREATE OR REPLACE FUNCTION public.tagmango_upsert_mangoes(p_mangoes jsonb)
 RETURNS TABLE(total integer, inserted integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_before integer;
  v_total  integer;
BEGIN
  SELECT count(*) INTO v_before FROM public.tagmango_mangoes;

  INSERT INTO public.tagmango_mangoes (mango_id, title, price_inr, subscriber_count, last_seen_at, updated_at)
  SELECT
    m->>'mango_id',
    NULLIF(m->>'title',''),
    NULLIF(m->>'price','')::numeric,
    COALESCE((m->>'subscriber_count')::integer, 0),
    now(), now()
  FROM jsonb_array_elements(p_mangoes) m
  WHERE NULLIF(m->>'mango_id','') IS NOT NULL
  ON CONFLICT (mango_id) DO UPDATE SET
    -- Only fill a title/price we did not already have, so a transient API
    -- blank cannot wipe a good value.
    title            = COALESCE(EXCLUDED.title, public.tagmango_mangoes.title),
    price_inr        = COALESCE(EXCLUDED.price_inr, public.tagmango_mangoes.price_inr),
    subscriber_count = EXCLUDED.subscriber_count,
    last_seen_at     = now(),
    updated_at       = now();

  SELECT count(*) INTO v_total FROM public.tagmango_mangoes;
  RETURN QUERY SELECT v_total, v_total - v_before;
END;
$function$;

REVOKE ALL ON FUNCTION public.tagmango_upsert_mangoes(p_mangoes jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tagmango_upsert_mangoes(p_mangoes jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.tagmango_auto_map_mangoes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH norm AS (
    SELECT
      lower(regexp_replace(btrim(legacy_program_name), '\s+', ' ', 'g')) AS key,
      min(offering_id::text)::uuid AS offering_id,
      min(legacy_program_name)     AS sample_name
    FROM public.legacy_program_mapping
    WHERE decision_status = 'mapped'
      AND offering_id IS NOT NULL
    GROUP BY 1
    -- Skip any name that vetted to MORE than one offering; ambiguity must not
    -- resolve itself silently.
    HAVING count(DISTINCT offering_id) = 1
  ),
  upd AS (
    UPDATE public.tagmango_mangoes t
    SET offering_id      = n.offering_id,
        decision_status  = 'mapped',
        auto_mapped_from = n.sample_name,
        updated_at       = now()
    FROM norm n
    WHERE t.decision_status = 'pending'
      AND t.title IS NOT NULL
      AND lower(regexp_replace(btrim(t.title), '\s+', ' ', 'g')) = n.key
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.tagmango_auto_map_mangoes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tagmango_auto_map_mangoes() TO service_role;

CREATE OR REPLACE FUNCTION public.tagmango_ingest_subscriptions(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_added integer;
BEGIN
  WITH incoming AS (
    SELECT DISTINCT
      NULLIF(btrim(r->>'phone'), '')     AS phone,
      NULLIF(btrim(r->>'email'), '')     AS email,
      NULLIF(btrim(r->>'full_name'), '') AS full_name,
      r->>'mango_id'                     AS mango_id
    FROM jsonb_array_elements(p_rows) r
  ),
  resolved AS (
    SELECT i.phone, i.email, i.full_name, m.offering_id, m.title
    FROM incoming i
    JOIN public.tagmango_mangoes m ON m.mango_id = i.mango_id
    WHERE m.decision_status = 'mapped'
      AND m.offering_id IS NOT NULL
      AND m.title IS NOT NULL
      -- The unique index is on (source, phone, legacy_program_name), so a row
      -- without a phone could never be deduplicated and would pile up on
      -- every run. Email-only buyers are rare; skip rather than duplicate.
      AND i.phone IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.legacy_enrolments
      (phone, email, full_name, offering_id, source, legacy_program_name)
    SELECT phone, email, full_name, offering_id, 'tagmango', title
    FROM resolved
    ON CONFLICT (source, phone, legacy_program_name) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_added FROM ins;
  RETURN v_added;
END;
$function$;

REVOKE ALL ON FUNCTION public.tagmango_ingest_subscriptions(p_rows jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tagmango_ingest_subscriptions(p_rows jsonb) TO service_role;

