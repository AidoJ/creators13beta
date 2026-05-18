CREATE UNIQUE INDEX IF NOT EXISTS case_studies_unique_practitioner_subject
  ON public.case_studies (practitioner_id, subject_user_id)
  WHERE subject_user_id IS NOT NULL;