-- Reel duration comes back fractional from the provider (e.g. 57.5s), so the
-- integer column rejects it. Widen to numeric. (cb_reels is new + empty, so this
-- is a no-op data-wise; view_count/like_count stay bigint — they're whole counts.)
ALTER TABLE public.cb_reels ALTER COLUMN duration TYPE numeric USING duration::numeric;
