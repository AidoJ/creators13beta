
-- 1. Fix subscription self-insert: restrict to free tier only
DROP POLICY IF EXISTS "Users can insert own subscription" ON subscriptions;
CREATE POLICY "Users can insert own subscription"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND tier = 'wren'::subscription_tier);

-- 2. Fix creator_type_profiles update: scope to assigned clients
DROP POLICY IF EXISTS "Practitioners can update creator types" ON creator_type_profiles;
CREATE POLICY "Practitioners can update creator types"
  ON creator_type_profiles FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'trainer'::app_role)
    OR auth.uid() = user_id
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
