REVOKE EXECUTE ON FUNCTION public.release_sweep_lease(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_sweep_lease(text) TO service_role;