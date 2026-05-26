-- Marketing + CRM surface for the admin-api.
--
-- Goal: let the Founders Office team and any third-party CRM/automation
-- tool (Zapier, Make, n8n, internal scripts) read and write the data
-- they need without us hand-rolling a new endpoint every week.
--
-- New tables:
--   user_tags             — segmentation (interested_in_bfp, vip, lapsed, …)
--   user_notes            — free-form context on a user
--   user_marketing_prefs  — opt-in flags + UTM/source provenance
--   crm_contacts          — pre-purchase leads (separate from auth users)
--   webhook_subscriptions — push events to CRMs / automation tools
--   webhook_deliveries    — durable delivery log w/ retry counter
--
-- Plus emit_event() helper + triggers on enrolments/users so common
-- events ('user.created', 'enrolment.granted', 'payment.captured')
-- queue webhook deliveries automatically.

/* ───────────────────────── user_tags ───────────────────────── */

CREATE TABLE IF NOT EXISTS public.user_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tag text NOT NULL,
  value text,                                      -- optional payload, e.g. "warm" / "Q4-2025"
  created_by uuid REFERENCES public.users(id),     -- nullable when set by API key
  source text,                                     -- 'admin_ui' | 'api' | 'auto' | …
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_tags_tag_chk CHECK (char_length(tag) BETWEEN 1 AND 60),
  CONSTRAINT user_tags_user_tag_uniq UNIQUE (user_id, tag)
);
CREATE INDEX user_tags_tag_idx ON public.user_tags (tag);
CREATE INDEX user_tags_user_idx ON public.user_tags (user_id);

ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_tags_admin_all ON public.user_tags
  USING (is_admin()) WITH CHECK (is_admin());

/* ───────────────────────── user_notes ───────────────────────── */

CREATE TABLE IF NOT EXISTS public.user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_by uuid REFERENCES public.users(id),
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_notes_user_idx ON public.user_notes (user_id, created_at DESC);

CREATE TRIGGER user_notes_updated_at BEFORE UPDATE ON public.user_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_notes_admin_all ON public.user_notes
  USING (is_admin()) WITH CHECK (is_admin());

/* ───────────────────── user_marketing_prefs ───────────────────── */

CREATE TABLE IF NOT EXISTS public.user_marketing_prefs (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  email_opt_in boolean NOT NULL DEFAULT true,
  whatsapp_opt_in boolean NOT NULL DEFAULT true,
  sms_opt_in boolean NOT NULL DEFAULT false,
  source text,                                     -- where the lead came from: 'instagram_ad' | 'organic' | 'referral' | …
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  crm_id text,                                     -- external CRM identifier (e.g. HubSpot contact id)
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_marketing_prefs_source_idx ON public.user_marketing_prefs (source);
CREATE INDEX user_marketing_prefs_utm_idx ON public.user_marketing_prefs (utm_source, utm_campaign);
CREATE INDEX user_marketing_prefs_crm_idx ON public.user_marketing_prefs (crm_id) WHERE crm_id IS NOT NULL;

CREATE TRIGGER user_marketing_prefs_updated_at BEFORE UPDATE ON public.user_marketing_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_marketing_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_marketing_prefs_admin_all ON public.user_marketing_prefs
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY user_marketing_prefs_self_read ON public.user_marketing_prefs FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY user_marketing_prefs_self_update ON public.user_marketing_prefs FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

/* ───────────────────────── crm_contacts ───────────────────────── */
-- Pre-purchase leads. Once they buy / sign up, we convert them by
-- linking converted_user_id (a users.id). Until then they live here.

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,
  full_name text,
  source text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','qualified','converted','lost','spam')),
  owner_user_id uuid REFERENCES public.users(id),   -- internal sales/CSM owner
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  tags text[] DEFAULT '{}'::text[],
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  crm_id text,
  converted_user_id uuid REFERENCES public.users(id),
  converted_at timestamptz,
  last_contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_contacts_contact_chk CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX crm_contacts_email_idx ON public.crm_contacts (lower(email));
CREATE INDEX crm_contacts_phone_idx ON public.crm_contacts (phone);
CREATE INDEX crm_contacts_status_idx ON public.crm_contacts (status, created_at DESC);
CREATE INDEX crm_contacts_owner_idx ON public.crm_contacts (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX crm_contacts_crm_idx ON public.crm_contacts (crm_id) WHERE crm_id IS NOT NULL;
CREATE INDEX crm_contacts_utm_idx ON public.crm_contacts (utm_source, utm_campaign);
CREATE INDEX crm_contacts_tags_idx ON public.crm_contacts USING gin (tags);

CREATE TRIGGER crm_contacts_updated_at BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_contacts_admin_all ON public.crm_contacts
  USING (is_admin()) WITH CHECK (is_admin());

/* ───────────────────── webhook_subscriptions ───────────────────── */

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL CHECK (url ~ '^https?://'),
  secret text NOT NULL,                             -- HMAC signing secret
  event_types text[] NOT NULL,                      -- ['user.created','enrolment.granted', …] or ['*']
  active boolean NOT NULL DEFAULT true,
  description text,
  created_by uuid REFERENCES public.users(id),
  last_triggered_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  last_failure_at timestamptz,
  last_failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_subs_active_idx ON public.webhook_subscriptions (active)
  WHERE active = true;

CREATE TRIGGER webhook_subs_updated_at BEFORE UPDATE ON public.webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_subs_admin_all ON public.webhook_subscriptions
  USING (is_admin()) WITH CHECK (is_admin());

/* ───────────────────── webhook_deliveries ───────────────────── */

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id bigserial PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES public.webhook_subscriptions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','delivered','failed','dead')),
  attempts integer NOT NULL DEFAULT 0,
  http_status integer,
  response_excerpt text,
  error_message text,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_deliveries_pending_idx ON public.webhook_deliveries (next_retry_at)
  WHERE status = 'pending';
CREATE INDEX webhook_deliveries_sub_idx ON public.webhook_deliveries (subscription_id, created_at DESC);
CREATE INDEX webhook_deliveries_event_idx ON public.webhook_deliveries (event_type, created_at DESC);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_admin_read ON public.webhook_deliveries FOR SELECT
  USING (is_admin());

/* ───────────────────────── emit_event() ───────────────────────── */
-- Insert one pending webhook_deliveries row per matching, active sub.
-- The deliver-webhooks edge function picks these up and POSTs them.

CREATE OR REPLACE FUNCTION public.emit_event(p_event_type text, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sub RECORD;
BEGIN
  FOR sub IN
    SELECT id FROM public.webhook_subscriptions
    WHERE active = true
      AND (event_types @> ARRAY[p_event_type]::text[] OR event_types @> ARRAY['*']::text[])
  LOOP
    INSERT INTO public.webhook_deliveries (subscription_id, event_type, payload, status, next_retry_at)
    VALUES (sub.id, p_event_type, p_payload, 'pending', now());
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.emit_event(text, jsonb) TO authenticated, service_role;

/* ───────────────────────── triggers ───────────────────────── */

-- user.created
CREATE OR REPLACE FUNCTION public._emit_user_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_event('user.created', jsonb_build_object(
    'user_id', NEW.id,
    'email', NEW.email,
    'phone', NEW.phone,
    'full_name', NEW.full_name,
    'role', NEW.role,
    'created_at', NEW.created_at
  ));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_emit_created ON public.users;
CREATE TRIGGER users_emit_created AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public._emit_user_created();

-- enrolment.granted
CREATE OR REPLACE FUNCTION public._emit_enrolment_granted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_event('enrolment.granted', jsonb_build_object(
    'enrolment_id', NEW.id,
    'user_id', NEW.user_id,
    'offering_id', NEW.offering_id,
    'status', NEW.status,
    'total_paid_inr', NEW.total_paid_inr,
    'created_at', NEW.created_at
  ));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enrolments_emit_granted ON public.enrolments;
CREATE TRIGGER enrolments_emit_granted AFTER INSERT ON public.enrolments
  FOR EACH ROW EXECUTE FUNCTION public._emit_enrolment_granted();

-- crm_contact.created + crm_contact.converted
CREATE OR REPLACE FUNCTION public._emit_crm_contact_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_event('crm_contact.created', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' AND NEW.converted_at IS NOT NULL AND OLD.converted_at IS NULL THEN
    PERFORM public.emit_event('crm_contact.converted', to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crm_contacts_emit ON public.crm_contacts;
CREATE TRIGGER crm_contacts_emit AFTER INSERT OR UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public._emit_crm_contact_changes();

/* ───────────────────── helper RPC: lead_capture ─────────────────────
   Idempotent lead capture — used by ad landing pages and the marketing
   site. Match by lowercased email (preferred) or phone. Returns the
   contact id (created or existing). Safe to call from anon. */

CREATE OR REPLACE FUNCTION public.lead_capture(
  p_email text,
  p_phone text,
  p_full_name text,
  p_source text,
  p_utm jsonb DEFAULT '{}'::jsonb,
  p_custom_fields jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF (p_email IS NULL OR p_email = '') AND (p_phone IS NULL OR p_phone = '') THEN
    RAISE EXCEPTION 'email or phone required';
  END IF;

  -- email match wins; fall back to phone
  IF p_email IS NOT NULL AND p_email <> '' THEN
    SELECT id INTO v_id FROM public.crm_contacts
      WHERE lower(email) = lower(p_email) LIMIT 1;
  END IF;
  IF v_id IS NULL AND p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT id INTO v_id FROM public.crm_contacts
      WHERE phone = p_phone LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.crm_contacts (
      email, phone, full_name, source,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      custom_fields
    ) VALUES (
      NULLIF(p_email, ''), NULLIF(p_phone, ''), NULLIF(p_full_name, ''), NULLIF(p_source, ''),
      p_utm->>'source', p_utm->>'medium', p_utm->>'campaign',
      p_utm->>'term', p_utm->>'content',
      COALESCE(p_custom_fields, '{}'::jsonb)
    ) RETURNING id INTO v_id;
  ELSE
    -- Update with any newly-supplied fields, never overwriting with null
    UPDATE public.crm_contacts SET
      full_name      = COALESCE(NULLIF(p_full_name, ''), full_name),
      source         = COALESCE(NULLIF(p_source, ''),    source),
      utm_source     = COALESCE(p_utm->>'source',        utm_source),
      utm_medium     = COALESCE(p_utm->>'medium',        utm_medium),
      utm_campaign   = COALESCE(p_utm->>'campaign',      utm_campaign),
      utm_term       = COALESCE(p_utm->>'term',          utm_term),
      utm_content    = COALESCE(p_utm->>'content',       utm_content),
      custom_fields  = COALESCE(custom_fields, '{}'::jsonb) || COALESCE(p_custom_fields, '{}'::jsonb)
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.lead_capture(text, text, text, text, jsonb, jsonb)
  TO authenticated, anon, service_role;
