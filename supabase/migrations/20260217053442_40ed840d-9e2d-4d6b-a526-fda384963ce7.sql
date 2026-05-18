-- Allow any authenticated user to see profiles that have a practitioner/trainee role
-- This is needed for the practitioner selection step during enrollment
CREATE POLICY "Authenticated users can view practitioner profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = profiles.user_id
    AND user_roles.role IN ('practitioner', 'trainee')
  )
);