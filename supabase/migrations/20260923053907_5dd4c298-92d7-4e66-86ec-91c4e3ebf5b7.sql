
CREATE POLICY "Project viewers can read thumbnails"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-thumbnails'
  AND (
    public.has_feature(auth.uid(), 'projects_view')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'trainer')
  )
);

CREATE POLICY "Project editors can upload thumbnails"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-thumbnails'
  AND (public.has_feature(auth.uid(), 'projects_add_edit') OR public.has_role(auth.uid(), 'admin'))
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owners can update their thumbnails"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-thumbnails'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
)
WITH CHECK (
  bucket_id = 'project-thumbnails'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Owners can delete their thumbnails"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-thumbnails'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
);
