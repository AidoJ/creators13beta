CREATE OR REPLACE FUNCTION public.prospectus_asset_in_use(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.prospectus_sections s
    WHERE position(_name in coalesce(s.image_urls::text,'')) > 0
       OR position(_name in coalesce(s.canvas_layout::text,'')) > 0
       OR position(_name in coalesce(s.body,'')) > 0
  )
$$;
GRANT EXECUTE ON FUNCTION public.prospectus_asset_in_use(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read prospectus assets" ON storage.objects;
CREATE POLICY "Public can read published prospectus assets" ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'prospectus-assets' AND length(name) > 8 AND public.prospectus_asset_in_use(name));
CREATE POLICY "Staff can read all prospectus assets" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'prospectus-assets' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'trainer')));