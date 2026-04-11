-- Email templates (admin-editable)
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text UNIQUE NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_all_templates" ON public.email_templates FOR ALL USING (public.is_admin());

-- Seed default templates
INSERT INTO public.email_templates (template_key, name, subject, html_body, text_body, variables) VALUES
('welcome', 'Welcome Email', 'Welcome to LevelUp Learning, {{student_name}}!',
 '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h1 style="color:#1a1a2e;">Welcome to LevelUp Learning!</h1><p>Hi {{student_name}},</p><p>We''re thrilled to have you join our learning community. Start exploring courses and level up your skills today.</p><p style="margin-top:24px;"><a href="{{app_url}}/home" style="background:#c9a96e;color:#1a1a2e;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Start Learning</a></p><p style="color:#666;margin-top:32px;font-size:13px;">— The LevelUp Learning Team</p></div>',
 'Hi {{student_name}}, Welcome to LevelUp Learning! Start exploring courses at {{app_url}}/home',
 '[{"key":"student_name","label":"Student Name"},{"key":"app_url","label":"App URL"}]'),

('enrollment_confirmation', 'Enrollment Confirmation', 'You''re enrolled in {{course_name}}!',
 '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h1 style="color:#1a1a2e;">Enrollment Confirmed!</h1><p>Hi {{student_name}},</p><p>You''ve been successfully enrolled in <strong>{{course_name}}</strong>.</p><p>Start your learning journey now:</p><p style="margin-top:24px;"><a href="{{app_url}}/courses/{{course_id}}" style="background:#c9a96e;color:#1a1a2e;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Go to Course</a></p><p style="color:#666;margin-top:32px;font-size:13px;">— The LevelUp Learning Team</p></div>',
 'Hi {{student_name}}, You are now enrolled in {{course_name}}. Start learning at {{app_url}}/courses/{{course_id}}',
 '[{"key":"student_name","label":"Student Name"},{"key":"course_name","label":"Course Name"},{"key":"course_id","label":"Course ID"},{"key":"app_url","label":"App URL"}]'),

('payment_receipt', 'Payment Receipt', 'Payment Receipt — ₹{{amount}} for {{offering_name}}',
 '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h1 style="color:#1a1a2e;">Payment Receipt</h1><p>Hi {{student_name}},</p><p>Thank you for your purchase!</p><table style="width:100%;border-collapse:collapse;margin:16px 0;"><tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#666;">Item</td><td style="padding:8px 0;font-weight:bold;">{{offering_name}}</td></tr><tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#666;">Amount</td><td style="padding:8px 0;font-weight:bold;">₹{{amount}}</td></tr><tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#666;">Payment ID</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">{{payment_id}}</td></tr><tr><td style="padding:8px 0;color:#666;">Date</td><td style="padding:8px 0;">{{date}}</td></tr></table><p style="color:#666;margin-top:32px;font-size:13px;">— The LevelUp Learning Team</p></div>',
 'Hi {{student_name}}, Receipt for ₹{{amount}} — {{offering_name}}. Payment ID: {{payment_id}}. Date: {{date}}',
 '[{"key":"student_name","label":"Student Name"},{"key":"offering_name","label":"Offering Name"},{"key":"amount","label":"Amount (INR)"},{"key":"payment_id","label":"Razorpay Payment ID"},{"key":"date","label":"Payment Date"},{"key":"app_url","label":"App URL"}]'),

('course_completion', 'Course Completion', 'Congratulations! You completed {{course_name}}',
 '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h1 style="color:#1a1a2e;">Course Completed!</h1><p>Hi {{student_name}},</p><p>Congratulations on completing <strong>{{course_name}}</strong>! Your dedication is inspiring.</p><p>Check your profile for your certificate:</p><p style="margin-top:24px;"><a href="{{app_url}}/profile" style="background:#c9a96e;color:#1a1a2e;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">View Certificate</a></p><p style="color:#666;margin-top:32px;font-size:13px;">— The LevelUp Learning Team</p></div>',
 'Hi {{student_name}}, Congratulations on completing {{course_name}}! View your certificate at {{app_url}}/profile',
 '[{"key":"student_name","label":"Student Name"},{"key":"course_name","label":"Course Name"},{"key":"app_url","label":"App URL"}]'),

('certificate_ready', 'Certificate Ready', 'Your certificate for {{course_name}} is ready!',
 '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h1 style="color:#1a1a2e;">Your Certificate is Ready!</h1><p>Hi {{student_name}},</p><p>Your completion certificate for <strong>{{course_name}}</strong> has been generated.</p><p>Certificate Number: <strong>{{certificate_number}}</strong></p><p style="margin-top:24px;"><a href="{{app_url}}/profile" style="background:#c9a96e;color:#1a1a2e;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Download Certificate</a></p><p style="color:#666;margin-top:32px;font-size:13px;">— The LevelUp Learning Team</p></div>',
 'Hi {{student_name}}, Your certificate for {{course_name}} is ready! Certificate #{{certificate_number}}. Download at {{app_url}}/profile',
 '[{"key":"student_name","label":"Student Name"},{"key":"course_name","label":"Course Name"},{"key":"certificate_number","label":"Certificate Number"},{"key":"app_url","label":"App URL"}]'),

('refund_processed', 'Refund Processed', 'Your refund of ₹{{amount}} has been processed',
 '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h1 style="color:#1a1a2e;">Refund Processed</h1><p>Hi {{student_name}},</p><p>Your refund of <strong>₹{{amount}}</strong> for <strong>{{offering_name}}</strong> has been processed.</p><p>The amount will reflect in your account within 5-7 business days.</p><p style="color:#666;margin-top:32px;font-size:13px;">— The LevelUp Learning Team</p></div>',
 'Hi {{student_name}}, Your refund of ₹{{amount}} for {{offering_name}} has been processed. It will reflect in 5-7 business days.',
 '[{"key":"student_name","label":"Student Name"},{"key":"amount","label":"Refund Amount"},{"key":"offering_name","label":"Offering Name"},{"key":"app_url","label":"App URL"}]')
ON CONFLICT (template_key) DO NOTHING;

-- Email campaigns
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text NOT NULL DEFAULT '',
  audience_type text NOT NULL CHECK (audience_type IN ('all','cohort','course')),
  audience_id uuid,
  sent_by uuid NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','sent','failed')),
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  sent_at timestamptz
);
CREATE TRIGGER email_campaigns_updated_at BEFORE UPDATE ON email_campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_all_campaigns" ON public.email_campaigns FOR ALL USING (public.is_admin());
