-- Session attendance: track who attended each live session
CREATE TABLE IF NOT EXISTS public.session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'excused')),
  joined_at timestamptz,
  left_at timestamptz,
  marked_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

-- Admins can manage all attendance
CREATE POLICY "Admins manage attendance"
  ON public.session_attendance
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- Students can view their own attendance
CREATE POLICY "Students view own attendance"
  ON public.session_attendance
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_session_attendance_session ON public.session_attendance(session_id);
CREATE INDEX idx_session_attendance_user ON public.session_attendance(user_id);
