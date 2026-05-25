-- ============================================================================
-- chapters.media_provider — multi-source video support for TagMango migration
-- ============================================================================
--
-- The chapters table originally assumed VdoCipher as the only video source
-- (media_url contained the VdoCipher video ID). For the TagMango → LevelUp
-- migration, we now have content scattered across:
--
--   - VdoCipher (current Masterclass videos)
--   - Vimeo (8+ workshop recordings via api.vimeo.com)
--   - WebinarKit (workshop recordings hosted on Bunny CDN)
--   - YouTube (potential future / community workshops)
--   - External / raw URL (anything else, e.g. Mega public link, direct mp4)
--
-- Adding `media_provider` lets ChapterViewer pick the right player component
-- and lets the admin curriculum editor accept media URLs/IDs from any source.

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS media_provider text
    DEFAULT 'vdocipher'
    CHECK (media_provider IN (
      'vdocipher',
      'vimeo',
      'webinarkit',
      'youtube',
      'external'
    ));

COMMENT ON COLUMN public.chapters.media_provider IS
  'Source platform for the video referenced by media_url. Default vdocipher (legacy). ChapterViewer dispatches to the right player based on this value.';

-- Existing rows: backfill is implicit (default = vdocipher). For any chapter
-- that already has a media_url and content_type='video', vdocipher is correct.
-- New rows added via the migration's content-import script will set this
-- explicitly to vimeo / webinarkit / etc.

-- ── Future-proofing: when media_provider != 'vdocipher', media_url stores
-- the provider-specific identifier:
--   vimeo      → video ID (e.g. "1185170637")  — embed url is derived: https://player.vimeo.com/video/{id}
--   webinarkit → full Bunny CDN URL (e.g. "https://vz-3f780a95-e11.b-cdn.net/<uuid>/playlist.m3u8")
--   youtube    → video ID (e.g. "dQw4w9WgXcQ")
--   external   → full direct URL (must be an mp4/m3u8/etc. the browser can play)

-- ── Validation example query:
-- SELECT content_type, media_provider, count(*) FROM chapters GROUP BY 1,2;
