-- Seed admin user: rahul@rahul.com
-- IMPORTANT: Change the password after first login.

DO $$
DECLARE
  _uid uuid;
BEGIN
  -- Check if auth user already exists
  SELECT id INTO _uid FROM auth.users WHERE email = 'rahul@rahul.com';

  IF _uid IS NULL THEN
    _uid := gen_random_uuid();

    -- Create the auth user with password
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
