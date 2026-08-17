DROP POLICY IF EXISTS "Admins and trainers can manage all roles" ON public.user_roles;

CREATE POLICY "Admins and trainers can view all roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'trainer'::app_role)
  );

CREATE POLICY "Admins can grant any role; trainers cannot grant admin/trainer"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'trainer'::app_role)
      AND role NOT IN ('admin'::app_role, 'trainer'::app_role)
    )
  );

CREATE POLICY "Admins can update any role; trainers cannot touch admin/trainer"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'trainer'::app_role)
      AND role NOT IN ('admin'::app_role, 'trainer'::app_role)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'trainer'::app_role)
      AND role NOT IN ('admin'::app_role, 'trainer'::app_role)
    )
  );

CREATE POLICY "Admins can revoke any role; trainers cannot touch admin/trainer"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'trainer'::app_role)
      AND role NOT IN ('admin'::app_role, 'trainer'::app_role)
    )
  );