CREATE POLICY "Certified practitioners can view Clinic Profile"
ON public.products
FOR SELECT
TO authenticated
USING (
  active = true
  AND name = 'Clinic Profile'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.practitioner_status = 'certified'
      AND p.certification_level >= 1
  )
);