-- Add Rahul's phone to the seeded admin user so phone-OTP login works.
-- The 20260410150000 seed creates rahul@rahul.com with an empty phone string
-- (Supabase go-true rejects NULL on nullable phone fields). This migration
-- backfills the real phone number and marks it confirmed so OTP login can
-- be issued against it without re-verifying.

UPDATE auth.users
SET
  phone = '+919884731816',
  phone_confirmed_at = COALESCE(phone_confirmed_at, now())
WHERE email = 'rahul@rahul.com'
  AND (phone IS NULL OR phone = '' OR phone <> '+919884731816');
