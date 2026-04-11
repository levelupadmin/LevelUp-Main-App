-- ══════════════════════════════════════════════
-- Certificate System: Templates + Generated Certificates
-- ══════════════════════════════════════════════

-- ── Certificate Templates (one per course) ──
CREATE TABLE public.certificate_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  background_image_url text NOT NULL,
  variable_positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  completion_threshold integer NOT NULL DEFAULT 100 CHECK (completion_threshold BETWEEN 0 AND 100),
  auto_generate boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id)
);

CREATE INDEX idx_cert_templates_course ON public.certificate_templates(course_id);
ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY cert_templates_admin ON public.certificate_templates
  FOR ALL USING (public.is_admin());

CREATE POLICY cert_templates_student_read ON public.certificate_templates
  FOR SELECT USING (
    is_active = true
    AND course_id IN (
      SELECT oc.course_id FROM offering_courses oc
      JOIN enrolments e ON e.offering_id = oc.offering_id
      WHERE e.user_id = auth.uid() AND e.status = 'active'
    )
  );

-- ── Generated Certificates ──
CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.certificate_templates(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  certificate_number text NOT NULL UNIQUE,
  generated_by text NOT NULL DEFAULT 'auto' CHECK (generated_by IN ('auto', 'admin_manual')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX idx_certificates_user ON public.certificates(user_id);
CREATE INDEX idx_certificates_course ON public.certificates(course_id);
CREATE INDEX idx_certificates_number ON public.certificates(certificate_number);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY certificates_admin ON public.certificates
  FOR ALL USING (public.is_admin());

CREATE POLICY certificates_own_read ON public.certificates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY certificates_own_insert ON public.certificates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── Storage bucket for certificates ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Anyone can view certificate files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'certificates');

CREATE POLICY "Authenticated users upload own certificates"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Admins manage all certificate files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'certificates' AND public.is_admin())
  WITH CHECK (bucket_id = 'certificates' AND public.is_admin());

-- ── Certificate number sequence ──
CREATE SEQUENCE IF NOT EXISTS certificate_number_seq;

CREATE OR REPLACE FUNCTION public.next_certificate_number()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE seq_val bigint;
BEGIN
  SELECT nextval('certificate_number_seq') INTO seq_val;
  RETURN 'LU-CERT-' || LPAD(seq_val::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_certificate_number() TO authenticated;
