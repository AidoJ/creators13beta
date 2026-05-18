
-- Scope practitioner/trainee SELECT on creator_type_profiles to assigned clients only
DROP POLICY IF EXISTS "Practitioners can view assigned client types" ON creator_type_profiles;
CREATE POLICY "Practitioners can view assigned client types"
  ON creator_type_profiles FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'trainer'::app_role)
    OR (auth.uid() = user_id)
    OR (
      (has_role(auth.uid(), 'practitioner'::app_role) OR has_role(auth.uid(), 'trainee'::app_role))
      AND EXISTS (
        SELECT 1 FROM client_practitioner cp
        WHERE cp.client_id = creator_type_profiles.user_id
          AND cp.practitioner_id = auth.uid()
          AND cp.active = true
      )
    )
  );
