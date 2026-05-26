-- Email + WhatsApp templates for cohort notifications.
-- The notify-cohort edge function reads these via template_key.

INSERT INTO public.email_templates (template_key, name, subject, html_body, is_active)
VALUES
  (
    'cohort_assignment_due_24h',
    'Cohort: Assignment Due in 24h',
    'Your {{week_theme}} assignment is due tomorrow',
    $$<p>Hey {{first_name}},</p>
<p>Your <strong>{{week_theme}}</strong> assignment is due in about 24 hours.</p>
<blockquote style="border-left:3px solid #d4af37;padding:8px 12px;color:#444;background:#fafafa;">
  {{assignment_prompt}}
</blockquote>
<p>Submit it here: <a href="https://app.leveluplearning.in/cohort/{{offering_id}}">Open your cohort dashboard</a></p>
<p>Even a rough cut counts — get something in, your mentor will help shape it.</p>
<p>— LevelUp</p>$$,
    true
  ),
  (
    'cohort_session_reminder_1h',
    'Cohort: Live Session in 1 Hour',
    '{{session_title}} starts in an hour',
    $$<p>Hey {{first_name}},</p>
<p><strong>{{session_title}}</strong> kicks off in 60 minutes.</p>
<p><a href="{{zoom_link}}" style="display:inline-block;background:#d4af37;color:#000;padding:10px 18px;border-radius:6px;font-weight:600;text-decoration:none;">Join the session →</a></p>
<p>Or copy the link: {{zoom_link}}</p>
<p>If you can't make it live, the recording will be on your cohort dashboard within 24 hours.</p>
<p>— LevelUp</p>$$,
    true
  ),
  (
    'cohort_submission_reviewed',
    'Cohort: Your work has been reviewed',
    'Your {{week_theme}} feedback is in',
    $$<p>Hey {{first_name}},</p>
<p>Your mentor just left feedback on your <strong>{{week_theme}}</strong> submission.</p>
<blockquote style="border-left:3px solid #d4af37;padding:8px 12px;color:#444;background:#fafafa;">
  {{feedback_excerpt}}
</blockquote>
<p><a href="https://app.leveluplearning.in/cohort/{{offering_id}}">Read the full feedback →</a></p>
<p>— LevelUp</p>$$,
    true
  ),
  (
    'cohort_assignment_missed',
    'Cohort: Last call on this week',
    'You missed last week''s assignment — here''s how to catch up',
    $$<p>Hey {{first_name}},</p>
<p>We noticed you didn't submit your <strong>{{week_theme}}</strong> assignment yet. No drama — it happens.</p>
<p>The cohort moves faster when you ship something each week, even rough. Drop a draft today:</p>
<p><a href="https://app.leveluplearning.in/cohort/{{offering_id}}" style="display:inline-block;background:#d4af37;color:#000;padding:10px 18px;border-radius:6px;font-weight:600;text-decoration:none;">Submit late →</a></p>
<p>Need to chat? Reply to this email and we'll help unblock you.</p>
<p>— LevelUp</p>$$,
    true
  )
ON CONFLICT (template_key) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_body = EXCLUDED.html_body,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Track which (template_key, related_row_id, user_id) pings have fired
-- so we don't double-send on retries / overlapping cron windows.
CREATE TABLE IF NOT EXISTS public.cohort_notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  related_kind text NOT NULL,   -- 'cohort_week' | 'live_session' | 'submission'
  related_id uuid NOT NULL,
  channels text[] NOT NULL DEFAULT '{}',  -- subset of {'email','whatsapp','in_app'}
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_notif_unique UNIQUE (template_key, user_id, related_kind, related_id)
);
CREATE INDEX IF NOT EXISTS cohort_notif_user_idx
  ON public.cohort_notifications_log (user_id, sent_at DESC);

-- Admins only — students don't need to read this directly
ALTER TABLE public.cohort_notifications_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cohort_notif_admin_all ON public.cohort_notifications_log;
CREATE POLICY cohort_notif_admin_all ON public.cohort_notifications_log
  USING (is_admin()) WITH CHECK (is_admin());
