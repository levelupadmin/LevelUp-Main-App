

## Plan: Add Content Upload Support for Lessons

### Current State
- Lessons have a `type` enum: `video | text | quiz | assignment`
- Lessons have `video_url` and `content` text fields but no file storage
- Lesson creation is inline with just title + duration, hardcoded to `type: "video"`

### What We Need

**1. Database Changes**
- Add `pdf` type to the `lesson_type` enum
- Add a `file_url` column to `lessons` table for storing uploaded file URLs
- Create a `course-content` storage bucket for file uploads (videos, PDFs, etc.)
- Add open RLS policies on the storage bucket (matching current open access pattern)

**2. UI Changes in AdminContent.tsx**
- Expand the inline lesson creation form to include:
  - **Type selector** (dropdown): Video, PDF, Text, Quiz, Assignment
  - **File upload input** for Video and PDF types — uploads to the storage bucket
  - **URL input** for video links (YouTube/Vimeo embed)
  - **Text editor** (textarea) for text-type lessons
- Show appropriate icons per lesson type (Video, FileText, BookOpen, etc.)
- Display the uploaded file name or URL in the lesson list row

**3. Upload Logic**
- Use the Supabase Storage SDK (`supabase.storage.from('course-content').upload(...)`)
- Generate public URLs for uploaded files
- Store the public URL in `file_url` (or `video_url` for videos)
- Accept common formats: `.mp4`, `.mov`, `.pdf`, `.doc`, `.docx`

### File Changes
- **Migration SQL**: Add `pdf` to enum, add `file_url` column, create storage bucket + policies
- **`src/pages/admin/AdminContent.tsx`**: Update lesson creation form with type selector and file upload, update lesson display with type-specific icons

