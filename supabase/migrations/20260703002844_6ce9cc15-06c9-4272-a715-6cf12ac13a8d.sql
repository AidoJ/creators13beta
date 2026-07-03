
CREATE OR REPLACE FUNCTION public.finalise_ranked_match(
  _match_id uuid,
  _reason   text DEFAULT 'normal'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row       public.game_matches;
  _settings  public.game_settings;
  _host_won  boolean;
  _draw      boolean;
  _pts_win   int;
  _pts_draw  int;
  _bonus_eco int;
  _elo_win   int;
  _elo_loss  int;
  _host_bonus int := 0;
  _guest_bonus int := 0;
BEGIN
  PERFORM _reason;

  SELECT * INTO _row FROM public.game_matches WHERE id = _match_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'finished' OR _row.is_ranked IS NOT TRUE THEN
    RETURN;
  END IF;
  IF _row.guest_user_id IS NULL OR _row.host_user_id IS NULL THEN
    RETURN;
  END IF;
  IF coalesce((_row.state ->> '__finalised')::boolean, false) THEN
    RETURN;
  END IF;

  SELECT * INTO _settings FROM public.game_settings ORDER BY updated_at DESC LIMIT 1;
  _pts_win   := coalesce(_settings.points_per_win, 10);
  _bonus_eco := coalesce(_settings.perfect_eco_bonus, 5);
  _elo_win   := coalesce(_settings.elo_win, 16);
  _elo_loss  := coalesce(_settings.elo_loss, -16);
  _pts_draw  := _pts_win / 2;

  _draw     := _row.winner_user_id IS NULL;
  _host_won := _row.winner_user_id = _row.host_user_id;

  -- Quiz bonus points earned in this match flow into lifetime points,
  -- regardless of win/loss/draw so studying is always rewarded.
  SELECT coalesce(bonus_points_awarded, 0) INTO _host_bonus
    FROM public.quiz_match_progress
   WHERE match_id = _match_id AND user_id = _row.host_user_id;
  SELECT coalesce(bonus_points_awarded, 0) INTO _guest_bonus
    FROM public.quiz_match_progress
   WHERE match_id = _match_id AND user_id = _row.guest_user_id;
  _host_bonus  := coalesce(_host_bonus, 0);
  _guest_bonus := coalesce(_guest_bonus, 0);

  PERFORM public.bump_player_progress(
    _row.host_user_id,
    (CASE WHEN _draw THEN _pts_draw WHEN _host_won THEN _pts_win ELSE 0 END) + _host_bonus,
    '{}'::text[],
    CASE WHEN _draw THEN NULL ELSE _host_won END,
    false,
    CASE WHEN _draw THEN 0 WHEN _host_won THEN _elo_win ELSE _elo_loss END
  );
  PERFORM public.bump_player_progress(
    _row.guest_user_id,
    (CASE WHEN _draw THEN _pts_draw WHEN _host_won THEN 0 ELSE _pts_win END) + _guest_bonus,
    '{}'::text[],
    CASE WHEN _draw THEN NULL ELSE NOT _host_won END,
    false,
    CASE WHEN _draw THEN 0 WHEN _host_won THEN _elo_loss ELSE _elo_win END
  );

  UPDATE public.game_matches
     SET state = state || jsonb_build_object('__finalised', true)
   WHERE id = _match_id;
END;
$$;
