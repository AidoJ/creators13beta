CREATE OR REPLACE FUNCTION public.profiles_guard_guardian_contact_distinct()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_self_email text := lower(btrim(coalesce(NEW.email, '')));
  v_guard_email text := lower(btrim(coalesce(NEW.guardian_email, '')));
  v_self_phone text := regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g');
  v_guard_phone text := regexp_replace(coalesce(NEW.guardian_phone, ''), '\D', '', 'g');
BEGIN
  IF v_guard_email <> '' AND v_self_email <> '' AND v_guard_email = v_self_email THEN
    RAISE EXCEPTION 'The parent/guardian email address must be different from your own email address.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Compare the last 8 digits so +61 4xx / 04xx forms of the same number still match.
  IF length(v_guard_phone) >= 8 AND length(v_self_phone) >= 8
     AND right(v_guard_phone, 8) = right(v_self_phone, 8) THEN
    RAISE EXCEPTION 'The parent/guardian phone number must be different from your own phone number.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_guardian_contact_distinct_trg ON public.profiles;
CREATE TRIGGER profiles_guard_guardian_contact_distinct_trg
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_guardian_contact_distinct();