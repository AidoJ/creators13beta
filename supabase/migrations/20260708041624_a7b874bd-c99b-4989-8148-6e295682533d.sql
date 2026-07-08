DROP POLICY IF EXISTS "Admins or trainers can read game card art objects" ON storage.objects;

CREATE POLICY "Admins or trainers can read game card art objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'game-card-art'
  AND (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'trainer'::app_role)
  )
);