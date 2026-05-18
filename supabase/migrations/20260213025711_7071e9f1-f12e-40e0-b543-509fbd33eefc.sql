-- Allow users to update/replace their own profiling photos
CREATE POLICY "Users can update own profiling photos"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'profiling-photos' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'profiling-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);