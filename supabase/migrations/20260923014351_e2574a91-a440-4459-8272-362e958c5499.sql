-- Complete the permission-layer hardening without breaking legitimate staff workflows.

-- Profiles: authenticated browser clients may update ordinary member fields, but
-- never certification or guardian verification fields. Staff changes go through
-- a role-checked function below.
DO $$
DECLARE
  cols text;
  protected text[] := ARRAY[
    'practitioner_status','certification_level',
    'guardian_consent_status','guardian_email_confirmed_at','guardian_verbal_confirmed_at',
    'guardian_verbal_confirmed_by','guardian_verification_token','guardian_verification_sent_at',
    'guardian_reminder_last_sent_at','guardian_reminder_count'
  ];
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND NOT (column_name = ANY(protected));

  REVOKE UPDATE ON public.profiles FROM authenticated;
  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', cols);
END $$;

CREATE OR REPLACE FUNCTION public.set_practitioner_certification(
  _user_id uuid,
  _status public.practitioner_status DEFAULT NULL,
  _certification_level smallint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'trainer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Trainer or admin access required' USING ERRCODE = '42501';
  END IF;

  IF _certification_level IS NOT NULL AND _certification_level NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Certification level must be between 1 and 3' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET practitioner_status = COALESCE(_status, practitioner_status),
         certification_level = COALESCE(_certification_level, certification_level)
   WHERE user_id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_practitioner_certification(uuid, public.practitioner_status, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_practitioner_certification(uuid, public.practitioner_status, smallint) TO authenticated, service_role;

-- Case studies: remove reviewer identity/timestamp from browser UPDATE grants.
-- Status remains writable because practitioners legitimately submit/re-submit,
-- while RLS prevents them from setting approved.
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'case_studies'
    AND column_name NOT IN ('reviewed_by', 'reviewed_at');

  REVOKE UPDATE ON public.case_studies FROM authenticated;
  EXECUTE format('GRANT UPDATE (%s) ON public.case_studies TO authenticated', cols);
END $$;

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
);

CREATE OR REPLACE FUNCTION public.review_case_study(
  _case_study_id uuid,
  _status public.case_study_status DEFAULT NULL,
  _reviewer_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'trainer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Trainer or admin access required' USING ERRCODE = '42501';
  END IF;

  IF _status IS NOT NULL AND _status NOT IN (
    'approved'::public.case_study_status,
    'revision_requested'::public.case_study_status
  ) THEN
    RAISE EXCEPTION 'Invalid review status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.case_studies
     SET status = COALESCE(_status, status),
         reviewer_notes = COALESCE(_reviewer_notes, reviewer_notes),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = _case_study_id;
END;
$$;
REVOKE ALL ON FUNCTION public.review_case_study(uuid, public.case_study_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_case_study(uuid, public.case_study_status, text) TO authenticated, service_role;

-- Invitation UPDATEs are performed by staff policies or trusted functions only.
DROP POLICY IF EXISTS "Practitioners cannot update invitations" ON public.client_invitations;