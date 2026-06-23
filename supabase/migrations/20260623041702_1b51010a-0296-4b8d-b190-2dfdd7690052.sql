-- Replace the broad "any authenticated user" SELECT policy on training-resources
-- with a role-gated one. Clients never receive resource links (confirmed).
DROP POLICY IF EXISTS "Authenticated users can view resources" ON storage.objects;

CREATE POLICY "Trainers, practitioners, trainees and admins can view resources"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'training-resources'
  AND (
    public.has_role(auth.uid(), 'trainer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'practitioner'::public.app_role)
    OR public.has_role(auth.uid(), 'trainee'::public.app_role)
  )
);