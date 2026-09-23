
REVOKE ALL ON FUNCTION public.is_project_editor(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_project_creator(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.projects_guard_creator_change() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.projects_guard_creator_change() TO service_role;
