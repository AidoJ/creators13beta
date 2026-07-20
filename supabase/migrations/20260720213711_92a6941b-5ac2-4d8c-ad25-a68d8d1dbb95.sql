
ALTER TABLE public.training_calls
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS cover_image_fit text NOT NULL DEFAULT 'cover' CHECK (cover_image_fit IN ('cover','contain')),
  ADD COLUMN IF NOT EXISTS cover_image_position text NOT NULL DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS promo_link text,
  ADD COLUMN IF NOT EXISTS promo_label text;

DROP FUNCTION IF EXISTS public.get_community_events(timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_community_events(_from timestamp with time zone DEFAULT (now() - '1 day'::interval), _to timestamp with time zone DEFAULT (now() + '180 days'::interval))
 RETURNS TABLE(id uuid, title text, description text, scheduled_at timestamp with time zone, duration_minutes integer, zoom_link text, has_access boolean, caller_tier subscription_tier, starts_at timestamp with time zone, ends_at timestamp with time zone, is_multi_day boolean, sessions jsonb, event_type text, cover_image_url text, cover_image_fit text, cover_image_position text, promo_link text, promo_label text)
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
    tc.event_type,
    tc.cover_image_url,
    tc.cover_image_fit,
    tc.cover_image_position,
    tc.promo_link,
    tc.promo_label
  FROM public.training_calls tc
  JOIN public.training_call_tier_access tcta
    ON tcta.training_call_id = tc.id
   AND tcta.tier = _tier
   AND tcta.visible = true
  WHERE COALESCE(tc.starts_at, tc.scheduled_at) >= _from
    AND COALESCE(tc.starts_at, tc.scheduled_at) <= _to
  ORDER BY COALESCE(tc.starts_at, tc.scheduled_at) ASC;
END;
$function$;
