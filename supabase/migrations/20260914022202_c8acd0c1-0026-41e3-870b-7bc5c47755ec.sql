CREATE OR REPLACE FUNCTION public.has_feature(_uid uuid, _feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH effective_uid AS (
    SELECT CASE
      WHEN public.has_role(auth.uid(), 'trainer') OR public.has_role(auth.uid(), 'admin')
        THEN _uid
      ELSE auth.uid()
    END AS uid
  ),
  held_levels AS (
    SELECT 'free'::text AS level_key
    UNION
    SELECT e.level_key
    FROM public.entitlements e, effective_uid eu
    WHERE e.user_id = eu.uid
      AND e.status = 'active'
      AND e.starts_at <= now()
      AND (e.ends_at IS NULL OR e.ends_at > now())
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.access_grid ag
    JOIN held_levels hl ON hl.level_key = ag.level_key
    WHERE ag.feature_key = _feature_key
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;