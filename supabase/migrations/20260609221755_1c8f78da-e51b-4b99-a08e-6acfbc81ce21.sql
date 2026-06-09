ALTER FUNCTION public.generate_invitation_code() SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.generate_invitation_code() TO authenticated, anon;