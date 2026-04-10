-- Seed admin user: rahul@rahul.com
-- IMPORTANT: Change the password after first login via the app's profile settings.

DO $$
DECLARE
  _uid uuid;
BEGIN
  -- Check if auth user already exists
  SELECT id INTO _uid FROM auth.users WHERE email = 'rahul@rahul.com';

  IF _uid IS NULL THEN
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
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
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
      ''
    )
    RETURNING id INTO _uid;

    -- The on_auth_user_created trigger will create the public.users row.
    -- Wait for it, then promote to admin.
  END IF;

  -- Promote to admin in public.users
  UPDATE public.users
  SET role = 'admin'
  WHERE id = _uid;

  -- If the trigger hasn't fired yet (edge case), insert directly
  IF NOT FOUND THEN
    INSERT INTO public.users (id, email, full_name, role)
    VALUES (_uid, 'rahul@rahul.com', 'Rahul', 'admin')
    ON CONFLICT (id) DO UPDATE SET role = 'admin';
  END IF;
END;
$$;
