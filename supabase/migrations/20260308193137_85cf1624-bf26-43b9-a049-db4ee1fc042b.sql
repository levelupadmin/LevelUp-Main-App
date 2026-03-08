
-- Add 'pdf' to lesson_type enum
ALTER TYPE public.lesson_type ADD VALUE IF NOT EXISTS 'pdf';

-- Add file_url column to lessons
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS file_url text;

-- Create storage bucket for course content
INSERT INTO storage.buckets (id, name, public) VALUES ('course-content', 'course-content', true) ON CONFLICT (id) DO NOTHING;

-- Allow public read access to course-content bucket
CREATE POLICY "Allow public read access on course-content" ON storage.objects FOR SELECT USING (bucket_id = 'course-content');

-- Allow public upload to course-content bucket
CREATE POLICY "Allow public upload to course-content" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'course-content');

-- Allow public delete on course-content bucket
CREATE POLICY "Allow public delete on course-content" ON storage.objects FOR DELETE USING (bucket_id = 'course-content');
