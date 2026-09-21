DROP POLICY IF EXISTS "Practitioners can insert creator types" ON public.creator_type_profiles;

CREATE POLICY "Practitioners can insert creator types for assigned clients"
ON public.creator_type_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'trainer'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'practitioner'::app_role) OR has_role(auth.uid(), 'trainee'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.client_practitioner cp
      WHERE cp.client_id = creator_type_profiles.user_id
        AND cp.practitioner_id = auth.uid()
        AND cp.active = true
    )
  )
);