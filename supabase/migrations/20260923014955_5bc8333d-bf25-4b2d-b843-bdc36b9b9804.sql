DROP POLICY IF EXISTS "Practitioners can create invitations" ON public.client_invitations;
CREATE POLICY "Practitioners can create invitations"
ON public.client_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  practitioner_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'practitioner'::public.app_role)
    OR public.has_role(auth.uid(), 'trainee'::public.app_role)
    OR public.has_role(auth.uid(), 'trainer'::public.app_role)
  )
);