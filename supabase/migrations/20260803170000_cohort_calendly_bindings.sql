-- PHASE IV follow-up: durable, app-minted Calendly → application identity.
--
-- The public Calendly form exposes email and text_reminder_number as invitee
-- input. Neither is a safe capability: a stranger can type another applicant's
-- values. Owner-authorized app booking links therefore carry an unguessable UUID in
-- Calendly's `utm_content` tracking field behind a reserved LevelUp prefix. Only
-- the service-role slot function can mint/read the mapping; only the signed Calendly webhook can use
-- it to resolve a delivery. The application id itself never enters the URL.

CREATE TABLE IF NOT EXISTS public.cohort_calendly_bindings (
  application_id uuid PRIMARY KEY
    REFERENCES public.cohort_applications(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_calendly_bindings_token_key UNIQUE (token)
);

ALTER TABLE public.cohort_calendly_bindings ENABLE ROW LEVEL SECURITY;

-- No client policy is intentional. `calendly-slots` verifies the bearer with
-- GoTrue and checks cohort_applications.user_id before it returns a URL carrying
-- this value. `calendly-webhook` is HMAC-authenticated. Both use service_role.
REVOKE ALL ON TABLE public.cohort_calendly_bindings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.cohort_calendly_bindings TO service_role;

COMMENT ON TABLE public.cohort_calendly_bindings IS
  'Service-role-only opaque identity used to bind app-originated Calendly deliveries to one cohort application without trusting invitee-typed phone/email.';
COMMENT ON COLUMN public.cohort_calendly_bindings.token IS
  'Random UUID placed in Calendly tracking.utm_content behind the reserved levelup_application_ prefix; never an application id and never accepted from an unauthenticated caller as authority.';

-- Rollback:
-- DROP TABLE IF EXISTS public.cohort_calendly_bindings;
