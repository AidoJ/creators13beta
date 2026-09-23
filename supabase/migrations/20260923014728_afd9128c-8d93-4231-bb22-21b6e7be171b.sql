CREATE OR REPLACE FUNCTION public.review_case_study(
  _case_study_id uuid,
  _status public.case_study_status DEFAULT NULL,
  _reviewer_notes text DEFAULT NULL,
  _profiling_complete boolean DEFAULT NULL,
  _complete_enrollment boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _subject_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'trainer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Trainer or admin access required' USING ERRCODE = '42501';
  END IF;

  IF _status IS NOT NULL AND _status NOT IN (
    'draft'::public.case_study_status,
    'approved'::public.case_study_status,
    'revision_requested'::public.case_study_status
  ) THEN
    RAISE EXCEPTION 'Invalid review status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.case_studies
     SET status = COALESCE(_status, status),
         reviewer_notes = COALESCE(_reviewer_notes, reviewer_notes),
         profiling_complete = COALESCE(_profiling_complete, profiling_complete),
         reviewed_by = CASE
           WHEN _status IN ('approved'::public.case_study_status, 'revision_requested'::public.case_study_status)
             OR _reviewer_notes IS NOT NULL
           THEN auth.uid()
           ELSE reviewed_by
         END,
         reviewed_at = CASE
           WHEN _status IN ('approved'::public.case_study_status, 'revision_requested'::public.case_study_status)
             OR _reviewer_notes IS NOT NULL
           THEN now()
           ELSE reviewed_at
         END
   WHERE id = _case_study_id
   RETURNING subject_user_id INTO _subject_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case study not found' USING ERRCODE = 'P0002';
  END IF;

  IF _complete_enrollment AND _subject_user_id IS NOT NULL THEN
    UPDATE public.profiles
       SET enrollment_step = 'complete'::public.enrollment_step
     WHERE user_id = _subject_user_id;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.review_case_study(uuid, public.case_study_status, text);
REVOKE ALL ON FUNCTION public.review_case_study(uuid, public.case_study_status, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_case_study(uuid, public.case_study_status, text, boolean, boolean) TO authenticated, service_role;