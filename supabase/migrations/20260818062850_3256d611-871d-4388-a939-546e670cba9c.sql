CREATE OR REPLACE FUNCTION public.claim_nominatim_slot(_min_interval_ms integer DEFAULT 1100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _key text := 'nominatim_next_slot';
  _now timestamptz := clock_timestamp();
  _stored_next timestamptz;
  _my_slot timestamptz;
BEGIN
  INSERT INTO public.system_settings (key, value, updated_at)
  VALUES (_key, jsonb_build_object('next_slot', _now), _now)
  ON CONFLICT (key) DO NOTHING;

  SELECT (value ->> 'next_slot')::timestamptz INTO _stored_next
    FROM public.system_settings
   WHERE key = _key
   FOR UPDATE;

  _my_slot := GREATEST(_stored_next, _now);

  UPDATE public.system_settings
     SET value = jsonb_build_object('next_slot', _my_slot + make_interval(millisecs => _min_interval_ms)),
         updated_at = _now
   WHERE key = _key;

  RETURN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (_my_slot - _now)) * 1000))::integer;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_nominatim_slot(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_nominatim_slot(integer) TO service_role;