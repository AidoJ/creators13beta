-- Allow authenticated users to see practitioner/trainee roles (needed for practitioner selection)
CREATE POLICY "Authenticated users can view practitioner roles"
ON public.user_roles
FOR SELECT
USING (
  role IN ('practitioner', 'trainee')
);