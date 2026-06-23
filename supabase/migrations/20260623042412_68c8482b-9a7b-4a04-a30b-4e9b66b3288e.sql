-- Allow admins (in addition to trainers) to upload and delete training resources.
-- Surfaced when an admin hit "new row violates row-level security policy" on upload.
DROP POLICY IF EXISTS "Trainers can upload resources" ON storage.objects;
DROP POLICY IF EXISTS "Trainers can delete resources" ON storage.objects;

CREATE POLICY "Trainers and admins can upload resources"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'training-resources'
  AND (
    public.has_role(auth.uid(), 'trainer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "Trainers and admins can delete resources"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'training-resources'
  AND (
    public.has_role(auth.uid(), 'trainer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);