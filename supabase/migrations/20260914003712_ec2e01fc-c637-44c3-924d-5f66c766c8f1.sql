DROP POLICY IF EXISTS "Practitioners can create case studies" ON public.case_studies;
CREATE POLICY "Practitioners can create case studies"
ON public.case_studies
FOR INSERT
TO authenticated
WITH CHECK (
  practitioner_id = auth.uid()
  AND (status IS DISTINCT FROM 'approved'::case_study_status)
  AND (
    public.has_role(auth.uid(), 'practitioner'::app_role)
    OR public.has_role(auth.uid(), 'trainee'::app_role)
  )
);

CREATE OR REPLACE FUNCTION public.case_studies_guard_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _privileged boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  _privileged := public.has_role(auth.uid(), 'trainer'::app_role)
                 OR public.has_role(auth.uid(), 'admin'::app_role);

  IF _privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved'::case_study_status
       OR NEW.reviewed_by IS NOT NULL
       OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only trainers or admins can approve or review case studies'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'approved'::case_study_status)
     OR (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by)
     OR (NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at) THEN
    RAISE EXCEPTION 'Only trainers or admins can approve or review case studies'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS case_studies_guard_approval ON public.case_studies;
CREATE TRIGGER case_studies_guard_approval
BEFORE INSERT OR UPDATE ON public.case_studies
FOR EACH ROW EXECUTE FUNCTION public.case_studies_guard_approval();