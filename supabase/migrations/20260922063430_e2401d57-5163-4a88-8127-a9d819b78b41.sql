-- 1. Three-state guardian consent status + separate confirmation records
DO $$ BEGIN
  CREATE TYPE public.guardian_consent_state AS ENUM ('pending', 'email_confirmed', 'verified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS guardian_consent_status public.guardian_consent_state NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS guardian_email_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS guardian_verbal_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS guardian_verbal_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS guardian_verification_token text,
  ADD COLUMN IF NOT EXISTS guardian_verification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS guardian_reminder_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS guardian_reminder_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_guardian_verification_token_key
  ON public.profiles (guardian_verification_token)
  WHERE guardian_verification_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_guardian_consent_status_idx
  ON public.profiles (guardian_consent_status)
  WHERE guardian_consent_status <> 'verified';

-- 2. Status is always derived from the two confirmations; never written directly.
CREATE OR REPLACE FUNCTION public.profiles_derive_guardian_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.guardian_consent_status :=
    CASE
      WHEN NEW.guardian_email_confirmed_at IS NOT NULL
       AND NEW.guardian_verbal_confirmed_at IS NOT NULL THEN 'verified'
      WHEN NEW.guardian_email_confirmed_at IS NOT NULL THEN 'email_confirmed'
      ELSE 'pending'
    END::public.guardian_consent_state;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_derive_guardian_status_trg ON public.profiles;
CREATE TRIGGER profiles_derive_guardian_status_trg
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_derive_guardian_status();

-- 3. Members may not write the verification fields at all: same access boundary
--    as certification. Column-level grants — everything except the protected set.
DO $$
DECLARE
  cols text;
  protected text[] := ARRAY[
    'guardian_consent_status','guardian_email_confirmed_at','guardian_verbal_confirmed_at',
    'guardian_verbal_confirmed_by','guardian_verification_token','guardian_verification_sent_at',
    'guardian_reminder_last_sent_at','guardian_reminder_count'
  ];
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND NOT (column_name = ANY(protected));

  EXECUTE 'REVOKE UPDATE ON public.profiles FROM authenticated';
  EXECUTE 'REVOKE INSERT ON public.profiles FROM authenticated';
  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', cols);
  EXECUTE format('GRANT INSERT (%s) ON public.profiles TO authenticated', cols);
END $$;

GRANT ALL ON public.profiles TO service_role;

-- 4. Upload guards now require the verified state specifically.
CREATE OR REPLACE FUNCTION public.profiling_photos_guard_minor_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  v_age int;
BEGIN
  SELECT date_of_birth, guardian_consent_status INTO p
  FROM public.profiles WHERE user_id = NEW.user_id;

  IF p IS NULL OR p.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Please complete your personal details (including date of birth) before uploading photos.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_age := date_part('year', age(current_date, p.date_of_birth));

  IF v_age < 16 THEN
    RAISE EXCEPTION 'Photo uploads are not permitted for anyone under 16 years old.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_age < 18 AND p.guardian_consent_status <> 'verified' THEN
    RAISE EXCEPTION 'Parent/guardian consent is not yet verified. Both the email confirmation and the phone confirmation with 13 Creators must be completed before photos can be uploaded.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

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
  SELECT date_of_birth, guardian_consent_status INTO p
  FROM public.profiles WHERE user_id = NEW.client_id;

  IF p IS NULL OR p.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Please complete your personal details (including date of birth) before uploading photos.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_age := date_part('year', age(current_date, p.date_of_birth));

  IF v_age < 16 THEN
    RAISE EXCEPTION 'Photo uploads are not permitted for anyone under 16 years old.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_age < 18 AND p.guardian_consent_status <> 'verified' THEN
    RAISE EXCEPTION 'Parent/guardian consent is not yet verified. Both the email confirmation and the phone confirmation with 13 Creators must be completed before photos can be uploaded.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Step one: the guardian clicks the emailed link.
CREATE OR REPLACE FUNCTION public.confirm_guardian_email(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
BEGIN
  IF _token IS NULL OR btrim(_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_token');
  END IF;

  SELECT user_id, first_name, guardian_first_name, guardian_email_confirmed_at,
         guardian_verbal_confirmed_at
    INTO p
  FROM public.profiles
  WHERE guardian_verification_token = _token;

  IF p IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  IF p.guardian_email_confirmed_at IS NULL THEN
    UPDATE public.profiles
      SET guardian_email_confirmed_at = now()
    WHERE user_id = p.user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', p.guardian_email_confirmed_at IS NOT NULL,
    'child_name', p.first_name,
    'guardian_name', p.guardian_first_name,
    'verbal_done', p.guardian_verbal_confirmed_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_guardian_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_guardian_email(text) TO anon, authenticated, service_role;

-- 6. Step two: A'Hara records the verbal confirmation (trainer/admin only).
CREATE OR REPLACE FUNCTION public.confirm_guardian_verbal_consent(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'trainer') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only a trainer or admin can record verbal guardian consent.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT user_id, guardian_email_confirmed_at, guardian_verbal_confirmed_at
    INTO p
  FROM public.profiles WHERE user_id = _user_id;

  IF p IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF p.guardian_email_confirmed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_not_confirmed');
  END IF;

  IF p.guardian_verbal_confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  UPDATE public.profiles
    SET guardian_verbal_confirmed_at = now(),
        guardian_verbal_confirmed_by = auth.uid()
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_guardian_verbal_consent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_guardian_verbal_consent(uuid) TO authenticated, service_role;

-- 7. A'Hara's queue: every minor enrolment not yet verified.
CREATE OR REPLACE FUNCTION public.get_guardian_consent_queue()
RETURNS TABLE (
  user_id uuid,
  child_name text,
  child_email text,
  date_of_birth date,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  status public.guardian_consent_state,
  email_confirmed_at timestamptz,
  verbal_confirmed_at timestamptz,
  verification_sent_at timestamptz,
  days_waiting integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'trainer') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorised.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT p.user_id,
         btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
         p.email,
         p.date_of_birth,
         btrim(coalesce(p.guardian_first_name, '') || ' ' || coalesce(p.guardian_last_name, '')),
         p.guardian_phone,
         p.guardian_email,
         p.guardian_consent_status,
         p.guardian_email_confirmed_at,
         p.guardian_verbal_confirmed_at,
         p.guardian_verification_sent_at,
         GREATEST(0, date_part('day', now() - coalesce(p.guardian_email_confirmed_at, p.guardian_verification_sent_at, now()))::int)
  FROM public.profiles p
  WHERE p.date_of_birth IS NOT NULL
    AND date_part('year', age(current_date, p.date_of_birth)) < 18
    AND p.guardian_consent_status <> 'verified'
    AND p.guardian_email IS NOT NULL
  ORDER BY coalesce(p.guardian_email_confirmed_at, p.guardian_verification_sent_at) ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_guardian_consent_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guardian_consent_queue() TO authenticated, service_role;

-- 8. Backfill: existing minors who already completed the old single-tick consent
--    keep their evidence but must still complete both new confirmations.
UPDATE public.profiles
  SET guardian_consent_status = 'pending'
WHERE guardian_email_confirmed_at IS NULL
  AND guardian_verbal_confirmed_at IS NULL
  AND guardian_consent_status <> 'pending';