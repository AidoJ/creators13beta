
CREATE OR REPLACE FUNCTION public.lookup_practitioner_by_code(_code text)
RETURNS TABLE(first_name text, last_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.first_name, p.last_name
  FROM profiles p
  WHERE p.practitioner_code = _code
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = p.user_id
        AND ur.role IN ('practitioner'::app_role, 'trainee'::app_role)
    )
  LIMIT 1;
$$;
