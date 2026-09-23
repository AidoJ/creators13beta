REVOKE ALL ON FUNCTION public.confirm_guardian_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_guardian_email(text) TO anon, authenticated, service_role;