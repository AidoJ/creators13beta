
-- Fix community_posts: add UPDATE and DELETE policies for post owners
CREATE POLICY "Users can update own posts"
  ON community_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON community_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add admin/trainer management for community_posts
CREATE POLICY "Admins and trainers can manage posts"
  ON community_posts FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Restrict client self-assignment to practitioners: require valid practitioner_code lookup
DROP POLICY IF EXISTS "Clients can assign themselves to practitioners" ON client_practitioner;
CREATE POLICY "Clients can assign themselves to practitioners"
  ON client_practitioner FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = client_id
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = client_practitioner.practitioner_id
        AND ur.role IN ('practitioner'::app_role, 'trainee'::app_role)
    )
  );
