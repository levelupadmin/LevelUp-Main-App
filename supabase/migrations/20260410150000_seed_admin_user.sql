-- Seed admin user: rahul@rahul.com
-- IMPORTANT: Change the password after first login.
--
-- Triggers `prevent_role_escalation` (20260407215331) and `users_admin_role_guard`
-- (20260408160200) would normally block the role bump below because no admin
-- exists yet on a fresh DB. Bypass them locally for this transaction only.

SET LOCAL session_replication_role = 'replica';

DO $$
DECLARE
  _uid uuid;
BEGIN
  -- Check if auth user already exists
  SELECT id INTO _uid FROM auth.users WHERE email = 'rahul@rahul.com';

  IF _uid IS NULL THEN
    _uid := gen_random_uuid();

    -- Create the auth user with password. Supabase's go-true auth service
    -- scans every nullable string column into a Go string, which fails with
    -- "converting NULL to string is unsupported" if any of email_change /
    -- phone_change / *_token fields are NULL. Initialise them to '' so the
    -- first sign-in does not 500.
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change,
      email_change_token_new,
      email_change_token_current,
      phone,
      phone_change,
      phone_change_token,
      reauthentication_token,
      is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      _uid,
      'authenticated',
      'authenticated',
      'rahul@rahul.com',
      crypt('rahul123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Rahul"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      false
    );

    -- Create the identity record (required for email/password login)
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      provider,
      identity_data,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      _uid,
      _uid,
      'rahul@rahul.com',
      'email',
      jsonb_build_object('sub', _uid::text, 'email', 'rahul@rahul.com', 'email_verified', true, 'phone_verified', false),
      now(),
      now(),
      now()
    );
  ELSE
    -- User exists — just make sure password is set
    UPDATE auth.users
    SET encrypted_password = crypt('rahul123', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = _uid;

    -- Ensure identity exists
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    VALUES (_uid, _uid, 'rahul@rahul.com', 'email', jsonb_build_object('sub', _uid::text, 'email', 'rahul@rahul.com', 'email_verified', true, 'phone_verified', false), now(), now(), now())
    ON CONFLICT (provider_id, provider) DO NOTHING;
  END IF;

  -- Promote to admin in public.users
  UPDATE public.users
  SET role = 'admin'
  WHERE id = _uid;

  -- If the trigger hasn't fired yet, insert directly
  IF NOT FOUND THEN
    INSERT INTO public.users (id, email, full_name, role)
    VALUES (_uid, 'rahul@rahul.com', 'Rahul', 'admin')
    ON CONFLICT (id) DO UPDATE SET role = 'admin';
  END IF;
END;
$$;
