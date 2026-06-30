
CREATE OR REPLACE FUNCTION public.assign_self_practitioner(_practitioner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _eligible boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF _practitioner_id IS NULL OR _practitioner_id = _uid THEN
    RAISE EXCEPTION 'invalid practitioner';
  END IF;

  -- Reuse the same eligibility logic as the enrollment picker.
  SELECT EXISTS (
    SELECT 1 FROM public.get_enrollment_practitioner_options(NULL) o
    WHERE o.user_id = _practitioner_id
  ) INTO _eligible;

  IF NOT _eligible THEN
    RAISE EXCEPTION 'practitioner not eligible for this user' USING ERRCODE = '42501';
  END IF;

  -- Deactivate any existing active assignment for this client.
  UPDATE public.client_practitioner
     SET active = false
   WHERE client_id = _uid
     AND active = true
     AND practitioner_id <> _practitioner_id;

  -- Upsert the target assignment as active.
  INSERT INTO public.client_practitioner (client_id, practitioner_id, active)
  VALUES (_uid, _practitioner_id, true)
  ON CONFLICT (client_id, practitioner_id)
    DO UPDATE SET active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_self_practitioner(uuid) TO authenticated;
