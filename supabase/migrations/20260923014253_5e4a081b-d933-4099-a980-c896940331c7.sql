-- Close the three policy/grant gaps identified by the security scan.

-- 1) Profiles: keep all normal self-service fields available, but make
-- certification and guardian-verification state server/staff controlled.
CREATE OR REPLACE FUNCTION public.profiles_guard_certification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

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
    IF NOT (public.has_role(auth.uid(), 'trainer'::app_role)
            OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
      RAISE EXCEPTION 'Only trainers or admins can change certification or guardian verification fields'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_guard_certification() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- The guardian email token is a bearer secret used only by server-side flows.
-- Preserve ordinary self/profile/staff reads while removing that column from
-- browser-accessible authenticated reads.
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name <> 'guardian_verification_token';

  EXECUTE 'REVOKE SELECT ON public.profiles FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', cols);
END $$;

GRANT ALL ON public.profiles TO service_role;

-- 2) Case studies: align RLS with the existing trigger guard so approval is
-- blocked at both layers for non-trainer/non-admin practitioners.
DROP POLICY IF EXISTS "Practitioners can update own case studies" ON public.case_studies;
CREATE POLICY "Practitioners can update own case studies"
ON public.case_studies
FOR UPDATE
TO authenticated
USING (
  auth.uid() = practitioner_id
  AND status IS DISTINCT FROM 'approved'::public.case_study_status
)
WITH CHECK (
  auth.uid() = practitioner_id
  AND status IS DISTINCT FROM 'approved'::public.case_study_status
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);

-- 3) Client invitations: no browser path legitimately updates an existing
-- invitation. Payment, status and redemption changes already use trusted
-- webhook/SECURITY DEFINER paths, while staff retain their management policy.
DROP POLICY IF EXISTS "Practitioners can update own invitations" ON public.client_invitations;
REVOKE UPDATE ON public.client_invitations FROM authenticated;
GRANT UPDATE ON public.client_invitations TO service_role;

-- Staff need table privilege in addition to their RLS management policy.
GRANT UPDATE ON public.client_invitations TO authenticated;

CREATE POLICY "Practitioners cannot update invitations"
ON public.client_invitations
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);