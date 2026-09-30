ALTER FUNCTION public.get_my_onboarding() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.get_my_onboarding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding() TO authenticated;