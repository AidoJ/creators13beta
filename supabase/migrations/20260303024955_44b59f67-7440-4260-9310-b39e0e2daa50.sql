-- Allow clients to view zoom recordings for case studies where they are the subject
CREATE POLICY "Clients can view recordings for their case studies"
ON public.zoom_recordings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.case_studies cs
    WHERE cs.id = zoom_recordings.case_study_id
      AND cs.subject_user_id = auth.uid()
  )
);