-- Per-chapter download toggle for protected documents/resources.
--
-- Protected documents (media_provider='supabase-signed', any file type) live in
-- the private `protected-video` bucket and are served through get-video-src as a
-- short-lived signed URL — no public link. By DEFAULT they are view-only: the
-- student viewer hides the PDF toolbar (#toolbar=0) and shows no download button.
-- Flip this to true per chapter to expose an explicit Download button.
alter table public.chapters
  add column if not exists allow_download boolean not null default false;

comment on column public.chapters.allow_download is
  'When true, students may download this protected document/resource. Default false = view-only (no download UI, PDF toolbar hidden).';
