
CREATE TABLE offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('onetime','subscription')),
  price_inr numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  subscription_period text CHECK (subscription_period IN ('month')),
  validity_days integer,
  gst_mode text NOT NULL DEFAULT 'none' CHECK (gst_mode IN ('inclusive','exclusive','none')),
  gst_rate numeric(5,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  razorpay_plan_id text,
  thumbnail_url text,
  refund_policy_days integer DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER offerings_updated_at BEFORE UPDATE ON offerings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE offering_courses (
  offering_id uuid NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (offering_id, course_id)
);

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('flat','percent')),
  discount_value numeric(10,2) NOT NULL,
  max_redemptions integer,
  used_count integer NOT NULL DEFAULT 0,
  valid_from timestamptz,
  valid_until timestamptz,
  applies_to_offering_id uuid REFERENCES offerings(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER coupons_updated_at BEFORE UPDATE ON coupons FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid REFERENCES offerings(id) ON DELETE CASCADE,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','number','email','phone','dropdown','checkbox','textarea')),
  options jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE offering_bumps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_offering_id uuid NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  bump_offering_id uuid NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  bump_price_override_inr numeric(10,2),
  headline text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CHECK (parent_offering_id <> bump_offering_id)
);

CREATE TABLE payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  offering_id uuid NOT NULL REFERENCES offerings(id) ON DELETE RESTRICT,
  coupon_id uuid REFERENCES coupons(id),
  bump_offering_ids uuid[] DEFAULT '{}',
  custom_field_values jsonb DEFAULT '{}',
  subtotal_inr numeric(10,2) NOT NULL,
  discount_inr numeric(10,2) NOT NULL DEFAULT 0,
  gst_inr numeric(10,2) NOT NULL DEFAULT 0,
  total_inr numeric(10,2) NOT NULL,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','authorized','captured','failed','refunded')),
  captured_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER payment_orders_updated_at BEFORE UPDATE ON payment_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES offerings(id) ON DELETE RESTRICT,
  payment_order_id uuid REFERENCES payment_orders(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked','cancelled')),
  starts_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz,
  autopay_active boolean NOT NULL DEFAULT false,
  razorpay_subscription_id text,
  revoked_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  revoked_reason text,
  granted_by uuid REFERENCES users(id),
  source text NOT NULL DEFAULT 'checkout' CHECK (source IN ('checkout','admin_grant','bulk_import','migration')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER enrolments_updated_at BEFORE UPDATE ON enrolments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE enrolment_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrolment_id uuid NOT NULL REFERENCES enrolments(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('granted','revoked','expired','restored','extended')),
  actor_user_id uuid REFERENCES users(id),
  reason text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT NOW()
);
