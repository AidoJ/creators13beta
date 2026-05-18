-- Allow trainers/admins and assigned practitioners to manage report images in profiling-photos/reports/{client_id}/...

CREATE POLICY "Practitioners can upload assigned client report images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'reports'
  AND (
    has_role(auth.uid(), 'trainer'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'practitioner'::app_role)
      AND EXISTS (
        SELECT 1
        FROM public.client_practitioner cp
        WHERE cp.practitioner_id = auth.uid()
          AND cp.active = true
          AND cp.client_id::text = (storage.foldername(name))[2]
      )
    )
  )
);

CREATE POLICY "Practitioners can view assigned client report images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'reports'
  AND (
    has_role(auth.uid(), 'trainer'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'practitioner'::app_role)
      AND EXISTS (
        SELECT 1
        FROM public.client_practitioner cp
        WHERE cp.practitioner_id = auth.uid()
          AND cp.active = true
          AND cp.client_id::text = (storage.foldername(name))[2]
      )
    )
  )
);

CREATE POLICY "Practitioners can update assigned client report images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'reports'
  AND (
    has_role(auth.uid(), 'trainer'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'practitioner'::app_role)
      AND EXISTS (
        SELECT 1
        FROM public.client_practitioner cp
        WHERE cp.practitioner_id = auth.uid()
          AND cp.active = true
          AND cp.client_id::text = (storage.foldername(name))[2]
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'profiling-photos'
  AND (storage.foldername(name))[1] = 'reports'
  AND (
    has_role(auth.uid(), 'trainer'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'practitioner'::app_role)
      AND EXISTS (
        SELECT 1
        FROM public.client_practitioner cp
        WHERE cp.practitioner_id = auth.uid()
          AND cp.active = true
          AND cp.client_id::text = (storage.foldername(name))[2]
      )
    )
  )
);