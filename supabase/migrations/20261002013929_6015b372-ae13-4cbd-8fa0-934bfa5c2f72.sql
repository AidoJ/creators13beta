DROP POLICY IF EXISTS "Authenticated users can upload event covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own event covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own event covers" ON storage.objects;

CREATE POLICY "Staff can upload event covers" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'event-covers'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'trainer')));

CREATE POLICY "Staff can update their own event covers" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'event-covers'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'trainer')))
WITH CHECK (bucket_id = 'event-covers'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'trainer')));

CREATE POLICY "Staff can delete their own event covers" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'event-covers'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'trainer')));