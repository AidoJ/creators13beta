CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first text := NULLIF(NEW.raw_user_meta_data->>'first_name', '');
  v_last  text := NULLIF(NEW.raw_user_meta_data->>'last_name', '');
  v_ref   text := NULLIF(NEW.raw_user_meta_data->>'invitation_ref', '');
  v_phone text := NULLIF(left(trim(NEW.raw_user_meta_data->>'phone'), 40), '');
  v_mkt   boolean := COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, false);
  v_invited_by uuid := NULL;
BEGIN
  IF v_ref IS NOT NULL THEN
    SELECT user_id INTO v_invited_by FROM public.profiles WHERE invitation_code = upper(v_ref) LIMIT 1;
  END IF;

  INSERT INTO public.profiles (user_id, email, first_name, last_name, phone, marketing_opt_in, marketing_opt_in_at, invited_by_user_id)
  VALUES (NEW.id, NEW.email, v_first, v_last, v_phone, v_mkt, CASE WHEN v_mkt THEN now() END, v_invited_by)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;