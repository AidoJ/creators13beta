CREATE POLICY "Public can read prospectus assets"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'prospectus-assets');

CREATE POLICY "Staff can upload prospectus assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'prospectus-assets'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'trainer'))
);

CREATE POLICY "Staff can update prospectus assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'prospectus-assets'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'trainer'))
)
WITH CHECK (
  bucket_id = 'prospectus-assets'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'trainer'))
);

CREATE POLICY "Staff can delete prospectus assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'prospectus-assets'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'trainer'))
);