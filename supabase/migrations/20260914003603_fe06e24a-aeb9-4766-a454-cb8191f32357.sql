CREATE OR REPLACE FUNCTION public.profiles_guard_certification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / server-side contexts have no auth.uid(); allow them.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.practitioner_status IS DISTINCT FROM OLD.practitioner_status)
     OR (NEW.certification_level IS DISTINCT FROM OLD.certification_level) THEN
    IF NOT (public.has_role(auth.uid(), 'trainer'::app_role)
            OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
      RAISE EXCEPTION 'Only trainers or admins can change certification fields'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_certification ON public.profiles;
CREATE TRIGGER profiles_guard_certification
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_certification();