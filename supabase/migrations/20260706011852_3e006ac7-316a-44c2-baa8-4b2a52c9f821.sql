-- Broaden game-card-art bucket write policies to allow trainers as well as admins
DROP POLICY IF EXISTS "Admins can upload game card art" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update game card art" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete game card art" ON storage.objects;

CREATE POLICY "Admins or trainers can upload game card art"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'game-card-art'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'trainer'::app_role))
);

CREATE POLICY "Admins or trainers can update game card art"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'game-card-art'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'trainer'::app_role))
)
WITH CHECK (
  bucket_id = 'game-card-art'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'trainer'::app_role))
);

CREATE POLICY "Admins or trainers can delete game card art"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'game-card-art'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'trainer'::app_role))
);