DROP FUNCTION IF EXISTS public.get_community_events(timestamptz, timestamptz);
CREATE FUNCTION public.get_community_events(_from timestamp with time zone DEFAULT (now() - '1 day'::interval), _to timestamp with time zone DEFAULT (now() + '180 days'::interval))
 RETURNS TABLE(id uuid, title text, description text, scheduled_at timestamp with time zone, duration_minutes integer, zoom_link text, has_access boolean, caller_tier subscription_tier, starts_at timestamp with time zone, ends_at timestamp with time zone, is_multi_day boolean, sessions jsonb, event_type text, cover_image_url text, cover_image_fit text, cover_image_position text, promo_link text, promo_label text, location text, open_to text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid  uuid := auth.uid();
  _tier public.subscription_tier;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_feature(_uid, 'events_view') THEN
    RETURN;
  END IF;
  _tier := public.resolve_effective_tier(_uid);
  RETURN QUERY
  WITH held AS (
    SELECT 'free'::text AS level_key
    UNION
    SELECT e.level_key FROM public.entitlements e
    WHERE e.user_id = _uid AND e.status = 'active' AND e.starts_at <= now()
      AND (e.ends_at IS NULL OR e.ends_at > now())
  )
  SELECT
    tc.id, tc.title, tc.description, tc.scheduled_at, tc.duration_minutes,
    CASE WHEN bool_or(tcta.access) THEN tc.zoom_link ELSE NULL END,
    bool_or(tcta.access),
    _tier,
    tc.starts_at, tc.ends_at, COALESCE(tc.is_multi_day, false), tc.sessions,
    tc.event_type, tc.cover_image_url, tc.cover_image_fit, tc.cover_image_position,
    tc.promo_link, tc.promo_label, tc.location,
    (SELECT array_agg(al.display_name ORDER BY al.sort_order NULLS LAST, al.display_name)
       FROM public.training_call_tier_access a2
       JOIN public.access_levels al ON al.level_key = a2.level_key
      WHERE a2.training_call_id = tc.id AND a2.access = true)
  FROM public.training_calls tc
  JOIN public.training_call_tier_access tcta
    ON tcta.training_call_id = tc.id AND tcta.visible = true
   AND tcta.level_key IN (SELECT h.level_key FROM held h)
  WHERE COALESCE(tc.starts_at, tc.scheduled_at) >= _from
    AND COALESCE(tc.starts_at, tc.scheduled_at) <= _to
  GROUP BY tc.id
  ORDER BY COALESCE(tc.starts_at, tc.scheduled_at) ASC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_community_events(timestamptz, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_community_events(timestamptz, timestamptz) TO authenticated;