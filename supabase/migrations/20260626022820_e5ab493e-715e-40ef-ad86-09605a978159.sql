
CREATE POLICY "Trainers and admins can upload email assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'email-assets' AND (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Trainers and admins can update email assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'email-assets' AND (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (bucket_id = 'email-assets' AND (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Trainers and admins can delete email assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'email-assets' AND (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Email assets publicly readable" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'email-assets');
