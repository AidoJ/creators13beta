CREATE OR REPLACE FUNCTION public.get_gst_setting()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT value FROM public.system_settings WHERE key = 'gst'), '{"registered": false, "registered_from": null}'::jsonb)
$$;
REVOKE ALL ON FUNCTION public.get_gst_setting() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_gst_setting() TO authenticated;