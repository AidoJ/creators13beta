CREATE OR REPLACE FUNCTION public.my_practitioner_is_trainer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_practitioner cp
    JOIN public.user_roles r ON r.user_id = cp.practitioner_id AND r.role = 'trainer'
    WHERE cp.client_id = auth.uid() AND cp.active
  )
$$;
REVOKE ALL ON FUNCTION public.my_practitioner_is_trainer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_practitioner_is_trainer() TO authenticated;