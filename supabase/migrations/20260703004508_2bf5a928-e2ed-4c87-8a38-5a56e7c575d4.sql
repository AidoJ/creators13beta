
-- 1. Schema: add new columns with sane defaults derived from current settings
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS points_win_2p     int NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS points_win_3p     int NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS points_win_4p     int NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS points_runner_up  int NOT NULL DEFAULT 1;

-- Seed 2p winner from existing points_per_win so we don't silently change value
UPDATE public.game_settings
   SET points_win_2p = points_per_win
 WHERE points_win_2p IS NULL OR points_win_2p = 4;

-- 2. Rewrite finalise_ranked_match to use these fields
CREATE OR REPLACE FUNCTION public.finalise_ranked_match(
  _match_id   uuid,
  _reason     text  DEFAULT 'normal',
  _placements jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row       public.game_matches;
  _settings  public.game_settings;
  _pts_win_2p int;
  _pts_win_3p int;
  _pts_win_4p int;
  _pts_runner int;
  _elo_k     int;
  _player_count int;
  _i record;
  _j record;
  _expected numeric;
  _score    numeric;
  _delta    numeric;
  _sum_delta numeric;
  _elo_delta int;
  _points    int;
  _won_bool  boolean;
  _bonus     int;
BEGIN
  PERFORM _reason;

  SELECT * INTO _row FROM public.game_matches WHERE id = _match_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'finished' OR _row.is_ranked IS NOT TRUE THEN
    RETURN;
  END IF;
  IF coalesce((_row.state ->> '__finalised')::boolean, false) THEN
    RETURN;
  END IF;

  SELECT * INTO _settings FROM public.game_settings ORDER BY updated_at DESC LIMIT 1;
  _pts_win_2p := coalesce(_settings.points_win_2p, _settings.points_per_win, 4);
  _pts_win_3p := coalesce(_settings.points_win_3p, 6);
  _pts_win_4p := coalesce(_settings.points_win_4p, 8);
  _pts_runner := coalesce(_settings.points_runner_up, 1);
  _elo_k      := coalesce(_settings.elo_win, 16);
  _player_count := coalesce(_row.player_count, 2);

  IF _player_count <= 2 THEN
    DECLARE
      _host_won boolean := _row.winner_user_id = _row.host_user_id;
      _draw     boolean := _row.winner_user_id IS NULL;
      _pts_draw int     := _pts_win_2p / 2;
      _elo_loss int     := coalesce(_settings.elo_loss, -16);
      _host_bonus int   := 0;
      _guest_bonus int  := 0;
    BEGIN
      IF _row.host_user_id IS NULL OR _row.guest_user_id IS NULL THEN
        RETURN;
      END IF;

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
        (CASE WHEN _draw THEN _pts_draw WHEN _host_won THEN _pts_win_2p ELSE _pts_runner END) + _host_bonus,
        '{}'::text[],
        CASE WHEN _draw THEN NULL ELSE _host_won END,
        false,
        CASE WHEN _draw THEN 0 WHEN _host_won THEN _elo_k ELSE _elo_loss END
      );
      PERFORM public.bump_player_progress(
        _row.guest_user_id,
        (CASE WHEN _draw THEN _pts_draw WHEN _host_won THEN _pts_runner ELSE _pts_win_2p END) + _guest_bonus,
        '{}'::text[],
        CASE WHEN _draw THEN NULL ELSE NOT _host_won END,
        false,
        CASE WHEN _draw THEN 0 WHEN _host_won THEN _elo_loss ELSE _elo_k END
      );
      UPDATE public.game_matches
         SET state = state || jsonb_build_object('__finalised', true)
       WHERE id = _match_id;
      RETURN;
    END;
  END IF;

  IF _placements IS NOT NULL AND jsonb_typeof(_placements) = 'array' THEN
    DROP TABLE IF EXISTS _np_ranks;
    CREATE TEMP TABLE _np_ranks (
      user_id uuid PRIMARY KEY,
      rank    smallint NOT NULL,
      elo     int      NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO _np_ranks (user_id, rank, elo)
    SELECT (el ->> 'user_id')::uuid,
           (el ->> 'rank')::smallint,
           coalesce(
             (SELECT pp.elo FROM public.player_progress pp WHERE pp.user_id = (el ->> 'user_id')::uuid),
             1000
           )
    FROM jsonb_array_elements(_placements) el
    WHERE (el ->> 'user_id') IS NOT NULL AND (el ->> 'rank') IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DROP TABLE IF EXISTS _np_ranks;
    CREATE TEMP TABLE _np_ranks (
      user_id uuid PRIMARY KEY,
      rank    smallint NOT NULL,
      elo     int      NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO _np_ranks (user_id, rank, elo)
    SELECT gmp.user_id,
           gmp.rank,
           coalesce(
             (SELECT pp.elo FROM public.player_progress pp WHERE pp.user_id = gmp.user_id),
             1000
           )
    FROM public.game_match_players gmp
    WHERE gmp.match_id = _match_id AND gmp.rank IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  IF (SELECT count(*) FROM _np_ranks) < 2 THEN
    UPDATE public.game_matches
       SET state = state || jsonb_build_object('__finalised', true)
     WHERE id = _match_id;
    RETURN;
  END IF;

  FOR _i IN SELECT user_id, rank, elo FROM _np_ranks LOOP
    _sum_delta := 0;
    FOR _j IN SELECT user_id, rank, elo FROM _np_ranks WHERE user_id <> _i.user_id LOOP
      _expected := 1.0 / (1.0 + power(10.0, (_j.elo - _i.elo) / 400.0));
      _score := CASE
        WHEN _i.rank < _j.rank THEN 1.0
        WHEN _i.rank = _j.rank THEN 0.5
        ELSE 0.0
      END;
      _delta := _elo_k * (_score - _expected);
      _sum_delta := _sum_delta + _delta;
    END LOOP;
    _elo_delta := round(_sum_delta / GREATEST(1, _player_count - 1))::int;

    IF _i.rank = 1 THEN
      _points := CASE _player_count
                   WHEN 3 THEN _pts_win_3p
                   WHEN 4 THEN _pts_win_4p
                   ELSE _pts_win_2p
                 END;
      _won_bool := true;
    ELSE
      _points := _pts_runner;
      _won_bool := false;
    END IF;

    SELECT coalesce(bonus_points_awarded, 0) INTO _bonus
      FROM public.quiz_match_progress
     WHERE match_id = _match_id AND user_id = _i.user_id;
    _bonus := coalesce(_bonus, 0);

    PERFORM public.bump_player_progress(
      _i.user_id,
      _points + _bonus,
      '{}'::text[],
      _won_bool,
      false,
      _elo_delta
    );
  END LOOP;

  UPDATE public.game_matches
     SET state = state || jsonb_build_object('__finalised', true)
   WHERE id = _match_id;
END;
$$;
