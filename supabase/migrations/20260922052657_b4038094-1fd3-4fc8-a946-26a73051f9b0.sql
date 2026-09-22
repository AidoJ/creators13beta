CREATE OR REPLACE FUNCTION public.profiles_set_invitation_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.invitation_code IS NULL THEN
    NEW.invitation_code := public.generate_invitation_code();
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.profiles_set_invitation_code() FROM PUBLIC, anon, authenticated;