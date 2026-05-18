CREATE OR REPLACE FUNCTION public.get_inviting_practitioners_for_current_user()
RETURNS TABLE(practitioner_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ci.practitioner_id
  FROM public.client_invitations ci
  WHERE auth.uid() IS NOT NULL
    AND ci.practitioner_id IS NOT NULL
    AND lower(trim(ci.email)) = lower(trim(coalesce((auth.jwt() ->> 'email'), '')));
$$;