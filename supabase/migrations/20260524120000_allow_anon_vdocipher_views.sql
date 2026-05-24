-- ============================================================================
-- vdocipher_video_views: allow user_id to be null
-- ============================================================================
--
-- Previously the audit log required a user_id. The new free-preview flow on
-- PublicOffering lets anon visitors play any chapter marked make_free=true
-- (so prospects can taste the production quality before logging in / buying).
-- Those plays still need to be logged for VdoCipher quota visibility and
-- IP-based rate-limit accounting, but they have no associated user.
--
-- The get-vdocipher-otp edge function gates anon access to make_free
-- chapters only and rate-limits by IP (10/hour), so this column change
-- doesn't open a vector for log abuse beyond what the function controls.

ALTER TABLE public.vdocipher_video_views
  ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN public.vdocipher_video_views.user_id IS
  'NULL when the view is from an anonymous visitor playing a free-preview chapter. Authed plays always carry the user id.';
