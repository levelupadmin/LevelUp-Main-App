-- ============================================================================
-- Drop dead tables: phone_otp_attempts + chapter_comments
-- ============================================================================
--
-- phone_otp_attempts: was the storage for server-side MSG91 Flow API OTPs
-- (we hashed the OTP server-side, sent the plaintext to the phone, stored
-- the hash + a 5-attempt limit, verified on confirm). Replaced weeks ago
-- by the MSG91 client-side widget, which owns OTP state inside MSG91's
-- infrastructure. The send-sms-otp edge function was deleted then; this
-- table has been zero-traffic since.
--
-- chapter_comments: the per-chapter comment thread the watching page used
-- to render as a "Chat" tab. The UI surface was removed during the
-- ChapterViewer redesign; per-chapter Q&A is handled by the separate
-- chapter_qna table now. The chapter_comments table never re-surfaced
-- and no code path reads or writes it anymore.
--
-- Both drops use CASCADE because there are dependent RLS policies and
-- (in chapter_comments' case) a self-referencing FK on parent_comment_id
-- that would otherwise block the drop.

-- Defensive: drop helper functions / cron schedule for phone_otp_attempts
-- before the table itself.
DROP FUNCTION IF EXISTS public.cleanup_phone_otps() CASCADE;

DROP TABLE IF EXISTS public.phone_otp_attempts CASCADE;
DROP TABLE IF EXISTS public.chapter_comments CASCADE;
