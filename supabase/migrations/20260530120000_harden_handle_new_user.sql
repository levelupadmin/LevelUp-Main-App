-- Fix: "Database error saving new user" on signup.
--
-- public.users mirrors auth.users but carries UNIQUE(email) and
-- UNIQUE(phone) (see the original users table in
-- 20260405062908_…sql). handle_new_user() fires AFTER INSERT on
-- auth.users and inserts the mirror row with both columns, guarded only
-- by `ON CONFLICT (id)`.
--
-- That guard catches an *id* collision, but NOT an email/phone collision
-- under a *different* id. When the verify-msg91-otp edge function calls
-- admin.createUser({ email, phone, … }) and that email (or phone)
-- already belongs to another mirror row — a reused email across repeated
-- signup attempts, an old ghost phone row from before the signup path was
-- hardened, etc. — the INSERT raises unique_violation. Because the
-- trigger runs inside the auth.users INSERT transaction, the violation
-- aborts the whole thing and GoTrue surfaces it as the opaque
-- "Database error saving new user".
--
-- The auth row is the source of truth; the public mirror must never block
-- signup over a UNIQUE collision. Fix: before inserting, detect an
-- email/phone already owned by a different id and drop just that colliding
-- identity column (login still works — verify-msg91-otp matches on the
-- *auth* email/phone, not the mirror). A belt-and-suspenders EXCEPTION
-- handler covers the residual insert/update race so the function can never
-- raise out of the signup transaction.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := NEW.email;
  v_phone text := NEW.raw_user_meta_data->>'phone';
BEGIN
  -- Drop an email already claimed by a different mirror row.
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users WHERE email = v_email AND id <> NEW.id
  ) THEN
    v_email := NULL;
  END IF;

  -- Drop a phone already claimed by a different mirror row.
  IF v_phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users WHERE phone = v_phone AND id <> NEW.id
  ) THEN
    v_phone := NULL;
  END IF;

  INSERT INTO public.users (id, email, full_name, phone, role)
  VALUES (
    NEW.id,
    v_email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_phone,
    'student'
  )
  ON CONFLICT (id) DO UPDATE SET
    phone = COALESCE(EXCLUDED.phone, users.phone),
    email = COALESCE(users.email, EXCLUDED.email);

  RETURN NEW;

EXCEPTION
  WHEN unique_violation THEN
    -- A concurrent signup grabbed the same email/phone between the
    -- pre-check and the INSERT. Fall back to an id-only row so the auth
    -- user still gets a profile and signup succeeds; email/phone can be
    -- reconciled later. Never let this abort the auth transaction.
    INSERT INTO public.users (id, full_name, role)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'student')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;
