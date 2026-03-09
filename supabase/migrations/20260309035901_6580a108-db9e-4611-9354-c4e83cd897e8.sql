
-- 1. New tables for LMS features

-- lesson_comments: threaded per-lesson comments
CREATE TABLE public.lesson_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES public.lesson_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.lesson_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all comments"
  ON public.lesson_comments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Enrolled users can read comments"
  ON public.lesson_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE enrollments.course_id = lesson_comments.course_id
      AND enrollments.user_id = auth.uid()
      AND enrollments.status = 'active'
  ));

CREATE POLICY "Enrolled users can insert comments"
  ON public.lesson_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.course_id = lesson_comments.course_id
        AND enrollments.user_id = auth.uid()
        AND enrollments.status = 'active'
    )
  );

CREATE POLICY "Users can delete own comments"
  ON public.lesson_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- qna_questions: per-lesson student questions
CREATE TABLE public.qna_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.qna_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all questions"
  ON public.qna_questions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Enrolled users can read questions"
  ON public.qna_questions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE enrollments.course_id = qna_questions.course_id
      AND enrollments.user_id = auth.uid()
      AND enrollments.status = 'active'
  ));

CREATE POLICY "Enrolled users can insert questions"
  ON public.qna_questions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.course_id = qna_questions.course_id
        AND enrollments.user_id = auth.uid()
        AND enrollments.status = 'active'
    )
  );

-- qna_answers: answers to questions
CREATE TABLE public.qna_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.qna_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  body TEXT NOT NULL,
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.qna_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all answers"
  ON public.qna_answers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Enrolled users can read answers"
  ON public.qna_answers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.qna_questions q
    JOIN public.enrollments e ON e.course_id = q.course_id
    WHERE q.id = qna_answers.question_id
      AND e.user_id = auth.uid()
      AND e.status = 'active'
  ));

CREATE POLICY "Enrolled users can insert answers"
  ON public.qna_answers FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.qna_questions q
      JOIN public.enrollments e ON e.course_id = q.course_id
      WHERE q.id = qna_answers.question_id
        AND e.user_id = auth.uid()
        AND e.status = 'active'
    )
  );

-- assignments: config per lesson
CREATE TABLE public.assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE UNIQUE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  instructions TEXT,
  max_score INTEGER NOT NULL DEFAULT 100,
  passing_score INTEGER NOT NULL DEFAULT 60,
  allow_retake BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage assignments"
  ON public.assignments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Enrolled users can read assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE enrollments.course_id = assignments.course_id
      AND enrollments.user_id = auth.uid()
      AND enrollments.status = 'active'
  ));

-- assignment_submissions: student work
CREATE TYPE public.submission_status AS ENUM ('submitted', 'graded', 'returned');

CREATE TABLE public.assignment_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT,
  file_url TEXT,
  score INTEGER,
  feedback TEXT,
  status submission_status NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  graded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all submissions"
  ON public.assignment_submissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Users can read own submissions"
  ON public.assignment_submissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own submissions"
  ON public.assignment_submissions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- lesson_resources: per-lesson downloadable attachments
CREATE TABLE public.lesson_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_url TEXT,
  type resource_type NOT NULL DEFAULT 'link',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage lesson resources"
  ON public.lesson_resources FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Enrolled users can read lesson resources"
  ON public.lesson_resources FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE enrollments.course_id = lesson_resources.course_id
      AND enrollments.user_id = auth.uid()
      AND enrollments.status = 'active'
  ));

-- 2. Add settings columns to courses
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS validity_days INTEGER;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS show_as_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS drm_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS disable_qna BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS disable_comments BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS drip_mode TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS drip_schedule JSONB;
