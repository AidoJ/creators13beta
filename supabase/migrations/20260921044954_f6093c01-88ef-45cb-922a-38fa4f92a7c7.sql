-- client_session_images: creation requires an active client link (same check viewing uses)
DROP POLICY "Practitioners can insert own session images" ON public.client_session_images;
CREATE POLICY "Practitioners can insert own session images"
ON public.client_session_images
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = practitioner_id
  AND EXISTS (
    SELECT 1 FROM client_practitioner cp
    WHERE cp.client_id = client_session_images.client_id
      AND cp.practitioner_id = auth.uid()
      AND cp.active = true
  )
);

-- zoom_recordings: creation requires an active client link to the case study's subject
DROP POLICY "Practitioners can insert own recordings" ON public.zoom_recordings;
CREATE POLICY "Practitioners can insert own recordings"
ON public.zoom_recordings
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = practitioner_id
  AND EXISTS (
    SELECT 1
    FROM case_studies cs
    JOIN client_practitioner cp ON cp.client_id = cs.subject_user_id
    WHERE cs.id = zoom_recordings.case_study_id
      AND cp.practitioner_id = auth.uid()
      AND cp.active = true
  )
);