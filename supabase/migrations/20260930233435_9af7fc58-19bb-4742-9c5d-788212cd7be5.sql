CREATE OR REPLACE FUNCTION public.is_case_study_subject(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  -- Only the member, their linked practitioner, or staff may ask.
  IF _user_id <> auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'trainer')
     AND NOT EXISTS (SELECT 1 FROM public.client_practitioner cp
                     WHERE cp.client_id = _user_id AND cp.practitioner_id = auth.uid() AND cp.active) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.case_studies WHERE subject_user_id = _user_id) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = _user_id AND referral_code IS NOT NULL AND referral_code <> '') THEN RETURN true; END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user_id;
  IF _email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.client_invitations ci
    WHERE ci.practitioner_id IS NOT NULL
      AND lower(trim(ci.email)) = lower(trim(_email))
  ) THEN RETURN true; END IF;

  RETURN false;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.is_case_study_subject(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_case_study_subject(uuid) TO authenticated;