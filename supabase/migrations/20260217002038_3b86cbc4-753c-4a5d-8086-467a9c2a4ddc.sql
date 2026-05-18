-- Allow trainers to update any profile (e.g. practitioner_status)
CREATE POLICY "Trainers can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'trainer'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'trainer'::app_role));