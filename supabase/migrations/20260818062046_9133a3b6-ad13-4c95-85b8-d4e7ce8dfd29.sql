CREATE OR REPLACE FUNCTION public.release_sweep_lease(_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.system_settings
     SET value = jsonb_build_object('expires_at', now()),
         updated_at = now()
   WHERE key = 'sweep_lease:' || _key;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.release_sweep_lease(text) TO service_role;