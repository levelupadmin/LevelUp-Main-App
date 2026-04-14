-- ============================================================
-- Live Cohort Phase 1: Application Pipeline + Staged Payments
-- ============================================================

-- ── 1. cohort_applications table ──
CREATE TABLE IF NOT EXISTS cohort_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  city text,
  occupation text,
  bio text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','app_fee_paid','interview_scheduled','interview_done','accepted','rejected','confirmation_paid','balance_paid','enrolled','withdrawn','waitlisted')),
  app_fee_paid_at timestamptz,
  tally_response_id text,
  tally_data jsonb,
  interview_notes text,
  interview_date timestamptz,
  rejection_reason text,
  app_fee_payment_id uuid,
  confirmation_payment_id uuid,
  balance_payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohort_apps_offering ON cohort_applications(offering_id);
CREATE INDEX IF NOT EXISTS idx_cohort_apps_user ON cohort_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_cohort_apps_email ON cohort_applications(email);
CREATE INDEX IF NOT EXISTS idx_cohort_apps_status ON cohort_applications(status);

CREATE OR REPLACE TRIGGER set_cohort_applications_updated_at
  BEFORE UPDATE ON cohort_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE cohort_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_applications" ON cohort_applications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "students_read_own_applications" ON cohort_applications
  FOR SELECT USING (user_id = auth.uid());

-- ── 2. ALTER offerings for staged payments ──
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT 'single' CHECK (payment_mode IN ('single', 'staged')),
  ADD COLUMN IF NOT EXISTS app_fee_inr numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmation_amount_inr numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmation_deadline_days integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS balance_deadline_days integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS confirmation_grace_hours numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tally_form_url text,
  ADD COLUMN IF NOT EXISTS calendly_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_group_link text,
  ADD COLUMN IF NOT EXISTS thankyou_show_calendly boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendance_threshold_pct integer DEFAULT 85;

-- ── 3. ALTER payment_orders for staged tracking ──
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS application_id uuid;

-- ── 4. ALTER enrolments for cohort tracking ──
ALTER TABLE enrolments
  ADD COLUMN IF NOT EXISTS application_id uuid,
  ADD COLUMN IF NOT EXISTS total_paid_inr numeric(10,2),
  ADD COLUMN IF NOT EXISTS balance_due_inr numeric(10,2);

-- ── 5. ALTER live_sessions for weekly structure ──
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS week_id text,
  ADD COLUMN IF NOT EXISTS session_type text;
