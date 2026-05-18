
-- 1. Fix privilege escalation: drop unsafe self-insert policy on user_roles
DROP POLICY IF EXISTS "Users can insert own role" ON user_roles;

-- 2. Fix profiles PII exposure: restrict to authenticated users
DROP POLICY IF EXISTS "Authenticated users can view practitioner profiles" ON profiles;
CREATE POLICY "Authenticated users can view practitioner profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = profiles.user_id
        AND user_roles.role = ANY(ARRAY['practitioner'::app_role, 'trainee'::app_role])
    )
  );

-- 3. Fix email templates public read
DROP POLICY IF EXISTS "Service role can read templates" ON email_templates;

-- 4. Fix subscription self-update: remove user self-update policy
DROP POLICY IF EXISTS "Users can update own subscription" ON subscriptions;
