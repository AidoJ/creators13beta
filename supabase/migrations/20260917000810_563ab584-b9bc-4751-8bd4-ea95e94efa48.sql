CREATE OR REPLACE FUNCTION public.client_session_images_guard_minor_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  v_age int;
BEGIN
  SELECT date_of_birth, guardian_consent, guardian_first_name, guardian_last_name,
         guardian_phone, guardian_email
    INTO p
  FROM public.profiles
  WHERE user_id = NEW.client_id;

  IF p IS NULL OR p.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Please complete your personal details (including date of birth) before uploading photos.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_age := date_part('year', age(current_date, p.date_of_birth));

  IF v_age < 16 THEN
    RAISE EXCEPTION 'Photo uploads are not permitted for anyone under 16 years old.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_age < 18 AND NOT (
    COALESCE(p.guardian_consent, false)
    AND COALESCE(NULLIF(btrim(p.guardian_first_name), ''), '') <> ''
    AND COALESCE(NULLIF(btrim(p.guardian_last_name), ''), '') <> ''
    AND COALESCE(NULLIF(btrim(p.guardian_phone), ''), '') <> ''
    AND COALESCE(NULLIF(btrim(p.guardian_email), ''), '') <> ''
  ) THEN
    RAISE EXCEPTION 'Parent/guardian consent must be recorded in personal details before photos can be uploaded.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.client_session_images_guard_minor_consent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS client_session_images_guard_minor_consent ON public.client_session_images;
CREATE TRIGGER client_session_images_guard_minor_consent
BEFORE INSERT OR UPDATE ON public.client_session_images
FOR EACH ROW EXECUTE FUNCTION public.client_session_images_guard_minor_consent();