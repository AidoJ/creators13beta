DROP POLICY IF EXISTS "Authenticated can read access grid" ON public.access_grid;
DROP POLICY IF EXISTS "Authenticated can read access levels" ON public.access_levels;
DROP POLICY IF EXISTS "Authenticated can read features" ON public.features;
CREATE POLICY "Staff read access grid" ON public.access_grid FOR SELECT TO authenticated USING (has_role(auth.uid(),'trainer') OR has_role(auth.uid(),'admin'));
CREATE POLICY "Staff read access levels" ON public.access_levels FOR SELECT TO authenticated USING (has_role(auth.uid(),'trainer') OR has_role(auth.uid(),'admin'));
CREATE POLICY "Staff read features" ON public.features FOR SELECT TO authenticated USING (has_role(auth.uid(),'trainer') OR has_role(auth.uid(),'admin'));
ALTER FUNCTION public.tcta_sync_level_key() SECURITY DEFINER;