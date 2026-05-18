-- === PROFILES ===
DROP POLICY IF EXISTS "Trainers can update all profiles" ON profiles;
CREATE POLICY "Admins and trainers can update all profiles" ON profiles FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Trainers can view all profiles" ON profiles;
CREATE POLICY "Admins and trainers can view all profiles" ON profiles FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- === USER_ROLES ===
DROP POLICY IF EXISTS "Trainers can manage all roles" ON user_roles;
CREATE POLICY "Admins and trainers can manage all roles" ON user_roles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- === TRAINING_RESOURCES ===
DROP POLICY IF EXISTS "Trainers can manage resources" ON training_resources;
CREATE POLICY "Admins and trainers can manage resources" ON training_resources FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- === FAQS ===
DROP POLICY IF EXISTS "Trainers can insert FAQs" ON faqs;
CREATE POLICY "Admins and trainers can insert FAQs" ON faqs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Trainers can update FAQs" ON faqs;
CREATE POLICY "Admins and trainers can update FAQs" ON faqs FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Trainers can delete FAQs" ON faqs;
CREATE POLICY "Admins and trainers can delete FAQs" ON faqs FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- === SUBSCRIPTIONS ===
DROP POLICY IF EXISTS "Trainers can view all subscriptions" ON subscriptions;
CREATE POLICY "Admins and trainers can view all subscriptions" ON subscriptions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- === ORDERS ===
DROP POLICY IF EXISTS "Trainers can manage all orders" ON orders;
CREATE POLICY "Admins and trainers can manage all orders" ON orders FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- === PRODUCTS ===
DROP POLICY IF EXISTS "Trainers can manage products" ON products;
CREATE POLICY "Admins and trainers can manage products" ON products FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- === BOOKINGS ===
DROP POLICY IF EXISTS "Trainers can manage all bookings" ON bookings;
CREATE POLICY "Admins and trainers can manage all bookings" ON bookings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- === PROFILING_PHOTOS ===
DROP POLICY IF EXISTS "Trainers can view all photos" ON profiling_photos;
CREATE POLICY "Admins and trainers can view all photos" ON profiling_photos FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- === CLIENT_INVITATIONS ===
DROP POLICY IF EXISTS "Trainers can manage all invitations" ON client_invitations;
CREATE POLICY "Admins and trainers can manage all invitations" ON client_invitations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- === CLIENT_PRACTITIONER ===
DROP POLICY IF EXISTS "Trainers can manage all assignments" ON client_practitioner;
CREATE POLICY "Admins and trainers can manage all assignments" ON client_practitioner FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Trainers can insert assignments" ON client_practitioner;
CREATE POLICY "Admins and trainers can insert assignments" ON client_practitioner FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));