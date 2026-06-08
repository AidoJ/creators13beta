
-- Trigger function: create a profile row whenever a new auth user is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first text := NULLIF(NEW.raw_user_meta_data->>'first_name', '');
  v_last  text := NULLIF(NEW.raw_user_meta_data->>'last_name', '');
  v_ref   text := NULLIF(NEW.raw_user_meta_data->>'invitation_ref', '');
  v_invited_by uuid := NULL;
BEGIN
  IF v_ref IS NOT NULL THEN
    SELECT user_id INTO v_invited_by
    FROM public.profiles
    WHERE invitation_code = upper(v_ref)
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (user_id, email, first_name, last_name, invited_by_user_id)
  VALUES (NEW.id, NEW.email, v_first, v_last, v_invited_by)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profile rows for any existing auth users missing one.
INSERT INTO public.profiles (user_id, email, first_name, last_name)
SELECT
  u.id,
  u.email,
  NULLIF(u.raw_user_meta_data->>'first_name', ''),
  NULLIF(u.raw_user_meta_data->>'last_name', '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
