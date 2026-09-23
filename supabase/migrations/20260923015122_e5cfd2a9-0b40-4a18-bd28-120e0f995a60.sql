DROP POLICY IF EXISTS "Authenticated can read system settings" ON public.system_settings;
CREATE POLICY "Staff can read system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'trainer'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);