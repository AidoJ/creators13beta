CREATE OR REPLACE FUNCTION public.get_joinable_event_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT tcta.training_call_id
  FROM public.training_call_tier_access tcta
  WHERE auth.uid() IS NOT NULL AND tcta.access = true AND tcta.visible = true;
$$;
REVOKE ALL ON FUNCTION public.get_joinable_event_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_joinable_event_ids() TO authenticated;