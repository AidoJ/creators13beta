-- Allow practitioners/trainees/trainers to upload body drawings
CREATE POLICY "Practitioners can upload body drawings"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'body-drawings'
  AND (
    has_role(auth.uid(), 'practitioner'::app_role)
    OR has_role(auth.uid(), 'trainee'::app_role)
    OR has_role(auth.uid(), 'trainer'::app_role)
  )
);

CREATE POLICY "Practitioners can update body drawings"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'body-drawings'
  AND (
    has_role(auth.uid(), 'practitioner'::app_role)
    OR has_role(auth.uid(), 'trainee'::app_role)
    OR has_role(auth.uid(), 'trainer'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'body-drawings'
  AND (
    has_role(auth.uid(), 'practitioner'::app_role)
    OR has_role(auth.uid(), 'trainee'::app_role)
    OR has_role(auth.uid(), 'trainer'::app_role)
  )
);

CREATE POLICY "Practitioners can view body drawings"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'body-drawings'
  AND (
    has_role(auth.uid(), 'practitioner'::app_role)
    OR has_role(auth.uid(), 'trainee'::app_role)
    OR has_role(auth.uid(), 'trainer'::app_role)
  )
);