REVOKE EXECUTE ON FUNCTION public.generate_invitation_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_set_invitation_code() FROM PUBLIC, anon, authenticated;