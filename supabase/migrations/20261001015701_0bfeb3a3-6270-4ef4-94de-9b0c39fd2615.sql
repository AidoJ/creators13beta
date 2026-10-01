ALTER TABLE public.entitlements ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS entitlements_product_active_idx ON public.entitlements (product_id) WHERE status = 'active';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS intake_starts_on date;
CREATE INDEX IF NOT EXISTS seat_reservations_product_idx ON public.seat_reservations (product_id, expires_at);

-- Places are counted per product (one product = one intake), so intakes of the same level can overlap.
CREATE OR REPLACE FUNCTION public.seats_taken_for_product(_product_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (
    SELECT count(*) FROM public.entitlements e
    WHERE e.product_id = _product_id AND e.status = 'active'
      AND e.starts_at <= now() AND (e.ends_at IS NULL OR e.ends_at > now())
  )::int + (
    SELECT count(*) FROM public.seat_reservations r
    WHERE r.product_id = _product_id AND r.expires_at > now()
  )::int;
$$;
REVOKE EXECUTE ON FUNCTION public.seats_taken_for_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seats_taken_for_product(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reserve_seat(
  _product_id uuid, _level_key text, _user_id uuid, _seat_cap integer, _minutes integer DEFAULT 30)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _taken integer; _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('seat:' || _product_id::text));
  -- A payer retrying checkout reuses their own hold instead of taking a second place.
  DELETE FROM public.seat_reservations WHERE product_id = _product_id AND user_id = _user_id;
  SELECT public.seats_taken_for_product(_product_id) INTO _taken;
  IF _seat_cap IS NOT NULL AND _taken >= _seat_cap THEN RETURN NULL; END IF;
  INSERT INTO public.seat_reservations (product_id, level_key, user_id, expires_at)
  VALUES (_product_id, _level_key, _user_id, now() + make_interval(mins => _minutes))
  RETURNING id INTO _id;
  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_seat(uuid, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_seat(uuid, text, uuid, integer, integer) TO service_role;