-- 1. Products: new commercial fields
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS billing_shape text NOT NULL DEFAULT 'one_off',
  ADD COLUMN IF NOT EXISTS term_months integer,
  ADD COLUMN IF NOT EXISTS grants_level_key text REFERENCES public.access_levels(key),
  ADD COLUMN IF NOT EXISTS seat_cap integer,
  ADD COLUMN IF NOT EXISTS is_visible_on_storefront boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_billing_shape_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_billing_shape_check
  CHECK (billing_shape IN ('one_off','recurring','fixed_term'));

-- Storefront visibility: replace the active-only read policy
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
CREATE POLICY "Public can view storefront products"
  ON public.products FOR SELECT
  USING (active = true AND is_visible_on_storefront = true);
CREATE POLICY "Staff can view all products"
  ON public.products FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'trainer') OR public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

-- 2. Taster is displayed as Connect
UPDATE public.access_levels SET display_name = 'Connect', updated_at = now() WHERE key = 'taster';

-- 3. Events: level_key alongside the existing tier (Option A — tier still authoritative)
ALTER TABLE public.training_call_tier_access
  ADD COLUMN IF NOT EXISTS level_key text REFERENCES public.access_levels(key);

-- 4. Processed payment-event ledger (service-role only)
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stripe_webhook_events TO service_role;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read webhook events"
  ON public.stripe_webhook_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Seat reservations (service-role only, short lived)
CREATE TABLE IF NOT EXISTS public.seat_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  level_key text NOT NULL REFERENCES public.access_levels(key),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_session_id text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seat_reservations_level_expiry_idx
  ON public.seat_reservations (level_key, expires_at);
GRANT ALL ON public.seat_reservations TO service_role;
ALTER TABLE public.seat_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read seat reservations"
  ON public.seat_reservations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'trainer') OR public.has_role(auth.uid(), 'admin'));

-- Seats taken = active entitlements for the level + unexpired reservations
CREATE OR REPLACE FUNCTION public.seats_taken(_level_key text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT count(*) FROM public.entitlements e
    WHERE e.level_key = _level_key
      AND e.status = 'active'
      AND e.starts_at <= now()
      AND (e.ends_at IS NULL OR e.ends_at > now())
  )::int + (
    SELECT count(*) FROM public.seat_reservations r
    WHERE r.level_key = _level_key
      AND r.expires_at > now()
  )::int;
$$;
REVOKE EXECUTE ON FUNCTION public.seats_taken(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seats_taken(text) TO authenticated, service_role;

-- 6. has_feature: treat a service-role / no-JWT caller as privileged
CREATE OR REPLACE FUNCTION public.has_feature(_uid uuid, _feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH effective_uid AS (
    SELECT CASE
      WHEN auth.uid() IS NULL
        OR public.has_role(auth.uid(), 'trainer')
        OR public.has_role(auth.uid(), 'admin')
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