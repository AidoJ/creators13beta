DROP FUNCTION IF EXISTS public.get_community_events(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_community_events(
  _from timestamptz DEFAULT now() - interval '1 day',
  _to   timestamptz DEFAULT now() + interval '180 days'
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  scheduled_at timestamptz,
  duration_minutes int,
  zoom_link text,
  has_access boolean,
  caller_tier public.subscription_tier,
  starts_at timestamptz,
  ends_at timestamptz,
  is_multi_day boolean,
  sessions jsonb,
  event_type text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid  uuid := auth.uid();
  _tier public.subscription_tier;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  _tier := public.resolve_effective_tier(_uid);

  RETURN QUERY
  SELECT
    tc.id,
    tc.title,
    tc.description,
    tc.scheduled_at,
    tc.duration_minutes,
    CASE WHEN tcta.access THEN tc.zoom_link ELSE NULL END AS zoom_link,
    tcta.access AS has_access,
    _tier AS caller_tier,
    tc.starts_at,
    tc.ends_at,
    COALESCE(tc.is_multi_day, false) AS is_multi_day,
    tc.sessions,
    tc.event_type
  FROM public.training_calls tc
  JOIN public.training_call_tier_access tcta
    ON tcta.training_call_id = tc.id
   AND tcta.tier = _tier
   AND tcta.visible = true
  WHERE COALESCE(tc.starts_at, tc.scheduled_at) >= _from
    AND COALESCE(tc.starts_at, tc.scheduled_at) <= _to
  ORDER BY COALESCE(tc.starts_at, tc.scheduled_at) ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_events(timestamptz, timestamptz) TO authenticated;