-- ============================================================================
-- chapters.vdocipher_thumbnail_url
-- ============================================================================
--
-- VdoCipher generates poster images for every uploaded video and exposes
-- them via the videos metadata API. Until now the Up Next rail on the
-- watching page used chapters.thumbnail_url and fell back to a numbered
-- tile when no custom thumb was set. Most lessons never get a custom
-- thumbnail uploaded, which means the rail was visually flat by default.
--
-- This column caches the VdoCipher-generated poster so the rail looks
-- good out of the box. The new get-vdocipher-video-meta edge function
-- populates it whenever an admin saves a chapter with a vdocipher
-- video id. The Up Next render order is:
--
--   chapters.thumbnail_url             -- creator override
--   ↓ (when null)
--   chapters.vdocipher_thumbnail_url   -- VdoCipher poster, this column
--   ↓ (when null)
--   numbered tile fallback
--
-- Nullable so chapters that don't use VdoCipher (free chapters with
-- embed_url, PDFs, etc.) simply have NULL here.

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS vdocipher_thumbnail_url text;

COMMENT ON COLUMN public.chapters.vdocipher_thumbnail_url IS
  'Cached VdoCipher poster URL. Populated by get-vdocipher-video-meta edge function when admin saves a chapter. Used as fallback in the Up Next rail when chapters.thumbnail_url is null.';
