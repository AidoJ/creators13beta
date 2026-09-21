CREATE OR REPLACE FUNCTION public.reserve_seat(
  _product_id uuid,
  _level_key text,
  _user_id uuid,
  _seat_cap integer,
  _minutes integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _taken integer;
  _id uuid;
BEGIN
  -- Serialise every seat claim for this level. Without this, two concurrent
  -- checkouts both read "0 taken" and both insert a reservation.
  PERFORM pg_advisory_xact_lock(hashtext('seat:' || _level_key));

  SELECT public.seats_taken(_level_key) INTO _taken;
  IF _seat_cap IS NOT NULL AND _taken >= _seat_cap THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.seat_reservations (product_id, level_key, user_id, expires_at)
  VALUES (_product_id, _level_key, _user_id, now() + make_interval(mins => _minutes))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_seat(uuid, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_seat(uuid, text, uuid, integer, integer) TO service_role;