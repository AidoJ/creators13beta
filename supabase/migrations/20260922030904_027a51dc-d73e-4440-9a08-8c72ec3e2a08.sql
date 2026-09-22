-- 1. Backfill owl rows + keep level_key in sync with tier on write
UPDATE public.training_call_tier_access SET level_key = 'owl' WHERE tier = 'owl' AND level_key IS NULL;

CREATE OR REPLACE FUNCTION public.tcta_sync_level_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.level_key IS NULL THEN
    NEW.level_key := CASE NEW.tier
      WHEN 'wren' THEN 'free'
      WHEN 'robin' THEN 'creator'
      WHEN 'cockatoo' THEN 'co_creator'
      WHEN 'owl' THEN 'owl'
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tcta_sync_level_key ON public.training_call_tier_access;
CREATE TRIGGER tcta_sync_level_key
  BEFORE INSERT OR UPDATE ON public.training_call_tier_access
  FOR EACH ROW EXECUTE FUNCTION public.tcta_sync_level_key();

-- 2. get_community_events: resolve by held access levels, gated on events_view
CREATE OR REPLACE FUNCTION public.get_community_events(
  _from timestamp with time zone DEFAULT (now() - '1 day'::interval),
  _to timestamp with time zone DEFAULT (now() + '180 days'::interval))
RETURNS TABLE(id uuid, title text, description text, scheduled_at timestamp with time zone, duration_minutes integer, zoom_link text, has_access boolean, caller_tier subscription_tier, starts_at timestamp with time zone, ends_at timestamp with time zone, is_multi_day boolean, sessions jsonb, event_type text, cover_image_url text, cover_image_fit text, cover_image_position text, promo_link text, promo_label text, location text)
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

  -- retained for display only (the plan name shown in the UI)
  _tier := public.resolve_effective_tier(_uid);

  RETURN QUERY
  WITH held AS (
    SELECT 'free'::text AS level_key
    UNION
    SELECT e.level_key
    FROM public.entitlements e
    WHERE e.user_id = _uid
      AND e.status = 'active'
      AND e.starts_at <= now()
      AND (e.ends_at IS NULL OR e.ends_at > now())
  )
  SELECT
    tc.id,
    tc.title,
    tc.description,
    tc.scheduled_at,
    tc.duration_minutes,
    CASE WHEN bool_or(tcta.access) THEN tc.zoom_link ELSE NULL END AS zoom_link,
    bool_or(tcta.access) AS has_access,
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
    tc.promo_label,
    tc.location
  FROM public.training_calls tc
  JOIN public.training_call_tier_access tcta
    ON tcta.training_call_id = tc.id
   AND tcta.visible = true
   AND tcta.level_key IN (SELECT h.level_key FROM held h)
  WHERE COALESCE(tc.starts_at, tc.scheduled_at) >= _from
    AND COALESCE(tc.starts_at, tc.scheduled_at) <= _to
  GROUP BY tc.id, tc.title, tc.description, tc.scheduled_at, tc.duration_minutes,
           tc.zoom_link, tc.starts_at, tc.ends_at, tc.is_multi_day, tc.sessions,
           tc.event_type, tc.cover_image_url, tc.cover_image_fit,
           tc.cover_image_position, tc.promo_link, tc.promo_label, tc.location
  ORDER BY COALESCE(tc.starts_at, tc.scheduled_at) ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_community_events(timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_community_events(timestamp with time zone, timestamp with time zone) TO authenticated, service_role;

-- 3. events_create: allow the feature holders alongside the existing roles
DROP POLICY IF EXISTS "Trainers can manage training calls" ON public.training_calls;
CREATE POLICY "Event creators can manage training calls"
  ON public.training_calls FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR public.has_feature(auth.uid(), 'events_create'))
  WITH CHECK (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR public.has_feature(auth.uid(), 'events_create'));

DROP POLICY IF EXISTS "Trainers manage tier access grid" ON public.training_call_tier_access;
CREATE POLICY "Event creators manage tier access grid"
  ON public.training_call_tier_access FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR public.has_feature(auth.uid(), 'events_create'))
  WITH CHECK (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR public.has_feature(auth.uid(), 'events_create'));

DROP POLICY IF EXISTS "Trainers can view tier access grid" ON public.training_call_tier_access;
CREATE POLICY "Event creators can view tier access grid"
  ON public.training_call_tier_access FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR public.has_feature(auth.uid(), 'events_create'));