REVOKE ALL ON FUNCTION public.get_enrollment_practitioner_options(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_enrollment_practitioner_options(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_enrollment_practitioner_options(text) TO authenticated;