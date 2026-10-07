-- ============================================================================
-- LUCA end-to-end kit: the slice of the main app that LUCA reads, for a
-- SCRATCH Postgres only. Mirrors the production columns LUCA touches and
-- Supabase's roles and default privileges. Never run this on a real project.
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT anon, authenticated, service_role TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase's defaults: new public objects are granted to every API role (LUCA revokes explicitly).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE, phone text UNIQUE, full_name text, avatar_url text,
  role text NOT NULL DEFAULT 'student', bio text, city text, occupation text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','owner')) $$;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self_or_admin ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE TABLE public.offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, slug text UNIQUE,
  status text NOT NULL DEFAULT 'active', price_inr numeric(10,2) NOT NULL DEFAULT 45000,
  app_fee_inr numeric(10,2), confirmation_amount_inr numeric(10,2),
  confirmation_deadline_days integer DEFAULT 2, balance_deadline_days integer DEFAULT 15,
  confirmation_grace_hours numeric, calendly_url text, intake_opens_at timestamptz, tally_form_url text,
  payment_mode text DEFAULT 'single' CHECK (payment_mode IN ('single','staged')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES public.users(id),
  offering_id uuid REFERENCES public.offerings(id), status text NOT NULL DEFAULT 'created',
  captured_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id), status text NOT NULL DEFAULT 'active', expires_at timestamptz);

CREATE TABLE public.cohort_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  full_name text NOT NULL, email text NOT NULL, phone text, city text, occupation text, bio text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','app_fee_paid','interview_scheduled','interview_done','accepted','rejected','confirmation_paid','balance_paid','enrolled','withdrawn','waitlisted')),
  app_fee_paid_at timestamptz, interview_date timestamptz, accepted_at timestamptz,
  app_fee_payment_id uuid, confirmation_payment_id uuid, balance_payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL, title text NOT NULL, body text, link_url text, link text,
  read_at timestamptz, is_read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.suppressed_emails (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL);

-- The email queue: captured instead of sent.
CREATE TABLE public.e2e_mail (queue text, payload jsonb, at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ INSERT INTO public.e2e_mail (queue, payload) VALUES (queue_name, payload) RETURNING 1::bigint $$;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, name text, statements text[]);
