
CREATE OR REPLACE FUNCTION public.bump_types_seen(_types text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  INSERT INTO public.player_progress(user_id) VALUES (_uid)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.player_progress
     SET types_seen = (
           SELECT array_agg(DISTINCT t)
           FROM unnest(coalesce(types_seen, '{}') || coalesce(_types, '{}')) AS t
           WHERE t IS NOT NULL AND t <> ''
         ),
         last_played_at = now()
   WHERE user_id = _uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_types_seen(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bump_types_seen(text[]) TO authenticated;
