-- Event cover images: members can view, signed-in members can upload their own
CREATE POLICY "Authenticated users can view event covers"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'event-covers');

CREATE POLICY "Authenticated users can upload event covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'event-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own event covers"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'event-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own event covers"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'event-covers' AND (storage.foldername(name))[1] = auth.uid()::text);