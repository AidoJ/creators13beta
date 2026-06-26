
-- ============================================================
-- Community events: per-tier visibility/access on training_calls
-- ============================================================

-- 1. Per-event per-tier access grid
CREATE TABLE public.training_call_tier_access (
  training_call_id uuid NOT NULL REFERENCES public.training_calls(id) ON DELETE CASCADE,
  tier public.subscription_tier NOT NULL,
  visible boolean NOT NULL DEFAULT false,
  access  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (training_call_id, tier),
  CONSTRAINT access_requires_visible CHECK (NOT access OR visible)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_call_tier_access TO authenticated;
GRANT ALL ON public.training_call_tier_access TO service_role;

ALTER TABLE public.training_call_tier_access ENABLE ROW LEVEL SECURITY;

-- Trainers/admins manage the grid; everyone else reads via the RPC only.
CREATE POLICY "Trainers manage tier access grid"
  ON public.training_call_tier_access
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'trainer'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'trainer'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER trg_tier_access_updated_at
  BEFORE UPDATE ON public.training_call_tier_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_tier_access_visible ON public.training_call_tier_access (tier, visible)
  WHERE visible = true;

-- 2. Effective-tier resolver (lapsed/expired → wren)
CREATE OR REPLACE FUNCTION public.resolve_effective_tier(_user_id uuid)
RETURNS public.subscription_tier
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT s.tier
      FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.status IN ('active','trialing','past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
      ORDER BY s.updated_at DESC
      LIMIT 1
    ),
    'wren'::public.subscription_tier
  );
$$;

GRANT EXECUTE ON FUNCTION public.resolve_effective_tier(uuid) TO authenticated;

-- 3. Community read RPC — returns events visible to caller's tier;
--    zoom_link is NULL unless the caller's tier has access=true.
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
  caller_tier public.subscription_tier
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
    _tier AS caller_tier
  FROM public.training_calls tc
  JOIN public.training_call_tier_access tcta
    ON tcta.training_call_id = tc.id
   AND tcta.tier = _tier
   AND tcta.visible = true
  WHERE tc.scheduled_at >= _from
    AND tc.scheduled_at <= _to
  ORDER BY tc.scheduled_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_events(timestamptz, timestamptz) TO authenticated;
