-- Cohort batches: group enrolled students into named batches
CREATE TABLE IF NOT EXISTS public.cohort_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  name text NOT NULL,
  max_students integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cohort_batch_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.cohort_batches(id) ON DELETE CASCADE,
  enrolment_id uuid NOT NULL REFERENCES public.enrolments(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, enrolment_id)
);

-- RLS
ALTER TABLE public.cohort_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_batch_members ENABLE ROW LEVEL SECURITY;

-- Admins can manage batches
CREATE POLICY "Admins manage cohort_batches"
  ON public.cohort_batches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

CREATE POLICY "Admins manage cohort_batch_members"
  ON public.cohort_batch_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- Students can see their own batch membership
CREATE POLICY "Students view own batch membership"
  ON public.cohort_batch_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.enrolments WHERE id = enrolment_id AND user_id = auth.uid())
  );

CREATE POLICY "Students view batches they belong to"
  ON public.cohort_batches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cohort_batch_members cbm
      JOIN public.enrolments e ON e.id = cbm.enrolment_id
      WHERE cbm.batch_id = cohort_batches.id AND e.user_id = auth.uid()
    )
  );

CREATE INDEX idx_cohort_batches_offering ON public.cohort_batches(offering_id);
CREATE INDEX idx_cohort_batch_members_batch ON public.cohort_batch_members(batch_id);
CREATE INDEX idx_cohort_batch_members_enrolment ON public.cohort_batch_members(enrolment_id);
