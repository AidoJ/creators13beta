DROP POLICY IF EXISTS "Public can read prospectus assets" ON storage.objects;
CREATE POLICY "Public can read prospectus assets"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'prospectus-assets');