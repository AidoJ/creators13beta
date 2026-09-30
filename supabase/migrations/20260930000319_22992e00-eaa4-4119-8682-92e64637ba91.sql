CREATE OR REPLACE FUNCTION public.profiles_guard_certification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF current_setting('app.guardian_trusted', true) = 'on' THEN RETURN NEW; END IF;
  IF (NEW.practitioner_status IS DISTINCT FROM OLD.practitioner_status)
     OR (NEW.certification_level IS DISTINCT FROM OLD.certification_level)
     OR (NEW.guardian_consent_status IS DISTINCT FROM OLD.guardian_consent_status)
     OR (NEW.guardian_email_confirmed_at IS DISTINCT FROM OLD.guardian_email_confirmed_at)
     OR (NEW.guardian_verbal_confirmed_at IS DISTINCT FROM OLD.guardian_verbal_confirmed_at)
     OR (NEW.guardian_verbal_confirmed_by IS DISTINCT FROM OLD.guardian_verbal_confirmed_by)
     OR (NEW.guardian_verification_token IS DISTINCT FROM OLD.guardian_verification_token)
     OR (NEW.guardian_verification_sent_at IS DISTINCT FROM OLD.guardian_verification_sent_at)
     OR (NEW.guardian_reminder_last_sent_at IS DISTINCT FROM OLD.guardian_reminder_last_sent_at)
     OR (NEW.guardian_reminder_count IS DISTINCT FROM OLD.guardian_reminder_count) THEN
    IF NOT (public.has_role(auth.uid(), 'trainer'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
      RAISE EXCEPTION 'Only trainers or admins can change certification or guardian verification fields' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.profiles_guard_certification() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_guardian_email(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p RECORD;
BEGIN
  IF _token IS NULL OR btrim(_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_token');
  END IF;
  SELECT user_id, first_name, guardian_first_name, guardian_email_confirmed_at, guardian_verbal_confirmed_at
    INTO p FROM public.profiles WHERE guardian_verification_token = btrim(_token);
  IF p IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token'); END IF;
  IF p.guardian_email_confirmed_at IS NULL THEN
    -- Token possession is the proof; allow this one trusted write whoever is signed in.
    PERFORM set_config('app.guardian_trusted', 'on', true);
    UPDATE public.profiles SET guardian_email_confirmed_at = now() WHERE user_id = p.user_id;
    PERFORM set_config('app.guardian_trusted', 'off', true);
  END IF;
  RETURN jsonb_build_object('ok', true, 'already', p.guardian_email_confirmed_at IS NOT NULL,
    'child_name', p.first_name, 'guardian_name', p.guardian_first_name,
    'verbal_done', p.guardian_verbal_confirmed_at IS NOT NULL);
END; $function$;