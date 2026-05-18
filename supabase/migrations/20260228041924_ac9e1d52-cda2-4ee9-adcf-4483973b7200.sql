-- Allow practitioners, trainees, and trainers to upload case study attachments
CREATE POLICY "Practitioners can upload case study attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'case-study-attachments'
  AND (
    has_role(auth.uid(), 'practitioner'::app_role)
    OR has_role(auth.uid(), 'trainee'::app_role)
    OR has_role(auth.uid(), 'trainer'::app_role)
  )
);

-- Allow practitioners, trainees, and trainers to update (upsert) case study attachments
CREATE POLICY "Practitioners can update case study attachments"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'case-study-attachments'
  AND (
    has_role(auth.uid(), 'practitioner'::app_role)
    OR has_role(auth.uid(), 'trainee'::app_role)
    OR has_role(auth.uid(), 'trainer'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'case-study-attachments'
  AND (
    has_role(auth.uid(), 'practitioner'::app_role)
    OR has_role(auth.uid(), 'trainee'::app_role)
    OR has_role(auth.uid(), 'trainer'::app_role)
  )
);

-- Allow practitioners, trainees, and trainers to view case study attachments
CREATE POLICY "Practitioners can view case study attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'case-study-attachments'
  AND (
    has_role(auth.uid(), 'practitioner'::app_role)
    OR has_role(auth.uid(), 'trainee'::app_role)
    OR has_role(auth.uid(), 'trainer'::app_role)
  )
);