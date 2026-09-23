
CREATE OR REPLACE FUNCTION public.get_project_member_options()
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id,
         COALESCE(NULLIF(TRIM(p.display_name), ''),
                  NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
                  'Member') AS display_name
  FROM public.profiles p
  WHERE (
    public.has_feature(auth.uid(), 'projects_view')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'trainer')
  )
  ORDER BY 2;
$$;

REVOKE ALL ON FUNCTION public.get_project_member_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_member_options() TO authenticated, service_role;
