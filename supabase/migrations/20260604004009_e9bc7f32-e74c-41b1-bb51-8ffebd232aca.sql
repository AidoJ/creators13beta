CREATE OR REPLACE FUNCTION public.bump_player_progress(_user_id uuid, _points_delta integer DEFAULT 0, _types_seen text[] DEFAULT '{}'::text[], _won boolean DEFAULT NULL::boolean, _perfect_eco boolean DEFAULT false, _elo_delta integer DEFAULT 0)
 RETURNS player_progress
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.player_progress;
  _new_streak integer;
  _caller uuid := auth.uid();
BEGIN
  -- Ignore client-supplied _user_id entirely. Progress writes are always
  -- attributed to the authenticated caller. The parameter is kept for
  -- backward compatibility with existing client calls.
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Clamp untrusted deltas to sane per-call bounds so a malicious client
  -- cannot inflate ELO or points in a single call.
  IF _points_delta IS NOT NULL THEN
    _points_delta := GREATEST(-500, LEAST(500, _points_delta));
  END IF;
  IF _elo_delta IS NOT NULL THEN
    _elo_delta := GREATEST(-100, LEAST(100, _elo_delta));
  END IF;

  INSERT INTO public.player_progress(user_id) VALUES (_caller)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO _row FROM public.player_progress WHERE user_id = _caller FOR UPDATE;

  IF _won IS TRUE THEN
    _new_streak := COALESCE(_row.current_streak,0) + 1;
  ELSIF _won IS FALSE THEN
    _new_streak := 0;
  ELSE
    _new_streak := _row.current_streak;
  END IF;

  UPDATE public.player_progress SET
    points = GREATEST(0, points + COALESCE(_points_delta,0)),
    types_seen = (
      SELECT array_agg(DISTINCT t) FROM unnest(
        COALESCE(types_seen,'{}') || COALESCE(_types_seen,'{}')
      ) AS t WHERE t IS NOT NULL AND t <> ''
    ),
    elo = GREATEST(0, elo + COALESCE(_elo_delta,0)),
    current_streak = _new_streak,
    longest_streak = GREATEST(longest_streak, _new_streak),
    perfect_ecosystems = perfect_ecosystems + CASE WHEN _perfect_eco THEN 1 ELSE 0 END,
    last_played_at = now()
  WHERE user_id = _caller
  RETURNING * INTO _row;

  RETURN _row;
END;
$function$;