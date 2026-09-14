CREATE OR REPLACE FUNCTION public.case_studies_guard_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  privileged boolean;
BEGIN
  privileged := auth.uid() IS NULL
    OR public.has_role(auth.uid(), 'trainer')
    OR public.has_role(auth.uid(), 'admin');

  -- Existing rule: only trainer/admin may set status to 'approved' or set review fields
  IF NOT privileged THEN
    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'Only trainers or admins can approve case studies';
    END IF;
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      RAISE EXCEPTION 'Only trainers or admins can set review fields on case studies';
    END IF;

    -- New rule: rows already approved are locked for non-privileged callers
    IF OLD.status = 'approved' THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Only trainers or admins can change the status of an approved case study';
      END IF;
      IF NEW.subject_user_id IS DISTINCT FROM OLD.subject_user_id THEN
        RAISE EXCEPTION 'Only trainers or admins can change the subject of an approved case study';
      END IF;
      IF NEW.creator_types_identified IS DISTINCT FROM OLD.creator_types_identified THEN
        RAISE EXCEPTION 'Only trainers or admins can change creator types on an approved case study';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.case_studies_guard_approval() FROM PUBLIC, anon, authenticated;